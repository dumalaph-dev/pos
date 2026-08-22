import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile, invalidateAdminProfile } from "@/lib/admin/profile";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateCatalogVariantPriceQuote, isPolicyGateOpen, MAX_BRANCH_ENTITLEMENT, type BillingVariant } from "@/lib/platform-operations";
import { readPromotionQuote, recordPromotionRedemption } from "@/lib/platform-promotions-server";
import { payMongoConfiguration, readPlatformOperations } from "@/lib/platform-operations-server";
import {
  createPayMongoCustomer,
  createPayMongoSubscription,
  ensurePayMongoPlan,
  getPayMongoPaymentIntent,
  getPayMongoSubscription,
  PayMongoApiError,
  readNestedResourceId,
  readPayMongoString,
  resourceAttributes,
} from "@/lib/paymongo-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type OrganizationRecord = {
  id: string;
  account_status: "active" | "suspended";
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_provider_customer_id: string | null;
  subscription_provider_plan_id: string | null;
  subscription_provider_subscription_id: string | null;
  subscription_provider_payment_intent_id: string | null;
  subscription_updated_at: string | null;
  subscription_current_period_end: string | null;
  subscription_billing_mode: "recurring" | "temporary_qrph" | null;
  subscription_pending_branch_count: number | null;
};

