export const PLATFORM_MY_WORK_SOURCES = ["follow_up", "support_case", "attention"] as const;
export type PlatformMyWorkSource = (typeof PLATFORM_MY_WORK_SOURCES)[number];

export const PLATFORM_MY_WORK_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type PlatformMyWorkSeverity = (typeof PLATFORM_MY_WORK_SEVERITIES)[number];

export type PlatformMyWorkItem = {
  id: string;
  source: PlatformMyWorkSource;
  title: string;
  detail: string;
  organizationId: string | null;
  organizationName: string | null;
  status: string;
  severity: PlatformMyWorkSeverity;
  dueAt: string | null;
  updatedAt: string;
  href: string;
};

export type PlatformMyWorkSourceAvailability = Record<PlatformMyWorkSource, boolean>;

export type PlatformMyWorkRead = {
  items: PlatformMyWorkItem[];
  operatorId: string | null;
  sourceAvailability: PlatformMyWorkSourceAvailability;
  hasMore: boolean;
  asOf: string;
};

export function platformMyWorkSourceLabel(source: PlatformMyWorkSource) {
  return source === "follow_up" ? "Follow-up" : source === "support_case" ? "Support case" : "Attention";
}

export function platformMyWorkSeverityLabel(severity: PlatformMyWorkSeverity) {
  return severity === "critical" ? "Critical" : severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
}

export function platformMyWorkSeverityRank(severity: PlatformMyWorkSeverity) {
  return severity === "critical" ? 0 : severity === "high" ? 1 : severity === "medium" ? 2 : 3;
}

export function sortPlatformMyWorkItems(items: PlatformMyWorkItem[]) {
  return [...items].sort((left, right) => {
    const severity = platformMyWorkSeverityRank(left.severity) - platformMyWorkSeverityRank(right.severity);
    if (severity !== 0) return severity;
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
    const due = (Number.isNaN(leftDue) ? Number.POSITIVE_INFINITY : leftDue) - (Number.isNaN(rightDue) ? Number.POSITIVE_INFINITY : rightDue);
    if (due !== 0) return due;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
