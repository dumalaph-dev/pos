"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { readPlatformAttentionSignals } from "@/lib/platform-attention-server";

export type AttentionActionState = {
  ok: boolean;
  message: string;
};

const INITIAL_ACTION_ERROR = "The attention action could not be completed. Refresh the queue and try again.";

export async function refreshPlatformAttention(_previousState: AttentionActionState, _formData: FormData): Promise<AttentionActionState> {
  void _previousState;
  void _formData;
  const actor = await requirePlatformOperator("attention_manage");
  if (!actor.ok) return actor;

  const canViewSupport = actor.role !== "billing";
  const signals = await readPlatformAttentionSignals(actor.admin, canViewSupport);
  const result = await actor.admin.rpc("platform_reconcile_attention", {
    p_signals: signals.items.map((item) => ({
      logical_key: item.id,
      source: item.category,
      category: item.category,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      organization_id: item.organizationId ?? null,
      branch_id: item.branchId ?? null,
      href: item.href,
      action_label: item.actionLabel,
      source_created_at: item.createdAt ?? null,
    })),
    p_resolve_sources: signals.resolveSources,
    p_observed_at: signals.asOf,
  });
  if (result.error) return attentionSchemaOrDatabaseError(result.error.message);
  revalidateAttentionPages();
  const summary = isRecord(result.data) ? result.data : null;
  const opened = readNumber(summary, "opened");
  const resolved = readNumber(summary, "resolved");
  return { ok: true, message: `Attention refreshed${opened === null ? "" : ` · ${opened} opened`}${resolved === null ? "" : ` · ${resolved} resolved`}.` };
}

export async function updatePlatformAttention(_previousState: AttentionActionState, formData: FormData): Promise<AttentionActionState> {
  const actor = await requirePlatformOperator("attention_manage");
  if (!actor.ok) return actor;

  const occurrenceId = readText(formData, "occurrence_id");
  const version = Number.parseInt(readText(formData, "version"), 10);
  const action = readText(formData, "action");
  const assigneeId = readText(formData, "assignee_id");
  const snoozeUntil = readText(formData, "snooze_until");
  const reason = readText(formData, "reason");
  if (!isUuid(occurrenceId)) return { ok: false, message: "Choose a valid attention occurrence." };
  if (!Number.isInteger(version) || version < 1) return { ok: false, message: "Refresh this occurrence before changing it." };
  if (!["acknowledge", "assign", "unassign", "snooze", "unsnooze"].includes(action)) return { ok: false, message: "Choose a valid attention action." };
  if (action === "assign" && !isUuid(assigneeId)) return { ok: false, message: "Choose an active operator." };
  if (action === "snooze" && !snoozeUntil) return { ok: false, message: "Choose when the occurrence should resurface." };
  const parsedSnoozeUntil = snoozeUntil ? new Date(snoozeUntil) : null;
  if (action === "snooze" && (!parsedSnoozeUntil || Number.isNaN(parsedSnoozeUntil.getTime()))) return { ok: false, message: "Choose a valid snooze deadline." };

  const result = await actor.admin.rpc("platform_update_attention_occurrence", {
    p_occurrence_id: occurrenceId,
    p_expected_version: version,
    p_action: action,
    p_assignee_id: action === "assign" ? assigneeId : null,
    p_snooze_until: action === "snooze" ? parsedSnoozeUntil?.toISOString() : null,
    p_reason: reason,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return attentionSchemaOrDatabaseError(result.error.message);
  revalidateAttentionPages();
  return { ok: true, message: action === "acknowledge" ? "Attention marked acknowledged." : action === "assign" ? "Attention assigned." : action === "unassign" ? "Attention unassigned." : action === "snooze" ? "Attention snoozed." : "Attention returned to the active queue." };
}

function revalidateAttentionPages() {
  revalidatePath("/platform");
  revalidatePath("/platform/attention");
}

function attentionSchemaOrDatabaseError(message: string): AttentionActionState {
  const normalized = message.toLowerCase();
  if (normalized.includes("version_conflict")) return { ok: false, message: "Another operator changed this occurrence. Refresh the queue before trying again." };
  if (normalized.includes("resolved")) return { ok: false, message: "Resolved occurrences are read-only; a new recurrence will open a new occurrence." };
  if (normalized.includes("snooze")) return { ok: false, message: "The snooze deadline or reason is invalid. Snooze for up to seven days and include a reason." };
  if (normalized.includes("assignee")) return { ok: false, message: "That operator is no longer active. Refresh the queue and choose another owner." };
  if (normalized.includes("platform_attention") || normalized.includes("schema cache") || normalized.includes("relation")) return { ok: false, message: "Apply Supabase migration 0089_platform_attention_occurrences.sql before changing attention state." };
  return { ok: false, message: INITIAL_ACTION_ERROR };
}

function readRequestId(formData: FormData) {
  const value = readText(formData, "request_id");
  return isUuid(value) ? value : randomUUID();
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: Record<string, unknown> | null, key: string) {
  const result = value?.[key];
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}
