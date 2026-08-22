import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateAdditionalBranchPriceQuote, calculateCatalogVariantPriceQuote, isPolicyGateOpen, MAX_BRANCH_ENTITLEMENT } from "@/lib/platform-operations";
import { readPromotionQuote, recordPromotionRedemption } from "@/lib/platform-promotions-server";
import {
  createPayMongoHostedCheckoutSession,
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
      return errorResponse("Apply Supabase migrations 0027_platform_operations.sql and 0068_branch_billing_pricing.sql before enabling checkout.", 503);
    }
    if (!isPolicyGateOpen(operations.policies)) {
      return errorResponse("Checkout is locked until both the billing and support policies are published.", 423);
    }

    const provider = payMongoConfiguration();
    if (!provider.temporaryQrPhEnabled || !provider.secretKeyConfigured || !provider.webhookSecretConfigured) {
      return errorResponse("Temporary QR Ph checkout is disabled or missing its server credentials.", 503);
    }

    const readiness = await readPayMongoSubscriptionReadiness();
    if (readiness.subscriptionPaymentMethods === null) {
      return errorResponse("PayMongo payment methods could not be checked. Run the PayMongo preflight and try again.", 503);
    }

    const organizationResult = await admin
      .from("organizations")
      .select("id, account_status, subscription_status, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_entitled_branch_count, subscription_provider_subscription_id, subscription_provider_payment_intent_id")
      .eq("id", profile.org_id)
      .maybeSingle();
    if (organizationResult.error) return errorResponse("Apply migration 0036_temporary_qrph_checkout.sql before enabling temporary QR Ph checkout.", 503);

    const organization = organizationResult.data as {
      id: string;
      account_status: "active" | "suspended";
      subscription_status: string | null;
      subscription_current_period_end: string | null;
      subscription_billing_mode: "recurring" | "temporary_qrph" | null;
      subscription_billing_variant_id: string | null;
      subscription_entitled_branch_count: number | null;
      subscription_provider_subscription_id: string | null;
      subscription_provider_payment_intent_id: string | null;
    } | null;
    if (!organization) return errorResponse("Your POS organization could not be found.", 404);
    if (organization.account_status === "suspended") return errorResponse("This organization is suspended. Contact support before starting billing.", 423);

    const activeBranchesResult = await admin
      .from("stores")
      .select("id")
      .eq("org_id", organization.id)
      .eq("is_active", true);
    if (activeBranchesResult.error) return errorResponse("The active branch count could not be verified. Try again after the branch data is available.", 503);
    const activeBranchCount = Math.max(activeBranchesResult.data?.length ?? 0, 1);

    const body = await readJson(request);
    const variantId = isRecord(body) && typeof body.variantId === "string" ? body.variantId.trim() : "";
    const promoCode = isRecord(body) && typeof body.promoCode === "string" ? body.promoCode.trim() : "";
    const purpose = isRecord(body) && body.purpose === "additional_branch" ? "additional_branch" as const : "subscription" as const;
    const requestedTargetBranchCount = isRecord(body) && Number.isSafeInteger(body.targetActiveBranchCount) ? Number(body.targetActiveBranchCount) : null;
    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant || !variant.id) return errorResponse("Choose an active payment option from the current pricing catalog.", 400);

    const status = normalizeSubscriptionStatus(organization.subscription_status);
    const periodEnd = organization.subscription_current_period_end ? new Date(organization.subscription_current_period_end) : null;
    const temporaryAccessCurrent = organization.subscription_billing_mode === "temporary_qrph" && periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now();
    const temporaryAccessExpired = organization.subscription_billing_mode === "temporary_qrph" && periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() <= Date.now();
    const currentEntitledBranchCount = Math.max(Number(organization.subscription_entitled_branch_count) || operations.catalog.includedBranchCount, operations.catalog.includedBranchCount);
    const minimumTargetBranchCount = activeBranchCount + 1;
    const isAdditionalBranchCheckout = purpose === "additional_branch";
    if (requestedTargetBranchCount !== null && (requestedTargetBranchCount < minimumTargetBranchCount || requestedTargetBranchCount > MAX_BRANCH_ENTITLEMENT)) {
      return errorResponse("Choose a branch capacity between your current active count and the supported maximum, then refresh Billing & Plan.", 409);
    }
    const targetActiveBranchCount = requestedTargetBranchCount ?? minimumTargetBranchCount;

    if (isAdditionalBranchCheckout) {
      if (status !== "active" || !temporaryAccessCurrent) {
        return errorResponse("Additional branch payment is available only while your prepaid QR Ph plan is active.", 409);
      }
      if (targetActiveBranchCount <= currentEntitledBranchCount) {
        return errorResponse("Your current paid branch entitlement already covers this branch.", 409);
      }
      if (organization.subscription_billing_variant_id && organization.subscription_billing_variant_id !== variant.id) {
        return errorResponse("Use the billing term from your current prepaid plan for this additional branch.", 409);
      }
    }

    const configuredPaymentMethods = (readiness.subscriptionPaymentMethods ?? []).map((method) => method.toLowerCase());
    const checkoutPaymentMethods = isAdditionalBranchCheckout
      ? ["qrph", "card"].filter((method) => method === "card" ? configuredPaymentMethods.includes("card") || configuredPaymentMethods.includes("cards") : configuredPaymentMethods.includes(method))
      : ["qrph"];
    const branchRequest = isAdditionalBranchCheckout || requestedTargetBranchCount !== null;
    if (isAdditionalBranchCheckout && checkoutPaymentMethods.length === 0) {
      return errorResponse("QR Ph or card is not active on this PayMongo account yet. Activate one of these payment methods, then rerun the PayMongo preflight.", 503);
    }
    if (!isAdditionalBranchCheckout && !configuredPaymentMethods.includes("qrph")) {
      return errorResponse("QR Ph is not active on this PayMongo account yet. Activate the account, then rerun the PayMongo preflight.", 503);
    }

    const expiredTrialCanStartBilling = status === "paused"
      && !organization.subscription_provider_subscription_id
      && !organization.subscription_provider_payment_intent_id;
    if (!isAdditionalBranchCheckout && (status === "active" || status === "past_due" || (status === "paused" && !expiredTrialCanStartBilling))) {
      if (temporaryAccessExpired && status === "active") {
        // A completed temporary period can be renewed with another one-time QR Ph checkout.
      } else if (temporaryAccessCurrent) {
        return errorResponse("Your temporary QR Ph access is still active. Renew after the current period ends.", 409);
      } else {
        return errorResponse("This organization already has an active billing connection. Wait for the current period to end or use the existing payment method.", 409);
      }
    }

    const billingBranchCount = isAdditionalBranchCheckout ? activeBranchCount : requestedTargetBranchCount ?? activeBranchCount;
    const pricingQuote = isAdditionalBranchCheckout
      ? calculateAdditionalBranchPriceQuote(operations.catalog, variant, Math.max(currentEntitledBranchCount, activeBranchCount), targetActiveBranchCount)
      : calculateCatalogVariantPriceQuote(operations.catalog, variant, billingBranchCount);
    const baseAmountCentavos = pricingQuote.termTotalCentavos;
    const promotionQuote = await readPromotionQuote(admin, {
      code: promoCode,
      organizationId: organization.id,
      variant,
      baseAmountCentavos,
    });
    if (!promotionQuote.ok) return errorResponse(promotionQuote.message, promotionQuote.schemaAvailable ? 422 : 503);
    const amountCentavos = promotionQuote.finalAmountCentavos;
    if (amountCentavos < 100) return errorResponse("The selected price is below PayMongo's minimum QR Ph amount.", 400);

    const attemptId = crypto.randomUUID().replace(/-/g, "");
    const referenceNumber = `DUMALA-QRPH-${organization.id.slice(0, 8)}-${attemptId.slice(0, 12)}`;
    const metadata = {
      pos_temporary_qrph: "true",
      checkout_purpose: purpose,
      organization_id: organization.id,
      variant_id: variant.id,
      interval_unit: variant.intervalUnit,
      interval_count: String(variant.intervalCount),
      promotion_id: promotionQuote.promotionId ?? "",
      promotion_code: promotionQuote.code ?? "",
      base_amount_centavos: String(promotionQuote.baseAmountCentavos),
      discount_amount_centavos: String(promotionQuote.discountAmountCentavos),
      amount_centavos: String(amountCentavos),
      active_branch_count: String(billingBranchCount),
      target_active_branch_count: String(isAdditionalBranchCheckout ? targetActiveBranchCount : billingBranchCount),
      entitled_branch_count: String(currentEntitledBranchCount),
      billable_branch_count: String(pricingQuote.billableBranchCount),
    };
    const successUrlObject = new URL("/admin/billing", request.nextUrl.origin);
    successUrlObject.searchParams.set("qrph", "success");
    if (branchRequest) {
      successUrlObject.searchParams.set("reason", "additional_branch");
      successUrlObject.searchParams.set("target", String(isAdditionalBranchCheckout ? targetActiveBranchCount : billingBranchCount));
    }
    const cancelUrlObject = new URL("/admin/billing", request.nextUrl.origin);
    cancelUrlObject.searchParams.set("qrph", "cancelled");
    if (branchRequest) {
      cancelUrlObject.searchParams.set("reason", "additional_branch");
      cancelUrlObject.searchParams.set("target", String(isAdditionalBranchCheckout ? targetActiveBranchCount : billingBranchCount));
    }
    const successUrl = successUrlObject.toString();
    const cancelUrl = cancelUrlObject.toString();
    const checkoutInput = {
      amountCentavos,
      itemName: isAdditionalBranchCheckout
        ? `Dumala POS additional branch · ${variant.label}`
        : `Dumala POS Premium · ${variant.label} · ${billingBranchCount} branch${billingBranchCount === 1 ? "" : "es"}`,
      description: isAdditionalBranchCheckout
         ? `One-time additional branch capacity · ${variant.label} · up to ${targetActiveBranchCount} branches`
        : `Prepaid Dumala POS Premium access · ${variant.label} · ${billingBranchCount} active branch${billingBranchCount === 1 ? "" : "es"}`,
      successUrl,
      cancelUrl,
      referenceNumber,
      email: user.email ?? null,
      metadata,
      idempotencyKey: `pos-qrph-${organization.id}-${attemptId}`,
    };
    const checkout = isAdditionalBranchCheckout
      ? await createPayMongoHostedCheckoutSession(checkoutInput, checkoutPaymentMethods)
      : await createPayMongoQrPhCheckoutSession(checkoutInput);

    const saved = await admin
      .from("organizations")
      .update({
        ...(isAdditionalBranchCheckout ? {} : { subscription_billing_mode: "temporary_qrph" }),
        subscription_provider_checkout_session_id: checkout.id,
        subscription_updated_at: new Date().toISOString(),
      })
      .eq("id", organization.id);
    if (saved.error) throw new Error("The QR Ph checkout was created but its pending state could not be saved.");

    if (promotionQuote.promotionId && promotionQuote.code) {
      await recordPromotionRedemption(admin, {
        promotionId: promotionQuote.promotionId,
        organizationId: organization.id,
        billingVariantId: variant.id,
        checkoutMode: "temporary_qrph",
        status: "started",
        baseAmountCentavos: promotionQuote.baseAmountCentavos,
        discountAmountCentavos: promotionQuote.discountAmountCentavos,
        finalAmountCentavos: promotionQuote.finalAmountCentavos,
        providerReference: checkout.id,
      });
    }

    return NextResponse.json({
      ok: true,
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.checkoutUrl,
      amountCentavos,
      baseAmountCentavos: promotionQuote.baseAmountCentavos,
      discountAmountCentavos: promotionQuote.discountAmountCentavos,
      promotionCode: promotionQuote.code,
      activeBranchCount: billingBranchCount,
      targetActiveBranchCount: isAdditionalBranchCheckout || requestedTargetBranchCount !== null ? (isAdditionalBranchCheckout ? targetActiveBranchCount : billingBranchCount) : null,
      billableBranchCount: pricingQuote.billableBranchCount,
      paymentMethodTypes: checkoutPaymentMethods,
      purpose,
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
