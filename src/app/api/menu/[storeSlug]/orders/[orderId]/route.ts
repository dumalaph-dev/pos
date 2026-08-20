import { getPublicStoreBySlug } from "@/lib/online-ordering-server";
import { createAdminClient } from "@/lib/employee-auth";
import { getDemoOnlineOrderNo } from "@/lib/online-ordering";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeSlug: string; orderId: string }> },
) {
  const { storeSlug, orderId } = await params;
  const store = await getPublicStoreBySlug(storeSlug);
  if (!store) return Response.json({ ok: false, message: "Order not found" }, { status: 404 });

  if (orderId.startsWith("demo-")) {
    return Response.json({ ok: true, orderNo: getDemoOnlineOrderNo(store.name, orderId.slice(5)), status: "new", queuePosition: 3, etaAt: new Date(Date.now() + 24 * 60_000).toISOString() });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, message: "Order tracking is not available" }, { status: 503 });

  const { data, error } = await admin
    .from("online_orders")
    .select("order_no, status, queue_position, eta_at, fulfillment_method")
    .eq("id", orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (error || !data) return Response.json({ ok: false, message: "Order not found" }, { status: 404 });

  return Response.json({ ok: true, orderNo: data.order_no, status: data.status, queuePosition: data.queue_position, etaAt: data.eta_at, fulfillmentMethod: data.fulfillment_method === "delivery" ? "delivery" : "pickup" });
}
