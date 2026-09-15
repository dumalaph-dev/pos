export const PLATFORM_ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export type PlatformAnnouncementStatus = (typeof PLATFORM_ANNOUNCEMENT_STATUSES)[number];

export const PLATFORM_ANNOUNCEMENT_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type PlatformAnnouncementSeverity = (typeof PLATFORM_ANNOUNCEMENT_SEVERITIES)[number];

export const PLATFORM_ANNOUNCEMENT_AUDIENCES = ["all", "plan", "account_status"] as const;
export type PlatformAnnouncementAudience = (typeof PLATFORM_ANNOUNCEMENT_AUDIENCES)[number];

export type PlatformAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: PlatformAnnouncementSeverity;
  status: PlatformAnnouncementStatus;
  audience: PlatformAnnouncementAudience;
  audienceValue: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function platformAnnouncementStatusLabel(value: PlatformAnnouncementStatus) {
  return value === "scheduled" ? "Scheduled" : value === "published" ? "Published" : value === "archived" ? "Archived" : "Draft";
}

export function platformAnnouncementSeverityLabel(value: PlatformAnnouncementSeverity) {
  return value === "critical" ? "Critical" : value === "warning" ? "Warning" : value === "success" ? "Success" : "Info";
}

export function platformAnnouncementAudienceLabel(value: PlatformAnnouncementAudience, audienceValue: string | null) {
  return value === "plan" ? `Plan · ${audienceValue || "Any"}` : value === "account_status" ? `Account · ${audienceValue || "Any"}` : "All merchants";
}
