import type { BillingVariant } from "@/lib/platform-operations";

export type PlatformPromotionType = "percentage" | "fixed";
export type PlatformPromotionScope = "all" | "monthly" | "annual";

export type PlatformPromotion = {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: PlatformPromotionType;
  discountPercent: number | null;
  discountAmountCentavos: number | null;
  appliesTo: PlatformPromotionScope;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlatformPromotionPerformance = {
  promotionId: string;
  started: number;
  converted: number;
  discountGivenCentavos: number;
  revenueCentavos: number;
};

export type PromotionQuote = {
  ok: true;
  schemaAvailable: true;
  code: string | null;
  promotionId: string | null;
  promotionName: string | null;
  discountType: PlatformPromotionType | null;
  discountPercent: number | null;
  baseAmountCentavos: number;
  discountAmountCentavos: number;
  finalAmountCentavos: number;
};

export type PromotionQuoteFailure = {
  ok: false;
  schemaAvailable: boolean;
  message: string;
};

export function normalizePromotionCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function promotionScopeMatches(scope: PlatformPromotionScope, variant: Pick<BillingVariant, "intervalUnit">) {
  return scope === "all" || (scope === "monthly" && variant.intervalUnit === "month") || (scope === "annual" && variant.intervalUnit === "year");
}

export function calculatePromotionDiscount(promotion: PlatformPromotion, baseAmountCentavos: number) {
  if (promotion.discountType === "percentage") {
    return Math.min(baseAmountCentavos, Math.round(baseAmountCentavos * (promotion.discountPercent ?? 0) / 100));
  }
  return Math.min(baseAmountCentavos, Math.max(0, promotion.discountAmountCentavos ?? 0));
}

export function promotionValueLabel(promotion: Pick<PlatformPromotion, "discountType" | "discountPercent" | "discountAmountCentavos">) {
  if (promotion.discountType === "percentage") return `${formatPercent(promotion.discountPercent ?? 0)}% off`;
  return `${formatPhp(promotion.discountAmountCentavos ?? 0)} off`;
}

export function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPhp(centavos: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(centavos / 100);
}
