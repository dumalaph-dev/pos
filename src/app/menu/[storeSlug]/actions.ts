"use server";

import { headers } from "next/headers";
import { getPublicMenuStoreForHostname } from "@/lib/online-ordering-server";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";
import {
  calculateOnlineOrderTotals,
  getDemoOnlineOrderNo,
  singaporeDateKey,
  type OnlineOrderingFulfillmentMethod,
  type PublicOnlineOrderResult,
} from "@/lib/online-ordering";

type OrderDraft = {
  productId: string;
  qty: number;
};

const INITIAL_RESULT: PublicOnlineOrderResult = { ok: false };

function fail(message: string): PublicOnlineOrderResult {
  return { ...INITIAL_RESULT, message };
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readRpcOrder(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const orderId = typeof record.order_id === "string" ? record.order_id : "";
  const orderNo = typeof record.order_no === "string" ? record.order_no : "";
  const queuePosition = typeof record.queue_position === "number" ? record.queue_position : Number(record.queue_position);
  const etaAt = typeof record.eta_at === "string" ? record.eta_at : "";
  const scheduledFor = typeof record.scheduled_for === "string" ? record.scheduled_for : undefined;
  const total = typeof record.total === "number" ? record.total : Number(record.total);
  const subtotal = typeof record.subtotal === "number" ? record.subtotal : Number(record.subtotal);
  const taxAmount = typeof record.tax_amount === "number" ? record.tax_amount : Number(record.tax_amount);
  const deliveryFee = typeof record.delivery_fee === "number" ? record.delivery_fee : Number(record.delivery_fee);
  const fulfillmentMethod = record.fulfillment_method === "delivery" ? "delivery" : "pickup";
  const phoneVerificationRequired = record.phone_verification_required === true;
  const phoneVerificationStatus: NonNullable<PublicOnlineOrderResult["phoneVerificationStatus"]> = record.phone_verification_status === "pending" || record.phone_verification_status === "verified" || record.phone_verification_status === "manual"
    ? record.phone_verification_status
    : "not_required";
  const verificationId = typeof record.verification_id === "string" ? record.verification_id : undefined;
  if (!orderId || !orderNo || !Number.isInteger(queuePosition) || queuePosition < 1 || !etaAt) return null;
  return {
    orderId,
    orderNo,
    queuePosition,
    etaAt,
    scheduledFor,
    total: Number.isFinite(total) ? total : undefined,
    subtotal: Number.isFinite(subtotal) ? subtotal : undefined,
    taxAmount: Number.isFinite(taxAmount) ? taxAmount : undefined,
    deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : undefined,
    fulfillmentMethod,
    phoneVerificationRequired,
    phoneVerificationStatus,
    verificationId,
    verificationCode: typeof record.verification_code === "string" ? record.verification_code : undefined,
    deduplicated: record.deduplicated === true,
  };
}

type RpcOrder = NonNullable<ReturnType<typeof readRpcOrder>>;

function readDraftItems(value: string): OrderDraft[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 40) return null;
    const items: OrderDraft[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const productId = typeof record.productId === "string" ? record.productId : "";
      const qty = typeof record.qty === "number" ? record.qty : Number(record.qty);
      if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 100) return null;
      items.push({ productId, qty });
    }
    return items;
  } catch {
    return null;
  }
}

function resolveEta(pickupDate: string, pickupSlot: string, queueCount: number, averagePrepMinutes: number, orderLeadMinutes: number, fulfillmentMethod: OnlineOrderingFulfillmentMethod, deliveryEtaMinutes: number) {
  if (pickupSlot !== "asap" && /^\d{2}:\d{2}$/.test(pickupSlot)) {
    const scheduled = new Date(`${pickupDate}T${pickupSlot}:00+08:00`);
    if (scheduled.getTime() > Date.now()) return scheduled;
  }
  const deliveryBuffer = fulfillmentMethod === "delivery" ? deliveryEtaMinutes : 0;
  return new Date(Date.now() + (orderLeadMinutes + deliveryBuffer + (queueCount + 1) * averagePrepMinutes) * 60_000);
}

