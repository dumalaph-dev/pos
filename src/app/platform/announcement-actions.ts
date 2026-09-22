"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/employee-auth";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PLATFORM_ANNOUNCEMENT_AUDIENCES, PLATFORM_ANNOUNCEMENT_SEVERITIES } from "@/lib/platform-announcements";

type PlatformAnnouncementAdmin = NonNullable<ReturnType<typeof createAdminClient>>;

export type AnnouncementActionState = { ok: boolean; message: string };

export async function savePlatformAnnouncement(_previousState: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const actor = await requirePlatformOperator("policy_manage");
  if (!actor.ok) return actor;

  const schema = await ensureAnnouncementSchema(actor.admin);
  if (!schema.ok) return schema;

  const id = readText(formData, "id");
  if (id && !isUuid(id)) return { ok: false, message: "The announcement identifier is invalid. Refresh the page and try again." };
  const title = readText(formData, "title");
  const body = readText(formData, "body");
  const severity = readEnum(formData, "severity", PLATFORM_ANNOUNCEMENT_SEVERITIES);
  const audience = readEnum(formData, "audience", PLATFORM_ANNOUNCEMENT_AUDIENCES);
  const audienceValue = readText(formData, "audience_value") || null;
  const actionLabel = readText(formData, "action_label") || null;
  const actionUrl = readText(formData, "action_url") || null;
  const startsAt = readDateTime(readText(formData, "starts_at"));
  const expiresAt = readDateTime(readText(formData, "expires_at"));
  const intent = readText(formData, "intent");

  if (title.length < 3 || title.length > 140) return { ok: false, message: "Use a title between 3 and 140 characters." };
  if (body.length < 1 || body.length > 5000) return { ok: false, message: "Add a message of up to 5,000 characters." };
  if (!severity) return { ok: false, message: "Choose a valid announcement severity." };
  if (!audience) return { ok: false, message: "Choose a valid announcement audience." };
  if (audience !== "all" && !audienceValue) return { ok: false, message: "Choose a value for the selected audience." };
  if (audience === "account_status" && audienceValue !== "active" && audienceValue !== "suspended") return { ok: false, message: "Choose an active or suspended account audience." };
  if (actionLabel && (actionLabel.length < 1 || actionLabel.length > 60)) return { ok: false, message: "Action labels must be 1–60 characters." };
  if (actionUrl && !isSafeAnnouncementUrl(actionUrl)) return { ok: false, message: "Use an internal path or an HTTPS action URL." };
  if (readText(formData, "starts_at") && !startsAt) return { ok: false, message: "Enter a valid start date and time." };
  if (readText(formData, "expires_at") && !expiresAt) return { ok: false, message: "Enter a valid expiry date and time." };
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) return { ok: false, message: "Expiry must be after the start time." };
  if (intent !== "draft" && intent !== "publish") return { ok: false, message: "Choose whether to save a draft or publish the announcement." };

  const existing = id ? await actor.admin.from("platform_announcements").select("id, status, published_at").eq("id", id).maybeSingle() : { data: null, error: null };
  if (existing.error) return announcementMutationError(existing.error.message);
  if (id && !existing.data) return { ok: false, message: "That announcement no longer exists. Refresh the page and try again." };

  const now = new Date();
  // A future start is an authorized publication with a delivery window, not a
  // promise that a background worker will promote a row later. The tenant RPC
  // independently enforces starts_at/expires_at, so a published future notice
  // stays hidden until its window opens.
  const status = intent === "draft" ? "draft" : "published";
  const announcementId = id || crypto.randomUUID();
  const row = {
    id: announcementId,
    title,
    body,
    severity,
    status,
    audience,
    audience_value: audience === "all" ? null : audienceValue,
    action_label: actionLabel,
    action_url: actionUrl,
    starts_at: startsAt,
    expires_at: expiresAt,
    published_at: status === "published" ? existing.data?.published_at ?? now.toISOString() : null,
    created_by: id ? undefined : actor.userId,
    updated_by: actor.userId,
    updated_at: now.toISOString(),
  };
  const result = await actor.admin.from("platform_announcements").upsert(row, { onConflict: "id" });
  if (result.error) return announcementMutationError(result.error.message);

  const audit = await writeAnnouncementAudit(actor.admin, {
    announcementId,
    action: id ? status === "published" && existing.data?.status !== "published" ? "platform.announcement.published" : "platform.announcement.updated" : status === "published" ? "platform.announcement.published" : "platform.announcement.created",
    actorId: actor.userId,
    actorEmail: actor.email,
    before: existing.data,
    after: row,
  });
  if (!audit.ok) return audit;

  revalidateAnnouncementPages();
  const futureStart = startsAt && Date.parse(startsAt) > now.getTime();
  return { ok: true, message: status === "published"
    ? futureStart ? "Announcement published and will appear at its start time." : "Announcement published."
    : "Announcement saved as a draft." };
}

