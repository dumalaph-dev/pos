export const PLATFORM_ATTENTION_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type PlatformAttentionSeverity = (typeof PLATFORM_ATTENTION_SEVERITIES)[number];

export const PLATFORM_ATTENTION_CATEGORIES = ["billing", "support", "sync", "access", "readiness"] as const;
export type PlatformAttentionCategory = (typeof PLATFORM_ATTENTION_CATEGORIES)[number];

export type PlatformAttentionItem = {
  id: string;
  category: PlatformAttentionCategory;
  severity: PlatformAttentionSeverity;
  title: string;
  detail: string;
  organizationName?: string;
  organizationId?: string;
  branchName?: string;
  href: string;
  actionLabel: string;
  createdAt?: string;
};

export function platformAttentionSeverityLabel(value: PlatformAttentionSeverity) {
  return value === "critical" ? "Critical" : value === "high" ? "High" : value === "medium" ? "Medium" : "Low";
}

export function platformAttentionCategoryLabel(value: PlatformAttentionCategory) {
  return value === "billing" ? "Billing" : value === "support" ? "Support" : value === "sync" ? "Sync" : value === "access" ? "Access" : "Readiness";
}

export function platformAttentionSeverityRank(value: PlatformAttentionSeverity) {
  return value === "critical" ? 0 : value === "high" ? 1 : value === "medium" ? 2 : 3;
}

export function sortPlatformAttentionItems(items: PlatformAttentionItem[]) {
  return [...items].sort((left, right) => {
    const severity = platformAttentionSeverityRank(left.severity) - platformAttentionSeverityRank(right.severity);
    if (severity !== 0) return severity;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}
