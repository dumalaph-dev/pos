import { getPublicStoreForRequest } from "@/lib/online-ordering-server";
import { createAdminClient } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeSlug: string }> },
) {
  const { storeSlug } = await params;
  const searchParams = new URL(request.url).searchParams;
  const orderNo = searchParams.get("order")?.trim().toUpperCase() ?? "";
  const customerPhone = searchParams.get("phone")?.trim() ?? "";
  const normalizedPhone = customerPhone.replace(/[^0-9]/g, "");
  const store = await getPublicStoreForRequest(request, storeSlug);

  if (!store || orderNo.length < 5 || orderNo.length > 32 || normalizedPhone.length < 7 || normalizedPhone.length > 15) {
    return Response.json({ ok: false, message: "Order not found" }, { status: 404 });
  }

  if (storeSlug.toLowerCase() === "demo" && /^[A-Z\d]{1,5}-\d{4}$/.test(orderNo)) {
    return Response.json({
      ok: true,
      orderNo,
      status: "new",
      queuePosition: 3,
      etaAt: new Date(Date.now() + 24 * 60_000).toISOString(),
    });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, message: "Order tracking is not available" }, { status: 503 });

  const { data, error } = await admin
    .from("online_orders")
    .select("order_no, status, queue_position, eta_at, fulfillment_method, customer_phone")
    .eq("store_id", store.id)
    .eq("order_no", orderNo)
    .maybeSingle();

  if (error || !data || String(data.customer_phone).replace(/[^0-9]/g, "") !== normalizedPhone) return Response.json({ ok: false, message: "Order not found" }, { status: 404 });

  return Response.json({
    ok: true,
    orderNo: data.order_no,
    status: data.status,
    queuePosition: data.queue_position,
    etaAt: data.eta_at,
    fulfillmentMethod: data.fulfillment_method === "delivery" ? "delivery" : "pickup",
  });
}
