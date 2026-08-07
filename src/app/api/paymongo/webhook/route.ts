import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/employee-auth";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { readPayMongoString, resourceAttributes } from "@/lib/paymongo-server";

type ProviderEvent = {
  data: {
    id: string;
    attributes: {
      type: string;
      livemode?: boolean;
      data?: {
        id?: string;
        type?: string;
        attributes?: unknown;
      };
    };
  };
};

type OrganizationBillingRecord = {
  id: string;
  subscription_status: string | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim();
  if (!secret) return webhookError("Webhook verification is not configured.", 503);

  const signature = request.headers.get("Paymongo-Signature");
  const payload = parseJson(rawBody);
  if (!signature || !isProviderEvent(payload) || !verifySignature(signature, secret, rawBody, payload.data.attributes.livemode === true)) {
    return webhookError("Invalid webhook signature.", 400);
  }

  const admin = createAdminClient();
  if (!admin) return webhookError("The billing database client is not configured.", 503);

  const eventId = payload.data.id;
  const eventType = payload.data.attributes.type;
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
    await applyProviderEvent(admin, eventType, payload.data.attributes.data);
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

async function applyProviderEvent(admin: NonNullable<ReturnType<typeof createAdminClient>>, eventType: string, resource: ProviderEvent["data"]["attributes"]["data"]) {
  const resourceId = resource?.id ?? null;
  const attributes = resourceAttributes({ data: { attributes: resource?.attributes } });
  const customerId = readPayMongoString(attributes, "customer_id");
  const paymentIntentId = readPayMongoString(attributes, "payment_intent_id");
  const subscriptionId = eventType.startsWith("subscription.") ? resourceId : readPayMongoString(attributes, "resource_id");
  const organization = await findOrganization(admin, subscriptionId, customerId, paymentIntentId);
  if (!organization) return;

  const status = eventSubscriptionStatus(eventType, readPayMongoString(attributes, "status"), organization.subscription_status);
  if (!status) return;

  const update: Record<string, string> = {
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

  const result = await admin.from("organizations").update(update).eq("id", organization.id);
  if (result.error) throw new Error("Organization billing status could not be updated.");
}

async function findOrganization(admin: NonNullable<ReturnType<typeof createAdminClient>>, subscriptionId: string | null, customerId: string | null, paymentIntentId: string | null) {
  if (subscriptionId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status")
      .eq("subscription_provider_subscription_id", subscriptionId)
      .limit(1);
    if (result.error) throw new Error("Subscription provider fields are not available.");
    const match = (result.data ?? [])[0] as OrganizationBillingRecord | undefined;
    if (match) return match;
  }

  if (customerId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status")
      .eq("subscription_provider_customer_id", customerId)
      .limit(1);
    if (result.error) throw new Error("Customer provider fields are not available.");
    const match = (result.data ?? [])[0] as OrganizationBillingRecord | undefined;
    if (match) return match;
  }

  if (paymentIntentId) {
    const result = await admin
      .from("organizations")
      .select("id, subscription_status")
      .eq("subscription_provider_payment_intent_id", paymentIntentId)
      .limit(1);
    if (result.error) throw new Error("Payment intent provider fields are not available.");
    return ((result.data ?? [])[0] as OrganizationBillingRecord | undefined) ?? null;
  }

  return null;
}

function eventSubscriptionStatus(eventType: string, providerStatus: string | null, currentStatus: string | null) {
  if (eventType === "subscription.invoice.paid" || eventType === "payment.paid") return "active" as const;
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

function isProviderEvent(value: unknown): value is ProviderEvent {
  if (!isRecord(value) || !isRecord(value.data) || typeof value.data.id !== "string" || !isRecord(value.data.attributes)) return false;
  return typeof value.data.attributes.type === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function webhookError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
