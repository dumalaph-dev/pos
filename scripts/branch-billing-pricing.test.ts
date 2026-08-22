import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBillableBranchCount,
  calculateAdditionalBranchPriceQuote,
  calculateCatalogVariantPriceQuote,
  calculateSubscriptionMonthlyTotal,
  calculateSubscriptionPriceQuote,
  calculateSubscriptionVariantPrice,
  DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS,
  DEFAULT_INCLUDED_BRANCH_COUNT,
  DEFAULT_MONTHLY_PRICE_CENTAVOS,
  MAX_BRANCH_ENTITLEMENT,
  decideBranchActivation,
  requiresAdditionalBranchPayment,
} from "../src/lib/branch-billing-pricing.ts";

test("the default catalog matches the requested base and branch prices", () => {
  assert.equal(DEFAULT_MONTHLY_PRICE_CENTAVOS, 59_900);
  assert.equal(DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS, 29_900);
  assert.equal(DEFAULT_INCLUDED_BRANCH_COUNT, 1);
});

test("the included branch does not create an add-on charge", () => {
  const quote = calculateSubscriptionPriceQuote({
    monthlyPriceCentavos: DEFAULT_MONTHLY_PRICE_CENTAVOS,
    additionalBranchPriceCentavos: DEFAULT_ADDITIONAL_BRANCH_PRICE_CENTAVOS,
    includedBranchCount: DEFAULT_INCLUDED_BRANCH_COUNT,
    activeBranchCount: 1,
    intervalUnit: "month",
    intervalCount: 1,
    discountPercent: 0,
  });

  assert.equal(quote.billableBranchCount, 0);
  assert.equal(quote.monthlyBaseCentavos, 59_900);
  assert.equal(quote.monthlyAddOnCentavos, 0);
  assert.equal(quote.monthlyTotalCentavos, 59_900);
  assert.equal(quote.termTotalCentavos, 59_900);
});

test("each branch after the included branch adds the configured monthly amount", () => {
  assert.equal(calculateBillableBranchCount(0), 0);
  assert.equal(calculateBillableBranchCount(1), 0);
  assert.equal(calculateBillableBranchCount(2), 1);
  assert.equal(calculateBillableBranchCount(3), 2);
  assert.equal(calculateSubscriptionMonthlyTotal(59_900, 29_900, 2), 89_800);
  assert.equal(calculateSubscriptionMonthlyTotal(59_900, 29_900, 3), 119_700);
});

test("an extra active branch requires paid or complimentary access", () => {
  const input = {
    branchCountDelta: 1 as const,
    nextActiveBranchCount: 2,
    includedBranchCount: 1,
    hasPaidAccess: false,
    hasComplimentaryAccess: false,
  };

  assert.equal(requiresAdditionalBranchPayment(input), true);
  assert.equal(requiresAdditionalBranchPayment({ ...input, hasPaidAccess: true }), false);
  assert.equal(requiresAdditionalBranchPayment({ ...input, hasComplimentaryAccess: true }), false);
  assert.equal(requiresAdditionalBranchPayment({ ...input, nextActiveBranchCount: 1 }), false);
  assert.equal(requiresAdditionalBranchPayment({ ...input, branchCountDelta: -1, nextActiveBranchCount: 1 }), false);
  assert.equal(requiresAdditionalBranchPayment({ ...input, includedBranchCount: 2 }), false);
});

test("catalog variants use the shared branch-aware quote", () => {
  const quote = calculateCatalogVariantPriceQuote(
    {
      monthlyPriceCentavos: 59_900,
      additionalBranchPriceCentavos: 29_900,
      includedBranchCount: 1,
    },
    {
      intervalUnit: "month",
      intervalCount: 1,
      discountPercent: 0,
    },
    2,
  );

  assert.equal(quote.monthlyTotalCentavos, 89_800);
  assert.equal(quote.termTotalCentavos, 89_800);
  assert.equal(quote.billableBranchCount, 1);
});

test("custom included branch counts and invalid counts are normalized safely", () => {
  assert.equal(calculateBillableBranchCount(3, 2), 1);
  assert.equal(calculateSubscriptionMonthlyTotal(59_900, 29_900, 3, 2), 89_800);
  assert.equal(calculateBillableBranchCount(-4), 0);
  assert.equal(calculateBillableBranchCount(2.9), 1);
  assert.equal(calculateBillableBranchCount(2, 0), 1);
});