type CheckoutPaymentIntent = {
  id: string;
  clientKey: string | null;
  status: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse("Sign in as the business owner before starting checkout.", 401);

    const profile = await getAdminProfile(user.id);
    if (!profile || profile.role !== "admin") return errorResponse("Only the business owner can start a subscription.", 403);

    const admin = createAdminClient();
    if (!admin) return errorResponse("The billing database client is not configured.", 503);

    const operations = await readPlatformOperations(admin);
    if (!operations.catalog.schemaAvailable || !operations.policies.schemaAvailable) {
      return errorResponse("Apply Supabase migrations 0027_platform_operations.sql and 0068_branch_billing_pricing.sql before enabling checkout.", 503);
    }
    if (!isPolicyGateOpen(operations.policies)) {
      return errorResponse("Checkout is locked until both the billing and support policies are published.", 423);
    }

    const provider = payMongoConfiguration();
    if (!provider.secretKeyConfigured || !provider.webhookSecretConfigured || !provider.subscriptionsEnabled || !provider.publicKeyConfigured || !provider.keyModeConsistent) {
      return errorResponse("PayMongo checkout is not ready. Configure matching test or live public/secret keys, the webhook secret, and subscription activation first.", 503);
    }

    const organizationResult = await admin
      .from("organizations")
      .select("id, account_status, subscription_status, subscription_plan, subscription_provider_customer_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_updated_at, subscription_current_period_end, subscription_billing_mode, subscription_pending_branch_count")
      .eq("id", profile.org_id)
      .maybeSingle();
    let organizationData = organizationResult.data;
    if (organizationResult.error) {
      // Keep the recurring checkout compatible while migration 0036 is still
      // rolling out; the temporary-mode fields are optional for this path.
      const fallback = await admin
        .from("organizations")
        .select("id, account_status, subscription_status, subscription_plan, subscription_provider_customer_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_updated_at, subscription_current_period_end")
        .eq("id", profile.org_id)
        .maybeSingle();
      if (fallback.error) return errorResponse("Apply Supabase migrations 0025 and 0027 before enabling checkout.", 503);
      organizationData = fallback.data as unknown as typeof organizationResult.data;
    }

    const organization = organizationData as OrganizationRecord | null;
    if (!organization) return errorResponse("Your POS organization could not be found.", 404);
    if (organization.account_status === "suspended") return errorResponse("This organization is suspended. Contact support before starting billing.", 423);

    const activeBranchesResult = await admin
      .from("stores")
      .select("id")
      .eq("org_id", organization.id)
      .eq("is_active", true);
    if (activeBranchesResult.error) return errorResponse("The active branch count could not be verified. Try again after the branch data is available.", 503);
    const activeBranchCount = Math.max(activeBranchesResult.data?.length ?? 0, 1);

    const body = await readJson(request);
    const variantId = isRecord(body) && typeof body.variantId === "string" ? body.variantId.trim() : "";
    const promoCode = isRecord(body) && typeof body.promoCode === "string" ? body.promoCode.trim() : "";
    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant || !variant.id) return errorResponse("Choose an active subscription option from the current pricing catalog.", 400);
    if (variant.intervalUnit === "year" && operations.policies.billing.settings.annualRenewal === "manual_review") {
      return errorResponse("Annual automatic renewal is disabled by the published billing policy. Choose monthly billing or contact support.", 409);
    }

    const status = normalizeSubscriptionStatus(organization.subscription_status);
    const temporaryAccessExpired = organization.subscription_billing_mode === "temporary_qrph"
      && organization.subscription_current_period_end
      && !Number.isNaN(new Date(organization.subscription_current_period_end).getTime())
      && new Date(organization.subscription_current_period_end).getTime() <= Date.now();
    const expiredTrialCanStartBilling = status === "paused"
      && !organization.subscription_provider_subscription_id
      && !organization.subscription_provider_payment_intent_id;
    if (status === "active" || status === "past_due" || (status === "paused" && !expiredTrialCanStartBilling)) {
      if (status === "active" && temporaryAccessExpired) {
        // A completed prepaid QR Ph period can transition to recurring billing.
      } else {
      return errorResponse("This organization already has a billing connection. Use the existing subscription instead of starting another one.", 409);
      }
    }

    const requestedTargetBranchCount = isRecord(body) && Number.isSafeInteger(body.targetActiveBranchCount) ? Number(body.targetActiveBranchCount) : null;
    if (requestedTargetBranchCount !== null && (requestedTargetBranchCount < activeBranchCount + 1 || requestedTargetBranchCount > MAX_BRANCH_ENTITLEMENT)) {
      return errorResponse("The selected branch capacity is no longer valid. Refresh Billing & Plan before starting checkout.", 409);
    }
    const billingBranchCount = requestedTargetBranchCount ?? activeBranchCount;
    const pricingQuote = calculateCatalogVariantPriceQuote(operations.catalog, variant, billingBranchCount);
    const baseAmountCentavos = pricingQuote.termTotalCentavos;
    const promotionQuote = await readPromotionQuote(admin, {
      code: promoCode,
      organizationId: organization.id,
      variant,
      baseAmountCentavos,
    });
    if (!promotionQuote.ok) return errorResponse(promotionQuote.message, promotionQuote.schemaAvailable ? 422 : 503);
    const hasPromotion = Boolean(promotionQuote.promotionId && promotionQuote.code);
    const amountCentavos = promotionQuote.finalAmountCentavos;
    if (amountCentavos < 2_000) return errorResponse("The selected price is below PayMongo's minimum subscription amount.", 400);

    if (status === "incomplete" && organization.subscription_provider_subscription_id) {
      const existing = await resumeIncompleteSubscription(organization, variant, amountCentavos, hasPromotion || billingBranchCount !== operations.catalog.includedBranchCount ? null : variant.paymongoPlanId);
      if (existing instanceof NextResponse) return existing;
      if (existing) return NextResponse.json(existing);
    }

    const plan = await ensurePayMongoPlan({
      existingPlanId: hasPromotion || billingBranchCount !== operations.catalog.includedBranchCount ? null : variant.paymongoPlanId,
      variantId: providerPlanVariantId(variant.id, billingBranchCount, hasPromotion ? promotionQuote.code : null),
      label: providerPlanLabel(variant.label, billingBranchCount, hasPromotion ? promotionQuote.code : null),
      amountCentavos,
      intervalUnit: variant.intervalUnit,
      intervalCount: variant.intervalCount,
    });

    if (!hasPromotion && billingBranchCount === operations.catalog.includedBranchCount && plan.id !== variant.paymongoPlanId) {
      const planUpdate = await admin
        .from("platform_billing_variants")
        .update({ paymongo_plan_id: plan.id, updated_at: new Date().toISOString() })
        .eq("id", variant.id);
      if (planUpdate.error) throw new Error("The new PayMongo plan was created but could not be saved to the billing catalog.");
    }

    const customer = await createPayMongoCustomer({
      existingCustomerId: organization.subscription_provider_customer_id,
      firstName: firstName(profile.full_name),
      lastName: lastName(profile.full_name),
      email: user.email || "",
      idempotencyKey: `pos-customer-${organization.id}`,
    });

    const subscription = await createPayMongoSubscription(plan.id, customer.id, subscriptionAttemptKey(organization));
    const subscriptionAttributes = resourceAttributes(subscription.response);
    if (!providerSubscriptionMatchesVariant(subscriptionAttributes, plan.id, variant, amountCentavos)) {
      return errorResponse("A different subscription payment is already in progress. Finish it or wait for it to expire before choosing another plan.", 409);
    }
    const paymentIntent = await checkoutPaymentIntent(subscription.id, subscriptionAttributes);
    const providerStatus = readPayMongoString(subscriptionAttributes, "status");
    const localStatus = localSubscriptionStatus(providerStatus, paymentIntent.status);
    const periodEnd = periodEndValue(readPayMongoString(resourceAttributes(subscription.response), "next_billing_schedule"));
    const saved = await saveOrganizationBilling(admin, organization.id, {
      subscription_status: localStatus,
      subscription_plan: "premium",
      subscription_provider_customer_id: customer.id,
      subscription_provider_plan_id: plan.id,
      subscription_provider_subscription_id: subscription.id,
      subscription_provider_payment_intent_id: paymentIntent.id,
      ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
      ...(localStatus === "active"
        ? { subscription_entitled_branch_count: billingBranchCount, subscription_pending_branch_count: null }
        : { subscription_pending_branch_count: billingBranchCount }),
    });
    if (!saved) throw new Error("The subscription was created but the organization billing record could not be saved.");

    const variantSaved = await admin
      .from("organizations")
      .update({ subscription_billing_variant_id: variant.id })
      .eq("id", organization.id);
    if (variantSaved.error) console.warn("[billing/subscribe] Billing variant could not be recorded", variantSaved.error.message);

    if (hasPromotion) {
      await recordPromotionRedemption(admin, {
        promotionId: promotionQuote.promotionId!,
        organizationId: organization.id,
        billingVariantId: variant.id,
        checkoutMode: "recurring",
        status: localStatus === "active" ? "converted" : "started",
        baseAmountCentavos: promotionQuote.baseAmountCentavos,
        discountAmountCentavos: promotionQuote.discountAmountCentavos,
        finalAmountCentavos: promotionQuote.finalAmountCentavos,
        providerReference: subscription.id,
      });
    }

    // Migration 0036 adds the temporary QR Ph mode. Keep this update
    // best-effort so a rolling deploy remains compatible before that
    // migration is applied, while a later Maya/card checkout restores the
    // organization to the recurring billing mode.
    const modeReset = await admin
      .from("organizations")
      .update({ subscription_billing_mode: "recurring", subscription_provider_checkout_session_id: null })
      .eq("id", organization.id);
    if (modeReset.error) console.warn("[billing/subscribe] Temporary QR Ph mode could not be reset", modeReset.error.message);

    // The profile cache may contain the paused trial snapshot that allowed the
    // owner to reach checkout. Drop it before the post-payment navigation so a
    // successful first payment restores protected access immediately.
    invalidateAdminProfile(user.id);

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      paymentIntentId: paymentIntent.id,
      clientKey: paymentIntent.clientKey,
      paymentIntentStatus: paymentIntent.status,
      amountCentavos,
      baseAmountCentavos: promotionQuote.baseAmountCentavos,
      discountAmountCentavos: promotionQuote.discountAmountCentavos,
      promotionCode: promotionQuote.code,
      activeBranchCount: billingBranchCount,
      billableBranchCount: pricingQuote.billableBranchCount,
      currency: "PHP",
    });
  } catch (error) {
    if (error instanceof PayMongoApiError) {
      console.error("[billing/subscribe] PayMongo API error", error.status, error.providerMessage);
      const providerMessage = error.providerMessage.toLowerCase();
      const accountCapabilityMessage = providerMessage.includes("no subscription payment methods are configured")
        ? " PayMongo has not enabled a subscription-capable payment method for this organization. Enable Visa/Mastercard cards or Maya, then request Subscriptions activation from PayMongo."
        : "";
      const diagnostic = process.env.PAYMONGO_SECRET_KEY?.trim().startsWith("sk_test_") && error.providerMessage
        ? ` PayMongo test response: ${error.providerMessage.slice(0, 240)}`
        : "";
      return errorResponse(`PayMongo could not start this subscription. Check account activation and payment settings, then try again.${accountCapabilityMessage}${diagnostic}`, 502);
    }
    console.error("[billing/subscribe] Unexpected error", error instanceof Error ? error.message : error);
    return errorResponse("Checkout could not be started. Please try again or contact support.", 500);
  }
}

