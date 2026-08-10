export const DEFAULT_TRIAL_DAYS = 14;
export const TRIAL_DAY_MS = 24 * 60 * 60 * 1000;

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
};

export function readTrialLifecycle(input: TrialLifecycleInput, now = Date.now()): TrialLifecycle {
  if (input.status !== "trialing") return emptyTrialLifecycle();

  const startedAt = validDateString(input.trialStartedAt) ?? validDateString(input.createdAt);
  const explicitEndsAt = validDateString(input.trialEndsAt) ?? validDateString(input.currentPeriodEnd);
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
