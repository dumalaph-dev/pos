import { normalizeSubscriptionStatus } from "@/lib/billing";
import { readCurrentComplimentaryAccess } from "@/lib/platform-access-server";
import {
  DEFAULT_INCLUDED_BRANCH_COUNT,
  decideBranchActivation,
} from "@/lib/branch-billing-pricing";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateCatalogVariantPriceQuote } from "@/lib/platform-operations";
import { readPlatformOperations } from "@/lib/platform-operations-server";
import {
  changePayMongoSubscriptionPlan,
  ensurePayMongoPlan,
  PayMongoApiError,
} from "@/lib/paymongo-server";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type OrganizationBillingRecord = {
  subscription_status: string | null;
  subscription_billing_mode: "recurring" | "temporary_qrph" | null;
  subscription_billing_variant_id: string | null;
  subscription_provider_plan_id: string | null;
  subscription_provider_subscription_id: string | null;
  subscription_current_period_end: string | null;
  subscription_entitled_branch_count: number | null;
};

export type BranchBillingChange = {
  status: "unchanged" | "scheduled" | "deferred";
  organizationId: string;
  subscriptionId: string | null;
  previousPlanId: string | null;
  nextPlanId: string | null;
  currentActiveBranchCount: number;
  nextActiveBranchCount: number;
  previousEntitledBranchCount: number;
  nextEntitledBranchCount: number;
};

export type BranchBillingFailureCode = "payment_required" | "billing_unavailable";

type BranchBillingResult =
  | { ok: true; change: BranchBillingChange }
  | { ok: false; message: string; code?: BranchBillingFailureCode };

/**
 * Prepare the provider-side price change before a branch mutation is written.
 * PayMongo applies plan changes on the next billing cycle, so the current
 * paid period remains intact while the next invoice follows the shared quote.
 */
