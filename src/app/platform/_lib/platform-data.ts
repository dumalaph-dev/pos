import { createAdminClient } from "@/lib/employee-auth";
import { readOrganizationAccessGrants } from "@/lib/platform-access-server";
import type { ComplimentaryAccessGrant } from "@/lib/platform-access";
import {
  normalizeReferralCodeRecord,
  normalizeReferralRecord,
  normalizeReferralRewardRecord,
  type ReferralCodeRecord,
  type ReferralRecord,
  type ReferralRewardRecord,
} from "@/lib/referrals";
import { normalizeTrialFeedbackStatus, type TrialFeedbackStatus } from "@/lib/trial";

export type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type OrganizationRecord = {
  id: string;
  name: string;
  created_at: string;
  owner_profile_id: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_trial_started_at?: string | null;
  subscription_trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
  subscription_billing_mode?: string | null;
  subscription_billing_variant_id?: string | null;
  subscription_provider_plan_id?: string | null;
  subscription_provider_subscription_id?: string | null;
  subscription_provider_payment_intent_id?: string | null;
  settings?: unknown;
  account_status?: "active" | "suspended" | null;
  suspension_reason?: string | null;
  suspended_at?: string | null;
};

export type ProfileRecord = {
  id: string;
  org_id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
};

export type StoreRecord = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
};

export type EmployeeRecord = {
  id: string;
  org_id: string;
  role: string;
  is_active: boolean;
  employee_code?: string | null;
  full_name?: string | null;
  profile_id?: string | null;
  store_id?: string | null;
};

export type SupportCaseRecord = {
  id: string;
  org_id: string;
  created_by: string;
  subject: string;
  description: string;
  priority: "normal" | "urgent";
  status: "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
  first_response_due_at: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type PlatformAuditRecord = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

export type PlatformReferralRecord = ReferralRecord & {
  referrerOrganizationName: string | null;
  referredOrganizationName: string | null;
  reward: ReferralRewardRecord | null;
};

export type PlatformOrganizationDetail = {
  organization: OrganizationRecord;
  profiles: ProfileRecord[];
  stores: StoreRecord[];
  employees: EmployeeRecord[];
  authEmailById: Map<string, string>;
  accessGrants: ComplimentaryAccessGrant[];
  accessGrantsSchemaAvailable: boolean;
  supportCases: SupportCaseRecord[];
  supportCasesSchemaAvailable: boolean;
  trialFeedback: TrialFeedbackRecord | null;
  trialFeedbackAvailable: boolean;
  auditLogs: PlatformAuditRecord[];
  referralCode: ReferralCodeRecord | null;
  referrals: PlatformReferralRecord[];
  referralsAvailable: boolean;
};

export type TrialFeedbackRecord = {
  org_id: string;
  submitted_by: string | null;
  reason: string;
  details: string;
  wants_discount: boolean;
  status: TrialFeedbackStatus;
  platform_notes: string;
  acted_at: string | null;
  acted_by: string | null;
  updated_at: string;
};

export type TrialFeedbackStorage = "table" | "table_legacy" | "settings" | "unavailable";

export type OrganizationsResult = {
  records: OrganizationRecord[];
  subscriptionFieldsAvailable: boolean;
  accountFieldsAvailable: boolean;
};

export type PlatformDirectory = {
  organizationsResult: OrganizationsResult;
  organizations: OrganizationRecord[];
  profiles: ProfileRecord[];
  stores: StoreRecord[];
  employees: EmployeeRecord[];
  authEmailById: Map<string, string>;
  trialFeedbackByOrg: Map<string, TrialFeedbackRecord>;
  trialFeedbackAvailable: boolean;
  trialFeedbackStorage: TrialFeedbackStorage;
  trialFeedbackWorkflowAvailable: boolean;
};

export async function readOrganizations(admin: PlatformAdminClient): Promise<OrganizationsResult> {
  const rich = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, account_status, suspension_reason, suspended_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!rich.error) {
    return {
      records: (rich.data ?? []) as OrganizationRecord[],
      subscriptionFieldsAvailable: true,
      accountFieldsAvailable: true,
    };
  }

  const legacy = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!legacy.error) {
    return {
      records: (legacy.data ?? []) as OrganizationRecord[],
      subscriptionFieldsAvailable: true,
      accountFieldsAvailable: true,
    };
  }

  const basic = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings")
    .order("created_at", { ascending: false })
    .limit(1000);

  return {
    records: (basic.data ?? []) as OrganizationRecord[],
    subscriptionFieldsAvailable: false,
    accountFieldsAvailable: false,
  };
}

