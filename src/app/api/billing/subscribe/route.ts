import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { isPolicyGateOpen, calculateBillingVariantPrice, type BillingVariant } from "@/lib/platform-operations";
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
      return errorResponse("Apply Supabase migration 0027_platform_operations.sql before enabling checkout.", 503);
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
      .select("id, account_status, subscription_status, subscription_plan, subscription_provider_customer_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (organizationResult.error) return errorResponse("Apply Supabase migrations 0025 and 0027 before enabling checkout.", 503);

    const organization = organizationResult.data as OrganizationRecord | null;
    if (!organization) return errorResponse("Your POS organization could not be found.", 404);
    if (organization.account_status === "suspended") return errorResponse("This organization is suspended. Contact support before starting billing.", 423);

    const body = await readJson(request);
    const variantId = isRecord(body) && typeof body.variantId === "string" ? body.variantId.trim() : "";
    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant || !variant.id) return errorResponse("Choose an active subscription option from the current pricing catalog.", 400);
    if (variant.intervalUnit === "year" && operations.policies.billing.settings.annualRenewal === "manual_review") {
      return errorResponse("Annual automatic renewal is disabled by the published billing policy. Choose monthly billing or contact support.", 409);
    }

    const status = normalizeSubscriptionStatus(organization.subscription_status);
    if (status === "active" || status === "past_due" || status === "paused") {
      return errorResponse("This organization already has a billing connection. Use the existing subscription instead of starting another one.", 409);
    }

    if (status === "incomplete" && organization.subscription_provider_subscription_id) {
      const existing = await resumeIncompleteSubscription(organization, variant);
      if (existing instanceof NextResponse) return existing;
      if (existing) return NextResponse.json(existing);
    }

    const amountCentavos = calculateBillingVariantPrice(
      operations.catalog.monthlyPriceCentavos,
      variant.intervalUnit,
      variant.intervalCount,
      variant.discountPercent,
    );
    if (amountCentavos < 2_000) return errorResponse("The selected price is below PayMongo's minimum subscription amount.", 400);

    const plan = await ensurePayMongoPlan({
      existingPlanId: variant.paymongoPlanId,
      variantId: variant.id,
      label: variant.label,
      amountCentavos,
      intervalUnit: variant.intervalUnit,
      intervalCount: variant.intervalCount,
    });

    if (plan.id !== variant.paymongoPlanId) {
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

    const subscription = await createPayMongoSubscription(plan.id, customer.id, `pos-subscription-${organization.id}-${variant.id}-${crypto.randomUUID()}`);
    const paymentIntent = await checkoutPaymentIntent(subscription.id, resourceAttributes(subscription.response));
    const providerStatus = readPayMongoString(resourceAttributes(subscription.response), "status");
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
    });
    if (!saved) throw new Error("The subscription was created but the organization billing record could not be saved.");

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      paymentIntentId: paymentIntent.id,
      clientKey: paymentIntent.clientKey,
      paymentIntentStatus: paymentIntent.status,
      amountCentavos,
      currency: "PHP",
    });
  } catch (error) {
    if (error instanceof PayMongoApiError) {
      console.error("[billing/subscribe] PayMongo API error", error.status, error.providerMessage);
      return errorResponse("PayMongo could not start this subscription. Check account activation and payment settings, then try again.", 502);
    }
    console.error("[billing/subscribe] Unexpected error", error instanceof Error ? error.message : error);
    return errorResponse("Checkout could not be started. Please try again or contact support.", 500);
  }
}

async function resumeIncompleteSubscription(organization: OrganizationRecord, variant: BillingVariant) {
  try {
    const existing = await getPayMongoSubscription(organization.subscription_provider_subscription_id!);
    const attributes = existing.attributes;
    const providerPlanId = readPayMongoString(attributes, "plan_id");
    if (providerPlanId && organization.subscription_provider_plan_id && providerPlanId !== organization.subscription_provider_plan_id) {
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

async function saveOrganizationBilling(admin: NonNullable<ReturnType<typeof createAdminClient>>, organizationId: string, values: Record<string, string | null>) {
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
