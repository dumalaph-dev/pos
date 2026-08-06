"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OrderAction = "voided" | "refunded";

export type OrderReprintResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readOrderAction(value: string): OrderAction | null {
  return value === "voided" || value === "refunded" ? value : null;
}

function safeOrdersReturnTo(value: string, orderId: string) {
  const fallback = new URL("/admin/orders", "http://pos.local");

  try {
    const candidate = new URL(value || fallback.toString(), "http://pos.local");
    if (candidate.pathname !== "/admin/orders") return fallback;
    candidate.searchParams.set("order", orderId);
    return candidate;
  } catch {
    fallback.searchParams.set("order", orderId);
    return fallback;
  }
}

function redirectOrderAction(
  returnTo: string,
  orderId: string,
  key: "saved" | "error",
  value: string,
): never {
  const url = safeOrdersReturnTo(returnTo, orderId);
  url.searchParams.set(key, value);
  redirect(`${url.pathname}${url.search}`);
}

function refreshOrderViews() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/inventory");
  revalidatePath("/admin/inventory");
}

export async function recordOrderAction(formData: FormData): Promise<never> {
  const orderId = readText(formData, "order_id");
  const action = readOrderAction(readText(formData, "order_action"));
  const reason = readText(formData, "reason");
  const returnTo = readText(formData, "return_to");

  if (!orderId) redirectOrderAction(returnTo, "", "error", "Select an order before taking an action.");
  if (!action) redirectOrderAction(returnTo, orderId, "error", "Choose either void or refund.");
  if (reason.length === 0 || reason.length > 180) {
    redirectOrderAction(returnTo, orderId, "error", "Add a reason of 1 to 180 characters.");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    redirectOrderAction(returnTo, orderId, "error", "Only organization admins can void or refund orders.");
  }

  const { error } = await supabase.rpc("record_order_action", {
    p_order_id: orderId,
    p_action: action,
    p_reason: reason,
  });

  if (error) {
    redirectOrderAction(returnTo, orderId, "error", error.message || "The order action could not be saved.");
  }

  refreshOrderViews();
  redirectOrderAction(returnTo, orderId, "saved", action === "voided" ? "voided" : "refunded");
}

export async function recordOrderReprint(orderId: string): Promise<OrderReprintResult> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return { ok: false, message: "The order could not be identified." };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, message: "Your session has expired. Sign in again to reprint." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, store_id, role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return { ok: false, message: "You do not have permission to reprint orders." };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_no, org_id, store_id, status")
    .eq("id", normalizedOrderId)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (orderError || !order) {
    return { ok: false, message: "That order is not available in your branch scope." };
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    org_id: order.org_id,
    store_id: order.store_id,
    actor_id: userData.user.id,
    action: "order.reprint",
    entity: "orders",
    entity_id: order.id,
    after: {
      order_no: order.order_no,
      status: order.status,
      source: "admin_orders",
    },
  });

  if (auditError) return { ok: false, message: "The receipt printed, but the reprint audit could not be saved." };

  revalidatePath("/admin/audit");
  return { ok: true, message: `${order.order_no} reprinted and audit logged.` };
}