async function resumeIncompleteSubscription(organization: OrganizationRecord, variant: BillingVariant, amountCentavos: number, expectedPlanId: string | null) {
  try {
    const existing = await getPayMongoSubscription(organization.subscription_provider_subscription_id!);
    const attributes = existing.attributes;
    if (!providerSubscriptionMatchesVariant(attributes, expectedPlanId, variant, amountCentavos)) {
      return errorResponse("A different subscription payment is already in progress. Finish it or wait for it to expire before choosing another plan.", 409);
    }

    const paymentIntent = await checkoutPaymentIntent(organization.subscription_provider_subscription_id!, attributes);
    return {
      ok: true,
      subscriptionId: organization.subscription_provider_subscription_id,
      paymentIntentId: paymentIntent.id,
      clientKey: paymentIntent.clientKey,
      paymentIntentStatus: paymentIntent.status,
      amountCentavos: null,
      currency: "PHP",
      variantId: variant.id,
    };
  } catch (error) {
    if (error instanceof PayMongoApiError && error.status === 404) return null;
    throw error;
  }
}

async function checkoutPaymentIntent(subscriptionId: string, subscriptionAttributes: Record<string, unknown>): Promise<CheckoutPaymentIntent> {
  const latestInvoice = isRecord(subscriptionAttributes.latest_invoice) ? subscriptionAttributes.latest_invoice : null;
  const paymentIntentId = latestInvoice ? readNestedResourceId(latestInvoice.payment_intent) : null;
  if (!paymentIntentId) throw new Error(`PayMongo subscription ${subscriptionId} did not return its first payment intent.`);

  const paymentIntent = await getPayMongoPaymentIntent(paymentIntentId);
  const clientKey = readPayMongoString(paymentIntent.attributes, "client_key");
  const status = readPayMongoString(paymentIntent.attributes, "status") || "awaiting_payment_method";
  if (!clientKey && status !== "succeeded") throw new Error("PayMongo did not return a client key for the first payment.");
  return { id: paymentIntentId, clientKey, status };
}

