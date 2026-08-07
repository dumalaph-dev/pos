import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { getPayMongoPaymentIntent, PayMongoApiError, readPayMongoString } from "@/lib/paymongo-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return responseError("Sign in as the business owner before checking payment status.", 401);

    const profile = await getAdminProfile(user.id);
    if (!profile || profile.role !== "admin") return responseError("Only the business owner can check this payment.", 403);

    const paymentIntentId = request.nextUrl.searchParams.get("payment_intent_id")?.trim() ?? "";
    if (!paymentIntentId || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) return responseError("The payment intent could not be verified.", 400);

    const admin = createAdminClient();
    if (!admin) return responseError("The billing database client is not configured.", 503);

    const organizationResult = await admin
      .from("organizations")
      .select("id, subscription_status, subscription_provider_payment_intent_id")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (organizationResult.error) return responseError("Apply Supabase migrations 0025 and 0027 before checking payment status.", 503);

    const organization = organizationResult.data as { id: string; subscription_status: string | null; subscription_provider_payment_intent_id: string | null } | null;
    if (!organization || organization.subscription_provider_payment_intent_id !== paymentIntentId) {
      return responseError("That payment intent is not associated with this organization.", 404);
    }

    const paymentIntent = await getPayMongoPaymentIntent(paymentIntentId);
    const status = readPayMongoString(paymentIntent.attributes, "status") || "awaiting_payment_method";
    if (status === "succeeded" && organization.subscription_status !== "active") {
      const update = await admin
        .from("organizations")
        .update({ subscription_status: "active", subscription_updated_at: new Date().toISOString() })
        .eq("id", organization.id)
        .eq("subscription_provider_payment_intent_id", paymentIntentId);
      if (update.error) throw new Error("The payment was confirmed but the organization billing record could not be updated.");
    }

    return NextResponse.json({ ok: true, paymentIntentId, status });
  } catch (error) {
    if (error instanceof PayMongoApiError) {
      console.error("[billing/payment-intent] PayMongo API error", error.status, error.providerMessage);
      return responseError("PayMongo could not verify this payment yet. Refresh and try again.", 502);
    }
    console.error("[billing/payment-intent] Unexpected error", error instanceof Error ? error.message : error);
    return responseError("The payment status could not be verified. Refresh and try again.", 500);
  }
}

function responseError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
