import { normalizeSubscriptionStatus } from "@/lib/billing";
import { MAX_BRANCH_ENTITLEMENT } from "@/lib/branch-billing-pricing";
import { markPromotionRedemptionConverted } from "@/lib/platform-promotions-server";
import { readNestedResourceId, type PayMongoResourceAttributes } from "@/lib/paymongo-server";

export type TemporaryQrPhCheckoutMetadata = {
  organizationId: string;
  variantId: string;
  purpose: "subscription" | "additional_branch";
  intervalUnit: "month" | "year";
  intervalCount: number;
  amountCentavos: number;
  activeBranchCount: number;
  targetActiveBranchCount: number;
  entitledBranchCount: number;
  promotionId: string | null;
};

type TemporaryQrPhOrganization = {
  id: string;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  subscription_billing_mode: string | null;
  subscription_provider_checkout_session_id: string | null;
  subscription_entitled_branch_count: number | null;
};

type TemporaryQrPhActivationInput = {
  checkoutSessionId: string;
  paymentIntentId: string | null;
  paidAmountCentavos: number | null;
  metadata: TemporaryQrPhCheckoutMetadata;
};

export function readTemporaryQrPhCheckoutMetadata(attributes: PayMongoResourceAttributes): TemporaryQrPhCheckoutMetadata | null {
  const metadata = isRecord(attributes.metadata) ? attributes.metadata : null;
  if (!metadata || metadata.pos_temporary_qrph !== "true") return null;

  const organizationId = readString(metadata.organization_id);
  const variantId = readString(metadata.variant_id);
  const intervalUnit = metadata.interval_unit === "month" || metadata.interval_unit === "year" ? metadata.interval_unit : null;
  const intervalCount = readInteger(metadata.interval_count);
  const amountCentavos = readInteger(metadata.amount_centavos);
  const purpose = metadata.checkout_purpose === "additional_branch" ? "additional_branch" as const : "subscription" as const;
  const activeBranchCount = readInteger(metadata.active_branch_count) ?? 1;
  const targetActiveBranchCount = readInteger(metadata.target_active_branch_count) ?? activeBranchCount;
  const entitledBranchCount = readInteger(metadata.entitled_branch_count) ?? 1;
  if (!organizationId || !variantId || !intervalUnit || !intervalCount || !amountCentavos || amountCentavos < 100 || activeBranchCount < 1 || targetActiveBranchCount < 1 || entitledBranchCount < 1) return null;

  return { organizationId, variantId, purpose, intervalUnit, intervalCount, amountCentavos, activeBranchCount, targetActiveBranchCount, entitledBranchCount, promotionId: readString(metadata.promotion_id) };
}

export function readCheckoutPaymentStatus(attributes: PayMongoResourceAttributes) {
  const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
  let paymentIntentId = readNestedResourceId(attributes.payment_intent);
  let paidAmountCentavos: number | null = null;
  let failed = false;

  for (const value of payments) {
    if (!isRecord(value)) continue;
    const paymentAttributes = isRecord(value.attributes) ? value.attributes : value;
    if (!paymentIntentId) paymentIntentId = readString(paymentAttributes.payment_intent_id);
    const status = readString(paymentAttributes.status);
    if (status === "paid") {
      paidAmountCentavos = readInteger(paymentAttributes.amount);
      return { status: "paid" as const, paymentIntentId, paidAmountCentavos };
    }
    if (status === "failed" || status === "cancelled") failed = true;
  }

  const paymentIntent = isRecord(attributes.payment_intent) ? attributes.payment_intent : null;
  const paymentIntentAttributes = paymentIntent && isRecord(paymentIntent.attributes) ? paymentIntent.attributes : null;
  if (paymentIntentAttributes) {
    const status = readString(paymentIntentAttributes.status);
    if (status === "succeeded") {
      return {
        status: "paid" as const,
        paymentIntentId: paymentIntentId ?? readString(paymentIntent?.id),
        paidAmountCentavos: readInteger(paymentIntentAttributes.amount),
      };
    }
    if (status === "failed" || status === "cancelled") failed = true;
  }

  return {
    status: failed ? "failed" as const : "pending" as const,
    paymentIntentId,
    paidAmountCentavos,
  };
}

