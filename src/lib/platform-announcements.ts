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

export type TenantPlatformAnnouncement = Pick<
  PlatformAnnouncement,
  "id" | "title" | "body" | "severity" | "actionLabel" | "actionUrl" | "publishedAt" | "expiresAt"
>;

export type PlatformAnnouncementTenantContext = {
  plan: string | null | undefined;
  accountStatus: string | null | undefined;
};

/**
 * Mirrors the database delivery predicate for deterministic tests and server
 * previews. The authenticated delivery RPC remains the authorization
 * boundary; callers must not use client-supplied context to authorize rows.
 */
export function platformAnnouncementAudienceMatches(
  audience: PlatformAnnouncementAudience,
  audienceValue: string | null | undefined,
  tenant: PlatformAnnouncementTenantContext,
) {
  if (audience === "all") return true;

  const target = audience === "plan" ? tenant.plan : audience === "account_status" ? tenant.accountStatus : null;
  const normalizedAudience = normalizeAudienceValue(audienceValue);
  return normalizedAudience !== null && normalizedAudience === normalizeAudienceValue(target);
}

/**
 * The strict end boundary matches the subscription/access lifecycle rules:
 * an announcement expires at the exact instant in `expiresAt`.
 */
export function platformAnnouncementIsLive(
  announcement: Pick<PlatformAnnouncement, "status" | "startsAt" | "expiresAt">,
  now = Date.now(),
) {
  if (announcement.status !== "published") return false;

  const startsAt = announcement.startsAt ? Date.parse(announcement.startsAt) : null;
  const expiresAt = announcement.expiresAt ? Date.parse(announcement.expiresAt) : null;
  return (startsAt === null || (Number.isFinite(startsAt) && startsAt <= now))
    && (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > now));
}

export function platformAnnouncementStatusLabel(value: PlatformAnnouncementStatus) {
  return value === "scheduled" ? "Scheduled" : value === "published" ? "Published" : value === "archived" ? "Archived" : "Draft";
}

export function platformAnnouncementSeverityLabel(value: PlatformAnnouncementSeverity) {
  return value === "critical" ? "Critical" : value === "warning" ? "Warning" : value === "success" ? "Success" : "Info";
}

export function platformAnnouncementAudienceLabel(value: PlatformAnnouncementAudience, audienceValue: string | null) {
  return value === "plan" ? `Plan · ${audienceValue || "Any"}` : value === "account_status" ? `Account · ${audienceValue || "Any"}` : "All merchants";
}

function normalizeAudienceValue(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized || null;
}
