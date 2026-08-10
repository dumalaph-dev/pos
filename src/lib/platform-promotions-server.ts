import type { BillingVariant } from "@/lib/platform-operations";
import {
  calculatePromotionDiscount,
  normalizePromotionCode,
  promotionScopeMatches,
  type PlatformPromotion,
  type PlatformPromotionPerformance,
  type PromotionQuote,
  type PromotionQuoteFailure,
} from "@/lib/platform-promotions";

type PlatformAdminClient = NonNullable<ReturnType<typeof import("@/lib/employee-auth").createAdminClient>>;

type PromotionRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_percent: number | string | null;
  discount_amount_centavos: number | string | null;
  applies_to: "all" | "monthly" | "annual";
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformPromotionsResult = {
  schemaAvailable: boolean;
  promotions: PlatformPromotion[];
  performance: PlatformPromotionPerformance[];
};

export async function readPlatformPromotions(admin: PlatformAdminClient): Promise<PlatformPromotionsResult> {
  const promotionsResult = await admin
    .from("platform_promotions")
    .select("id, code, name, description, discount_type, discount_percent, discount_amount_centavos, applies_to, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (promotionsResult.error) return { schemaAvailable: false, promotions: [], performance: [] };

  const performanceResult = await admin.rpc("platform_promotion_performance");

  if (performanceResult.error) return { schemaAvailable: false, promotions: [], performance: [] };

  return {
    schemaAvailable: true,
    promotions: ((promotionsResult.data ?? []) as PromotionRow[]).map(normalizePromotion),
    performance: (performanceResult.data ?? []).map(normalizePerformance),
  };
}

export async function readPromotionQuote(
  admin: PlatformAdminClient,
  input: {
    code: string;
    organizationId: string;
    variant: BillingVariant;
    baseAmountCentavos: number;
  },
): Promise<PromotionQuote | PromotionQuoteFailure> {
  const code = normalizePromotionCode(input.code);
  const baseAmountCentavos = Math.max(0, Math.round(input.baseAmountCentavos));
  if (!code) return emptyQuote(baseAmountCentavos);

  const result = await admin
    .from("platform_promotions")
    .select("id, code, name, description, discount_type, discount_percent, discount_amount_centavos, applies_to, starts_at, ends_at, max_redemptions, is_active, created_at, updated_at")
    .eq("code", code)
    .maybeSingle();
  if (result.error) return promotionSchemaFailure();
  if (!result.data) return { ok: false, schemaAvailable: true, message: "That promotion code is not recognized." };

  const promotion = normalizePromotion(result.data as PromotionRow);
  const now = Date.now();
  if (!promotion.isActive) return { ok: false, schemaAvailable: true, message: "That promotion is no longer active." };
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now) return { ok: false, schemaAvailable: true, message: "That promotion is not available yet." };
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() <= now) return { ok: false, schemaAvailable: true, message: "That promotion has ended." };
  if (!promotionScopeMatches(promotion.appliesTo, input.variant)) return { ok: false, schemaAvailable: true, message: "That promotion does not apply to this billing option." };

  const convertedCount = await admin
    .from("platform_promotion_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", promotion.id)
    .eq("status", "converted");
  if (convertedCount.error) return promotionSchemaFailure();

  if (promotion.maxRedemptions !== null && (convertedCount.count ?? 0) >= promotion.maxRedemptions) {
    return { ok: false, schemaAvailable: true, message: "That promotion has reached its redemption limit." };
  }

  const organizationUse = await admin
    .from("platform_promotion_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", promotion.id)
    .eq("organization_id", input.organizationId)
    .eq("status", "converted");
  if (organizationUse.error) return promotionSchemaFailure();
  if ((organizationUse.count ?? 0) > 0) {
    return { ok: false, schemaAvailable: true, message: "This promotion has already been used for your business." };
  }

  const discountAmountCentavos = calculatePromotionDiscount(promotion, baseAmountCentavos);
  return {
    ok: true,
    schemaAvailable: true,
    code: promotion.code,
    promotionId: promotion.id,
    promotionName: promotion.name,
    discountType: promotion.discountType,
    discountPercent: promotion.discountPercent,
    baseAmountCentavos,
    discountAmountCentavos,
    finalAmountCentavos: Math.max(0, baseAmountCentavos - discountAmountCentavos),
  };
}

