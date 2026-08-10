import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { getPayMongoCheckoutSession, PayMongoApiError } from "@/lib/paymongo-server";
import { activateTemporaryQrPhCheckout, readCheckoutPaymentStatus, readTemporaryQrPhCheckoutMetadata } from "@/lib/temporary-qrph";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse("Sign in as the business owner before checking this payment.", 401);

    const profile = await getAdminProfile(user.id);
    if (!profile || profile.role !== "admin") return errorResponse("Only the business owner can check this payment.", 403);

    const checkoutSessionId = request.nextUrl.searchParams.get("checkout_session_id")?.trim() ?? "";
    if (!/^cs_[A-Za-z0-9]+$/.test(checkoutSessionId)) return errorResponse("The QR Ph checkout could not be verified.", 400);

    const admin = createAdminClient();
    if (!admin) return errorResponse("The billing database client is not configured.", 503);

    const checkout = await getPayMongoCheckoutSession(checkoutSessionId);
    const metadata = readTemporaryQrPhCheckoutMetadata(checkout.attributes);
    if (!metadata || metadata.organizationId !== profile.org_id) {
      return errorResponse("That QR Ph checkout is not associated with this organization.", 404);
    }

    const payment = readCheckoutPaymentStatus(checkout.attributes);
    if (payment.status === "paid") {
      const activated = await activateTemporaryQrPhCheckout(admin, {
        checkoutSessionId,
        paymentIntentId: payment.paymentIntentId,
        paidAmountCentavos: payment.paidAmountCentavos,
        metadata,
      });
      return NextResponse.json({
        ok: true,
        status: "paid",
        paymentIntentId: payment.paymentIntentId,
        accessActivated: true,
        periodEnd: activated.periodEnd,
      });
    }

    return NextResponse.json({
      ok: true,
      status: payment.status,
      paymentIntentId: payment.paymentIntentId,
      accessActivated: false,
    });
  } catch (error) {
    if (error instanceof PayMongoApiError) {
      console.error("[billing/qrph/status] PayMongo API error", error.status, error.providerMessage);
      return errorResponse("PayMongo could not verify this QR Ph checkout yet. Refresh and try again.", 502);
    }
    console.error("[billing/qrph/status] Unexpected error", error instanceof Error ? error.message : error);
    return errorResponse("The QR Ph payment status could not be verified. Refresh and try again.", 500);
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