export async function prepareBranchBillingChange(
  admin: PlatformAdminClient | null,
  organizationId: string,
  branchCountDelta: 1 | -1,
): Promise<BranchBillingResult> {
  if (!admin) return { ok: false, message: "Branch billing is temporarily unavailable. Try again after the billing service is configured." };

  const [organizationResult, branchesResult] = await Promise.all([
    admin
      .from("organizations")
      .select("subscription_status, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_current_period_end, subscription_entitled_branch_count")
      .eq("id", organizationId)
      .maybeSingle(),
    admin
      .from("stores")
      .select("id")
      .eq("org_id", organizationId)
      .eq("is_active", true),
  ]);

  if (organizationResult.error || branchesResult.error) {
    return { ok: false, message: "The organization billing state could not be verified. Try again after the billing data is available." };
  }

  const organization = organizationResult.data as OrganizationBillingRecord | null;
  if (!organization) return { ok: false, message: "The organization billing record could not be found." };

  const currentActiveBranchCount = branchesResult.data?.length ?? 0;
  const nextActiveBranchCount = currentActiveBranchCount + branchCountDelta;
  if (nextActiveBranchCount < 1) return { ok: false, message: "Keep at least one active branch in your organization." };

  const subscriptionStatus = normalizeSubscriptionStatus(organization.subscription_status);
  const temporaryAccessCurrent = subscriptionStatus === "active"
    && organization.subscription_billing_mode === "temporary_qrph"
    && isBillingPeriodCurrent(organization.subscription_current_period_end);
  const paidAccessMode = temporaryAccessCurrent
    ? "prepaid" as const
    : subscriptionStatus === "active" && Boolean(organization.subscription_provider_subscription_id)
      ? "recurring" as const
      : "none" as const;
  const paidBranchEntitlement = Math.max(Number(organization.subscription_entitled_branch_count) || DEFAULT_INCLUDED_BRANCH_COUNT, DEFAULT_INCLUDED_BRANCH_COUNT);

  const unchanged = (status: BranchBillingChange["status"] = "unchanged"): BranchBillingResult => ({
    ok: true,
    change: {
      status,
      organizationId,
      subscriptionId: organization.subscription_provider_subscription_id,
      previousPlanId: organization.subscription_provider_plan_id,
      nextPlanId: organization.subscription_provider_plan_id,
      currentActiveBranchCount,
      nextActiveBranchCount,
      previousEntitledBranchCount: paidBranchEntitlement,
      nextEntitledBranchCount: paidBranchEntitlement,
    },
  });

  let operations: Awaited<ReturnType<typeof readPlatformOperations>> | null = null;

  // Trial, unpaid, and active prepaid organizations must have the next branch
  // covered before the row is written. Recurring subscriptions can schedule
  // the provider price change, while complimentary grants remain exempt.
  if (branchCountDelta === 1) {
    const [candidateOperations, complimentaryAccess] = await Promise.all([
      readPlatformOperations(admin),
      readCurrentComplimentaryAccess(admin, organizationId),
    ]);
    operations = candidateOperations;
    const includedBranchCount = candidateOperations.catalog.schemaAvailable
      ? candidateOperations.catalog.includedBranchCount
      : DEFAULT_INCLUDED_BRANCH_COUNT;

    const activationDecision = decideBranchActivation({
      branchCountDelta,
      nextActiveBranchCount,
      paidBranchEntitlement: paidAccessMode === "none"
        ? includedBranchCount
        : Math.max(paidBranchEntitlement, includedBranchCount),
      paidAccessMode,
      hasComplimentaryAccess: Boolean(complimentaryAccess),
    });

    if (activationDecision === "payment_required") {
      if (!candidateOperations.catalog.schemaAvailable) {
        return { ok: false, code: "billing_unavailable", message: "The branch pricing catalog is not available. Apply the latest billing migrations before adding another active branch." };
      }

      const coveredBranchCount = paidAccessMode === "prepaid" ? paidBranchEntitlement : includedBranchCount;
      const branchLabel = `${coveredBranchCount} active branch${coveredBranchCount === 1 ? "" : "es"}`;
      const detail = paidAccessMode === "prepaid"
        ? "Pay for the additional branch in Billing & Plan before creating it."
        : `Your current access includes ${branchLabel}. Complete payment in Billing & Plan before adding another active branch.`;
      return { ok: false, code: "payment_required", message: detail };
    }
  }

  if (organization.subscription_billing_mode === "temporary_qrph" && subscriptionStatus === "active") return unchanged("deferred");
  if (!organization.subscription_provider_subscription_id) return unchanged();
  if (subscriptionStatus === "past_due") return { ok: false, message: "Resolve the outstanding subscription payment before changing active branches." };
  if (subscriptionStatus === "incomplete") return { ok: false, message: "Complete the pending subscription payment before changing active branches." };
  if (subscriptionStatus !== "active" || organization.subscription_billing_mode === "temporary_qrph") return unchanged();
  if (!organization.subscription_provider_plan_id) return { ok: false, message: "The active subscription plan could not be identified. Contact support before changing branches." };

  operations ??= await readPlatformOperations(admin);
  if (!operations.catalog.schemaAvailable) return { ok: false, code: "billing_unavailable", message: "The branch pricing catalog is not available. Apply the latest billing migrations before changing branches." };

  const variant = operations.catalog.variants.find((candidate) => candidate.id === organization.subscription_billing_variant_id)
    ?? operations.catalog.variants.find((candidate) => candidate.paymongoPlanId === organization.subscription_provider_plan_id)
    ?? operations.catalog.variants.find((candidate) => organization.subscription_provider_plan_id?.startsWith(`${candidate.id}-`) === true);
  if (!variant || !variant.id) return { ok: false, message: "The active billing option could not be matched to the current catalog. Contact support before changing branches." };

  const quote = calculateCatalogVariantPriceQuote(operations.catalog, variant, nextActiveBranchCount);
  try {
    const plan = await ensurePayMongoPlan({
      existingPlanId: organization.subscription_provider_plan_id,
      variantId: `${variant.id}-branches-${nextActiveBranchCount}`,
      label: `${variant.label} · ${nextActiveBranchCount} active branch${nextActiveBranchCount === 1 ? "" : "es"}`,
      amountCentavos: quote.termTotalCentavos,
      intervalUnit: variant.intervalUnit,
      intervalCount: variant.intervalCount,
    });

    if (plan.id === organization.subscription_provider_plan_id) return unchanged();

    await changePayMongoSubscriptionPlan(organization.subscription_provider_subscription_id, plan.id);
    const localUpdate = await admin
      .from("organizations")
      .update({
        subscription_billing_variant_id: variant.id,
        subscription_provider_plan_id: plan.id,
        subscription_entitled_branch_count: nextActiveBranchCount,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
    if (localUpdate.error) {
      await restoreBranchBillingPlan(admin, {
        status: "scheduled",
        organizationId,
        subscriptionId: organization.subscription_provider_subscription_id,
        previousPlanId: organization.subscription_provider_plan_id,
        nextPlanId: plan.id,
        currentActiveBranchCount,
        nextActiveBranchCount,
        previousEntitledBranchCount: paidBranchEntitlement,
        nextEntitledBranchCount: nextActiveBranchCount,
      });
      return { ok: false, message: "The provider price change could not be recorded locally. The branch was not changed." };
    }

    return {
      ok: true,
      change: {
        status: "scheduled",
        organizationId,
        subscriptionId: organization.subscription_provider_subscription_id,
        previousPlanId: organization.subscription_provider_plan_id,
        nextPlanId: plan.id,
        currentActiveBranchCount,
        nextActiveBranchCount,
        previousEntitledBranchCount: paidBranchEntitlement,
        nextEntitledBranchCount: nextActiveBranchCount,
      },
    };
  } catch (error) {
    return { ok: false, message: providerErrorMessage(error) };
  }
}

export async function restoreBranchBillingPlan(admin: PlatformAdminClient | null, change: BranchBillingChange) {
  if (!admin || change.status !== "scheduled" || !change.subscriptionId || !change.previousPlanId || !change.nextPlanId) return true;

  try {
    await changePayMongoSubscriptionPlan(change.subscriptionId, change.previousPlanId);
    const localUpdate = await admin
      .from("organizations")
      .update({
        subscription_provider_plan_id: change.previousPlanId,
        subscription_entitled_branch_count: change.previousEntitledBranchCount,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq("id", change.organizationId);
    return !localUpdate.error;
  } catch (error) {
    console.error("[branch-billing] Could not restore the previous provider plan", error instanceof Error ? error.message : error);
    return false;
  }
}

function providerErrorMessage(error: unknown) {
  if (error instanceof PayMongoApiError) return "The billing provider could not schedule the branch price change. Try again or contact support.";
  return error instanceof Error ? error.message : "The branch billing change could not be prepared.";
}

function isBillingPeriodCurrent(value: string | null) {
  if (!value) return false;
  const end = new Date(value);
  return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
}