export async function recordPromotionRedemption(
  admin: PlatformAdminClient,
  input: {
    promotionId: string;
    organizationId: string;
    billingVariantId: string;
    checkoutMode: "recurring" | "temporary_qrph";
    status: "started" | "converted";
    baseAmountCentavos: number;
    discountAmountCentavos: number;
    finalAmountCentavos: number;
    providerReference: string;
  },
) {
  const result = await admin.from("platform_promotion_redemptions").insert({
    promotion_id: input.promotionId,
    organization_id: input.organizationId,
    billing_variant_id: input.billingVariantId,
    checkout_mode: input.checkoutMode,
    status: input.status,
    base_amount_centavos: input.baseAmountCentavos,
    discount_amount_centavos: input.discountAmountCentavos,
    final_amount_centavos: input.finalAmountCentavos,
    provider_reference: input.providerReference,
    converted_at: input.status === "converted" ? new Date().toISOString() : null,
  });
  if (result.error) console.warn("[platform-promotions] Redemption could not be recorded", result.error.message);
}

export async function markPromotionRedemptionConverted(admin: PlatformAdminClient, providerReference: string | null, alternateProviderReference: string | null = null) {
  const references = Array.from(new Set([providerReference, alternateProviderReference].filter((value): value is string => Boolean(value))));
  if (references.length === 0) return;
  const result = await admin
    .from("platform_promotion_redemptions")
    .update({ status: "converted", converted_at: new Date().toISOString() })
    .in("provider_reference", references)
    .eq("status", "started");
  if (result.error) console.warn("[platform-promotions] Redemption could not be finalized", result.error.message);
}

export async function markLatestPromotionRedemptionConverted(admin: PlatformAdminClient, organizationId: string) {
  const lookup = await admin
    .from("platform_promotion_redemptions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "started")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookup.error || !lookup.data?.id) return;

  const result = await admin
    .from("platform_promotion_redemptions")
    .update({ status: "converted", converted_at: new Date().toISOString() })
    .eq("id", lookup.data.id)
    .eq("status", "started");
  if (result.error) console.warn("[platform-promotions] Latest redemption could not be finalized", result.error.message);
}

function normalizePromotion(value: PromotionRow): PlatformPromotion {
  return {
    id: value.id,
    code: value.code,
    name: value.name,
    description: value.description ?? "",
    discountType: value.discount_type,
    discountPercent: value.discount_percent === null ? null : Number(value.discount_percent),
    discountAmountCentavos: value.discount_amount_centavos === null ? null : Number(value.discount_amount_centavos),
    appliesTo: value.applies_to,
    startsAt: value.starts_at,
    endsAt: value.ends_at,
    maxRedemptions: value.max_redemptions === null ? null : Number(value.max_redemptions),
    isActive: value.is_active,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function normalizePerformance(value: {
  promotion_id: string;
  started: number | string;
  converted: number | string;
  discount_given_centavos: number | string;
  revenue_centavos: number | string;
}) {
  return {
    promotionId: value.promotion_id,
    started: Number(value.started),
    converted: Number(value.converted),
    discountGivenCentavos: Number(value.discount_given_centavos),
    revenueCentavos: Number(value.revenue_centavos),
  };
}

function emptyQuote(baseAmountCentavos: number): PromotionQuote {
  return {
    ok: true,
    schemaAvailable: true,
    code: null,
    promotionId: null,
    promotionName: null,
    discountType: null,
    discountPercent: null,
    baseAmountCentavos,
    discountAmountCentavos: 0,
    finalAmountCentavos: baseAmountCentavos,
  };
}

function promotionSchemaFailure(): PromotionQuoteFailure {
  return {
    ok: false,
    schemaAvailable: false,
    message: "Promotion codes are not available yet. Apply migration 0040_platform_promotions.sql and try again.",
  };
}
