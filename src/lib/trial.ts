import { isComplimentaryAccessCurrent } from "./platform-access.ts";

export const DEFAULT_TRIAL_DAYS = 14;
export const TRIAL_DAY_MS = 24 * 60 * 60 * 1000;
/**
 * An expired trial has no provider subscription to cancel. `paused` is the
 * existing non-active state that lets the owner reach Billing and start a new
 * checkout while the tenant RLS context stays unavailable.
 */
export const TRIAL_EXPIRED_SUBSCRIPTION_STATUS = "paused" as const;

export type TrialReminderKind = "five_days" | "three_days" | "last_day";

export const TRIAL_FEEDBACK_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  offer_sent: "Offer sent",
  closed: "Closed",
} as const;

export type TrialFeedbackStatus = keyof typeof TRIAL_FEEDBACK_STATUS_LABELS;

export type TrialLifecycle = {
  known: boolean;
  startedAt: string | null;
  endsAt: string | null;
  remainingMs: number | null;
  remainingDays: number | null;
  isActive: boolean;
  isExpired: boolean;
  isLastDay: boolean;
  reminder: TrialReminderKind | null;
};

export type TrialLifecycleInput = {
  status: string | null | undefined;
  createdAt?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  trialDays?: number;
  billingMode?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentIntentId?: string | null;
  complimentaryAccessUntil?: string | null;
};

export function readTrialLifecycle(input: TrialLifecycleInput, now = Date.now()): TrialLifecycle {
  const startedAt = validDateString(input.trialStartedAt) ?? validDateString(input.createdAt);
  const explicitTrialEndsAt = validDateString(input.trialEndsAt);
  const explicitEndsAt = validDateString(input.trialEndsAt) ?? validDateString(input.currentPeriodEnd);
  const canReadHistoricalExpiredTrial = input.status === TRIAL_EXPIRED_SUBSCRIPTION_STATUS
    && explicitTrialEndsAt !== null
    && !input.providerSubscriptionId
    && !input.providerPaymentIntentId
    && Date.parse(explicitTrialEndsAt) <= now;
  if (input.status !== "trialing" && !canReadHistoricalExpiredTrial) return emptyTrialLifecycle();

  const trialDays = normalizeTrialDays(input.trialDays);
  const endsAt = explicitEndsAt ?? (startedAt ? new Date(Date.parse(startedAt) + trialDays * TRIAL_DAY_MS).toISOString() : null);
  const endsAtMs = endsAt ? Date.parse(endsAt) : NaN;

  if (!endsAt || !Number.isFinite(endsAtMs)) {
    return {
      known: false,
      startedAt,
      endsAt: null,
      remainingMs: null,
      remainingDays: null,
      isActive: false,
      isExpired: false,
      isLastDay: false,
      reminder: null,
    };
  }

  const remainingMs = endsAtMs - now;
  const isActive = remainingMs > 0;
  const isExpired = !isActive;
  const remainingDays = isActive ? Math.max(1, Math.ceil(remainingMs / TRIAL_DAY_MS)) : 0;
  const isLastDay = isActive && remainingMs <= TRIAL_DAY_MS;
  const reminder = !isActive
    ? null
    : isLastDay
      ? "last_day"
      : remainingDays <= 3
        ? "three_days"
        : remainingDays <= 5
          ? "five_days"
          : null;

  return {
    known: true,
    startedAt,
    endsAt,
    remainingMs,
    remainingDays,
    isActive,
    isExpired,
    isLastDay,
    reminder,
  };
}

export type SubscriptionAccessInput = {
  status: string | null | undefined;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  trialDays?: number;
  billingMode?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentIntentId?: string | null;
  complimentaryAccessUntil?: string | null;
};

export type BillingAccessReason = "trial_expired" | "access_ended";

/**
 * Selects the message to show when a protected route sends an owner to Billing.
 * A paused subscription with a known historical trial end is the persisted
 * representation of an expired trial; every other known non-current state is
 * a general access-ending event.
 */
export function getBillingAccessReason(input: SubscriptionAccessInput, now = Date.now()): BillingAccessReason {
  const trial = readTrialLifecycle(input, now);
  return input.status === TRIAL_EXPIRED_SUBSCRIPTION_STATUS && trial.isExpired
    ? "trial_expired"
    : "access_ended";
}

/**
 * Returns whether tenant-scoped POS/backoffice access is current.
 *
 * `null` means the subscription schema is unavailable, so rolling deployments
 * retain the historical behavior until the lifecycle columns are present.
 * Known non-active states fail closed. Trial expiry is strict: an end timestamp
 * equal to `now` is already expired.
 */
export function isSubscriptionAccessCurrent(input: SubscriptionAccessInput, now = Date.now()): boolean | null {
  if (input.status === null || input.status === undefined) return null;

  if (isComplimentaryAccessCurrent(input.complimentaryAccessUntil, now)) return true;

  switch (input.status) {
    case "trialing":
      return readTrialLifecycle(input, now).isActive;
    case "active":
    case "past_due":
      if (input.billingMode === "temporary_qrph") {
        const periodEnd = validDateString(input.currentPeriodEnd);
        return periodEnd !== null && Date.parse(periodEnd) > now;
      }
      return true;
    case "paused":
    case "canceled":
    case "incomplete":
      return false;
    default:
      return false;
  }
}

export function normalizeTrialDays(value: unknown) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : DEFAULT_TRIAL_DAYS;
}

export function normalizeTrialFeedbackStatus(value: unknown): TrialFeedbackStatus {
  return value === "contacted" || value === "offer_sent" || value === "closed" ? value : "new";
}

export function formatTrialRemaining(remainingMs: number | null) {
  if (remainingMs === null) return "Trial period not scheduled";
  if (remainingMs <= 0) return "Trial ended";

  if (remainingMs < TRIAL_DAY_MS) {
    const totalMinutes = Math.max(1, Math.floor(remainingMs / (60 * 1000)));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  return `${Math.ceil(remainingMs / TRIAL_DAY_MS)} days left`;
}

function emptyTrialLifecycle(): TrialLifecycle {
  return {
    known: false,
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    remainingDays: null,
    isActive: false,
    isExpired: false,
    isLastDay: false,
    reminder: null,
  };
}

function validDateString(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
