import { calculateSubscriptionPriceQuote } from "./branch-billing-pricing.ts";
import { readEffectiveComplimentaryAccess, type ComplimentaryAccessGrant, type EffectiveComplimentaryAccess } from "./platform-access.ts";

export type RevenueIntervalUnit = "month" | "year";

export type PlatformRevenueOrganization = {
  id: string;
  name: string;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_trial_ends_at?: string | null;
  subscription_billing_mode?: string | null;
  subscription_billing_variant_id?: string | null;
  subscription_provider_plan_id?: string | null;
  subscription_entitled_branch_count?: number | null;
  subscription_pending_branch_count?: number | null;
};

export type PlatformRevenueCatalogVariant = {
  id: string | null;
  label: string;
  intervalUnit: RevenueIntervalUnit;
  intervalCount: number;
  discountPercent: number;
  paymongoPlanId: string | null;
  isActive: boolean;
};

export type PlatformRevenueCatalog = {
  monthlyPriceCentavos: number;
  additionalBranchPriceCentavos: number;
  includedBranchCount: number;
  variants: readonly PlatformRevenueCatalogVariant[];
};

export type NormalizedMrrInput = {
  monthlyPriceCentavos: number;
  additionalBranchPriceCentavos: number;
  includedBranchCount: number;
  entitledBranchCount: number;
  intervalUnit: RevenueIntervalUnit;
  intervalCount: number;
  discountPercent: number;
};

export type NormalizedMrrResult = {
  termMonths: number;
  termTotalCentavos: number;
  normalizedMrrCentavos: number;
  billableBranchCount: number;
};

export type PlatformRevenueContributionState =
  | "contracted"
  | "past_due"
  | "trial"
  | "complimentary"
  | "prepaid"
  | "unsupported"
  | "none";

export type PlatformRevenueContribution = {
  organizationId: string;
  organizationName: string;
  planId: string;
  planLabel: string;
  state: PlatformRevenueContributionState;
  billingMode: "recurring" | "temporary_qrph" | "unknown";
  billingVariantId: string | null;
  billingCycleLabel: string | null;
  intervalMonths: number | null;
  discountPercent: number | null;
  entitledBranchCount: number | null;
  pendingBranchCount: number | null;
  normalizedMrrCentavos: number | null;
  termTotalCentavos: number | null;
  currentGrant: EffectiveComplimentaryAccess | null;
  hasCurrentTrial: boolean;
  hasCurrentGrant: boolean;
  exclusionReason: string | null;
};

export type PlatformRevenuePlanMixEntry = {
  key: string;
  label: string;
  billingVariantId: string | null;
  intervalMonths: number;
  organizationCount: number;
  mrrCentavos: number;
  sharePercent: number;
};

export type PlatformRevenueReadout = {
  asOf: string;
  contractedMrrCentavos: number;
  arrCentavos: number;
  activeMrrCentavos: number;
  pastDueMrrCentavos: number;
  contractedOrganizationCount: number;
  activeOrganizationCount: number;
  pastDueOrganizationCount: number;
  recognizedOrganizationCount: number;
  unsupportedOrganizationCount: number;
  prepaidOrganizationCount: number;
  planMix: PlatformRevenuePlanMixEntry[];
  unbilledAccess: {
    totalOrganizationCount: number;
    trialOrganizationCount: number;
    complimentaryOrganizationCount: number;
    trialAndComplimentaryOrganizationCount: number;
  };
  contributions: PlatformRevenueContribution[];
  topContributors: PlatformRevenueContribution[];
};

export type PlatformRevenueReadoutInput = {
  organizations: readonly PlatformRevenueOrganization[];
  catalog: PlatformRevenueCatalog;
  grantsByOrg?: ReadonlyMap<string, readonly ComplimentaryAccessGrant[]>;
  asOf?: string | number | Date;
  topLimit?: number;
};

