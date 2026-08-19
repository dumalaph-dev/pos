"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/employee-auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { readPlatformPolicies } from "@/lib/platform-operations-server";
import { isMissingReferralSchemaError } from "@/lib/referrals-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { normalizeTrialFeedbackStatus, TRIAL_DAY_MS, type TrialFeedbackStatus } from "@/lib/trial";

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

export async function grantComplimentaryPremium(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  const reason = readText(formData, "reason");
  const source = readText(formData, "source") || "manual";
  const startMode = readText(formData, "start_mode") || "now";
  const days = readInteger(formData, "days");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, message: "Choose a complimentary access period from 1–365 days." };
  if (reason.length < 5 || reason.length > 500) return { ok: false, message: "Add a grant reason of 5–500 characters." };
  if (source !== "manual" && source !== "support" && source !== "campaign" && source !== "referral") return { ok: false, message: "Choose a valid grant source." };
  if (startMode !== "now" && startMode !== "after_current_access") return { ok: false, message: "Choose when the complimentary access should begin." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;
  if (organization.record.account_status === "suspended") return { ok: false, message: "Restore the suspended account before granting tenant access." };

  const now = new Date();
  const currentAccess = await actor.admin
    .from("platform_access_grants")
    .select("ends_at")
    .eq("org_id", organizationId)
    .eq("status", "active")
    .gt("ends_at", now.toISOString())
    .order("ends_at", { ascending: false })
    .limit(1);
  if (currentAccess.error) return platformMigrationError(currentAccess.error.message, "0052_platform_access_grants.sql");

  const lifecycle = await actor.admin
    .from("organizations")
    .select("subscription_status, subscription_trial_ends_at, subscription_current_period_end")
    .eq("id", organizationId)
    .maybeSingle();
  if (lifecycle.error) return platformMigrationError(lifecycle.error.message, "0023_store_access_and_subscriptions.sql");

  const candidateEndTimes = [
    ...((currentAccess.data ?? []).map((row) => Date.parse(String(row.ends_at ?? "")))),
    ...(lifecycle.data?.subscription_status === "trialing" || lifecycle.data?.subscription_status === "active" || lifecycle.data?.subscription_status === "past_due"
      ? [
        Date.parse(String(lifecycle.data.subscription_trial_ends_at ?? "")),
        Date.parse(String(lifecycle.data.subscription_current_period_end ?? "")),
      ]
      : []),
  ].filter(Number.isFinite);
  const startsAtMs = startMode === "after_current_access"
    ? Math.max(now.getTime(), ...candidateEndTimes)
    : now.getTime();
  const startsAt = new Date(startsAtMs).toISOString();
  const endsAt = new Date(startsAtMs + days * TRIAL_DAY_MS).toISOString();
  const result = await actor.admin
    .from("platform_access_grants")
    .insert({
      org_id: organizationId,
      source,
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
      reason,
      created_by: actor.userId,
      metadata: { grant_kind: "complimentary_premium" },
    })
    .select("id")
    .single();

  if (result.error || !result.data) return platformMigrationError(result.error?.message ?? "The complimentary grant could not be created.", "0052_platform_access_grants.sql");

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: organizationId,
    actorId: actor.userId,
    action: "platform.access_grant.created",
    entity: "platform_access_grants",
    entityId: result.data.id as string,
    before: null,
    after: {
      grant_id: result.data.id,
      source,
      status: "active",
      starts_at: startsAt,
      ends_at: endsAt,
      reason,
    },
  });

  revalidatePlatformPages(organizationId);
  if (auditError) return { ok: false, message: "The grant was created, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: `${days} complimentary Premium day${days === 1 ? "" : "s"} granted to ${organization.record.name}. Access ends ${endsAt}.` };
}

export async function revokeComplimentaryPremium(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const grantId = readText(formData, "grant_id");
  if (!isUuid(grantId)) return { ok: false, message: "Choose a valid complimentary grant." };

  const grant = await actor.admin
    .from("platform_access_grants")
    .select("id, org_id, source, status, starts_at, ends_at, reason, created_by, created_at, metadata")
    .eq("id", grantId)
    .maybeSingle();
  if (grant.error) return platformMigrationError(grant.error.message, "0052_platform_access_grants.sql");
  if (!grant.data) return { ok: false, message: "That complimentary grant could not be found." };
  if (grant.data.status !== "active") return { ok: false, message: "That complimentary grant has already been revoked." };

  const revokedAt = new Date().toISOString();
  const update = await actor.admin
    .from("platform_access_grants")
    .update({ status: "revoked", revoked_at: revokedAt, revoked_by: actor.userId })
    .eq("id", grantId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (update.error) return platformMigrationError(update.error.message, "0052_platform_access_grants.sql");
  if (!update.data) return { ok: false, message: "This grant changed while you were reviewing it. Refresh the organization record and try again." };

  let rewardLedgerSyncFailed = false;
  if (grant.data.source === "referral") {
    const rewardUpdate = await actor.admin
      .from("platform_referral_reward_ledger")
      .update({ status: "revoked", revoked_at: revokedAt })
      .eq("grant_id", grantId)
      .eq("status", "issued");
    rewardLedgerSyncFailed = Boolean(rewardUpdate.error && !isMissingReferralSchemaError(rewardUpdate.error.message));
  }

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: grant.data.org_id as string,
    actorId: actor.userId,
    action: "platform.access_grant.revoked",
    entity: "platform_access_grants",
    entityId: grantId,
    before: {
      status: grant.data.status,
      starts_at: grant.data.starts_at,
      ends_at: grant.data.ends_at,
      reason: grant.data.reason,
    },
    after: {
      status: "revoked",
      revoked_at: revokedAt,
    },
  });

  revalidatePlatformPages(grant.data.org_id as string);
  if (rewardLedgerSyncFailed) return { ok: false, message: "The grant was revoked, but the referral reward ledger could not be synchronized. Review the organization record before retrying." };
  if (auditError) return { ok: false, message: "The grant was revoked, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: "Complimentary Premium access was revoked." };
}

