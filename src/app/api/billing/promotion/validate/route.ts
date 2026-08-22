import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { normalizeSubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateAdditionalBranchPriceQuote, calculateCatalogVariantPriceQuote } from "@/lib/platform-operations";
import { readPromotionQuote } from "@/lib/platform-promotions-server";
import { readPlatformOperations } from "@/lib/platform-operations-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse("Sign in as the business owner before applying a promotion.", 401);

    const profile = await getAdminProfile(user.id);
    if (!profile || profile.role !== "admin") return errorResponse("Only the business owner can apply a promotion code.", 403);

    const admin = createAdminClient();
    if (!admin) return errorResponse("The billing database client is not configured.", 503);

    const body = await readJson(request);
    const code = isRecord(body) && typeof body.code === "string" ? body.code.trim() : "";
    const variantId = isRecord(body) && typeof body.variantId === "string" ? body.variantId.trim() : "";
    const purpose = isRecord(body) && body.purpose === "additional_branch" ? "additional_branch" as const : "subscription" as const;
    const requestedTargetBranchCount = isRecord(body) && Number.isSafeInteger(body.targetActiveBranchCount) ? Number(body.targetActiveBranchCount) : null;
    if (!code) return errorResponse("Enter a promotion code first.", 400);

    const operations = await readPlatformOperations(admin);
    if (!operations.catalog.schemaAvailable) return errorResponse("The billing catalog is not available yet. Please try again later.", 503);

    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant) return errorResponse("Choose an active plan before applying a promotion.", 400);
    const organizationResult = purpose === "additional_branch"
      ? await admin
        .from("organizations")
        .select("subscription_status, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_entitled_branch_count")
        .eq("id", profile.org_id)
        .maybeSingle()
      : null;
    if (organizationResult?.error) return errorResponse("The prepaid branch entitlement could not be verified. Please refresh Billing & Plan.", 503);

    const activeBranchesResult = await admin
      .from("stores")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("is_active", true);
    if (activeBranchesResult.error) return errorResponse("The active branch count could not be verified. Please try again later.", 503);
    const activeBranchCount = Math.max(activeBranchesResult.data?.length ?? 0, 1);
    const additionalBranchCheckout = purpose === "additional_branch";
    const organization = organizationResult?.data as {
      subscription_status: string | null;
      subscription_current_period_end: string | null;
      subscription_billing_mode: "recurring" | "temporary_qrph" | null;
      subscription_billing_variant_id: string | null;
      subscription_entitled_branch_count: number | null;
    } | null;
    const entitlement = Math.max(Number(organization?.subscription_entitled_branch_count) || operations.catalog.includedBranchCount, operations.catalog.includedBranchCount);
    const targetActiveBranchCount = activeBranchCount + 1;
    if (!additionalBranchCheckout && requestedTargetBranchCount !== null && requestedTargetBranchCount !== targetActiveBranchCount) {
      return errorResponse("The branch count changed. Refresh Billing & Plan before applying a promotion.", 409);
    }
    if (additionalBranchCheckout) {
      const periodEnd = organization?.subscription_current_period_end ? new Date(organization.subscription_current_period_end) : null;
      const prepaidCurrent = normalizeSubscriptionStatus(organization?.subscription_status) === "active"
        && organization?.subscription_billing_mode === "temporary_qrph"
        && Boolean(periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now());
      if (!prepaidCurrent || requestedTargetBranchCount !== targetActiveBranchCount || targetActiveBranchCount <= entitlement) {
        return errorResponse("The additional branch entitlement changed. Refresh Billing & Plan before applying a promotion.", 409);
      }
      if (organization?.subscription_billing_variant_id && organization.subscription_billing_variant_id !== variant.id) {
        return errorResponse("Use the billing term from your current prepaid plan for this additional branch.", 409);
      }
    }
    const billingBranchCount = additionalBranchCheckout ? activeBranchCount : requestedTargetBranchCount ?? activeBranchCount;
    const pricingQuote = additionalBranchCheckout
      ? calculateAdditionalBranchPriceQuote(operations.catalog, variant, entitlement, targetActiveBranchCount)
      : calculateCatalogVariantPriceQuote(operations.catalog, variant, billingBranchCount);
    const baseAmountCentavos = pricingQuote.termTotalCentavos;
    const quote = await readPromotionQuote(admin, {
      code,
      organizationId: profile.org_id,
      variant,
      baseAmountCentavos,
    });
    if (!quote.ok) return errorResponse(quote.message, quote.schemaAvailable ? 422 : 503);

    return NextResponse.json({
      ok: true,
      code: quote.code,
      name: quote.promotionName,
      discountType: quote.discountType,
      discountPercent: quote.discountPercent,
      baseAmountCentavos: quote.baseAmountCentavos,
      discountAmountCentavos: quote.discountAmountCentavos,
      finalAmountCentavos: quote.finalAmountCentavos,
      activeBranchCount: billingBranchCount,
      targetActiveBranchCount: additionalBranchCheckout || requestedTargetBranchCount !== null ? (additionalBranchCheckout ? targetActiveBranchCount : billingBranchCount) : null,
      billableBranchCount: pricingQuote.billableBranchCount,
      variantId,
    });
  } catch (error) {
    console.error("[billing/promotion] Unexpected error", error instanceof Error ? error.message : error);
    return errorResponse("The promotion code could not be checked. Please try again.", 500);
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
