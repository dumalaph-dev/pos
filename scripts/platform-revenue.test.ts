import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNormalizedMrr,
  calculateOrganizationRevenueContribution,
  calculatePlatformRevenueReadout,
  type PlatformRevenueCatalog,
  type PlatformRevenueOrganization,
} from "../src/lib/platform-revenue.ts";
import type { ComplimentaryAccessGrant } from "../src/lib/platform-access.ts";

const AS_OF = "2026-09-01T00:00:00.000Z";
const CATALOG: PlatformRevenueCatalog = {
  monthlyPriceCentavos: 59_900,
  additionalBranchPriceCentavos: 29_900,
  includedBranchCount: 1,
  variants: [
    { id: "monthly", label: "Monthly", intervalUnit: "month", intervalCount: 1, discountPercent: 0, paymongoPlanId: "pm_monthly", isActive: true },
    { id: "annual", label: "1 year", intervalUnit: "year", intervalCount: 1, discountPercent: 10, paymongoPlanId: "pm_annual", isActive: true },
  ],
};

function organization(overrides: Partial<PlatformRevenueOrganization> = {}): PlatformRevenueOrganization {
  return {
    id: "org-default",
    name: "Morning Ritual",
    subscription_status: "active",
    subscription_plan: "premium",
    subscription_trial_ends_at: null,
    subscription_billing_mode: "recurring",
    subscription_billing_variant_id: "monthly",
    subscription_provider_plan_id: "pm_monthly",
    subscription_entitled_branch_count: 1,
    subscription_pending_branch_count: null,
    ...overrides,
  };
}

function grant(overrides: Partial<ComplimentaryAccessGrant> = {}): ComplimentaryAccessGrant {
  return {
    id: "grant-default",
    org_id: "org-default",
    source: "support",
    status: "active",
    starts_at: "2026-08-20T00:00:00.000Z",
    ends_at: "2026-09-10T00:00:00.000Z",
    reason: "Support recovery",
    created_by: null,
    created_at: "2026-08-20T00:00:00.000Z",
    revoked_by: null,
    revoked_at: null,
    metadata: {},
    ...overrides,
  };
}

test("normalized MRR uses the catalog term price divided by its term months", () => {
  const monthly = calculateNormalizedMrr({
    monthlyPriceCentavos: 59_900,
    additionalBranchPriceCentavos: 29_900,
    includedBranchCount: 1,
    entitledBranchCount: 2,
    intervalUnit: "month",
    intervalCount: 1,
    discountPercent: 0,
  });
  assert.deepEqual(monthly, {
    termMonths: 1,
    termTotalCentavos: 89_800,
    normalizedMrrCentavos: 89_800,
    billableBranchCount: 1,
  });

  const annual = calculateNormalizedMrr({
    monthlyPriceCentavos: 59_900,
    additionalBranchPriceCentavos: 29_900,
    includedBranchCount: 1,
    entitledBranchCount: 2,
    intervalUnit: "year",
    intervalCount: 1,
    discountPercent: 10,
  });
  assert.equal(annual.termMonths, 12);
  assert.equal(annual.termTotalCentavos, 969_840);
  assert.equal(annual.normalizedMrrCentavos, 80_820);
});

test("active recurring subscriptions contribute even when complimentary access is also current", () => {
  const contribution = calculateOrganizationRevenueContribution({
    organization: organization(),
    catalog: CATALOG,
    grants: [grant()],
    asOf: AS_OF,
  });

  assert.equal(contribution.state, "contracted");
  assert.equal(contribution.normalizedMrrCentavos, 59_900);
  assert.equal(contribution.hasCurrentGrant, true);
  assert.equal(contribution.exclusionReason, null);
});

test("past-due recurring commitments remain contracted but are separated as at risk", () => {
  const readout = calculatePlatformRevenueReadout({
    organizations: [organization({ id: "org-past-due", name: "Past Due Cafe", subscription_status: "past_due" })],
    catalog: CATALOG,
    asOf: AS_OF,
  });

  assert.equal(readout.contractedMrrCentavos, 59_900);
  assert.equal(readout.activeMrrCentavos, 0);
  assert.equal(readout.pastDueMrrCentavos, 59_900);
  assert.equal(readout.pastDueOrganizationCount, 1);
});

