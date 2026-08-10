import { normalizeSubscriptionStatus } from "@/lib/billing";
import { readNestedResourceId, type PayMongoResourceAttributes } from "@/lib/paymongo-server";

export type TemporaryQrPhCheckoutMetadata = {
  organizationId: string;
  variantId: string;
  intervalUnit: "month" | "year";
  intervalCount: number;
  amountCentavos: number;
};

type TemporaryQrPhOrganization = {
  id: string;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  subscription_billing_mode: string | null;
  subscription_provider_checkout_session_id: string | null;
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
  if (!organizationId || !variantId || !intervalUnit || !intervalCount || !amountCentavos || amountCentavos < 100) return null;

  return { organizationId, variantId, intervalUnit, intervalCount, amountCentavos };
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
    .select("id, subscription_status, subscription_current_period_end, subscription_billing_mode, subscription_provider_checkout_session_id")
    .eq("id", input.metadata.organizationId)
    .maybeSingle();
  if (result.error) throw new Error("Temporary QR Ph billing fields are not available. Apply migration 0036_temporary_qrph_checkout.sql.");

  const organization = result.data as TemporaryQrPhOrganization | null;
  if (!organization) throw new Error("The organization linked to this QR Ph checkout could not be found.");
  if (input.paidAmountCentavos !== null && input.paidAmountCentavos !== input.metadata.amountCentavos) {
    throw new Error("The QR Ph payment amount did not match the selected plan.");
  }

  const currentStatus = normalizeSubscriptionStatus(organization.subscription_status);
  if (
    organization.subscription_billing_mode === "temporary_qrph" &&
    organization.subscription_provider_checkout_session_id === input.checkoutSessionId &&
    currentStatus === "active" &&
    organization.subscription_current_period_end
  ) {
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
      subscription_updated_at: now.toISOString(),
    })
    .eq("id", organization.id);
  if (update.error) throw new Error("The QR Ph payment was confirmed but the organization billing record could not be updated.");

  return { periodEnd: periodEnd.toISOString(), duplicate: false };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