test("term discounts apply to the combined base and branch total", () => {
  const input = {
    monthlyPriceCentavos: 59_900,
    additionalBranchPriceCentavos: 29_900,
    includedBranchCount: 1,
    activeBranchCount: 2,
    intervalUnit: "year" as const,
    intervalCount: 1,
    discountPercent: 10,
  };
  const quote = calculateSubscriptionPriceQuote(input);

  assert.equal(quote.monthlyTotalCentavos, 89_800);
  assert.equal(quote.termTotalCentavos, 969_840);
  assert.equal(quote.monthlyEquivalentCentavos, 80_820);
  assert.equal(calculateSubscriptionVariantPrice(input), quote.termTotalCentavos);
});

test("a full discount cannot produce a negative term price", () => {
  const quote = calculateSubscriptionPriceQuote({
    monthlyPriceCentavos: 59_900,
    additionalBranchPriceCentavos: 29_900,
    includedBranchCount: 1,
    activeBranchCount: 3,
    intervalUnit: "month",
    intervalCount: 1,
    discountPercent: 100,
  });

  assert.equal(quote.monthlyTotalCentavos, 119_700);
  assert.equal(quote.termTotalCentavos, 0);
});

test("trial access stops at the included branch until payment is completed", () => {
  assert.equal(decideBranchActivation({
    branchCountDelta: 1,
    nextActiveBranchCount: 2,
    paidBranchEntitlement: 1,
    paidAccessMode: "none",
    hasComplimentaryAccess: false,
  }), "payment_required");
});

test("an active recurring plan schedules the additional branch for its next cycle", () => {
  assert.equal(decideBranchActivation({
    branchCountDelta: 1,
    nextActiveBranchCount: 2,
    paidBranchEntitlement: 1,
    paidAccessMode: "recurring",
    hasComplimentaryAccess: false,
  }), "schedule_recurring");
});

test("an active prepaid plan requires a paid entitlement before the branch is activated", () => {
  assert.equal(decideBranchActivation({
    branchCountDelta: 1,
    nextActiveBranchCount: 3,
    paidBranchEntitlement: 2,
    paidAccessMode: "prepaid",
    hasComplimentaryAccess: false,
  }), "payment_required");
  assert.equal(decideBranchActivation({
    branchCountDelta: 1,
    nextActiveBranchCount: 2,
    paidBranchEntitlement: 2,
    paidAccessMode: "prepaid",
    hasComplimentaryAccess: false,
  }), "allowed");
});

test("complimentary access bypasses the paid branch check", () => {
  assert.equal(decideBranchActivation({
    branchCountDelta: 1,
    nextActiveBranchCount: 10,
    paidBranchEntitlement: 1,
    paidAccessMode: "none",
    hasComplimentaryAccess: true,
  }), "allowed");
});

test("the additional branch quote is exactly the difference between covered terms", () => {
  const monthly = calculateAdditionalBranchPriceQuote(
    { monthlyPriceCentavos: 59_900, additionalBranchPriceCentavos: 29_900, includedBranchCount: 1 },
    { intervalUnit: "month", intervalCount: 1, discountPercent: 0 },
    1,
    2,
  );
  assert.equal(monthly.termTotalCentavos, 29_900);
  assert.equal(monthly.monthlyEquivalentCentavos, 29_900);
  assert.equal(monthly.additionalBranchCount, 1);

  const annual = calculateAdditionalBranchPriceQuote(
    { monthlyPriceCentavos: 59_900, additionalBranchPriceCentavos: 29_900, includedBranchCount: 1 },
    { intervalUnit: "year", intervalCount: 1, discountPercent: 10 },
    1,
    2,
  );
  assert.equal(annual.termTotalCentavos, 322_920);
  assert.equal(annual.monthlyEquivalentCentavos, 26_910);
});

test("one prepaid checkout can buy multiple additional branch slots", () => {
  const quote = calculateAdditionalBranchPriceQuote(
    { monthlyPriceCentavos: 59_900, additionalBranchPriceCentavos: 29_900, includedBranchCount: 1 },
    { intervalUnit: "year", intervalCount: 1, discountPercent: 10 },
    2,
    5,
  );

  assert.equal(quote.currentEntitledBranchCount, 2);
  assert.equal(quote.targetActiveBranchCount, 5);
  assert.equal(quote.additionalBranchCount, 3);
  assert.equal(quote.termTotalCentavos, 968_760);
  assert.equal(quote.monthlyEquivalentCentavos, 80_730);
  assert.equal(MAX_BRANCH_ENTITLEMENT, 1_000);
});