export async function activateTemporaryQrPhCheckout(
  admin: NonNullable<ReturnType<typeof import("@/lib/employee-auth").createAdminClient>>,
  input: TemporaryQrPhActivationInput,
) {
  const result = await admin
    .from("organizations")
    .select("id, subscription_status, subscription_current_period_end, subscription_billing_mode, subscription_provider_checkout_session_id, subscription_entitled_branch_count")
    .eq("id", input.metadata.organizationId)
    .maybeSingle();
  if (result.error) throw new Error("Temporary QR Ph billing fields are not available. Apply migrations 0036_temporary_qrph_checkout.sql and 0070_paid_branch_entitlements.sql.");

  const organization = result.data as TemporaryQrPhOrganization | null;
  if (!organization) throw new Error("The organization linked to this QR Ph checkout could not be found.");
  if (input.paidAmountCentavos !== null && input.paidAmountCentavos !== input.metadata.amountCentavos) {
    throw new Error("The payment amount did not match the selected billing action.");
  }

  const currentStatus = normalizeSubscriptionStatus(organization.subscription_status);
  if (input.metadata.purpose === "additional_branch") {
    if (currentStatus !== "active" || organization.subscription_billing_mode !== "temporary_qrph" || !isBillingPeriodCurrent(organization.subscription_current_period_end)) {
      throw new Error("The prepaid QR Ph period is no longer active for this branch payment.");
    }

    const branchesResult = await admin
      .from("stores")
      .select("id")
      .eq("org_id", organization.id)
      .eq("is_active", true);
    if (branchesResult.error) throw new Error("The paid branch entitlement could not be verified.");
    const activeBranchCount = Math.max(branchesResult.data?.length ?? 0, 1);
    const currentEntitlement = Math.max(Number(organization.subscription_entitled_branch_count) || input.metadata.entitledBranchCount, 1);
    if (input.metadata.targetActiveBranchCount < activeBranchCount + 1 || input.metadata.targetActiveBranchCount > MAX_BRANCH_ENTITLEMENT) {
      throw new Error("The branch count changed while this payment was processing. Refresh Billing & Plan.");
    }
    if (input.metadata.targetActiveBranchCount <= currentEntitlement) {
      await persistBillingVariant(admin, organization.id, input.metadata.variantId);
      await markPromotionRedemptionConverted(admin, input.checkoutSessionId);
      return { periodEnd: organization.subscription_current_period_end, duplicate: true, additionalBranch: true };
    }

    const update = await admin
      .from("organizations")
      .update({
        subscription_status: "active",
        subscription_plan: "premium",
        subscription_billing_mode: "temporary_qrph",
        subscription_entitled_branch_count: input.metadata.targetActiveBranchCount,
        subscription_provider_checkout_session_id: input.checkoutSessionId,
        subscription_provider_payment_intent_id: input.paymentIntentId,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id);
    if (update.error) throw new Error("The payment was confirmed but the paid branch entitlement could not be updated.");

    await persistBillingVariant(admin, organization.id, input.metadata.variantId);
    await markPromotionRedemptionConverted(admin, input.checkoutSessionId);
    return { periodEnd: organization.subscription_current_period_end, duplicate: false, additionalBranch: true };
  }

  if (
    organization.subscription_billing_mode === "temporary_qrph" &&
    organization.subscription_provider_checkout_session_id === input.checkoutSessionId &&
    currentStatus === "active" &&
    organization.subscription_current_period_end
  ) {
    await persistBillingVariant(admin, organization.id, input.metadata.variantId);
    await markPromotionRedemptionConverted(admin, input.checkoutSessionId);
    return { periodEnd: organization.subscription_current_period_end, duplicate: true };
  }

  const now = new Date();
  const currentPeriodEnd = organization.subscription_current_period_end ? new Date(organization.subscription_current_period_end) : null;
  const baseDate = currentPeriodEnd && !Number.isNaN(currentPeriodEnd.getTime()) && currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  const periodEnd = addBillingMonths(baseDate, input.metadata.intervalUnit === "year" ? input.metadata.intervalCount * 12 : input.metadata.intervalCount);

  const update = await admin
    .from("organizations")
    .update({
      subscription_status: "active",
      subscription_plan: "premium",
      subscription_billing_mode: "temporary_qrph",
      subscription_current_period_end: periodEnd.toISOString(),
      subscription_provider_checkout_session_id: input.checkoutSessionId,
      subscription_provider_payment_intent_id: input.paymentIntentId,
      subscription_provider_subscription_id: null,
      subscription_entitled_branch_count: Math.max(input.metadata.activeBranchCount, 1),
      subscription_updated_at: now.toISOString(),
    })
    .eq("id", organization.id);
  if (update.error) throw new Error("The QR Ph payment was confirmed but the organization billing record could not be updated.");

  await persistBillingVariant(admin, organization.id, input.metadata.variantId);
  await markPromotionRedemptionConverted(admin, input.checkoutSessionId);

  return { periodEnd: periodEnd.toISOString(), duplicate: false };
}

async function persistBillingVariant(
  admin: NonNullable<ReturnType<typeof import("@/lib/employee-auth").createAdminClient>>,
  organizationId: string,
  variantId: string,
) {
  const result = await admin
    .from("organizations")
    .update({ subscription_billing_variant_id: variantId })
    .eq("id", organizationId);
  if (result.error) console.warn("[billing/qrph] Billing variant could not be recorded", result.error.message);
}

function addBillingMonths(value: Date, months: number) {
  const result = new Date(value.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isBillingPeriodCurrent(value: string | null) {
  if (!value) return false;
  const end = new Date(value);
  return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
