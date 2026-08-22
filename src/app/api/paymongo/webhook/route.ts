import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { invalidateAdminProfilesForOrganization } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { markPromotionRedemptionConverted } from "@/lib/platform-promotions-server";
import { readPayMongoString, resourceAttributes } from "@/lib/paymongo-server";
import { isMissingReferralSchemaError, qualifyReferralForPaidConversion } from "@/lib/referrals-server";
import { activateTemporaryQrPhCheckout, readCheckoutPaymentStatus, readTemporaryQrPhCheckoutMetadata } from "@/lib/temporary-qrph";

type ProviderResource = {
  id?: string;
  type?: string;
  attributes?: unknown;
};

type NormalizedProviderEvent = {
  id: string;
  type: string;
  livemode: boolean;
  resource: ProviderResource | null;
};

type OrganizationBillingRecord = {
  id: string;
  subscription_status: string | null;
  subscription_provider_subscription_id: string | null;
  subscription_pending_branch_count: number | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim();
  if (!secret) return webhookError("Webhook verification is not configured.", 503);

  const signature = request.headers.get("Paymongo-Signature");
  const payload = parseJson(rawBody);
  const event = readProviderEvent(payload);
  if (!signature || !event || !verifySignature(signature, secret, rawBody, event.livemode)) {
    return webhookError("Invalid webhook signature.", 400);
  }

  const admin = createAdminClient();
  if (!admin) return webhookError("The billing database client is not configured.", 503);

  const eventId = event.id;
  const eventType = event.type;
  const existing = await admin
    .from("billing_provider_events")
    .select("id, processed_at")
    .eq("provider", "paymongo")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (existing.error) return webhookError("Apply Supabase migration 0027_platform_operations.sql before accepting billing webhooks.", 503);
  if (existing.data?.processed_at) return NextResponse.json({ ok: true, duplicate: true });

  if (!existing.data) {
    const inserted = await admin.from("billing_provider_events").insert({
      provider: "paymongo",
      provider_event_id: eventId,
      event_type: eventType,
      payload,
    });
    if (inserted.error && inserted.error.code !== "23505") {
      return webhookError("The billing webhook could not be recorded.", 500);
    }
  }

  try {
    await applyProviderEvent(admin, eventType, event.resource);
    const completed = await admin
      .from("billing_provider_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", "paymongo")
      .eq("provider_event_id", eventId);
    if (completed.error) return webhookError("The billing webhook was processed but could not be finalized.", 500);
    return NextResponse.json({ ok: true, eventType });
  } catch (error) {
    console.error("[paymongo/webhook] Event processing failed", eventId, error instanceof Error ? error.message : error);
    return webhookError("The billing webhook could not be processed.", 500);
  }
}

async function applyProviderEvent(admin: NonNullable<ReturnType<typeof createAdminClient>>, eventType: string, resource: ProviderResource | null) {
  if (eventType === "checkout_session.payment.paid") {
    await applyTemporaryQrPhEvent(admin, resource);
    return;
  }

  const resourceId = resource?.id ?? null;
  const attributes = resourceAttributes({ data: { attributes: resource?.attributes } });
  const customerId = readPayMongoString(attributes, "customer_id");
  const paymentIntentId = eventType.startsWith("payment_intent.") ? resourceId : readPayMongoString(attributes, "payment_intent_id");
  const subscriptionId = eventType.startsWith("subscription.invoice.")
    ? readPayMongoString(attributes, "resource_id") ?? resourceId
    : eventType.startsWith("subscription.")
      ? resourceId
      : null;
  const organization = await findOrganization(admin, subscriptionId, customerId, paymentIntentId);
  if (!organization) return;

  const status = eventSubscriptionStatus(eventType, readPayMongoString(attributes, "status"), organization.subscription_status);
  if (!status) return;

  const update: Record<string, string | number | null> = {
    subscription_status: status,
    subscription_updated_at: new Date().toISOString(),
  };
  if (subscriptionId) update.subscription_provider_subscription_id = subscriptionId;
  if (customerId) update.subscription_provider_customer_id = customerId;
  if (paymentIntentId) update.subscription_provider_payment_intent_id = paymentIntentId;

  const nextBillingSchedule = readPayMongoString(attributes, "next_billing_schedule");
  const dueDate = readPayMongoString(attributes, "due_date");
  const periodEnd = periodEndValue(nextBillingSchedule || (eventType === "subscription.invoice.paid" ? dueDate : null));
  if (periodEnd) update.subscription_current_period_end = periodEnd;
  if (status === "active") {
    const activeBranchesResult = await admin
      .from("stores")
      .select("id")
      .eq("org_id", organization.id)
      .eq("is_active", true);
    if (activeBranchesResult.error) throw new Error("The subscription is active but its branch entitlement could not be verified.");
    const activeBranchCount = Math.max(activeBranchesResult.data?.length ?? 0, 1);
    update.subscription_entitled_branch_count = Math.max(Number(organization.subscription_pending_branch_count) || activeBranchCount, activeBranchCount);
    update.subscription_pending_branch_count = null;
  }

  const result = await admin.from("organizations").update(update).eq("id", organization.id);
  if (result.error) throw new Error("Organization billing status could not be updated.");
  if (status === "active") {
    await markPromotionRedemptionConverted(admin, organization.subscription_provider_subscription_id ?? subscriptionId ?? paymentIntentId, paymentIntentId);
    const referralReward = await qualifyReferralForPaidConversion(admin, organization.id);
    if (!referralReward.schemaAvailable) {
      console.warn("[paymongo/webhook] Referral reward migration is not available; billing access was still updated.");
    } else if (referralReward.error) {
      if (isMissingReferralSchemaError(referralReward.error)) {
        console.warn("[paymongo/webhook] Referral reward schema is incomplete; billing access was still updated.");
      } else {
        throw new Error(`Referral reward qualification failed: ${referralReward.error}`);
      }
    } else if (referralReward.rewarded) {
      console.info("[paymongo/webhook] Referral reward issued", {
        referralId: referralReward.referralId,
        rewardDays: referralReward.rewardDays,
      });
    }
    await invalidateAdminProfilesForOrganization(organization.id);
  }
}