const CONTRACTED_STATUSES = new Set(["active", "past_due"]);
const KNOWN_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "incomplete", "paused"]);

/**
 * Normalize a recurring term into its monthly run rate. The division is kept
 * precise until the platform readout is aggregated and rounded for display.
 * This function only prices a stored contract; it never represents cash
 * collected from a provider.
 */
export function calculateNormalizedMrr(input: NormalizedMrrInput): NormalizedMrrResult {
  const intervalCount = normalizePositiveWholeNumber(input.intervalCount);
  const termMonths = input.intervalUnit === "year" ? intervalCount * 12 : intervalCount;
  const quote = calculateSubscriptionPriceQuote({
    monthlyPriceCentavos: input.monthlyPriceCentavos,
    additionalBranchPriceCentavos: input.additionalBranchPriceCentavos,
    includedBranchCount: input.includedBranchCount,
    activeBranchCount: normalizePositiveWholeNumber(input.entitledBranchCount),
    intervalUnit: input.intervalUnit,
    intervalCount,
    discountPercent: input.discountPercent,
  });

  return {
    termMonths,
    termTotalCentavos: quote.termTotalCentavos,
    normalizedMrrCentavos: quote.termTotalCentavos / termMonths,
    billableBranchCount: quote.billableBranchCount,
  };
}

export function calculateOrganizationRevenueContribution({
  organization,
  catalog,
  grants = [],
  asOf = Date.now(),
}: {
  organization: PlatformRevenueOrganization;
  catalog: PlatformRevenueCatalog;
  grants?: readonly ComplimentaryAccessGrant[];
  asOf?: string | number | Date;
}): PlatformRevenueContribution {
  const asOfMs = toTimestamp(asOf);
  const status = normalizeStatus(organization.subscription_status);
  const billingMode = normalizeBillingMode(organization.subscription_billing_mode);
  const currentGrant = readEffectiveComplimentaryAccess(grants, asOfMs);
  const hasCurrentGrant = currentGrant !== null;
  const hasCurrentTrial = status === "trialing" && isCurrentTrial(organization.subscription_trial_ends_at, asOfMs);
  const planId = normalizePlanId(organization.subscription_plan);
  const planLabel = planId === "premium" ? "Premium" : planId;
  const entitledBranchCount = readPositiveWholeNumber(organization.subscription_entitled_branch_count);
  const pendingBranchCount = readPositiveWholeNumber(organization.subscription_pending_branch_count);

  const base = {
    organizationId: organization.id,
    organizationName: organization.name.trim() || "Unnamed organization",
    planId,
    planLabel,
    billingMode,
    billingVariantId: null,
    billingCycleLabel: null,
    intervalMonths: null,
    discountPercent: null,
    entitledBranchCount,
    pendingBranchCount,
    normalizedMrrCentavos: null,
    termTotalCentavos: null,
    currentGrant,
    hasCurrentTrial,
    hasCurrentGrant,
    exclusionReason: null,
  } satisfies Omit<PlatformRevenueContribution, "state">;

  if (CONTRACTED_STATUSES.has(status)) {
    if (billingMode === "temporary_qrph") {
      return { ...base, state: "prepaid", exclusionReason: "Temporary QRPH access is billed separately from recurring MRR." };
    }
    if (billingMode !== "recurring") {
      return { ...base, state: "unsupported", exclusionReason: "The billing mode is not recognized." };
    }
    const variant = findBillingVariant(organization, catalog.variants);
    if (!variant) {
      return { ...base, state: "unsupported", exclusionReason: "The stored billing variant is not mapped to the current catalog." };
    }
    if (entitledBranchCount === null) {
      return { ...base, billingVariantId: variant.id, billingCycleLabel: variant.label, intervalMonths: variantMonths(variant), discountPercent: variant.discountPercent, state: "unsupported", exclusionReason: "Billed branch entitlement is unavailable." };
    }

    const normalized = calculateNormalizedMrr({
      monthlyPriceCentavos: catalog.monthlyPriceCentavos,
      additionalBranchPriceCentavos: catalog.additionalBranchPriceCentavos,
      includedBranchCount: catalog.includedBranchCount,
      entitledBranchCount,
      intervalUnit: variant.intervalUnit,
      intervalCount: variant.intervalCount,
      discountPercent: variant.discountPercent,
    });

    return {
      ...base,
      billingVariantId: variant.id,
      billingCycleLabel: variant.label,
      intervalMonths: normalized.termMonths,
      discountPercent: variant.discountPercent,
      normalizedMrrCentavos: normalized.normalizedMrrCentavos,
      termTotalCentavos: normalized.termTotalCentavos,
      state: status === "past_due" ? "past_due" : "contracted",
    };
  }

  if (billingMode === "temporary_qrph" && status === "active") {
    return { ...base, state: "prepaid", exclusionReason: "Temporary QRPH access is billed separately from recurring MRR." };
  }
  if (hasCurrentGrant) {
    return { ...base, state: "complimentary" };
  }
  if (hasCurrentTrial) {
    return { ...base, state: "trial" };
  }

  return { ...base, state: "none" };
}