async function saveOrganizationBilling(admin: NonNullable<ReturnType<typeof createAdminClient>>, organizationId: string, values: Record<string, string | number | null>) {
  const result = await admin
    .from("organizations")
    .update({ ...values, subscription_updated_at: new Date().toISOString() })
    .eq("id", organizationId);
  return !result.error;
}

function localSubscriptionStatus(providerStatus: string | null, paymentIntentStatus: string) {
  if (providerStatus === "active" || paymentIntentStatus === "succeeded") return "active" as const;
  if (providerStatus === "past_due") return "past_due" as const;
  if (providerStatus === "unpaid") return "paused" as const;
  if (providerStatus === "cancelled" || providerStatus === "incomplete_cancelled") return "canceled" as const;
  return "incomplete" as const;
}

function periodEndValue(value: string | null) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function providerSubscriptionMatchesVariant(attributes: Record<string, unknown>, expectedPlanId: string | null, variant: BillingVariant, amountCentavos: number) {
  const providerPlanId = readProviderPlanId(attributes);
  if (providerPlanId && expectedPlanId && providerPlanId !== expectedPlanId) return false;

  const providerPlan = isRecord(attributes.plan) ? attributes.plan : null;
  if (!providerPlan) return Boolean(providerPlanId && expectedPlanId && providerPlanId === expectedPlanId);

  const providerAmount = Number(providerPlan.amount);
  const providerInterval = typeof providerPlan.interval === "string" ? providerPlan.interval : null;
  const providerIntervalCount = Number(providerPlan.interval_count);
  const intervalMatches = variant.intervalUnit === "month"
    ? providerInterval === "monthly" || providerInterval === "month"
    : providerInterval === "yearly" || providerInterval === "year";
  return providerAmount === amountCentavos && intervalMatches && providerIntervalCount === variant.intervalCount;
}

function readProviderPlanId(attributes: Record<string, unknown>) {
  const direct = readPayMongoString(attributes, "plan_id");
  if (direct) return direct;
  const plan = isRecord(attributes.plan) ? attributes.plan : null;
  return plan && typeof plan.id === "string" ? plan.id : null;
}

function subscriptionAttemptKey(organization: OrganizationRecord) {
  const revision = (organization.subscription_updated_at ?? "new").replace(/[^a-zA-Z0-9]/g, "");
  return `pos-subscription-${organization.id}-${revision}`;
}

function providerPlanVariantId(variantId: string, activeBranchCount: number, promotionCode: string | null) {
  const branchSuffix = activeBranchCount > 1 ? `-branches-${activeBranchCount}` : "";
  return `${variantId}${branchSuffix}${promotionCode ? `-${promotionCode}` : ""}`;
}

function providerPlanLabel(label: string, activeBranchCount: number, promotionCode: string | null) {
  const branchLabel = `${activeBranchCount} active branch${activeBranchCount === 1 ? "" : "es"}`;
  return `${label} · ${branchLabel}${promotionCode ? ` · ${promotionCode}` : ""}`;
}

function firstName(value: string | null) {
  return (value?.trim().split(/\s+/)[0] || "Dumala").slice(0, 80);
}

function lastName(value: string | null) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) || [];
  return (parts.slice(1).join(" ") || "POS Owner").slice(0, 80);
}

async function readJson(request: NextRequest) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