export async function setPlatformAnnouncementStatus(_previousState: AnnouncementActionState, formData: FormData): Promise<AnnouncementActionState> {
  const actor = await requirePlatformOperator("policy_manage");
  if (!actor.ok) return actor;
  const schema = await ensureAnnouncementSchema(actor.admin);
  if (!schema.ok) return schema;
  const id = readText(formData, "id");
  const status = readText(formData, "status");
  if (!isUuid(id)) return { ok: false, message: "Choose a valid announcement." };
  if (status !== "published" && status !== "archived") return { ok: false, message: "Choose a valid announcement status." };

  const existing = await actor.admin.from("platform_announcements").select("*").eq("id", id).maybeSingle();
  if (existing.error) return announcementMutationError(existing.error.message);
  if (!existing.data) return { ok: false, message: "That announcement no longer exists. Refresh the page and try again." };
  const now = new Date().toISOString();
  const update = await actor.admin.from("platform_announcements").update({ status, published_at: status === "published" ? existing.data.published_at ?? now : existing.data.published_at, updated_by: actor.userId, updated_at: now }).eq("id", id);
  if (update.error) return announcementMutationError(update.error.message);
  const audit = await writeAnnouncementAudit(actor.admin, { announcementId: id, action: status === "published" ? "platform.announcement.published" : "platform.announcement.archived", actorId: actor.userId, actorEmail: actor.email, before: existing.data, after: { ...existing.data, status, updated_at: now } });
  if (!audit.ok) return audit;
  revalidateAnnouncementPages();
  return { ok: true, message: status === "published" ? "Announcement published." : "Announcement archived." };
}

async function ensureAnnouncementSchema(admin: PlatformAnnouncementAdmin): Promise<AnnouncementActionState> {
  const [announcements, audit] = await Promise.all([
    admin.from("platform_announcements").select("id").limit(1),
    admin.from("platform_announcement_audit_logs").select("id").limit(1),
  ]);
  if (announcements.error || audit.error) return { ok: false, message: "Announcement storage is not active yet. Apply migration 0085_platform_announcements.sql before publishing." };
  return { ok: true, message: "" };
}

async function writeAnnouncementAudit(admin: PlatformAnnouncementAdmin, input: { announcementId: string; action: string; actorId: string; actorEmail: string | null; before: unknown; after: unknown }): Promise<AnnouncementActionState> {
  const result = await admin.from("platform_announcement_audit_logs").insert({ announcement_id: input.announcementId, action: input.action, actor_id: input.actorId, actor_email: input.actorEmail, before: input.before, after: input.after });
  return result.error ? announcementMutationError(result.error.message) : { ok: true, message: "" };
}

function revalidateAnnouncementPages() {
  revalidatePath("/platform");
  revalidatePath("/platform/announcements");
}

function announcementMutationError(detail: string): AnnouncementActionState {
  const normalized = detail.toLowerCase();
  if (normalized.includes("platform_announcements") || normalized.includes("platform_announcement_audit_logs") || normalized.includes("schema cache") || normalized.includes("relation") || normalized.includes("does not exist")) return { ok: false, message: "Announcement storage is not active yet. Apply migration 0085_platform_announcements.sql before publishing." };
  return { ok: false, message: detail || "The announcement could not be saved." };
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readEnum<T extends readonly string[]>(formData: FormData, name: string, values: T): T[number] | null {
  const value = readText(formData, name);
  return values.includes(value) ? value as T[number] : null;
}

function readDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isSafeAnnouncementUrl(value: string) {
  return (value.startsWith("/") && !value.startsWith("//")) || /^https:\/\//i.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
