import { DEFAULT_INCLUDED_BRANCH_COUNT } from "./branch-billing-pricing.ts";
import { normalizeSubscriptionStatus } from "./billing.ts";
import {
  readEffectiveComplimentaryAccess,
  type ComplimentaryAccessGrant,
} from "./platform-access.ts";
import {
  readTrialExtensionEligibility,
  sumTrialExtensionDays,
  type TrialExtensionBlock,
  type TrialExtensionRecord,
} from "./platform-trial.ts";
import {
  formatTrialRemaining,
  isSubscriptionAccessCurrent,
  readTrialLifecycle,
  type TrialLifecycle,
} from "./trial.ts";

export type PlatformEntitlementFilter =
  | "all"
  | "in_trial"
  | "trial_expiring"
  | "on_grant"
  | "grant_expiring"
  | "paused"
  | "suspended";

export const PLATFORM_ENTITLEMENT_FILTERS: readonly PlatformEntitlementFilter[] = [
  "all",
  "in_trial",
  "trial_expiring",
  "on_grant",
  "grant_expiring",
  "paused",
  "suspended",
];

export type PlatformEntitlementTimelineKind = "trial" | "trial_extension" | "grant" | "subscription" | "suspension";
export type PlatformEntitlementTimelineState = "current" | "scheduled" | "expired" | "revoked" | "active" | "ended";

export type PlatformEntitlementTimelineItem = {
  id: string;
  kind: PlatformEntitlementTimelineKind;
  label: string;
  detail: string;
  startsAt: string | null;
  endsAt: string | null;
  state: PlatformEntitlementTimelineState;
};

export type PlatformEntitlementOrganization = {
  id: string;
  name: string;
  created_at: string;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_trial_started_at?: string | null;
  subscription_trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_billing_mode?: string | null;
  subscription_provider_subscription_id?: string | null;
  subscription_provider_payment_intent_id?: string | null;
  subscription_entitled_branch_count?: number | null;
  subscription_pending_branch_count?: number | null;
  subscription_updated_at?: string | null;
  account_status?: "active" | "suspended" | null;
  suspension_reason?: string | null;
  suspended_at?: string | null;
};

export type PlatformEntitlementSummary = {
  organizationId: string;
  organizationName: string;
  accountStatus: "active" | "suspended";
  subscriptionStatus: ReturnType<typeof normalizeSubscriptionStatus> | null;
  subscriptionPlan: string | null | undefined;
  accessState: "trial" | "grant" | "paid" | "paused" | "suspended" | "ended" | "unknown";
  accessLabel: string;
  accessDetail: string;
  trial: TrialLifecycle;
  currentGrant: {
    id: string;
    startsAt: string;
    endsAt: string;
    source: ComplimentaryAccessGrant["source"];
    reason: string;
  } | null;
  grantCount: number;
  paidBranch: {
    activeCount: number;
    entitledCount: number;
    includedCount: number;
    paidAddOnCount: number;
    pendingCount: number | null;
    isPaidAccess: boolean;
  };
  trialExtension: {
    daysUsed: number;
    daysRemaining: number;
    maxDays: number;
    canExtend: boolean;
    revives: boolean;
    block: TrialExtensionBlock;
  };
  filterKeys: PlatformEntitlementFilter[];
  timeline: PlatformEntitlementTimelineItem[];
};

