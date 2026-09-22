export const PLATFORM_FOLLOW_UP_STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
export type PlatformFollowUpStatus = (typeof PLATFORM_FOLLOW_UP_STATUSES)[number];

export const PLATFORM_FOLLOW_UP_SOURCES = ["manual", "attention", "support_case", "trial_feedback", "renewal"] as const;
export type PlatformFollowUpSource = (typeof PLATFORM_FOLLOW_UP_SOURCES)[number];

export type PlatformFollowUpTask = {
  id: string;
  orgId: string;
  title: string;
  reason: string;
  sourceType: PlatformFollowUpSource;
  sourceId: string | null;
  status: PlatformFollowUpStatus;
  assigneeId: string | null;
  dueAt: string | null;
  outcome: string | null;
  nextStep: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export function platformFollowUpStatusLabel(status: PlatformFollowUpStatus) {
  return status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : "Open";
}

export function platformFollowUpSourceLabel(source: PlatformFollowUpSource) {
  return source === "attention" ? "Attention" : source === "support_case" ? "Support case" : source === "trial_feedback" ? "Trial feedback" : source === "renewal" ? "Renewal" : "Manual";
}

export function platformFollowUpIsOpen(status: PlatformFollowUpStatus) {
  return status === "open" || status === "in_progress";
}

export function platformFollowUpStatusTone(status: PlatformFollowUpStatus) {
  return status === "completed" ? "success" : status === "cancelled" ? "muted" : status === "in_progress" ? "primary" : "warning";
}
