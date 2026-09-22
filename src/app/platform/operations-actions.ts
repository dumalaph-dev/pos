"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { readPlatformPolicies } from "@/lib/platform-operations-server";
import { requirePlatformOperator, type PlatformOperatorActor } from "@/lib/platform-operators-server";
import { isMissingReferralSchemaError } from "@/lib/referrals-server";
import { TRIAL_EXTENSION_MAX_DAYS_PER_ACTION, TRIAL_EXTENSION_MAX_DAYS_LIFETIME, trialExtensionBlockMessage } from "@/lib/platform-trial";
import { normalizeTrialFeedbackStatus, type TrialFeedbackStatus } from "@/lib/trial";

export type OperationsActionState = {
  ok: boolean;
  message: string;
};

type OperationsActionFailure = {
  ok: false;
  message: string;
};

type OrganizationLifecycle = {
  id: string;
  name: string;
  account_status: "active" | "suspended" | null;
  suspension_reason: string | null;
  suspended_at: string | null;
  platform_account_version: number | null;
};

export async function suspendOrganization(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
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
  const result = await actor.admin.rpc("platform_set_organization_status", {
    p_org_id: organizationId,
    p_expected_version: organization.record.platform_account_version ?? 1,
    p_target_status: "suspended",
    p_reason: reason,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_policy_version: gate.policies.support.version,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformOrganizationMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: `${organization.record.name} is suspended. New checkout attempts are blocked.` };
}

export async function restoreOrganization(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;
  if (organization.record.account_status !== "suspended") return { ok: false, message: `${organization.record.name} is already active.` };
  const result = await actor.admin.rpc("platform_set_organization_status", {
    p_org_id: organizationId,
    p_expected_version: organization.record.platform_account_version ?? 1,
    p_target_status: "active",
    p_reason: readText(formData, "reason"),
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_policy_version: gate.policies.support.version,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformOrganizationMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: `${organization.record.name} is active again.` };
}

export async function openSupportCase(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
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
  const result = await actor.admin.rpc("platform_open_support_case", {
    p_org_id: organizationId,
    p_subject: subject,
    p_description: description,
    p_priority: priority,
    p_first_response_due_at: firstResponseDueAt,
    p_policy_version: gate.policies.support.version,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformSupportMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: `Support case opened for ${organization.record.name}. First response target: ${formatHours(responseHours)}.` };
}

export async function grantComplimentaryPremium(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("entitlement_manage");
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

  const result = await actor.admin.rpc("grant_platform_access", {
    p_org_id: organizationId,
    p_days: days,
    p_reason: reason,
    p_source: source,
    p_start_mode: startMode,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return platformAccessGrantError(result.error.message);

  const grant = isRecord(result.data) ? result.data : null;
  const startsAt = readRecordString(grant, "starts_at");
  const endsAt = readRecordString(grant, "ends_at");
  if (!grant || !startsAt || !endsAt) return { ok: false, message: "The complimentary grant response was incomplete. Refresh the organization record and try again." };

  revalidatePlatformPages(organizationId);
  return { ok: true, message: `${days} complimentary Premium day${days === 1 ? "" : "s"} granted to ${organization.record.name}. Access runs from ${startsAt} through ${endsAt}.` };
}

export async function adjustComplimentaryPremium(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("entitlement_manage");
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const grantId = readText(formData, "grant_id");
  const deltaDays = readInteger(formData, "delta_days");
  const reason = readText(formData, "reason");
  if (!isUuid(grantId)) return { ok: false, message: "Choose a valid complimentary grant." };
  if (!Number.isInteger(deltaDays) || deltaDays === 0 || deltaDays < -365 || deltaDays > 365) return { ok: false, message: "Choose a grant adjustment from -365 to 365 days, excluding zero." };
  if (reason.length < 5 || reason.length > 500) return { ok: false, message: "Add an adjustment reason of 5–500 characters." };

  const grant = await actor.admin
    .from("platform_access_grants")
    .select("id, org_id, status, starts_at, ends_at")
    .eq("id", grantId)
    .maybeSingle();
  if (grant.error) return platformMigrationError(grant.error.message, "0052_platform_access_grants.sql");
  if (!grant.data) return { ok: false, message: "That complimentary grant could not be found." };
  if (grant.data.status !== "active") return { ok: false, message: "That complimentary grant has already been revoked." };

  const organization = await readOrganization(actor.admin, grant.data.org_id as string);
  if (!organization.ok) return organization;
  if (organization.record.account_status === "suspended") return { ok: false, message: "Restore the suspended account before changing tenant access." };

  const result = await actor.admin.rpc("adjust_platform_access_grant", {
    p_grant_id: grantId,
    p_delta_days: deltaDays,
    p_reason: reason,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return platformAccessGrantAdjustmentError(result.error.message);

  const adjustment = isRecord(result.data) ? result.data : null;
  const endsAt = readRecordString(adjustment, "ends_at");
  const previousEndsAt = readRecordString(adjustment, "previous_ends_at");
  if (!adjustment || !endsAt || !previousEndsAt) return { ok: false, message: "The grant adjustment response was incomplete. Refresh the organization record and try again." };

  revalidatePlatformPages(organization.record.id);
  const direction = deltaDays > 0 ? "extended" : "shortened";
  const dayCount = Math.abs(deltaDays);
  return { ok: true, message: `Grant for ${organization.record.name} ${direction} by ${dayCount} day${dayCount === 1 ? "" : "s"}. Access now ends ${formatOperationsDate(endsAt)}; one before/after audit row was recorded.` };
}

export async function revokeComplimentaryPremium(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("entitlement_manage");
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

export async function extendOrganizationTrial(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("entitlement_manage");
  if (!actor.ok) return actor;

  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;

  const organizationId = readText(formData, "organization_id");
  const reason = readText(formData, "reason");
  const days = readInteger(formData, "days");
  if (!isUuid(organizationId)) return { ok: false, message: "Choose a valid business account." };
  if (!Number.isInteger(days) || days < 1 || days > TRIAL_EXTENSION_MAX_DAYS_PER_ACTION) return { ok: false, message: `Choose a trial extension of 1–${TRIAL_EXTENSION_MAX_DAYS_PER_ACTION} days.` };
  if (reason.length < 5 || reason.length > 500) return { ok: false, message: "Add an extension reason of 5–500 characters." };

  const organization = await readOrganization(actor.admin, organizationId);
  if (!organization.ok) return organization;
  if (organization.record.account_status === "suspended") return { ok: false, message: trialExtensionBlockMessage("account_suspended") };

  const result = await actor.admin.rpc("extend_organization_trial", {
    p_org_id: organizationId,
    p_days: days,
    p_reason: reason,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
  });
  if (result.error) return platformTrialExtensionError(result.error.message);

  const extension = isRecord(result.data) ? result.data : null;
  const trialEndsAt = readRecordString(extension, "trial_ends_at");
  if (!extension || !trialEndsAt) return { ok: false, message: "The trial extension response was incomplete. Refresh the organization record and try again." };

  const revived = extension.revived === true;
  const remaining = Number(extension.days_remaining);
  const remainingNote = Number.isFinite(remaining) ? ` ${remaining} operator day${remaining === 1 ? "" : "s"} remain for this account.` : "";

  revalidatePlatformPages(organizationId);
  return {
    ok: true,
    message: `${days} trial day${days === 1 ? "" : "s"} added to ${organization.record.name}.${revived ? " The expired trial was reopened." : ""} The trial now ends ${formatOperationsDate(trialEndsAt)}.${remainingNote}`,
  };
}

export async function updateTrialFeedback(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
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

async function requirePublishedPolicies(admin: PlatformOperatorActor["admin"]): Promise<{ ok: true; policies: Awaited<ReturnType<typeof readPlatformPolicies>> } | OperationsActionFailure> {
  const policies = await readPlatformPolicies(admin);
  if (!policies.schemaAvailable) return { ok: false, message: "Apply Supabase migration 0027_platform_operations.sql before enabling account or support actions." };
  if (!isPolicyGateOpen(policies)) return { ok: false, message: "Publish both the billing and support policies before enabling account or support actions." };
  return { ok: true, policies };
}

async function readOrganization(admin: PlatformOperatorActor["admin"], organizationId: string): Promise<{ ok: true; record: OrganizationLifecycle } | OperationsActionFailure> {
  const result = await admin
    .from("organizations")
    .select("id, name, account_status, suspension_reason, suspended_at, platform_account_version")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error) return platformMigrationError(result.error.message, result.error.message.toLowerCase().includes("platform_account_version") ? "0088_platform_support_lifecycle.sql" : "0027_platform_operations.sql");
  if (!result.data) return { ok: false, message: "That business account could not be found." };
  return { ok: true, record: result.data as OrganizationLifecycle };
}

export async function transitionSupportCase(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
  if (!actor.ok) return actor;
  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;
  const caseId = readText(formData, "case_id");
  const expectedVersion = readInteger(formData, "version");
  const status = readText(formData, "status");
  const resolutionReason = readText(formData, "resolution_reason");
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { ok: false, message: "Refresh this support case before changing its status." };
  if (["resolved", "closed"].includes(status) && (resolutionReason.length < 1 || resolutionReason.length > 1000)) return { ok: false, message: "Add a resolution reason of 1–1,000 characters." };
  const result = await actor.admin.rpc("platform_transition_support_case", {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_to_status: status,
    p_resolution_reason: resolutionReason,
    p_policy_version: gate.policies.support.version,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformSupportMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: `Support case moved to ${status.replaceAll("_", " ")}.` };
}

export async function assignSupportCase(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
  if (!actor.ok) return actor;
  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;
  const caseId = readText(formData, "case_id");
  const expectedVersion = readInteger(formData, "version");
  const assigneeId = readText(formData, "assignee_id");
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { ok: false, message: "Refresh this support case before assigning it." };
  if (assigneeId && !isUuid(assigneeId)) return { ok: false, message: "Choose an eligible support operator." };
  const result = await actor.admin.rpc("platform_assign_support_case", {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_assignee_id: assigneeId || null,
    p_policy_version: gate.policies.support.version,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformSupportMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: assigneeId ? "Support case assigned." : "Support case returned to the unassigned queue." };
}

export async function appendSupportCaseNote(_previousState: OperationsActionState, formData: FormData): Promise<OperationsActionState> {
  const actor = await requirePlatformOperator("support_manage");
  if (!actor.ok) return actor;
  const gate = await requirePublishedPolicies(actor.admin);
  if (!gate.ok) return gate;
  const caseId = readText(formData, "case_id");
  const expectedVersion = readInteger(formData, "version");
  const body = readText(formData, "body");
  const noteType = readText(formData, "note_type") || "internal";
  if (!isUuid(caseId) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { ok: false, message: "Refresh this support case before adding a note." };
  if (body.length < 1 || body.length > 5000) return { ok: false, message: "Add a note of 1–5,000 characters." };
  if (noteType !== "internal" && noteType !== "operator_response") return { ok: false, message: "Choose an internal note or operator response." };
  const result = await actor.admin.rpc("platform_append_support_case_note", {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_body: body,
    p_note_type: noteType,
    p_policy_version: gate.policies.support.version,
    p_actor_id: actor.userId,
    p_actor_email: actor.email,
    p_request_id: readRequestId(formData),
  });
  if (result.error) return platformSupportMutationError(result.error.message);
  revalidatePlatformPages();
  return { ok: true, message: noteType === "operator_response" ? "First-response evidence recorded." : "Internal note added." };
}

async function updateFeedbackInOrganizationSettings(admin: PlatformOperatorActor["admin"], organizationId: string, input: {
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

async function writePlatformAudit(admin: PlatformOperatorActor["admin"], input: {
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
  revalidatePath("/platform/operators");
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

function platformAccessGrantError(detail: string): OperationsActionFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("schema cache") || normalized.includes("function") || normalized.includes("does not exist") || normalized.includes("relation") || normalized.includes("column")) {
    return { ok: false, message: "Apply Supabase migration 0054_atomic_platform_access_grant.sql before granting complimentary access." };
  }
  if (normalized.includes("platform_access_account_suspended")) return { ok: false, message: "Restore the suspended account before granting tenant access." };
  if (normalized.includes("platform_access_organization_not_found")) return { ok: false, message: "That business account could not be found. Refresh the directory and try again." };
  if (normalized.includes("platform_access_invalid_days")) return { ok: false, message: "Choose a complimentary access period from 1–365 days." };
  if (normalized.includes("platform_access_invalid_reason")) return { ok: false, message: "Add a grant reason of 5–500 characters." };
  if (normalized.includes("platform_access_invalid_source")) return { ok: false, message: "Choose a valid grant source." };
  if (normalized.includes("platform_access_invalid_start_mode")) return { ok: false, message: "Choose when the complimentary access should begin." };
  return { ok: false, message: detail || "The complimentary grant could not be created." };
}

function platformOrganizationMutationError(detail: string): OperationsActionFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("function") || normalized.includes("schema cache") || normalized.includes("does not exist") || normalized.includes("platform_account_version")) {
    return { ok: false, message: "Apply Supabase migration 0088_platform_support_lifecycle.sql before using atomic account safety." };
  }
  if (normalized.includes("platform_organization_conflict")) return { ok: false, message: "This account changed in another operator session. Refresh the organization before retrying." };
  if (normalized.includes("platform_request_id_conflict")) return { ok: false, message: "This mutation request key was already used for another operation. Refresh the page and retry." };
  if (normalized.includes("already_in_state")) return { ok: false, message: "This account already has that lifecycle state. Refresh the organization record." };
  if (normalized.includes("invalid_reason")) return { ok: false, message: "Add a suspension reason of 10–500 characters." };
  return { ok: false, message: detail || "The account lifecycle change could not be completed." };
}

function platformSupportMutationError(detail: string): OperationsActionFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("function") || normalized.includes("schema cache") || normalized.includes("does not exist") || normalized.includes("support_case_events") || normalized.includes("support_case_notes")) {
    return { ok: false, message: "Apply Supabase migration 0088_platform_support_lifecycle.sql before using support lifecycle controls." };
  }
  if (normalized.includes("conflict")) return { ok: false, message: "This support case changed in another operator session. Refresh it before retrying." };
  if (normalized.includes("platform_request_id_conflict")) return { ok: false, message: "This mutation request key was already used for another operation. Refresh the case and retry." };
  if (normalized.includes("resolution_reason_required")) return { ok: false, message: "Add a resolution reason before closing this case." };
  if (normalized.includes("reopen_reason_required")) return { ok: false, message: "Add a reason before reopening a closed case." };
  if (normalized.includes("invalid_assignee")) return { ok: false, message: "Choose an active Support or Owner operator." };
  if (normalized.includes("already_in_state") || normalized.includes("already_assigned")) return { ok: false, message: "That support case already has this state or assignment. Refresh it." };
  return { ok: false, message: detail || "The support case change could not be completed." };
}

function platformAccessGrantAdjustmentError(detail: string): OperationsActionFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("schema cache") || normalized.includes("function") || normalized.includes("does not exist") || normalized.includes("relation") || normalized.includes("column")) {
    return { ok: false, message: "Apply Supabase migration 0078_adjust_platform_access_grant.sql before adjusting complimentary access." };
  }
  if (normalized.includes("platform_access_invalid_grant")) return { ok: false, message: "Choose a valid complimentary grant." };
  if (normalized.includes("platform_access_invalid_actor")) return { ok: false, message: "A signed-in platform operator is required to adjust access." };
  if (normalized.includes("platform_access_invalid_delta_days")) return { ok: false, message: "Choose a grant adjustment from -365 to 365 days, excluding zero." };
  if (normalized.includes("platform_access_invalid_adjustment_reason")) return { ok: false, message: "Add an adjustment reason of 5–500 characters." };
  if (normalized.includes("platform_access_grant_not_found")) return { ok: false, message: "That complimentary grant could not be found. Refresh the organization record and try again." };
  if (normalized.includes("platform_access_grant_not_active")) return { ok: false, message: "That complimentary grant is no longer active." };
  if (normalized.includes("platform_access_grant_expired")) return { ok: false, message: "That complimentary grant has expired. Create a new grant instead." };
  if (normalized.includes("platform_access_invalid_adjusted_window")) return { ok: false, message: "That shortening would end access now or make the grant window invalid. Revoke it for immediate removal." };
  return { ok: false, message: detail || "The complimentary grant could not be adjusted." };
}

function platformTrialExtensionError(detail: string): OperationsActionFailure {
  const normalized = detail.toLowerCase();
  if (normalized.includes("platform_trial_account_suspended")) return { ok: false, message: trialExtensionBlockMessage("account_suspended") };
  if (normalized.includes("platform_trial_billing_pause")) return { ok: false, message: trialExtensionBlockMessage("billing_pause") };
  if (normalized.includes("platform_trial_status_not_eligible")) return { ok: false, message: trialExtensionBlockMessage("billing_subscription") };
  if (normalized.includes("platform_trial_cap_exceeded")) return { ok: false, message: `This extension would pass the ${TRIAL_EXTENSION_MAX_DAYS_LIFETIME}-day limit on operator-added trial days for this account. Grant complimentary Premium instead.` };
  if (normalized.includes("platform_trial_invalid_days")) return { ok: false, message: `Choose a trial extension of 1–${TRIAL_EXTENSION_MAX_DAYS_PER_ACTION} days.` };
  if (normalized.includes("platform_trial_invalid_reason")) return { ok: false, message: "Add an extension reason of 5–500 characters." };
  if (normalized.includes("platform_trial_organization_not_found")) return { ok: false, message: "That business account could not be found. Refresh the directory and try again." };
  if (normalized.includes("platform_trial_invalid_organization")) return { ok: false, message: "Choose a valid business account." };
  if (normalized.includes("schema cache") || normalized.includes("function") || normalized.includes("does not exist") || normalized.includes("relation") || normalized.includes("column")) {
    return { ok: false, message: "Apply Supabase migration 0075_extend_organization_trial.sql before extending a trial." };
  }
  return { ok: false, message: detail || "The trial extension could not be applied." };
}

function formatOperationsDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readRequestId(formData: FormData) {
  const value = readText(formData, "request_id");
  return isUuid(value) ? value : randomUUID();
}

function readRecordString(record: Record<string, unknown> | null, key: string) {
  return record && typeof record[key] === "string" ? record[key] : "";
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
