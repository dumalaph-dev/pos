"use server";

import { getPublicMenuStoreBySlug } from "@/lib/online-ordering-server";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import type { PublicOnlineOrderResult } from "@/lib/online-ordering";

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
  if (!orderId || !orderNo || !Number.isInteger(queuePosition) || queuePosition < 1 || !etaAt) return null;
  return { orderId, orderNo, queuePosition, etaAt };
}

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
      if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 20) return null;
      items.push({ productId, qty });
    }
    return items;
  } catch {
    return null;
  }
}

function singaporeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(date);
}

function resolveEta(pickupSlot: string, queueCount: number, averagePrepMinutes: number, orderLeadMinutes: number) {
  if (pickupSlot !== "asap" && /^\d{2}:\d{2}$/.test(pickupSlot)) {
    const scheduled = new Date(`${singaporeDateKey()}T${pickupSlot}:00+08:00`);
    if (scheduled.getTime() > Date.now()) return scheduled;
  }
  return new Date(Date.now() + (orderLeadMinutes + (queueCount + 1) * averagePrepMinutes) * 60_000);
}

export async function placeOnlineOrder(_previousState: PublicOnlineOrderResult, formData: FormData): Promise<PublicOnlineOrderResult> {
  const storeSlug = readText(formData, "store_slug");
  const customerName = readText(formData, "customer_name");
  const customerPhone = readText(formData, "customer_phone");
  const pickupSlot = readText(formData, "pickup_slot") || "asap";
  const note = readText(formData, "note");
  const requestId = readText(formData, "request_id");
  const drafts = readDraftItems(readText(formData, "items"));

  if (!isUuid(requestId)) return fail("Refresh the menu and try placing your pickup order again.");
  if (customerName.length < 2 || customerName.length > 80) return fail("Add your name so the store knows who to call.");
  if (customerPhone.length < 5 || customerPhone.length > 40) return fail("Add a phone number the store can reach you on.");
  if (note.length > 240) return fail("Keep the note under 240 characters.");
  if (!drafts) return fail("Your cart is empty. Add an item before checking out.");
  if (pickupSlot !== "asap" && !/^\d{2}:\d{2}$/.test(pickupSlot)) return fail("Choose a valid pickup time.");

  const menu = await getPublicMenuStoreBySlug(storeSlug);
  if (!menu) return fail("This menu is no longer available. Refresh and try again.");
  if (!menu.settings.enabled) return fail("This store is not accepting online orders right now.");

  const productById = new Map(menu.products.map((product) => [product.id, product]));
  const items = drafts.map((draft) => {
    const product = productById.get(draft.productId);
    if (!product) return null;
    return {
      product,
      qty: draft.qty,
      lineTotal: product.price * draft.qty,
    };
  });
  if (items.some((item) => item === null)) return fail("One of the items in your cart changed. Refresh the menu and try again.");
  const validItems = items.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const subtotal = validItems.reduce((sum, item) => sum + item.lineTotal, 0);
  if (subtotal < 1) return fail(`Your order total must be at least ${formatPeso(1)}.`);

  const admin = createAdminClient();
  if (!admin) {
    const demoOrderId = `demo-${requestId}`;
    const demoOrderNo = `WEB-${requestId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const etaAt = resolveEta(pickupSlot, 2, menu.settings.averagePrepMinutes, menu.settings.orderLeadMinutes).toISOString();
    return { ok: true, orderId: demoOrderId, orderNo: demoOrderNo, queuePosition: 3, etaAt };
  }

  const { data, error } = await admin.rpc("place_online_order", {
    p_store_id: menu.id,
    p_request_id: requestId,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_pickup_slot: pickupSlot,
    p_note: note || null,
    p_average_prep_minutes: menu.settings.averagePrepMinutes,
    p_order_lead_minutes: menu.settings.orderLeadMinutes,
    p_items: drafts.map((item) => ({ productId: item.productId, qty: item.qty })),
  });
  if (error) return fail("We could not place the order yet. Please check your connection and try again.");

  const order = readRpcOrder(data);
  if (!order) return fail("We could not confirm the pickup order. Please try again.");
  return { ok: true, orderId: order.orderId, orderNo: order.orderNo, queuePosition: order.queuePosition, etaAt: order.etaAt };
}
