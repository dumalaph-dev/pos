import { createAdminClient } from "@/lib/employee-auth";
import {
  PLATFORM_MY_WORK_SEVERITIES,
  sortPlatformMyWorkItems,
  type PlatformMyWorkItem,
  type PlatformMyWorkRead,
  type PlatformMyWorkSeverity,
  type PlatformMyWorkSourceAvailability,
} from "@/lib/platform-my-work";

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function readPlatformMyWork(admin: PlatformAdminClient, email: string | null, canViewSupport: boolean): Promise<PlatformMyWorkRead> {
  const asOf = new Date().toISOString();
  const sourceAvailability: PlatformMyWorkSourceAvailability = {
    follow_up: false,
    support_case: false,
    attention: false,
  };
  if (!email) return { items: [], operatorId: null, sourceAvailability, hasMore: false, asOf };

  const operatorResult = await admin.from("platform_operators").select("id").eq("email", email).eq("is_active", true).maybeSingle();
  if (operatorResult.error || !isRecord(operatorResult.data) || typeof operatorResult.data.id !== "string") {
    return { items: [], operatorId: null, sourceAvailability, hasMore: false, asOf };
  }
  const operatorId = operatorResult.data.id;

  const [followUpResult, supportResult, attentionResult] = await Promise.all([
    admin
      .from("platform_follow_up_tasks")
      .select("id, org_id, title, reason, status, due_at, next_step, updated_at")
      .eq("assignee_id", operatorId)
      .in("status", ["open", "in_progress"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(51),
    canViewSupport
      ? admin
        .from("support_cases")
        .select("id, org_id, subject, priority, status, first_response_due_at, updated_at")
        .eq("assigned_to", operatorId)
        .in("status", ["open", "in_progress", "waiting_on_customer"])
        .order("first_response_due_at", { ascending: true })
        .order("updated_at", { ascending: false })
        .limit(51)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("platform_attention_occurrences")
      .select("id, title, detail, organization_id, severity, state, href, updated_at, snoozed_until")
      .eq("assigned_to", operatorId)
      .in("state", ["open", "acknowledged", "snoozed"])
      .order("severity", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(51),
  ]);

  sourceAvailability.follow_up = !followUpResult.error;
  sourceAvailability.support_case = canViewSupport && !supportResult.error;
  sourceAvailability.attention = !attentionResult.error;

  const rawFollowUps = Array.isArray(followUpResult.data) ? followUpResult.data : [];
  const rawSupport = Array.isArray(supportResult.data) ? supportResult.data : [];
  const rawAttention = Array.isArray(attentionResult.data) ? attentionResult.data : [];
  const items: PlatformMyWorkItem[] = [];

  for (const row of rawFollowUps.slice(0, 50)) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.title !== "string" || typeof row.reason !== "string" || typeof row.updated_at !== "string") continue;
    const status = typeof row.status === "string" ? row.status : "open";
    const dueAt = readNullableText(row.due_at);
    items.push({
      id: row.id,
      source: "follow_up",
      title: row.title,
      detail: `${row.reason}${readNullableText(row.next_step) ? ` · Next: ${readNullableText(row.next_step)}` : ""}`,
      organizationId: row.org_id,
      organizationName: null,
      status,
      severity: dueAt && Date.parse(dueAt) < Date.parse(asOf) ? "high" : "medium",
      dueAt,
      updatedAt: row.updated_at,
      href: `/platform/organizations/${row.org_id}`,
    });
  }

  for (const row of rawSupport.slice(0, 50)) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.subject !== "string" || typeof row.updated_at !== "string") continue;
    const dueAt = readNullableText(row.first_response_due_at);
    const overdue = dueAt ? Date.parse(dueAt) < Date.parse(asOf) : false;
    const urgent = row.priority === "urgent";
    items.push({
      id: row.id,
      source: "support_case",
      title: urgent ? `Urgent: ${row.subject}` : row.subject,
      detail: `${typeof row.status === "string" ? row.status.replaceAll("_", " ") : "open"} · First response ${overdue ? "overdue" : "due"}${dueAt ? ` ${formatDate(dueAt)}` : ""}.`,
      organizationId: row.org_id,
      organizationName: null,
      status: typeof row.status === "string" ? row.status : "open",
      severity: urgent ? "critical" : overdue ? "high" : "medium",
      dueAt,
      updatedAt: row.updated_at,
      href: `/platform/organizations/${row.org_id}`,
    });
  }

  for (const row of rawAttention.slice(0, 50)) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.detail !== "string" || typeof row.updated_at !== "string") continue;
    const severity = normalizeSeverity(row.severity);
    const href = typeof row.href === "string" && (row.href.startsWith("/") || row.href.startsWith("https://")) ? row.href : "/platform/attention";
    items.push({
      id: row.id,
      source: "attention",
      title: row.title,
      detail: row.detail,
      organizationId: typeof row.organization_id === "string" ? row.organization_id : null,
      organizationName: null,
      status: typeof row.state === "string" ? row.state : "open",
      severity,
      dueAt: row.state === "snoozed" ? readNullableText(row.snoozed_until) : null,
      updatedAt: row.updated_at,
      href,
    });
  }

  const organizationIds = [...new Set(items.map((item) => item.organizationId).filter((id): id is string => Boolean(id)))];
  if (organizationIds.length > 0) {
    const organizationsResult = await admin.from("organizations").select("id, name").in("id", organizationIds);
    const names = new Map<string, string>();
    for (const row of organizationsResult.data ?? []) {
      if (isRecord(row) && typeof row.id === "string") names.set(row.id, typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization");
    }
    for (const item of items) item.organizationName = item.organizationId ? names.get(item.organizationId) ?? "Unnamed organization" : null;
  }

  return {
    items: sortPlatformMyWorkItems(items).slice(0, 50),
    operatorId,
    sourceAvailability,
    hasMore: rawFollowUps.length > 50 || rawSupport.length > 50 || rawAttention.length > 50,
    asOf,
  };
}

function normalizeSeverity(value: unknown): PlatformMyWorkSeverity {
  return typeof value === "string" && PLATFORM_MY_WORK_SEVERITIES.includes(value as PlatformMyWorkSeverity) ? value as PlatformMyWorkSeverity : "medium";
}

function readNullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