async function sendOnlineOrderVerificationCode(phone: string, orderNo: string, code: string) {
  const endpoint = process.env.ONLINE_ORDER_SMS_WEBHOOK_URL;
  if (!endpoint) return false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.ONLINE_ORDER_SMS_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.ONLINE_ORDER_SMS_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ phone, code, orderNo, purpose: "online_order_phone_verification" }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function placementErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("sold out") || normalized.includes("unavailable")) return "One of the items just became unavailable. Refresh the menu and review your basket.";
  if (normalized.includes("minimum order")) return "Your order is below the store’s minimum order amount.";
  if (normalized.includes("rate limit") || normalized.includes("too many order attempts")) return "We’ve paused new attempts for a few minutes. Please wait and try again.";
  if (normalized.includes("outside the service area")) return "That address is outside the store’s delivery area.";
  if (normalized.includes("selected time") || normalized.includes("scheduling window")) return "That time slot is no longer available. Choose another slot and try again.";
  if (normalized.includes("phone")) return "Enter a valid mobile number the store can reach you on.";
  return "We could not place the order yet. Please review your details and try again.";
}

function cleanResult(order: RpcOrder, verificationSent = false): PublicOnlineOrderResult {
  return {
    ok: true,
    orderId: order.orderId,
    orderNo: order.orderNo,
    queuePosition: order.queuePosition,
    etaAt: order.etaAt,
    scheduledFor: order.scheduledFor,
    total: order.total,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    deliveryFee: order.deliveryFee,
    fulfillmentMethod: order.fulfillmentMethod as OnlineOrderingFulfillmentMethod,
    phoneVerificationRequired: order.phoneVerificationRequired,
    phoneVerificationStatus: order.phoneVerificationStatus,
    verificationId: order.verificationId,
    verificationSent,
    deduplicated: order.deduplicated,
  };
}