async function applyTemporaryQrPhEvent(admin: NonNullable<ReturnType<typeof createAdminClient>>, resource: ProviderResource | null) {
  if (!resource?.id) return;
  const attributes = resourceAttributes({ data: { attributes: resource.attributes } });
  const metadata = readTemporaryQrPhCheckoutMetadata(attributes);
  if (!metadata) return;

  const payment = readCheckoutPaymentStatus(attributes);
  if (payment.status !== "paid") return;

  await activateTemporaryQrPhCheckout(admin, {
    checkoutSessionId: resource.id,
    paymentIntentId: payment.paymentIntentId,
    paidAmountCentavos: payment.paidAmountCentavos,
    metadata,
  });
  await invalidateAdminProfilesForOrganization(metadata.organizationId);
}

async function findOrganization(admin: NonNullable<ReturnType<typeof createAdminClient>>, subscriptionId: string | null, customerId: string | null, paymentIntentId: string | null) {
  if (subscriptionId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status, subscription_provider_subscription_id, subscription_pending_branch_count")
      .eq("subscription_provider_subscription_id", subscriptionId)
      .limit(1);
    if (result.error) throw new Error("Subscription provider fields are not available.");
    const match = (result.data ?? [])[0] as OrganizationBillingRecord | undefined;
    if (match) return match;
  }

  if (customerId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status, subscription_provider_subscription_id, subscription_pending_branch_count")
      .eq("subscription_provider_customer_id", customerId)
      .limit(1);
    if (result.error) throw new Error("Customer provider fields are not available.");
    const match = (result.data ?? [])[0] as OrganizationBillingRecord | undefined;
    if (match) return match;
  }

  if (paymentIntentId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status, subscription_provider_subscription_id, subscription_pending_branch_count")
      .eq("subscription_provider_payment_intent_id", paymentIntentId)
      .limit(1);
    if (result.error) throw new Error("Payment intent provider fields are not available.");
    return ((result.data ?? [])[0] as OrganizationBillingRecord | undefined) ?? null;
  }

  return null;
}

function eventSubscriptionStatus(eventType: string, providerStatus: string | null, currentStatus: string | null) {
  if (eventType === "subscription.activated" || eventType === "subscription.invoice.paid" || eventType === "payment.paid") return "active" as const;
  if (eventType === "payment_intent.succeeded") return "active" as const;
  if (eventType === "payment_intent.awaiting_payment_method") {
    return normalizeSubscriptionStatus(currentStatus) === "incomplete" ? "incomplete" as const : null;
  }
  if (eventType === "subscription.invoice.payment_failed" || eventType === "payment.failed") {
    return normalizeSubscriptionStatus(currentStatus) === "incomplete" ? "incomplete" as const : "past_due" as const;
  }

  switch (providerStatus) {
    case "active": return "active" as const;
    case "past_due": return "past_due" as const;
    case "unpaid": return "paused" as const;
    case "cancelled":
    case "incomplete_cancelled": return "canceled" as const;
    case "incomplete": return "incomplete" as const;
    default: return null;
  }
}

function verifySignature(header: string, secret: string, rawBody: string, livemode: boolean) {
  const parts = new Map(header.split(",").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")] as const;
  }));
  const timestamp = parts.get("t");
  const signature = parts.get(livemode ? "li" : "te");
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 10 * 60 * 1000) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function periodEndValue(value: string | null) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readProviderEvent(value: unknown): NormalizedProviderEvent | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const envelope = value.data;
  const legacyAttributes = isRecord(envelope.attributes) ? envelope.attributes : null;
  if (legacyAttributes && typeof legacyAttributes.type === "string" && typeof envelope.id === "string") {
    return {
      id: envelope.id,
      type: legacyAttributes.type,
      livemode: legacyAttributes.livemode === true,
      resource: isRecord(legacyAttributes.data) ? legacyAttributes.data as ProviderResource : null,
    };
  }

  if (typeof envelope.type === "string") {
    const resource = isRecord(envelope.data) ? envelope.data as ProviderResource : null;
    const id = typeof envelope.id === "string"
      ? envelope.id
      : typeof value.id === "string"
        ? value.id
        : resource && typeof resource.id === "string"
          ? `${envelope.type}:${resource.id}`
          : null;
    if (!id) return null;
    return {
      id,
      type: envelope.type,
      livemode: envelope.livemode === true,
      resource,
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function webhookError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