export function calculatePlatformRevenueReadout(input: PlatformRevenueReadoutInput): PlatformRevenueReadout {
  const asOfMs = toTimestamp(input.asOf ?? Date.now());
  const contributions = input.organizations.map((organization) => calculateOrganizationRevenueContribution({
    organization,
    catalog: input.catalog,
    grants: input.grantsByOrg?.get(organization.id) ?? [],
    asOf: asOfMs,
  }));
  const recognized = contributions.filter((contribution) => isContractedContribution(contribution));
  const active = recognized.filter((contribution) => contribution.state === "contracted");
  const pastDue = recognized.filter((contribution) => contribution.state === "past_due");
  const mrrRaw = sumMrr(recognized);
  const activeMrrRaw = sumMrr(active);
  const pastDueMrrRaw = sumMrr(pastDue);

  const planMix = buildPlanMix(recognized, mrrRaw);
  const currentUnbilled = contributions.filter((contribution) => contribution.state === "trial" || contribution.state === "complimentary");
  const trialCount = currentUnbilled.filter((contribution) => contribution.hasCurrentTrial).length;
  const complimentaryCount = currentUnbilled.filter((contribution) => contribution.hasCurrentGrant).length;
  const overlapCount = currentUnbilled.filter((contribution) => contribution.hasCurrentTrial && contribution.hasCurrentGrant).length;
  const topLimit = normalizeTopLimit(input.topLimit);

  return {
    asOf: new Date(asOfMs).toISOString(),
    contractedMrrCentavos: roundCentavos(mrrRaw),
    arrCentavos: roundCentavos(mrrRaw * 12),
    activeMrrCentavos: roundCentavos(activeMrrRaw),
    pastDueMrrCentavos: roundCentavos(pastDueMrrRaw),
    contractedOrganizationCount: recognized.length,
    activeOrganizationCount: active.length,
    pastDueOrganizationCount: pastDue.length,
    recognizedOrganizationCount: recognized.length,
    unsupportedOrganizationCount: contributions.filter((contribution) => contribution.state === "unsupported").length,
    prepaidOrganizationCount: contributions.filter((contribution) => contribution.state === "prepaid").length,
    planMix,
    unbilledAccess: {
      totalOrganizationCount: new Set(currentUnbilled.map((contribution) => contribution.organizationId)).size,
      trialOrganizationCount: trialCount,
      complimentaryOrganizationCount: complimentaryCount,
      trialAndComplimentaryOrganizationCount: overlapCount,
    },
    contributions,
    topContributors: [...recognized]
      .sort(compareContributions)
      .slice(0, topLimit),
  };
}