export function derivePlatformEntitlementSummary(input: {
  organization: PlatformEntitlementOrganization;
  grants?: ComplimentaryAccessGrant[];
  trialExtensions?: TrialExtensionRecord[];
  activeBranchCount: number;
  includedBranchCount?: number;
  trialDays?: number;
  now?: number;
}): PlatformEntitlementSummary {
  const now = input.now ?? Date.now();
  const grants = input.grants ?? [];
  const trialExtensions = input.trialExtensions ?? [];
  const organization = input.organization;
  const subscriptionStatus = organization.subscription_status
    ? normalizeSubscriptionStatus(organization.subscription_status)
    : null;
  const accountStatus = organization.account_status === "suspended" ? "suspended" : "active";
  const trial = readTrialLifecycle({
    status: organization.subscription_status,
    createdAt: organization.created_at,
    trialStartedAt: organization.subscription_trial_started_at,
    trialEndsAt: organization.subscription_trial_ends_at,
    currentPeriodEnd: organization.subscription_current_period_end,
    trialDays: input.trialDays,
    providerSubscriptionId: organization.subscription_provider_subscription_id,
    providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
  }, now);
  const effectiveGrant = readEffectiveComplimentaryAccess(grants, now);
  const currentGrant = effectiveGrant
    ? grants.find((grant) => grant.id === effectiveGrant.grantId) ?? null
    : null;
  const effectiveAccess = accountStatus === "suspended"
    ? false
    : effectiveGrant
      ? true
      : isSubscriptionAccessCurrent({
        status: organization.subscription_status,
        trialStartedAt: organization.subscription_trial_started_at,
        trialEndsAt: organization.subscription_trial_ends_at,
        currentPeriodEnd: organization.subscription_current_period_end,
        billingMode: organization.subscription_billing_mode,
        providerSubscriptionId: organization.subscription_provider_subscription_id,
        providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
      }, now);
  const paidAccessCurrent = subscriptionStatus === "active"
    && (organization.subscription_billing_mode !== "temporary_qrph"
      || isFutureDate(organization.subscription_current_period_end, now));
  const accessState = accountStatus === "suspended"
    ? "suspended"
    : effectiveGrant
      ? "grant"
      : subscriptionStatus === "trialing" && trial.isActive
        ? "trial"
        : paidAccessCurrent || (effectiveAccess === true && (subscriptionStatus === "active" || subscriptionStatus === "past_due"))
          ? "paid"
          : subscriptionStatus === "paused"
            ? "paused"
            : effectiveAccess === false || trial.isExpired
              ? "ended"
              : "unknown";
  const accessLabel = accessState === "grant"
    ? "Complimentary Premium"
    : accessState === "trial"
      ? "Live trial"
      : accessState === "paid"
        ? "Paid access"
        : accessState === "paused"
          ? "Paused"
          : accessState === "suspended"
            ? "Suspended"
            : accessState === "ended"
              ? "Access ended"
              : "Access unknown";
  const accessDetail = currentGrant
    ? `Through ${formatEntitlementDate(currentGrant.ends_at)}`
    : accessState === "trial"
      ? formatTrialRemaining(trial.remainingMs)
      : subscriptionStatus
        ? humanizeSubscriptionStatus(subscriptionStatus)
        : "No subscription state";
  const includedBranchCount = Math.max(1, integerOrDefault(input.includedBranchCount, DEFAULT_INCLUDED_BRANCH_COUNT));
  const entitledCount = Math.max(
    includedBranchCount,
    integerOrDefault(organization.subscription_entitled_branch_count, includedBranchCount),
  );
  const activeBranchCount = Math.max(0, Math.floor(Number(input.activeBranchCount) || 0));
  const pendingCount = integerOrNull(organization.subscription_pending_branch_count);
  const daysUsed = sumTrialExtensionDays(trialExtensions);
  const trialExtension = readTrialExtensionEligibility({
    status: organization.subscription_status,
    accountStatus: organization.account_status,
    providerSubscriptionId: organization.subscription_provider_subscription_id,
    providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
    daysUsed,
  });
  const filterKeys: PlatformEntitlementFilter[] = [];
  if (trial.isActive) {
    filterKeys.push("in_trial");
    if (trial.remainingMs !== null && trial.remainingMs <= 7 * 24 * 60 * 60 * 1000) filterKeys.push("trial_expiring");
  }
  if (effectiveGrant) {
    filterKeys.push("on_grant");
    if (Date.parse(effectiveGrant.until) - now <= 7 * 24 * 60 * 60 * 1000) filterKeys.push("grant_expiring");
  }
  if (subscriptionStatus === "paused") filterKeys.push("paused");
  if (accountStatus === "suspended") filterKeys.push("suspended");

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    accountStatus,
    subscriptionStatus,
    subscriptionPlan: organization.subscription_plan ?? null,
    accessState,
    accessLabel,
    accessDetail,
    trial,
    currentGrant: currentGrant
      ? {
        id: currentGrant.id,
        startsAt: currentGrant.starts_at,
        endsAt: currentGrant.ends_at,
        source: currentGrant.source,
        reason: currentGrant.reason,
      }
      : null,
    grantCount: grants.length,
    paidBranch: {
      activeCount: activeBranchCount,
      entitledCount,
      includedCount: includedBranchCount,
      paidAddOnCount: Math.max(entitledCount - includedBranchCount, 0),
      pendingCount,
      isPaidAccess: paidAccessCurrent,
    },
    trialExtension: {
      daysUsed: trialExtension.daysUsed,
      daysRemaining: trialExtension.daysRemaining,
      maxDays: trialExtension.maxDays,
      canExtend: trialExtension.canExtend,
      revives: trialExtension.revives,
      block: trialExtension.block,
    },
    filterKeys,
    timeline: buildPlatformEntitlementTimeline({
      organization,
      grants,
      trialExtensions,
      trial,
      now,
    }),
  };
}

