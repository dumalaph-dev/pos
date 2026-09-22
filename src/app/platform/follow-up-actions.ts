"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PLATFORM_FOLLOW_UP_SOURCES } from "@/lib/platform-follow-ups";

export type FollowUpActionState = { ok: boolean; message: string };

export async function createPlatformFollowUpTask(_previousState: FollowUpActionState, formData: FormData): Promise<FollowUpActionState> {
  const actor = await requirePlatformOperator("account_success_manage");
  if (!actor.ok) return actor;

  const organizationId = readText(formData, "organization_id");
  const title = readText(formData, "title");
  const reason = readText(formData, "reason");
  const sourceType = readText(formData, "source_type") || "manual";
  const assigneeId = readText(formData, "assignee_id");
  const dueAt = readDateTime(readText(formData, "due_at"));
  const nextStep = readText(formData, "next_step");

  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid organization." };
  if (title.length < 3 || title.length > 160) return { ok: false, message: "Use a task title between 3 and 160 characters." };
  if (reason.length < 1 || reason.length > 500) return { ok: false, message: "Add a reason of up to 500 characters." };
  if (!PLATFORM_FOLLOW_UP_SOURCES.includes(sourceType as (typeof PLATFORM_FOLLOW_UP_SOURCES)[number])) return { ok: false, message: "Choose a valid follow-up source." };
  if (assigneeId && !isUuid(assigneeId)) return { ok: false, message: "Choose an active owner or support operator." };
  if (readText(formData, "due_at") && !dueAt) return { ok: false, message: "Choose a valid due date." };
  if (nextStep.length > 1000) return { ok: false, message: "Keep the next step to 1,000 characters or fewer." };

  const result = await actor.admin.rpc("platform_create_follow_up_task", {
    p_org_id: organizationId,
    p_title: title,
    p_reason: reason,
    p_source_type: sourceType,
    p_source_id: readNullableUuid(formData, "source_id"),
    p_assignee_id: assigneeId || null,
    p_due_at: dueAt,
    p_next_step: nextStep || null,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return followUpDatabaseError(result.error.message);
  revalidateFollowUpPages(organizationId);
  return { ok: true, message: "Follow-up task created." };
}

export async function updatePlatformFollowUpTask(_previousState: FollowUpActionState, formData: FormData): Promise<FollowUpActionState> {
  const actor = await requirePlatformOperator("account_success_manage");
  if (!actor.ok) return actor;

  const organizationId = readText(formData, "organization_id");
  const taskId = readText(formData, "task_id");
  const expectedVersion = Number.parseInt(readText(formData, "version"), 10);
  const action = readText(formData, "action");
  const assigneeId = readText(formData, "assignee_id");
  const dueAt = readDateTime(readText(formData, "due_at"));
  const outcome = readText(formData, "outcome");
  const nextStep = readText(formData, "next_step");
  const reason = readText(formData, "reason");

  if (!isUuid(organizationId) || !isUuid(taskId)) return { ok: false, message: "Refresh the organization task list before changing a task." };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { ok: false, message: "Refresh this task before changing it." };
  if (!["assign", "unassign", "start", "complete", "cancel", "reopen", "edit"].includes(action)) return { ok: false, message: "Choose a valid task action." };
  if (action === "assign" && !isUuid(assigneeId)) return { ok: false, message: "Choose an active owner or support operator." };
  if (readText(formData, "due_at") && !dueAt) return { ok: false, message: "Choose a valid due date." };
  if (outcome.length > 2000) return { ok: false, message: "Keep the outcome to 2,000 characters or fewer." };
  if (nextStep.length > 1000) return { ok: false, message: "Keep the next step to 1,000 characters or fewer." };
  if (action === "complete" && !outcome) return { ok: false, message: "Record the outcome before completing the task." };
  if (action === "cancel" && !reason) return { ok: false, message: "Explain why the task is being cancelled." };

  const result = await actor.admin.rpc("platform_update_follow_up_task", {
    p_task_id: taskId,
    p_expected_version: expectedVersion,
    p_action: action,
    p_assignee_id: action === "assign" ? assigneeId : null,
    p_due_at: action === "edit" ? dueAt : null,
    p_outcome: outcome || null,
    p_next_step: nextStep || null,
    p_reason: reason || null,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return followUpDatabaseError(result.error.message);
  revalidateFollowUpPages(organizationId);
  return { ok: true, message: action === "complete" ? "Follow-up completed." : action === "cancel" ? "Follow-up cancelled." : action === "reopen" ? "Follow-up reopened." : action === "start" ? "Follow-up started." : action === "assign" ? "Follow-up assigned." : action === "unassign" ? "Follow-up unassigned." : "Follow-up updated." };
}

function revalidateFollowUpPages(organizationId: string) {
  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/platform/attention");
  revalidatePath("/platform/operations");
}

function followUpDatabaseError(message: string): FollowUpActionState {
  const normalized = message.toLowerCase();
  if (normalized.includes("version_conflict")) return { ok: false, message: "Another operator changed this task. Refresh the organization before trying again." };
  if (normalized.includes("assignee")) return { ok: false, message: "That operator is no longer active. Refresh and choose another owner." };
  if (normalized.includes("outcome_required")) return { ok: false, message: "Record an outcome before completing the task." };
  if (normalized.includes("reason_required")) return { ok: false, message: "Add a cancellation reason before closing the task." };
  if (normalized.includes("platform_follow_up_task") || normalized.includes("schema cache") || normalized.includes("relation")) return { ok: false, message: "Apply migration 0093_platform_follow_up_tasks.sql before using follow-up tasks." };
  return { ok: false, message: "The follow-up task could not be changed. Refresh and try again." };
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readDateTime(value: string) {
  if (!value) return null;
  const normalized = value.trim();
  const singaporeInput = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/.exec(normalized);
  const parsed = singaporeInput
    ? new Date(`${singaporeInput[1]}:${singaporeInput[2] ?? "00"}+08:00`)
    : new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readNullableUuid(formData: FormData, name: string) {
  const value = readText(formData, name);
  return isUuid(value) ? value : null;
}

function readRequestId(formData: FormData) {
  const value = readText(formData, "request_id");
  return isUuid(value) ? value : randomUUID();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