function findBillingVariant(
  organization: PlatformRevenueOrganization,
  variants: readonly PlatformRevenueCatalogVariant[],
) {
  const storedVariantId = normalizeOptionalString(organization.subscription_billing_variant_id);
  if (storedVariantId) {
    const storedVariant = variants.find((variant) => variant.id === storedVariantId);
    if (storedVariant) return storedVariant;
  }

  const providerPlanId = normalizeOptionalString(organization.subscription_provider_plan_id);
  if (providerPlanId) {
    const providerVariant = variants.find((variant) => variant.paymongoPlanId === providerPlanId);
    if (providerVariant) return providerVariant;
  }

  return null;
}

function buildPlanMix(contributions: PlatformRevenueContribution[], totalMrrRaw: number) {
  const grouped = new Map<string, { label: string; billingVariantId: string | null; intervalMonths: number; organizationCount: number; mrrRaw: number }>();
  for (const contribution of contributions) {
    const key = `${contribution.planId}:${contribution.billingVariantId ?? contribution.billingCycleLabel ?? "unknown"}`;
    const current = grouped.get(key) ?? {
      label: `${contribution.planLabel} · ${contribution.billingCycleLabel ?? "Unmapped cycle"}`,
      billingVariantId: contribution.billingVariantId,
      intervalMonths: contribution.intervalMonths ?? 0,
      organizationCount: 0,
      mrrRaw: 0,
    };
    current.organizationCount += 1;
    current.mrrRaw += contribution.normalizedMrrCentavos ?? 0;
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      billingVariantId: entry.billingVariantId,
      intervalMonths: entry.intervalMonths,
      organizationCount: entry.organizationCount,
      mrrCentavos: roundCentavos(entry.mrrRaw),
      sharePercent: totalMrrRaw > 0 ? roundPercent(entry.mrrRaw / totalMrrRaw * 100) : 0,
    }))
    .sort((left, right) => right.mrrCentavos - left.mrrCentavos || right.organizationCount - left.organizationCount || left.label.localeCompare(right.label));
}

function isContractedContribution(contribution: PlatformRevenueContribution) {
  return (contribution.state === "contracted" || contribution.state === "past_due")
    && contribution.normalizedMrrCentavos !== null;
}

function sumMrr(contributions: PlatformRevenueContribution[]) {
  return contributions.reduce((sum, contribution) => sum + (contribution.normalizedMrrCentavos ?? 0), 0);
}

function compareContributions(left: PlatformRevenueContribution, right: PlatformRevenueContribution) {
  return (right.normalizedMrrCentavos ?? 0) - (left.normalizedMrrCentavos ?? 0)
    || left.organizationName.localeCompare(right.organizationName)
    || left.organizationId.localeCompare(right.organizationId);
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return KNOWN_STATUSES.has(normalized) ? normalized : "unknown";
}

function normalizeBillingMode(value: string | null | undefined): PlatformRevenueContribution["billingMode"] {
  if (value === null || value === undefined || value.trim() === "" || value === "recurring") return "recurring";
  if (value === "temporary_qrph") return "temporary_qrph";
  return "unknown";
}

function normalizePlanId(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized || "premium";
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function readPositiveWholeNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
}

function normalizePositiveWholeNumber(value: number) {
  return Math.max(Math.floor(Number.isFinite(value) ? value : 1), 1);
}

function variantMonths(variant: Pick<PlatformRevenueCatalogVariant, "intervalUnit" | "intervalCount">) {
  const count = normalizePositiveWholeNumber(variant.intervalCount);
  return variant.intervalUnit === "year" ? count * 12 : count;
}

function isCurrentTrial(value: string | null | undefined, asOfMs: number) {
  if (!value) return true;
  const endsAt = Date.parse(value);
  return !Number.isFinite(endsAt) || endsAt > asOfMs;
}

function toTimestamp(value: string | number | Date) {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function roundCentavos(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeTopLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 8;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}