test("trial and complimentary-only access is unbilled and contributes zero MRR", () => {
  const readout = calculatePlatformRevenueReadout({
    organizations: [
      organization({ id: "org-trial", name: "Trial Cafe", subscription_status: "trialing", subscription_billing_variant_id: null, subscription_entitled_branch_count: 1, subscription_trial_ends_at: "2026-09-10T00:00:00.000Z" }),
      organization({ id: "org-grant", name: "Grant Cafe", subscription_status: "paused", subscription_billing_variant_id: null, subscription_entitled_branch_count: null }),
      organization({ id: "org-overlap", name: "Overlap Cafe", subscription_status: "trialing", subscription_billing_variant_id: null, subscription_trial_ends_at: "2026-09-10T00:00:00.000Z", subscription_entitled_branch_count: 1 }),
    ],
    catalog: CATALOG,
    grantsByOrg: new Map([
      ["org-grant", [grant({ id: "grant-grant", org_id: "org-grant" })]],
      ["org-overlap", [grant({ id: "grant-overlap", org_id: "org-overlap" })]],
    ]),
    asOf: AS_OF,
  });

  assert.equal(readout.contractedMrrCentavos, 0);
  assert.equal(readout.unbilledAccess.totalOrganizationCount, 3);
  assert.equal(readout.unbilledAccess.trialOrganizationCount, 2);
  assert.equal(readout.unbilledAccess.complimentaryOrganizationCount, 2);
  assert.equal(readout.unbilledAccess.trialAndComplimentaryOrganizationCount, 1);
});

test("temporary QRPH access is excluded from recurring MRR", () => {
  const contribution = calculateOrganizationRevenueContribution({
    organization: organization({ subscription_billing_mode: "temporary_qrph" }),
    catalog: CATALOG,
    asOf: AS_OF,
  });

  assert.equal(contribution.state, "prepaid");
  assert.equal(contribution.normalizedMrrCentavos, null);
  assert.match(contribution.exclusionReason ?? "", /billed separately/i);
});

test("missing variant or billed quantity is unsupported instead of priced with a default", () => {
  const missingVariant = calculateOrganizationRevenueContribution({
    organization: organization({ subscription_billing_variant_id: "retired-variant", subscription_provider_plan_id: "retired-provider" }),
    catalog: CATALOG,
    asOf: AS_OF,
  });
  assert.equal(missingVariant.state, "unsupported");
  assert.equal(missingVariant.normalizedMrrCentavos, null);

  const missingQuantity = calculateOrganizationRevenueContribution({
    organization: organization({ subscription_entitled_branch_count: null }),
    catalog: CATALOG,
    asOf: AS_OF,
  });
  assert.equal(missingQuantity.state, "unsupported");
  assert.equal(missingQuantity.normalizedMrrCentavos, null);
});

test("plan mix and top contributors reconcile to the normalized MRR total", () => {
  const readout = calculatePlatformRevenueReadout({
    organizations: [
      organization({ id: "org-monthly", name: "Monthly Cafe" }),
      organization({ id: "org-annual", name: "Annual Cafe", subscription_billing_variant_id: "annual", subscription_provider_plan_id: "pm_annual", subscription_entitled_branch_count: 2 }),
      organization({ id: "org-unsupported", name: "Legacy Cafe", subscription_billing_variant_id: null, subscription_provider_plan_id: null }),
    ],
    catalog: CATALOG,
    asOf: AS_OF,
  });

  assert.equal(readout.contractedMrrCentavos, 140_720);
  assert.equal(readout.arrCentavos, 1_688_640);
  assert.equal(readout.planMix.length, 2);
  assert.equal(readout.planMix.reduce((sum, entry) => sum + entry.mrrCentavos, 0), readout.contractedMrrCentavos);
  assert.deepEqual(readout.topContributors.map((entry) => entry.organizationName), ["Annual Cafe", "Monthly Cafe"]);
  assert.equal(readout.unsupportedOrganizationCount, 1);
});

test("annual rounding is deferred until the platform total is displayed", () => {
  const readout = calculatePlatformRevenueReadout({
    organizations: [
      organization({ id: "org-one", subscription_billing_variant_id: "annual", subscription_provider_plan_id: "pm_annual", subscription_entitled_branch_count: 1 }),
      organization({ id: "org-two", subscription_billing_variant_id: "annual", subscription_provider_plan_id: "pm_annual", subscription_entitled_branch_count: 1 }),
    ],
    catalog: { ...CATALOG, monthlyPriceCentavos: 9_999, additionalBranchPriceCentavos: 0 },
    asOf: AS_OF,
  });

  assert.equal(readout.contractedMrrCentavos, 17_998);
  assert.equal(readout.arrCentavos, 215_978);
});
