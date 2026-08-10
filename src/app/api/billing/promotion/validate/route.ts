import { NextResponse, type NextRequest } from "next/server";
import { getAdminProfile } from "@/lib/admin/profile";
import { createAdminClient } from "@/lib/employee-auth";
import { calculateBillingVariantPrice } from "@/lib/platform-operations";
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
    if (!code) return errorResponse("Enter a promotion code first.", 400);

    const operations = await readPlatformOperations(admin);
    if (!operations.catalog.schemaAvailable) return errorResponse("The billing catalog is not available yet. Please try again later.", 503);

    const variant = operations.catalog.variants.find((candidate) => candidate.id === variantId && candidate.isActive);
    if (!variant) return errorResponse("Choose an active plan before applying a promotion.", 400);
    const baseAmountCentavos = calculateBillingVariantPrice(
      operations.catalog.monthlyPriceCentavos,
      variant.intervalUnit,
      variant.intervalCount,
      variant.discountPercent,
    );
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
