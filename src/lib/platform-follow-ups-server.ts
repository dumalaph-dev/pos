import { createAdminClient } from "@/lib/employee-auth";
import {
  PLATFORM_FOLLOW_UP_SOURCES,
  PLATFORM_FOLLOW_UP_STATUSES,
  type PlatformFollowUpTask,
} from "@/lib/platform-follow-ups";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PlatformFollowUpRead = {
  tasks: PlatformFollowUpTask[];
  schemaAvailable: boolean;
};

export async function readPlatformFollowUpTasks(admin: PlatformAdminClient, organizationId: string): Promise<PlatformFollowUpRead> {
  const result = await admin
    .from("platform_follow_up_tasks")
    .select("id, org_id, title, reason, source_type, source_id, status, assignee_id, due_at, outcome, next_step, completed_at, version, created_at, updated_at")
    .eq("org_id", organizationId)
    .order("status", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(100);

  if (result.error) return { tasks: [], schemaAvailable: false };
  const tasks = (result.data ?? []).flatMap((row): PlatformFollowUpTask[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.title !== "string" || typeof row.reason !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return [];
    return [{
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      reason: row.reason,
      sourceType: normalizeEnum(row.source_type, PLATFORM_FOLLOW_UP_SOURCES, "manual"),
      sourceId: readNullableText(row.source_id),
      status: normalizeEnum(row.status, PLATFORM_FOLLOW_UP_STATUSES, "open"),
      assigneeId: readNullableText(row.assignee_id),
      dueAt: readNullableText(row.due_at),
      outcome: readNullableText(row.outcome),
      nextStep: readNullableText(row.next_step),
      completedAt: readNullableText(row.completed_at),
      version: readPositiveInteger(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });
  return { tasks, schemaAvailable: true };
}

function normalizeEnum<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === "string" && values.includes(value) ? value as T[number] : fallback;
}

function readNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function readPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