export async function readPlatformDirectory(admin: PlatformAdminClient): Promise<PlatformDirectory> {
  const [organizationsResult, profilesResult, storesResult, employeesResult, authUsersResult] = await Promise.all([
    readOrganizations(admin),
    admin.from("profiles").select("id, org_id, full_name, role, is_active").limit(10000),
    admin.from("stores").select("id, org_id, name, is_active").limit(10000),
    admin.from("employee_records").select("id, org_id, role, is_active").limit(10000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const stores = (storesResult.data ?? []) as StoreRecord[];
  const employees = (employeesResult.data ?? []) as EmployeeRecord[];
  const authUsers = authUsersResult.data?.users ?? [];
  const organizations = organizationsResult.records;
  const richFeedbackResult = await admin
    .from("trial_feedback")
    .select("org_id, submitted_by, reason, details, wants_discount, status, platform_notes, acted_at, acted_by, updated_at")
    .order("updated_at", { ascending: false })
    .limit(10000);
  let trialFeedback: TrialFeedbackRecord[] = [];
  let trialFeedbackStorage: TrialFeedbackStorage = "unavailable";
  let trialFeedbackWorkflowAvailable = false;

  if (!richFeedbackResult.error) {
    trialFeedback = (richFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
    trialFeedbackStorage = "table";
    trialFeedbackWorkflowAvailable = true;
  } else {
    const legacyFeedbackResult = await admin
      .from("trial_feedback")
      .select("org_id, submitted_by, reason, details, wants_discount, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000);

    if (!legacyFeedbackResult.error) {
      trialFeedback = (legacyFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
      trialFeedbackStorage = "table_legacy";
    } else {
      trialFeedback = organizations
        .map((organization) => readSettingsTrialFeedback(organization))
        .filter((feedback): feedback is TrialFeedbackRecord => feedback !== null);
      trialFeedbackStorage = "settings";
      trialFeedbackWorkflowAvailable = true;
    }
  }

  return {
    organizationsResult,
    organizations: organizationsResult.records,
    profiles,
    stores,
    employees,
    authEmailById: new Map(authUsers.map((authUser) => [authUser.id, authUser.email ?? ""])),
    trialFeedbackByOrg: new Map(trialFeedback.map((feedback) => [feedback.org_id, feedback])),
    trialFeedbackAvailable: true,
    trialFeedbackStorage,
    trialFeedbackWorkflowAvailable,
  };
}

export async function readPlatformOrganizationDetail(admin: PlatformAdminClient, organizationId: string): Promise<PlatformOrganizationDetail | null> {
  const organizationResult = await readOrganizationDetailRecord(admin, organizationId);
  if (!organizationResult) return null;

  const [profilesResult, storesResult, employeesResult, authUsersResult, grantsResult, supportResult, feedbackResult, auditResult, referralCodeResult, referralsAsReferrerResult, referralsAsReferredResult, referralRewardsResult] = await Promise.all([
    admin.from("profiles").select("id, org_id, full_name, role, is_active, store_id").eq("org_id", organizationId).order("full_name"),
    admin.from("stores").select("id, org_id, name, is_active").eq("org_id", organizationId).order("name"),
    admin.from("employee_records").select("id, org_id, employee_code, full_name, role, is_active, profile_id, store_id").eq("org_id", organizationId).order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    readOrganizationAccessGrants(admin, organizationId),
    admin.from("support_cases").select("id, org_id, created_by, subject, description, priority, status, first_response_due_at, created_at, updated_at, resolved_at").eq("org_id", organizationId).order("created_at", { ascending: false }),
    readOrganizationTrialFeedback(admin, organizationId),
    admin.from("audit_logs").select("id, action, entity, entity_id, before, after, created_at").eq("org_id", organizationId).order("created_at", { ascending: false }).limit(100),
    admin.from("platform_referral_codes").select("id, code, referrer_org_id, referrer_profile_id, is_active, created_at, updated_at").eq("referrer_org_id", organizationId).eq("is_active", true).limit(1).maybeSingle(),
    admin.from("platform_referrals").select("id, referral_code_id, referrer_org_id, referrer_profile_id, referred_user_id, referred_profile_id, referred_org_id, status, captured_at, qualified_at, rewarded_at, reward_grant_id, rejection_reason, created_at, updated_at").eq("referrer_org_id", organizationId).order("created_at", { ascending: false }).limit(1000),
    admin.from("platform_referrals").select("id, referral_code_id, referrer_org_id, referrer_profile_id, referred_user_id, referred_profile_id, referred_org_id, status, captured_at, qualified_at, rewarded_at, reward_grant_id, rejection_reason, created_at, updated_at").eq("referred_org_id", organizationId).order("created_at", { ascending: false }).limit(1000),
    admin.from("platform_referral_reward_ledger").select("id, referral_id, referrer_org_id, grant_id, reward_type, reward_days, status, issued_at, revoked_at, metadata").eq("referrer_org_id", organizationId).order("issued_at", { ascending: false }).limit(1000),
  ]);

  const supportCases = !supportResult.error ? (supportResult.data ?? []) as SupportCaseRecord[] : [];
  const auditLogs = !auditResult.error ? (auditResult.data ?? []) as PlatformAuditRecord[] : [];
  const authUsers = authUsersResult.data?.users ?? [];
  const referrals = [
    ...(referralsAsReferrerResult.data ?? []).map((row) => normalizeReferralRecord(row)),
    ...(referralsAsReferredResult.data ?? []).map((row) => normalizeReferralRecord(row)),
  ];
  const rewards = (referralRewardsResult.data ?? []).map((row) => normalizeReferralRewardRecord(row));
  const relatedOrganizationIds = [...new Set(referrals.flatMap((referral) => [referral.referrer_org_id, referral.referred_org_id]).filter((id) => id && id !== organizationId))];
  const relatedOrganizationsResult = relatedOrganizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", relatedOrganizationIds)
    : null;
  const organizationNames = new Map<string, string>([[organizationResult.id, organizationResult.name]]);
  for (const relatedOrganization of relatedOrganizationsResult?.data ?? []) organizationNames.set(String(relatedOrganization.id), String(relatedOrganization.name ?? "Unnamed organization"));
  const rewardByReferralId = new Map(rewards.map((reward) => [reward.referral_id, reward]));
  const referralHistory = referrals.map<PlatformReferralRecord>((referral) => ({
    ...referral,
    referrerOrganizationName: organizationNames.get(referral.referrer_org_id) ?? null,
    referredOrganizationName: organizationNames.get(referral.referred_org_id) ?? null,
    reward: rewardByReferralId.get(referral.id) ?? null,
  }));
  const referralsAvailable = !referralCodeResult.error && !referralsAsReferrerResult.error && !referralsAsReferredResult.error && !referralRewardsResult.error;

  return {
    organization: organizationResult,
    profiles: (profilesResult.data ?? []) as ProfileRecord[],
    stores: (storesResult.data ?? []) as StoreRecord[],
    employees: (employeesResult.data ?? []) as EmployeeRecord[],
    authEmailById: new Map(authUsers.map((authUser) => [authUser.id, authUser.email ?? ""])),
    accessGrants: grantsResult.records,
    accessGrantsSchemaAvailable: grantsResult.schemaAvailable,
    supportCases,
    supportCasesSchemaAvailable: !supportResult.error,
    trialFeedback: feedbackResult.record,
    trialFeedbackAvailable: feedbackResult.available,
    auditLogs,
    referralCode: referralCodeResult.data ? normalizeReferralCodeRecord(referralCodeResult.data) : null,
    referrals: referralHistory,
    referralsAvailable,
  };
}

async function readOrganizationDetailRecord(admin: PlatformAdminClient, organizationId: string): Promise<OrganizationRecord | null> {
  const rich = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, account_status, suspension_reason, suspended_at")
    .eq("id", organizationId)
    .maybeSingle();

  if (!rich.error && rich.data) return rich.data as OrganizationRecord;

  const legacy = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at")
    .eq("id", organizationId)
    .maybeSingle();

  if (!legacy.error && legacy.data) return legacy.data as OrganizationRecord;

  const basic = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings")
    .eq("id", organizationId)
    .maybeSingle();

  return !basic.error && basic.data ? basic.data as OrganizationRecord : null;
}

async function readOrganizationTrialFeedback(admin: PlatformAdminClient, organizationId: string): Promise<{ record: TrialFeedbackRecord | null; available: boolean }> {
  const rich = await admin
    .from("trial_feedback")
    .select("org_id, submitted_by, reason, details, wants_discount, status, platform_notes, acted_at, acted_by, updated_at")
    .eq("org_id", organizationId)
    .maybeSingle();

  if (!rich.error) {
    return { record: rich.data ? normalizeTrialFeedbackRecord(rich.data) : null, available: true };
  }

  const legacy = await admin
    .from("trial_feedback")
    .select("org_id, submitted_by, reason, details, wants_discount, updated_at")
    .eq("org_id", organizationId)
    .maybeSingle();

  if (!legacy.error) {
    return { record: legacy.data ? normalizeTrialFeedbackRecord(legacy.data) : null, available: true };
  }

  return { record: null, available: false };
}

function normalizeTrialFeedbackRecord(value: Partial<TrialFeedbackRecord> & Record<string, unknown>): TrialFeedbackRecord {
  return {
    org_id: typeof value.org_id === "string" ? value.org_id : "",
    submitted_by: typeof value.submitted_by === "string" ? value.submitted_by : null,
    reason: typeof value.reason === "string" ? value.reason : "other",
    details: typeof value.details === "string" ? value.details : "",
    wants_discount: value.wants_discount === true,
    status: normalizeTrialFeedbackStatus(value.status),
    platform_notes: typeof value.platform_notes === "string" ? value.platform_notes : "",
    acted_at: typeof value.acted_at === "string" ? value.acted_at : null,
    acted_by: typeof value.acted_by === "string" ? value.acted_by : null,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : new Date(0).toISOString(),
  };
}

function readSettingsTrialFeedback(organization: OrganizationRecord): TrialFeedbackRecord | null {
  const settings = isRecord(organization.settings) ? organization.settings : null;
  const value = settings && isRecord(settings.trial_retention_feedback) ? settings.trial_retention_feedback : null;
  if (!value || typeof value.reason !== "string" || !value.reason) return null;

  return normalizeTrialFeedbackRecord({
    org_id: organization.id,
    submitted_by: typeof value.submittedBy === "string" ? value.submittedBy : null,
    reason: value.reason,
    details: typeof value.details === "string" ? value.details : "",
    wants_discount: value.wantsDiscount === true,
    status: normalizeTrialFeedbackStatus(value.status),
    platform_notes: typeof value.platformNotes === "string" ? value.platformNotes : "",
    acted_at: typeof value.actedAt === "string" ? value.actedAt : null,
    acted_by: typeof value.actedBy === "string" ? value.actedBy : null,
    updated_at: typeof value.updatedAt === "string" ? value.updatedAt : organization.created_at,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function countByOrg<T extends { org_id: string }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  return counts;
}

export function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

export function getInitials(value: string | null | undefined) {
  const parts = (value ?? "Platform admin").split(/[@.\s_-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "PA";
}

export function humanizeRole(role: string) {
  return role
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
