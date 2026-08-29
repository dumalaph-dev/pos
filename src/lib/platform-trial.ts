/**
 * Platform-owned trial extension.
 *
 * Extending a trial moves `subscription_trial_ends_at` itself rather than
 * layering a separate grant on top, because the owner's trial banner and
 * countdown read that column. A grant-shaped extension would leave the tenant
 * reading "Trial ended" while the product kept working.
 *
 * The bounds here mirror migration `0075_extend_organization_trial.sql`. The
 * database is the authority; these copies exist so the console can explain a
 * refusal before spending a round trip.
 */

export const TRIAL_EXTENSION_MAX_DAYS_PER_ACTION = 90;
export const TRIAL_EXTENSION_MAX_DAYS_LIFETIME = 180;
export const TRIAL_EXTENSION_DEFAULT_DAYS = 14;

export type TrialExtensionRecord = {
  id: string;
  org_id: string;
  days: number;
  reason: string;
  previous_status: string | null;
  new_status: string | null;
  previous_trial_ends_at: string | null;
  new_trial_ends_at: string;
  revived: boolean;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

/**
 * Why the console cannot extend this organization's trial right now. `none`
 * means the action is available.
 */
export type TrialExtensionBlock =
  | "none"
  | "account_suspended"
  | "billing_pause"
  | "billing_subscription"
  | "cap_reached"
  | "subscription_unknown";

export type TrialExtensionEligibilityInput = {
  status: string | null | undefined;
  accountStatus?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentIntentId?: string | null;
  daysUsed?: number;
};

export type TrialExtensionEligibility = {
  block: TrialExtensionBlock;
  canExtend: boolean;
  /** True when the action would also return a lapsed trial to `trialing`. */
  revives: boolean;
  daysUsed: number;
  daysRemaining: number;
  maxDays: number;
};

export function readTrialExtensionEligibility(input: TrialExtensionEligibilityInput): TrialExtensionEligibility {
  const daysUsed = Number.isFinite(input.daysUsed) ? Math.max(0, Number(input.daysUsed)) : 0;
  const daysRemaining = Math.max(0, TRIAL_EXTENSION_MAX_DAYS_LIFETIME - daysUsed);
  const base = { daysUsed, daysRemaining, maxDays: Math.min(TRIAL_EXTENSION_MAX_DAYS_PER_ACTION, daysRemaining) };

  if ((input.accountStatus ?? "active") !== "active") {
    return { ...base, block: "account_suspended", canExtend: false, revives: false };
  }

  if (input.status === null || input.status === undefined) {
    return { ...base, block: "subscription_unknown", canExtend: false, revives: false };
  }

  // A trial expiry never leaves provider records behind, because there was
  // never a subscription. A `paused` row that has them stopped paying, and
  // must not be revived into a free trial. This mirrors the discriminator in
  // the billing subscribe route.
  const pausedByTrialExpiry = input.status === "paused"
    && !input.providerSubscriptionId
    && !input.providerPaymentIntentId;

  if (input.status !== "trialing" && !pausedByTrialExpiry) {
    return {
      ...base,
      block: input.status === "paused" ? "billing_pause" : "billing_subscription",
      canExtend: false,
      revives: false,
    };
  }

  if (daysRemaining < 1) {
    return { ...base, block: "cap_reached", canExtend: false, revives: pausedByTrialExpiry };
  }

  return { ...base, block: "none", canExtend: true, revives: pausedByTrialExpiry };
}

export function trialExtensionBlockMessage(block: TrialExtensionBlock): string {
  switch (block) {
    case "account_suspended":
      return "Restore the suspended account before extending its trial.";
    case "billing_pause":
      return "This account is paused for a billing failure, not an expired trial. Resolve the payment instead of extending a trial.";
    case "billing_subscription":
      return "This account is on a paid subscription. Use a complimentary Premium grant instead of a trial extension.";
    case "cap_reached":
      return `This organization has reached the ${TRIAL_EXTENSION_MAX_DAYS_LIFETIME}-day limit on operator-added trial days. Use a complimentary Premium grant instead.`;
    case "subscription_unknown":
      return "This organization has no subscription state to extend.";
    default:
      return "";
  }
}

export function sumTrialExtensionDays(records: TrialExtensionRecord[]) {
  return records.reduce((total, record) => total + (Number.isFinite(record.days) ? record.days : 0), 0);
}

export function normalizeTrialExtension(value: Partial<TrialExtensionRecord> & Record<string, unknown>): TrialExtensionRecord {
  const days = Number(value.days);
  return {
    id: typeof value.id === "string" ? value.id : "",
    org_id: typeof value.org_id === "string" ? value.org_id : "",
    days: Number.isFinite(days) ? days : 0,
    reason: typeof value.reason === "string" ? value.reason : "",
    previous_status: typeof value.previous_status === "string" ? value.previous_status : null,
    new_status: typeof value.new_status === "string" ? value.new_status : null,
    previous_trial_ends_at: typeof value.previous_trial_ends_at === "string" ? value.previous_trial_ends_at : null,
    new_trial_ends_at: typeof value.new_trial_ends_at === "string" ? value.new_trial_ends_at : new Date(0).toISOString(),
    revived: value.revived === true,
    created_by: typeof value.created_by === "string" ? value.created_by : null,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date(0).toISOString(),
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
}

/**
 * The end date a given extension would produce, used to preview the result
 * before the operator submits. Mirrors the arithmetic in `0075`: a live trial
 * is appended to, a lapsed one restarts from today.
 */
export function previewExtendedTrialEnd(currentEndsAt: string | null | undefined, days: number, now = Date.now()) {
  if (!Number.isInteger(days) || days < 1) return null;
  const currentMs = currentEndsAt ? Date.parse(currentEndsAt) : NaN;
  const base = Number.isFinite(currentMs) ? Math.max(now, currentMs) : now;
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
