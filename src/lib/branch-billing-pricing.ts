export type BillingIntervalUnit = "month" | "year";

export type SubscriptionPriceInput = {
  monthlyPriceCentavos: number;
  additionalBranchPriceCentavos: number;
  includedBranchCount: number;
  activeBranchCount: number;
  intervalUnit: BillingIntervalUnit;
  intervalCount: number;
  discountPercent: number;
};

export type SubscriptionCatalogPricing = Pick<SubscriptionPriceInput, "monthlyPriceCentavos" | "additionalBranchPriceCentavos" | "includedBranchCount">;

export type SubscriptionVariantInput = Pick<SubscriptionPriceInput, "intervalUnit" | "intervalCount" | "discountPercent">;

export type SubscriptionPriceQuote = {
  activeBranchCount: number;
  includedBranchCount: number;
  billableBranchCount: number;
  monthlyBaseCentavos: number;
  monthlyAddOnCentavos: number;
  monthlyTotalCentavos: number;
  termTotalCentavos: number;
  monthlyEquivalentCentavos: number;
};

export const DEFAULT_MONTHLY_PRICE_CENTAVOS = 59_900;
export const DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS = 29_900;
export const DEFAULT_INCLUDED_BRANCH_COUNT = 1;

export type AdditionalBranchPaymentInput = {
  branchCountDelta: 1 | -1;
  nextActiveBranchCount: number;
  includedBranchCount: number;
  hasPaidAccess: boolean;
  hasComplimentaryAccess: boolean;
};

/**
 * An extra active branch is an entitlement change, not just a directory write.
 * Deactivations are always allowed to reduce an existing branch commitment.
 */
export function requiresAdditionalBranchPayment(input: AdditionalBranchPaymentInput) {
  if (input.branchCountDelta !== 1 || input.hasPaidAccess || input.hasComplimentaryAccess) return false;

  const nextActiveBranchCount = normalizeWholeNumber(input.nextActiveBranchCount);
  const includedBranchCount = normalizeMinimumWholeNumber(input.includedBranchCount, 1);
  return nextActiveBranchCount > includedBranchCount;
}

export function calculateBillableBranchCount(activeBranchCount: number, includedBranchCount = DEFAULT_INCLUDED_BRANCH_COUNT) {
  const active = normalizeWholeNumber(activeBranchCount);
  const included = normalizeMinimumWholeNumber(includedBranchCount, 1);
  return Math.max(active - included, 0);
}

export function calculateSubscriptionMonthlyTotal(
  monthlyPriceCentavos: number,
  additionalBranchPriceCentavos: number,
  activeBranchCount: number,
  includedBranchCount = DEFAULT_INCLUDED_BRANCH_COUNT,
) {
  const basePrice = normalizeCentavos(monthlyPriceCentavos);
  const branchPrice = normalizeCentavos(additionalBranchPriceCentavos);
  return basePrice + branchPrice * calculateBillableBranchCount(activeBranchCount, includedBranchCount);
}

export function calculateSubscriptionPriceQuote(input: SubscriptionPriceInput): SubscriptionPriceQuote {
  const activeBranchCount = normalizeWholeNumber(input.activeBranchCount);
  const includedBranchCount = normalizeMinimumWholeNumber(input.includedBranchCount, 1);
  const billableBranchCount = calculateBillableBranchCount(activeBranchCount, includedBranchCount);
  const monthlyBaseCentavos = normalizeCentavos(input.monthlyPriceCentavos);
  const monthlyAddOnCentavos = normalizeCentavos(input.additionalBranchPriceCentavos) * billableBranchCount;
  const monthlyTotalCentavos = monthlyBaseCentavos + monthlyAddOnCentavos;
  const intervalCount = normalizeMinimumWholeNumber(input.intervalCount, 1);
  const months = input.intervalUnit === "year" ? intervalCount * 12 : intervalCount;
  const discountPercent = normalizeDiscount(input.discountPercent);
  const termTotalCentavos = Math.round(monthlyTotalCentavos * months * Math.max(0, 1 - discountPercent / 100));

  return {
    activeBranchCount,
    includedBranchCount,
    billableBranchCount,
    monthlyBaseCentavos,
    monthlyAddOnCentavos,
    monthlyTotalCentavos,
    termTotalCentavos,
    monthlyEquivalentCentavos: Math.round(termTotalCentavos / Math.max(months, 1)),
  };
}

export function calculateCatalogVariantPriceQuote(
  pricing: SubscriptionCatalogPricing,
  variant: SubscriptionVariantInput,
  activeBranchCount: number,
) {
  return calculateSubscriptionPriceQuote({
    ...pricing,
    ...variant,
    activeBranchCount,
  });
}

export function calculateSubscriptionVariantPrice(input: SubscriptionPriceInput) {
  return calculateSubscriptionPriceQuote(input).termTotalCentavos;
}

function normalizeCentavos(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeWholeNumber(value: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeMinimumWholeNumber(value: number, minimum: number) {
  return Math.max(normalizeWholeNumber(value), minimum);
}

function normalizeDiscount(value: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}
