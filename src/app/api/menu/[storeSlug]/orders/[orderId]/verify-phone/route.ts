import { createAdminClient } from "@/lib/employee-auth";
import { getPublicStoreForRequest } from "@/lib/online-ordering-server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ storeSlug: string; orderId: string }> },
) {
  const { storeSlug, orderId } = await context.params;
  const store = await getPublicStoreForRequest(request, storeSlug);
  if (!store) return Response.json({ ok: false, message: "This menu is not available." }, { status: 404 });

  let payload: { verificationId?: string; code?: string };
  try {
    payload = await request.json() as { verificationId?: string; code?: string };
  } catch {
    return Response.json({ ok: false, message: "Enter the six-digit verification code." }, { status: 400 });
  }

  const verificationId = typeof payload.verificationId === "string" ? payload.verificationId.trim() : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!verificationId || !/^\d{6}$/.test(code)) {
    return Response.json({ ok: false, message: "Enter the six-digit verification code." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return Response.json({ ok: false, message: "Phone verification is unavailable in demo mode." }, { status: 503 });

  const { data: order, error: orderError } = await admin
    .from("online_orders")
    .select("id, store_id")
    .eq("id", orderId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (orderError || !order) return Response.json({ ok: false, message: "That order could not be verified." }, { status: 404 });

  const { data, error } = await admin.rpc("verify_online_order_phone", {
    p_online_order_id: order.id,
    p_verification_id: verificationId,
    p_code: code,
  });
  const result = data as { ok?: boolean; already_verified?: boolean } | null;
  if (error || result?.ok !== true) return Response.json({ ok: false, message: "That code is invalid or has expired." }, { status: 400 });
  return Response.json({ ok: true, alreadyVerified: Boolean(result.already_verified) });
}