export async function updateTrialFeedback(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformAdmin();
  if (!actor.ok) return actor;

  const organizationId = readText(formData, "organization_id");
  const status = normalizeTrialFeedbackStatus(readText(formData, "status"));
  const platformNotes = readText(formData, "platform_notes");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };
  if (platformNotes.length > 2000) return { ok: false, message: "Keep internal notes to 2,000 characters or fewer." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;

  const actedAt = status === "new" ? null : new Date().toISOString();
  const update = await actor.admin
    .from("trial_feedback")
    .update({
      status,
      platform_notes: platformNotes,
      acted_at: actedAt,
      acted_by: status === "new" ? null : actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", organizationId)
    .select("org_id")
    .maybeSingle();

  if (update.error && isMissingTrialFeedbackWorkflowSchema(update.error.message)) {
    return { ok: false, message: "Apply Supabase migration 0039_trial_feedback_workflow.sql to enable follow-up tracking." };
  }

  if (update.error && isMissingTrialFeedbackTable(update.error.message)) {
    const fallback = await updateFeedbackInOrganizationSettings(actor.admin, organizationId, {
      status,
      platformNotes,
      actedAt,
      actedBy: status === "new" ? null : actor.userId,
    });
    if (!fallback.found) return { ok: false, message: "No trial feedback was found for this business account." };
    if (!fallback.ok) return { ok: false, message: "The follow-up could not be saved. Please try again." };
  } else if (update.error) {
    return { ok: false, message: "The follow-up could not be saved. Please try again." };
  } else if (!update.data) {
    return { ok: false, message: "No trial feedback was found for this business account." };
  }

  const auditError = await writePlatformAudit(actor.admin, {
    orgId: organizationId,
    actorId: actor.userId,
    action: "platform.trial_feedback.updated",
    entity: "trial_feedback",
    entityId: organizationId,
    before: null,
    after: {
      status,
      platform_notes: platformNotes,
      acted_at: actedAt,
    },
  });

  revalidatePlatformPages();
  if (auditError) return { ok: false, message: "The follow-up was saved, but its audit record could not be written. Review the audit log before retrying." };
  return { ok: true, message: `${organization.record.name} follow-up saved as ${trialFeedbackStatusLabel(status)}.` };
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

async function updateFeedbackInOrganizationSettings(admin: PlatformAdminClient, organizationId: string, input: {
  status: TrialFeedbackStatus;
  platformNotes: string;
  actedAt: string | null;
  actedBy: string | null;
}) {
  const current = await admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  if (current.error || !current.data) return { ok: false, found: false };
  const settings = isRecord(current.data.settings) ? current.data.settings : {};
  const existingFeedback = isRecord(settings.trial_retention_feedback) ? settings.trial_retention_feedback : null;
  if (!existingFeedback || typeof existingFeedback.reason !== "string") return { ok: true, found: false };

  const update = await admin.from("organizations").update({
    settings: {
      ...settings,
      trial_retention_feedback: {
        ...existingFeedback,
        status: input.status,
        platformNotes: input.platformNotes,
        actedAt: input.actedAt,
        actedBy: input.actedBy,
        updatedAt: new Date().toISOString(),
      },
    },
  }).eq("id", organizationId);
  return { ok: !update.error, found: true };
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

function revalidatePlatformPages(organizationId?: string) {
  revalidatePath("/platform");
  revalidatePath("/platform/plans");
  revalidatePath("/platform/policies");
  revalidatePath("/platform/users");
  revalidatePath("/platform/operations");
  revalidatePath("/admin");
  revalidatePath("/admin/billing");
  revalidatePath("/account");
  revalidatePath("/pos");
  if (organizationId) revalidatePath(`/platform/organizations/${organizationId}`);
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

function readInteger(formData: FormData, name: string) {
  const value = readText(formData, name);
  if (!value) return NaN;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
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

function isMissingTrialFeedbackWorkflowSchema(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("platform_notes") || normalized.includes("acted_at") || (normalized.includes("column") && normalized.includes("status"));
}

function isMissingTrialFeedbackTable(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("trial_feedback") && (normalized.includes("does not exist") || normalized.includes("schema cache") || normalized.includes("relation"));
}

function trialFeedbackStatusLabel(status: TrialFeedbackStatus) {
  return status === "offer_sent" ? "offer sent" : status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
