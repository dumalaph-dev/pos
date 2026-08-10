import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateBillingVariantPrice, isPolicyGateOpen } from "@/lib/platform-operations";
import {
  createPayMongoQrPhCheckoutSession,
  PayMongoApiError,
} from "@/lib/paymongo-server";
import { payMongoConfiguration, readPayMongoSubscriptionReadiness, readPlatformOperations } from "@/lib/platform-operations-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse("Sign in as the business owner before starting checkout.", 401);

    const profile = await getAdminProfile(user.id);
    if (!profile || profile.role !== "admin") return errorResponse("Only the business owner can start a payment checkout.", 403);

    const admin = createAdminClient();
    if (!admin) return errorResponse("The billing database client is not configured.", 503);

    const operations = await readPlatformOperations(admin);
    if (!operations.catalog.schemaAvailable || !operations.policies.schemaAvailable) {
      return errorResponse("Apply Supabase migration 0027_platform_operations.sql before enabling checkout.", 503);
    }
    if (!isPolicyGateOpen(operations.policies)) {
      return errorResponse("Checkout is locked until both the billing and support policies are published.", 423);
    }

    const provider = payMongoConfiguration();
    if (!provider.temporaryQrPhEnabled || !provider.secretKeyConfigured || !provider.webhookSecretConfigured) {
      return errorResponse("Temporary QR Ph checkout is disabled or missing its server credentials.", 503);
    }

    const readiness = await readPayMongoSubscriptionReadiness();
    const qrPhAvailable = readiness.subscriptionPaymentMethods?.some((method) => method.toLowerCase() === "qrph") === true;
    if (readiness.subscriptionPaymentMethods === null) {
      return errorResponse("PayMongo payment methods could not be checked. Run the PayMongo preflight and try again.", 503);
    }
    if (!qrPhAvailable) {
      return errorResponse("QR Ph is not active on this PayMongo account yet. Activate the account, then rerun the PayMongo preflight.", 503);
    }

    const organizationResult = await admin
      .from("organizations")
      .select("id, account_status, subscription_status, subscription_current_period_end, subscription_billing_mode")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (organizationResult.error) return errorResponse("Apply migration 0036_temporary_qrph_checkout.sql before enabling temporary QR Ph checkout.", 503);

    const organization = organizationResult.data as {
      id: string;
      account_status: "active" | "suspended";
      subscription_status: string | null;
      subscription_current_period_end: string | null;
      subscription_billing_mode: "recurring" | "temporary_qrph" | null;
    } | null;
    if (!organization) return errorResponse("Your POS organization could not be found.", 404);
    if (organization.account_status === "suspended") return errorResponse("This organization is suspended. Contact support before starting billing.", 423);

    const body = await readJson(request);
    const variantId = isRecord(body) && typeof body.variantId === "string" ? body.variantId.trim() : "";
    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant || !variant.id) return errorResponse("Choose an active payment option from the current pricing catalog.", 400);

    const status = normalizeSubscriptionStatus(organization.subscription_status);
    const periodEnd = organization.subscription_current_period_end ? new Date(organization.subscription_current_period_end) : null;
    const temporaryAccessCurrent = organization.subscription_billing_mode === "temporary_qrph" && periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now();
    const temporaryAccessExpired = organization.subscription_billing_mode === "temporary_qrph" && periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() <= Date.now();
    if (status === "active" || status === "past_due" || status === "paused") {
      if (temporaryAccessExpired && status === "active") {
        // A completed temporary period can be renewed with another one-time QR Ph checkout.
      } else if (temporaryAccessCurrent) {
        return errorResponse("Your temporary QR Ph access is still active. Renew after the current period ends.", 409);
      } else {
        return errorResponse("This organization already has an active billing connection. Wait for the current period to end or use the existing payment method.", 409);
      }
    }

    const amountCentavos = calculateBillingVariantPrice(
      operations.catalog.monthlyPriceCentavos,
      variant.intervalUnit,
      variant.intervalCount,
      variant.discountPercent,
    );
    if (amountCentavos < 100) return errorResponse("The selected price is below PayMongo's minimum QR Ph amount.", 400);

    const attemptId = crypto.randomUUID().replace(/-/g, "");
    const referenceNumber = `DUMALA-QRPH-${organization.id.slice(0, 8)}-${attemptId.slice(0, 12)}`;
    const metadata = {
      pos_temporary_qrph: "true",
      organization_id: organization.id,
      variant_id: variant.id,
      interval_unit: variant.intervalUnit,
      interval_count: String(variant.intervalCount),
      amount_centavos: String(amountCentavos),
    };
    const successUrl = new URL("/admin/billing?qrph=success", request.nextUrl.origin).toString();
    const cancelUrl = new URL("/admin/billing?qrph=cancelled", request.nextUrl.origin).toString();
    const checkout = await createPayMongoQrPhCheckoutSession({
      amountCentavos,
      itemName: `Dumala POS Premium · ${variant.label}`,
      description: `Prepaid Dumala POS Premium access · ${variant.label}`,
      successUrl,
      cancelUrl,
      referenceNumber,
      email: user.email ?? null,
      metadata,
      idempotencyKey: `pos-qrph-${organization.id}-${attemptId}`,
    });

    const saved = await admin
      .from("organizations")
      .update({
        subscription_billing_mode: "temporary_qrph",
        subscription_provider_checkout_session_id: checkout.id,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id);
    if (saved.error) throw new Error("The QR Ph checkout was created but its pending state could not be saved.");

    return NextResponse.json({
      ok: true,
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      amountCentavos,
      currency: "PHP",
      variantId: variant.id,
    });
  } catch (error) {
    if (error instanceof PayMongoApiError) {
      console.error("[billing/qrph] PayMongo API error", error.status, error.providerMessage);
      const diagnostic = process.env.PAYMONGO_SECRET_KEY?.trim().startsWith("sk_test_") && error.providerMessage
        ? ` PayMongo test response: ${error.providerMessage.slice(0, 240)}`
        : "";
      return errorResponse(`PayMongo could not start the QR Ph checkout. Check the account activation and webhook settings, then try again.${diagnostic}`, 502);
    }
    console.error("[billing/qrph] Unexpected error", error instanceof Error ? error.message : error);
    return errorResponse("QR Ph checkout could not be started. Please try again or contact support.", 500);
  }
}

async function readJson(request: NextRequest) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