export function buildPlatformEntitlementTimeline(input: {
  organization: PlatformEntitlementOrganization;
  grants?: ComplimentaryAccessGrant[];
  trialExtensions?: TrialExtensionRecord[];
  trial?: TrialLifecycle;
  now?: number;
}): PlatformEntitlementTimelineItem[] {
  const now = input.now ?? Date.now();
  const organization = input.organization;
  const grants = input.grants ?? [];
  const trialExtensions = input.trialExtensions ?? [];
  const trial = input.trial ?? readTrialLifecycle({
    status: organization.subscription_status,
    createdAt: organization.created_at,
    trialStartedAt: organization.subscription_trial_started_at,
    trialEndsAt: organization.subscription_trial_ends_at,
    currentPeriodEnd: organization.subscription_current_period_end,
    providerSubscriptionId: organization.subscription_provider_subscription_id,
    providerPaymentIntentId: organization.subscription_provider_payment_intent_id,
  }, now);
  const items: PlatformEntitlementTimelineItem[] = [];
  const subscriptionStatus = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;

  if (trial.known) {
    items.push({
      id: `trial-${organization.id}`,
      kind: "trial",
      label: "Trial window",
      detail: trial.endsAt
        ? `${trial.isActive ? "Live" : "Ended"} · ends ${formatEntitlementDate(trial.endsAt)}`
        : "Trial end is not scheduled",
      startsAt: trial.startedAt,
      endsAt: trial.endsAt,
      state: trial.isActive ? "current" : "expired",
    });
  }

  if ((subscriptionStatus === "active" || subscriptionStatus === "past_due") && organization.subscription_current_period_end) {
    const periodEnd = Date.parse(organization.subscription_current_period_end);
    items.push({
      id: `subscription-${organization.id}`,
      kind: "subscription",
      label: "Subscription period",
      detail: `${humanizeSubscriptionStatus(subscriptionStatus)} · renews ${formatEntitlementDate(organization.subscription_current_period_end)}`,
      startsAt: organization.subscription_updated_at ?? organization.created_at,
      endsAt: organization.subscription_current_period_end,
      state: Number.isFinite(periodEnd) && periodEnd > now ? "current" : "ended",
    });
  }

  for (const extension of trialExtensions) {
    items.push({
      id: `trial-extension-${extension.id}`,
      kind: "trial_extension",
      label: `Trial extension · +${extension.days} day${extension.days === 1 ? "" : "s"}`,
      detail: `${extension.revived ? "Reopened · " : ""}${extension.reason}`,
      startsAt: extension.created_at,
      endsAt: extension.new_trial_ends_at,
      state: isFutureDate(extension.new_trial_ends_at, now) ? "current" : "expired",
    });
  }

  for (const grant of grants) {
    const startsAt = Date.parse(grant.starts_at);
    const endsAt = Date.parse(grant.ends_at);
    const state: PlatformEntitlementTimelineState = grant.status === "revoked"
      ? "revoked"
      : Number.isFinite(startsAt) && startsAt > now
        ? "scheduled"
        : Number.isFinite(endsAt) && endsAt > now
          ? "current"
          : "expired";
    items.push({
      id: `grant-${grant.id}`,
      kind: "grant",
      label: `Complimentary grant · ${grant.source}`,
      detail: `${grant.reason} · through ${formatEntitlementDate(grant.ends_at)}`,
      startsAt: grant.starts_at,
      endsAt: grant.ends_at,
      state,
    });
  }

  if (organization.account_status === "suspended") {
    items.push({
      id: `suspension-${organization.id}`,
      kind: "suspension",
      label: "Account suspension",
      detail: organization.suspension_reason || "Account access is suspended",
      startsAt: organization.suspended_at ?? null,
      endsAt: null,
      state: "active",
    });
  }

  return items.sort((left, right) => {
    const leftTime = left.startsAt ? Date.parse(left.startsAt) : 0;
    const rightTime = right.startsAt ? Date.parse(right.startsAt) : 0;
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

export function filterPlatformEntitlementSummaries(
  summaries: PlatformEntitlementSummary[],
  search: string,
  filter: PlatformEntitlementFilter,
) {
  const normalizedSearch = search.trim().toLowerCase();
  return summaries.filter((summary) => {
    if (filter !== "all" && !summary.filterKeys.includes(filter)) return false;
    if (!normalizedSearch) return true;
    return [summary.organizationName, summary.organizationId, summary.accessLabel, summary.accessState, summary.subscriptionStatus ?? ""]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

export function platformEntitlementFilterLabel(filter: PlatformEntitlementFilter) {
  switch (filter) {
    case "in_trial": return "In trial";
    case "trial_expiring": return "Trial expiring within 7 days";
    case "on_grant": return "On a grant";
    case "grant_expiring": return "Grant expiring within 7 days";
    case "paused": return "Paused";
    case "suspended": return "Suspended";
    default: return "All entitlement states";
  }
}

function humanizeSubscriptionStatus(value: string) {
  return value === "past_due" ? "Payment due" : value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatEntitlementDate(value: string | null) {
  if (!value) return "not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "not scheduled"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function isFutureDate(value: string | null | undefined, now: number) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

function integerOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function integerOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}
