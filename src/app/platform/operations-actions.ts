"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/employee-auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { readPlatformPolicies } from "@/lib/platform-operations-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export type OperationsActionState = {
  ok: boolean;
  message: string;
};

type OperationsActionFailure = {
  ok: false;
  message: string;
};

type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type OrganizationLifecycle = {
  id: string;
  name: string;
  account_status: "active" | "suspended" | null;
  suspension_reason: string | null;
  suspended_at: string | null;
};

export async function suspendOrganization(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  const reason = readText(formData, "reason");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };
  if (reason.length < 10 || reason.length > 500) return { ok: false, message: "Add a suspension reason of 10–500 characters." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;
  if (organization.record.account_status === "suspended") return { ok: false, message: `${organization.record.name} is already suspended.` };

  const suspendedAt = new Date().toISOString();
  const update = await actor.admin
    .from("organizations")
    .update({
      account_status: "suspended",
      suspension_reason: reason,
      suspended_at: suspendedAt,
      suspended_by: actor.userId,
    })
    .eq("id", organizationId)
    .eq("account_status", "active")
    .select("id")
    .maybeSingle();

  if (update.error) return platformMigrationError(update.error.message, "0027_platform_operations.sql");
  if (!update.data) return { ok: false, message: "This business account changed while you were reviewing it. Refresh the directory and try again." };

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: organizationId,
    actorId: actor.userId,
    action: "platform.organization.suspended",
    entity: "organizations",
    entityId: organizationId,
    before: {
      account_status: organization.record.account_status ?? "active",
      suspension_reason: organization.record.suspension_reason,
      suspended_at: organization.record.suspended_at,
    },
    after: {
      account_status: "suspended",
      suspension_reason: reason,
      suspended_at: suspendedAt,
    },
  });

  revalidatePlatformPages();
  if (auditError) return { ok: false, message: "The account was suspended, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: `${organization.record.name} is suspended. New checkout attempts are blocked.` };
}

export async function restoreOrganization(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;
  if (organization.record.account_status !== "suspended") return { ok: false, message: `${organization.record.name} is already active.` };

  const restoredAt = new Date().toISOString();
  const update = await actor.admin
    .from("organizations")
    .update({
      account_status: "active",
      suspension_reason: null,
      suspended_at: null,
      suspended_by: null,
    })
    .eq("id", organizationId)
    .eq("account_status", "suspended")
    .select("id")
    .maybeSingle();

  if (update.error) return platformMigrationError(update.error.message, "0027_platform_operations.sql");
  if (!update.data) return { ok: false, message: "This business account changed while you were reviewing it. Refresh the directory and try again." };

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: organizationId,
    actorId: actor.userId,
    action: "platform.organization.restored",
    entity: "organizations",
    entityId: organizationId,
    before: {
      account_status: "suspended",
      suspension_reason: organization.record.suspension_reason,
      suspended_at: organization.record.suspended_at,
    },
    after: {
      account_status: "active",
      restored_at: restoredAt,
    },
  });

  revalidatePlatformPages();
  if (auditError) return { ok: false, message: "The account was restored, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: `${organization.record.name} is active again.` };
}

export async function openSupportCase(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  const subject = readText(formData, "subject");
  const description = readText(formData, "description");
  const priority = readText(formData, "priority");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };
  if (subject.length < 1 || subject.length > 160) return { ok: false, message: "Add a support subject of 1–160 characters." };
  if (description.length < 1 || description.length > 5000) return { ok: false, message: "Add support details of 1–5,000 characters." };
  if (priority !== "normal" && priority !== "urgent") return { ok: false, message: "Choose a normal or urgent support priority." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;

  const responseHours = readPolicyNumber(gate.policies.support, "firstResponseHours", 24);
  const firstResponseDueAt = new Date(Date.now() + responseHours * 60 * 60 * 1000).toISOString();
  const result = await actor.admin
    .from("support_cases")
    .insert({
      org_id: organizationId,
      created_by: actor.userId,
      subject,
      description,
      priority,
      status: "open",
      first_response_due_at: firstResponseDueAt,
    })
    .select("id")
    .single();

  if (result.error || !result.data) return platformMigrationError(result.error?.message ?? "The support case could not be created.", "0028_support_cases.sql");

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: organizationId,
    actorId: actor.userId,
    action: "platform.support_case.opened",
    entity: "support_cases",
    entityId: result.data.id as string,
    before: null,
    after: {
      support_case_id: result.data.id,
      subject,
      priority,
      status: "open",
      first_response_due_at: firstResponseDueAt,
    },
  });

  revalidatePlatformPages();
  if (auditError) return { ok: false, message: "The support case was created, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: `Support case opened for ${organization.record.name}. First response target: ${formatHours(responseHours)}.` };
}

async function requirePlatformAdmin(): Promise<{ ok: true; admin: PlatformAdminClient; userId: string } | OperationsActionFailure> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again to manage platform operations." };
  if (!isPlatformAdminEmail(user.email)) return { ok: false, message: "Platform administrator access is required." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "The platform database client is not configured. Add SUPABASE_SERVICE_ROLE_KEY." };
  return { ok: true, admin, userId: user.id };
}

async function requirePublishedPolicies(admin: PlatformAdminClient): Promise<{ ok: true; policies: Awaited<ReturnType<typeof readPlatformPolicies>> } | OperationsActionFailure> {
  const policies = await readPlatformPolicies(admin);
  if (!policies.schemaAvailable) return { ok: false, message: "Apply Supabase migration 0027_platform_operations.sql before enabling account or support actions." };
  if (!isPolicyGateOpen(policies)) return { ok: false, message: "Publish both the billing and support policies before enabling account or support actions." };
  return { ok: true, policies };
}

async function readOrganization(admin: PlatformAdminClient, organizationId: string): Promise<{ ok: true; record: OrganizationLifecycle } | OperationsActionFailure> {
  const result = await admin
    .from("organizations")
    .select("id, name, account_status, suspension_reason, suspended_at")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error) return platformMigrationError(result.error.message, "0027_platform_operations.sql");
  if (!result.data) return { ok: false, message: "That business account could not be found." };
  return { ok: true, record: result.data as OrganizationLifecycle };
}

async function writePlatformAudit(admin: PlatformAdminClient, input: {
  orgId: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: Record<string, unknown> | null;
}) {
  const result = await admin.from("audit_logs").insert({
    org_id: input.orgId,
    actor_id: null,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    before: input.before,
    after: input.after ? { ...input.after, platform_actor_id: input.actorId } : null,
  });
  return result.error;
}

function revalidatePlatformPages() {
  revalidatePath("/platform");
  revalidatePath("/admin");
  revalidatePath("/admin/billing");
  revalidatePath("/account");
  revalidatePath("/pos");
}

function platformMigrationError(detail: string, migration: string): OperationsActionFailure {
  const lower = detail.toLowerCase();
  if (lower.includes("does not exist") || lower.includes("relation") || lower.includes("column")) {
    return { ok: false, message: `Apply Supabase migration ${migration} before using this platform action.` };
  }
  return { ok: false, message: detail || "The platform operation could not be completed." };
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatHours(value: number) {
  if (value === 1) return "1 hour";
  if (value < 24) return `${value} hours`;
  const days = value / 24;
  return Number.isInteger(days) ? `${days} day${days === 1 ? "" : "s"}` : `${value} hours`;
}