export async function placeOnlineOrder(_previousState: PublicOnlineOrderResult, formData: FormData): Promise<PublicOnlineOrderResult> {
  const requestHeaders = await headers();
  const storeSlug = readText(formData, "store_slug");
  const customerName = readText(formData, "customer_name");
  const customerPhone = readText(formData, "customer_phone");
  const fulfillmentMethod = (readText(formData, "fulfillment_method") || "pickup") as OnlineOrderingFulfillmentMethod;
  const pickupDate = readText(formData, "pickup_date") || singaporeDateKey();
  const pickupSlot = readText(formData, "pickup_slot") || "asap";
  const deliveryAddress = readText(formData, "delivery_address");
  const deliveryNote = readText(formData, "delivery_note");
  const note = readText(formData, "note");
  const requestId = readText(formData, "request_id");
  const legalAcknowledged = formData.get("legal_acknowledged") === "yes";
  const legalTermsVersion = readText(formData, "legal_terms_version");
  const legalPrivacyNoticeVersion = readText(formData, "legal_privacy_notice_version");
  const drafts = readDraftItems(readText(formData, "items"));

  if (!isUuid(requestId)) return fail("Refresh the menu and try placing your online order again.");
  if (!legalAcknowledged || legalTermsVersion !== LEGAL_DOCUMENT_VERSION || legalPrivacyNoticeVersion !== LEGAL_DOCUMENT_VERSION) return fail("Review and accept the current ordering terms and privacy notice, then try again.");
  if (customerName.length < 2 || customerName.length > 80) return fail("Add your name so the store knows who to call.");
  if (customerPhone.length < 5 || customerPhone.length > 40) return fail("Add a phone number the store can reach you on.");
  if (fulfillmentMethod !== "pickup" && fulfillmentMethod !== "delivery") return fail("Choose pickup or delivery to continue.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return fail("Choose a valid pickup date.");
  if (deliveryAddress.length > 240 || (fulfillmentMethod === "delivery" && deliveryAddress.length < 8)) return fail("Add a complete delivery address so the rider can find you.");
  if (deliveryNote.length > 160) return fail("Keep the delivery note under 160 characters.");
  if (note.length > 240) return fail("Keep the note under 240 characters.");
  if (!drafts) return fail("Your cart is empty. Add an item before checking out.");
  if (pickupSlot !== "asap" && !/^\d{2}:\d{2}$/.test(pickupSlot)) return fail("Choose a valid pickup time.");

  const menu = await getPublicMenuStoreForHostname(storeSlug, requestHeaders.get("host"));
  if (!menu) return fail("This menu is no longer available. Refresh and try again.");
  if (!menu.settings.enabled) return fail("This store is not accepting online orders right now.");
  if (fulfillmentMethod === "delivery" && !menu.settings.delivery.enabled) return fail("Delivery is not available right now. Choose pickup instead.");

  const productById = new Map(menu.products.map((product) => [product.id, product]));
  const items = drafts.map((draft) => {
    const product = productById.get(draft.productId);
    if (!product) return null;
    return { product, qty: draft.qty, lineTotal: product.price * draft.qty };
  });
  if (items.some((item) => item === null)) return fail("One of the items in your cart changed. Refresh the menu and try again.");
  const validItems = items.filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (validItems.some((item) => !item.product.isAvailable)) return fail("One of the items just became unavailable. Refresh the menu and review your basket.");
  if (validItems.some((item) => item.qty > menu.settings.maxItemQuantity)) return fail(`Each item is limited to ${menu.settings.maxItemQuantity} per order.`);
  const subtotal = validItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const totals = calculateOnlineOrderTotals(subtotal, fulfillmentMethod, menu.settings, menu.vatRegistered, menu.vatRate);
  if (!totals.minimumOrderMet) return fail(`Orders start at ${formatPeso(totals.minimumOrderCentavos)}.`);

  const admin = createAdminClient();
  if (!admin) {
    const demoOrderId = `demo-${requestId}`;
    const demoOrderNo = getDemoOnlineOrderNo(menu.name, requestId);
    const etaAt = resolveEta(pickupDate, pickupSlot, 2, menu.settings.averagePrepMinutes, menu.settings.orderLeadMinutes, fulfillmentMethod, menu.settings.delivery.etaMinutes).toISOString();
    const scheduledFor = pickupSlot === "asap" ? undefined : new Date(`${pickupDate}T${pickupSlot}:00+08:00`).toISOString();
    return { ok: true, orderId: demoOrderId, orderNo: demoOrderNo, queuePosition: 3, etaAt, scheduledFor, total: totals.total, subtotal: totals.subtotal, taxAmount: totals.taxAmount, deliveryFee: totals.deliveryFee, fulfillmentMethod };
  }

  const { data, error } = await admin.rpc("place_online_order", {
    p_store_id: menu.id,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_fulfillment_method: fulfillmentMethod,
    p_pickup_slot: pickupSlot,
    p_pickup_date: pickupDate,
    p_delivery_address: fulfillmentMethod === "delivery" ? deliveryAddress : null,
    p_delivery_note: fulfillmentMethod === "delivery" ? deliveryNote || null : null,
    p_note: note || null,
    p_average_prep_minutes: menu.settings.averagePrepMinutes,
    p_order_lead_minutes: menu.settings.orderLeadMinutes,
    p_items: drafts.map((item) => ({ productId: item.productId, qty: item.qty })),
    p_client_ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null,
  });
  if (error) return fail(placementErrorMessage(error.message));

  const order = readRpcOrder(data);
  if (!order) return fail("We could not confirm the online order. Please try again.");
  const verificationCode = order.verificationCode;
  const verificationSent = order.phoneVerificationRequired && verificationCode
    ? await sendOnlineOrderVerificationCode(customerPhone, order.orderNo, verificationCode)
    : false;
  return cleanResult(order, verificationSent);
}
