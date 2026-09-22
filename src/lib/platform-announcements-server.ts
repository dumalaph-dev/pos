import { createAdminClient } from "@/lib/employee-auth";
import { PLATFORM_ANNOUNCEMENT_AUDIENCES, PLATFORM_ANNOUNCEMENT_SEVERITIES, PLATFORM_ANNOUNCEMENT_STATUSES, type PlatformAnnouncement, type TenantPlatformAnnouncement } from "@/lib/platform-announcements";
import { createClient } from "@/lib/supabase/server";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type TenantSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type TenantPlatformAnnouncementsRead = {
  announcements: TenantPlatformAnnouncement[];
  schemaAvailable: boolean;
};

export async function readPlatformAnnouncements(admin: PlatformAdminClient): Promise<{ announcements: PlatformAnnouncement[]; schemaAvailable: boolean }> {
  const result = await admin
    .from("platform_announcements")
    .select("id, title, body, severity, status, audience, audience_value, action_label, action_url, starts_at, expires_at, published_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) return { announcements: [], schemaAvailable: false };
  const announcements = (result.data ?? []).flatMap((row): PlatformAnnouncement[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return [];
    const severity = normalizeEnum(row.severity, PLATFORM_ANNOUNCEMENT_SEVERITIES, "info");
    const status = normalizeEnum(row.status, PLATFORM_ANNOUNCEMENT_STATUSES, "draft");
    const audience = normalizeEnum(row.audience, PLATFORM_ANNOUNCEMENT_AUDIENCES, "all");
    return [{
      id: row.id,
      title: row.title,
      body: row.body,
      severity,
      status,
      audience,
      audienceValue: readNullableText(row.audience_value),
      actionLabel: readNullableText(row.action_label),
      actionUrl: readNullableText(row.action_url),
      startsAt: readNullableText(row.starts_at),
      expiresAt: readNullableText(row.expires_at),
      publishedAt: readNullableText(row.published_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });
  return { announcements, schemaAvailable: true };
}

/**
 * Read the current owner's delivery set through the authenticated RPC. The
 * RPC derives auth.uid(), organization, plan, and account status in Postgres;
 * this function deliberately accepts no audience or organization filters.
 */
export async function readTenantPlatformAnnouncements(supabase: TenantSupabaseClient): Promise<TenantPlatformAnnouncementsRead> {
  const result = await supabase.rpc("platform_announcements_for_current_tenant");
  if (result.error) return { announcements: [], schemaAvailable: false };

  const announcements = (result.data ?? []).flatMap((row: unknown): TenantPlatformAnnouncement[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.body !== "string") return [];
    return [{
      id: row.id,
      title: row.title,
      body: row.body,
      severity: normalizeEnum(row.severity, PLATFORM_ANNOUNCEMENT_SEVERITIES, "info"),
      actionLabel: readNullableText(row.action_label),
      actionUrl: readNullableText(row.action_url),
      publishedAt: readNullableText(row.published_at),
      expiresAt: readNullableText(row.expires_at),
    }];
  });

  return { announcements, schemaAvailable: true };
}

function normalizeEnum<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}

function readNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
