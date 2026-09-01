import { createAdminClient } from "@/lib/employee-auth";
import { readAllPlatformAccessGrants, readOrganizationAccessGrants } from "@/lib/platform-access-server";
import type { ComplimentaryAccessGrant } from "@/lib/platform-access";
import { readAllPlatformTrialExtensions, readOrganizationTrialExtensions } from "@/lib/platform-trial-server";
import type { TrialExtensionRecord } from "@/lib/platform-trial";
import {
  normalizeReferralCodeRecord,
  normalizeReferralRecord,
  normalizeReferralRewardRecord,
  type ReferralCodeRecord,
  type ReferralRecord,
  type ReferralRewardRecord,
} from "@/lib/referrals";
import { normalizeTrialFeedbackStatus, type TrialFeedbackStatus } from "@/lib/trial";
import {
  PLATFORM_FLEET_HEALTH_WINDOWS,
  summarizePlatformFleetHealth,
  type PlatformFleetHealthOrganization,
  type PlatformFleetHealthSample,
  type PlatformFleetHealthSummaries,
} from "@/lib/platform-fleet-health";
import {
  PLATFORM_SYNC_HEALTH_QUEUES,
  summarizePlatformSyncHealth,
  type PlatformSyncHealthOrganization,
  type PlatformSyncHealthSample,
  type PlatformSyncHealthStore,
  type PlatformSyncHealthSummary,
} from "@/lib/platform-sync-health";
import type { PlatformAuditEvent } from "@/lib/platform-audit";

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
  subscription_entitled_branch_count?: number | null;
  subscription_pending_branch_count?: number | null;
  subscription_updated_at?: string | null;
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
  role: string | null;
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
  accessGrantAdjustmentSchemaAvailable: boolean;
  trialExtensions: TrialExtensionRecord[];
  trialExtensionsSchemaAvailable: boolean;
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

export type PlatformEntitlementRecords = {
  accessGrantsByOrg: Map<string, ComplimentaryAccessGrant[]>;
  trialExtensionsByOrg: Map<string, TrialExtensionRecord[]>;
  accessGrantsSchemaAvailable: boolean;
  accessGrantAdjustmentSchemaAvailable: boolean;
  trialExtensionsSchemaAvailable: boolean;
};

export type PlatformAuditResult = {
  events: PlatformAuditEvent[];
  schemaAvailable: boolean;
  operatorAuditSchemaAvailable: boolean;
  hasMore: boolean;
};

export type PlatformFleetHealthResult = {
  asOf: string;
  summaries: PlatformFleetHealthSummaries;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  hasMore: boolean;
};

export type PlatformSyncHealthResult = {
  summary: PlatformSyncHealthSummary;
  schemaAvailable: boolean;
  enhancedMetricsAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  hasMore: boolean;
};

const PLATFORM_AUDIT_LIMIT = 500;
const PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT = 10000;
const PLATFORM_SYNC_HEALTH_SAMPLE_LIMIT = 10000;

export async function readOrganizations(admin: PlatformAdminClient): Promise<OrganizationsResult> {
  const rich = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count, subscription_pending_branch_count, subscription_updated_at, account_status, suspension_reason, suspended_at")
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

export async function readPlatformEntitlementRecords(admin: PlatformAdminClient): Promise<PlatformEntitlementRecords> {
  const [grantsResult, trialExtensionsResult] = await Promise.all([
    readAllPlatformAccessGrants(admin),
    readAllPlatformTrialExtensions(admin),
  ]);
  const accessGrantsByOrg = new Map<string, ComplimentaryAccessGrant[]>();
  for (const grant of grantsResult.records) {
    const records = accessGrantsByOrg.get(grant.org_id) ?? [];
    records.push(grant);
    accessGrantsByOrg.set(grant.org_id, records);
  }
  const trialExtensionsByOrg = new Map<string, TrialExtensionRecord[]>();
  for (const extension of trialExtensionsResult.records) {
    const records = trialExtensionsByOrg.get(extension.org_id) ?? [];
    records.push(extension);
    trialExtensionsByOrg.set(extension.org_id, records);
  }
  return {
    accessGrantsByOrg,
    trialExtensionsByOrg,
    accessGrantsSchemaAvailable: grantsResult.schemaAvailable,
    accessGrantAdjustmentSchemaAvailable: grantsResult.adjustmentSchemaAvailable,
    trialExtensionsSchemaAvailable: trialExtensionsResult.schemaAvailable,
  };
}

export async function readPlatformAudit(admin: PlatformAdminClient): Promise<PlatformAuditResult> {
  const [organizationAuditResult, operatorAuditResult] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id, org_id, actor_id, action, entity, entity_id, before, after, created_at")
      .like("action", "platform.%")
      .order("created_at", { ascending: false })
      .limit(PLATFORM_AUDIT_LIMIT),
    admin
      .from("platform_operator_audit_logs")
      .select("id, operator_id, action, actor_id, actor_email, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(PLATFORM_AUDIT_LIMIT),
  ]);

  const organizationRows = !organizationAuditResult.error && Array.isArray(organizationAuditResult.data)
    ? organizationAuditResult.data
    : [];
  const operatorRows = !operatorAuditResult.error && Array.isArray(operatorAuditResult.data)
    ? operatorAuditResult.data
    : [];
  const organizationIds = [...new Set(organizationRows
    .map((row) => typeof row.org_id === "string" ? row.org_id : null)
    .filter((id): id is string => id !== null))];
  const organizationNamesResult = organizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", organizationIds)
    : null;
  const organizationNames = new Map<string, string>(
    (organizationNamesResult?.data ?? []).flatMap((row) => typeof row.id === "string"
      ? [[row.id, typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization"] as [string, string]]
      : []),
  );

  const organizationEvents = organizationRows.flatMap<PlatformAuditEvent>((row) => {
    if (typeof row.id !== "string" || typeof row.action !== "string" || typeof row.created_at !== "string") return [];
    const before = row.before;
    const after = row.after;
    return [{
      id: row.id,
      source: "organization",
      organizationId: typeof row.org_id === "string" ? row.org_id : null,
      organizationName: typeof row.org_id === "string" ? organizationNames.get(row.org_id) ?? null : null,
      action: row.action,
      entity: typeof row.entity === "string" ? row.entity : null,
      entityId: typeof row.entity_id === "string" ? row.entity_id : null,
      actorId: typeof row.actor_id === "string" ? row.actor_id : readAuditSnapshotString(after, "platform_actor_id") ?? readAuditSnapshotString(after, "operator_id") ?? readAuditSnapshotString(before, "platform_actor_id"),
      actorEmail: readAuditSnapshotString(after, "platform_actor_email") ?? readAuditSnapshotString(after, "actor_email") ?? readAuditSnapshotString(before, "platform_actor_email"),
      before,
      after,
      createdAt: row.created_at,
    }];
  });
  const operatorEvents = operatorRows.flatMap<PlatformAuditEvent>((row) => {
    if (typeof row.id !== "string" || typeof row.action !== "string" || typeof row.created_at !== "string") return [];
    return [{
      id: row.id,
      source: "operator",
      organizationId: null,
      organizationName: "Platform-wide",
      action: row.action,
      entity: "platform_operators",
      entityId: typeof row.operator_id === "string" ? row.operator_id : null,
      actorId: typeof row.actor_id === "string" ? row.actor_id : null,
      actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
      before: row.before,
      after: row.after,
      createdAt: row.created_at,
    }];
  });
  const events = [...organizationEvents, ...operatorEvents].sort((left, right) => {
    const rightTime = Date.parse(right.createdAt);
    const leftTime = Date.parse(left.createdAt);
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });

  return {
    events: events.slice(0, PLATFORM_AUDIT_LIMIT),
    schemaAvailable: !organizationAuditResult.error,
    operatorAuditSchemaAvailable: !operatorAuditResult.error,
    hasMore: events.length > PLATFORM_AUDIT_LIMIT,
  };
}

export async function readPlatformFleetHealth(admin: PlatformAdminClient, requestedAsOf = new Date().toISOString()): Promise<PlatformFleetHealthResult> {
  const parsedAsOf = Date.parse(requestedAsOf);
  const asOf = Number.isFinite(parsedAsOf) ? new Date(parsedAsOf).toISOString() : new Date().toISOString();
  const lookbackStart = new Date(Date.parse(asOf) - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [attributedSamplesResult, organizationsResult] = await Promise.all([
    admin
      .from("admin_performance_samples")
      .select("id, org_id, recorded_at, surface, interaction, mode, sample_type, duration_ms, error", { count: "exact" })
      .gte("recorded_at", lookbackStart)
      .lte("recorded_at", asOf)
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT),
    admin.from("organizations").select("id, name").order("name").limit(1000),
  ]);

  let rawSamples: unknown[] = Array.isArray(attributedSamplesResult.data) ? attributedSamplesResult.data : [];
  let sampleCount = attributedSamplesResult.count;
  let schemaAvailable = !attributedSamplesResult.error;
  if (attributedSamplesResult.error) {
    const legacySamplesResult = await admin
      .from("admin_performance_samples")
      .select("id, recorded_at, surface, interaction, mode, sample_type, duration_ms, error", { count: "exact" })
      .gte("recorded_at", lookbackStart)
      .lte("recorded_at", asOf)
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT);
    rawSamples = Array.isArray(legacySamplesResult.data) ? legacySamplesResult.data : [];
    sampleCount = legacySamplesResult.count;
    schemaAvailable = false;
  }

  const samples = rawSamples.flatMap((row) => normalizePlatformFleetSample(row));
  const organizations = (Array.isArray(organizationsResult.data) ? organizationsResult.data : []).flatMap((row): PlatformFleetHealthOrganization[] => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    return [{ id: row.id, name: typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization" }];
  });
  const summaries = Object.fromEntries(PLATFORM_FLEET_HEALTH_WINDOWS.map((window) => [
    window,
    summarizePlatformFleetHealth(samples, organizations, window, asOf),
  ])) as PlatformFleetHealthSummaries;

  return {
    asOf,
    summaries,
    schemaAvailable,
    organizationsAvailable: !organizationsResult.error,
    hasMore: (sampleCount ?? rawSamples.length) > rawSamples.length,
  };
}

export async function readPlatformSyncHealth(admin: PlatformAdminClient, requestedAsOf = new Date().toISOString()): Promise<PlatformSyncHealthResult> {
  const parsedAsOf = Date.parse(requestedAsOf);
  const asOf = Number.isFinite(parsedAsOf) ? new Date(parsedAsOf).toISOString() : new Date().toISOString();
  const [richSamplesResult, organizationsResult, storesResult] = await Promise.all([
    admin
      .from("admin_sync_health_snapshots")
      .select("id, recorded_at, org_id, store_id, device_key, queue, pending_count, failed_count, conflict_count, stuck_count, oldest_pending_at, last_successful_sync_at, online", { count: "exact" })
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_SYNC_HEALTH_SAMPLE_LIMIT),
    admin.from("organizations").select("id, name").order("name").limit(1000),
    admin.from("stores").select("id, org_id, name, is_active").order("name").limit(10000),
  ]);

  let samplesResult: { data: unknown[] | null; count: number | null; error: unknown } = richSamplesResult;
  let enhancedMetricsAvailable = !richSamplesResult.error;
  if (richSamplesResult.error) {
    // 0080 can be deployed before the additive 0081 metrics. Keep the
    // read-only page useful during that rollout, while the UI labels the
    // missing exact stuck depth and success marker explicitly.
    samplesResult = await admin
      .from("admin_sync_health_snapshots")
      .select("id, recorded_at, org_id, store_id, device_key, queue, pending_count, failed_count, conflict_count, oldest_pending_at, online", { count: "exact" })
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_SYNC_HEALTH_SAMPLE_LIMIT);
    enhancedMetricsAvailable = false;
  }
  const rawSamples = Array.isArray(samplesResult.data) ? samplesResult.data : [];
  const samples = rawSamples.flatMap((row) => normalizePlatformSyncSample(row));
  const organizations = (Array.isArray(organizationsResult.data) ? organizationsResult.data : []).flatMap((row): PlatformSyncHealthOrganization[] => {
    if (!isRecord(row) || typeof row.id !== "string") return [];
    return [{ id: row.id, name: typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization" }];
  });
  const stores = (Array.isArray(storesResult.data) ? storesResult.data : []).flatMap((row): PlatformSyncHealthStore[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string") return [];
    return [{
      id: row.id,
      organizationId: row.org_id,
      name: typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed branch",
      isActive: row.is_active !== false,
    }];
  });

  return {
    summary: summarizePlatformSyncHealth(samples, organizations, stores, asOf),
    schemaAvailable: !samplesResult.error,
    enhancedMetricsAvailable,
    organizationsAvailable: !organizationsResult.error,
    storesAvailable: !storesResult.error,
    hasMore: (samplesResult.count ?? rawSamples.length) > rawSamples.length,
  };
}

export async function readPlatformOrganizationDetail(admin: PlatformAdminClient, organizationId: string): Promise<PlatformOrganizationDetail | null> {
  const organizationResult = await readOrganizationDetailRecord(admin, organizationId);
  if (!organizationResult) return null;

  const [profilesResult, storesResult, employeesResult, authUsersResult, grantsResult, trialExtensionsResult, supportResult, feedbackResult, auditResult, referralCodeResult, referralsAsReferrerResult, referralsAsReferredResult, referralRewardsResult] = await Promise.all([
    admin.from("profiles").select("id, org_id, full_name, role, is_active, store_id").eq("org_id", organizationId).order("full_name"),
    admin.from("stores").select("id, org_id, name, is_active").eq("org_id", organizationId).order("name"),
    admin.from("employee_records").select("id, org_id, employee_code, full_name, role, is_active, profile_id, store_id").eq("org_id", organizationId).order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    readOrganizationAccessGrants(admin, organizationId),
    readOrganizationTrialExtensions(admin, organizationId),
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
    accessGrantAdjustmentSchemaAvailable: grantsResult.adjustmentSchemaAvailable,
    trialExtensions: trialExtensionsResult.records,
    trialExtensionsSchemaAvailable: trialExtensionsResult.schemaAvailable,
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
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count, subscription_pending_branch_count, subscription_updated_at, account_status, suspension_reason, suspended_at")
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

function normalizePlatformFleetSample(value: unknown): PlatformFleetHealthSample[] {
  if (!isRecord(value) || typeof value.recorded_at !== "string" || typeof value.surface !== "string" || typeof value.interaction !== "string" || typeof value.mode !== "string" || typeof value.sample_type !== "string" || typeof value.duration_ms !== "number" || !Number.isFinite(value.duration_ms) || typeof value.error !== "boolean") return [];
  return [{
    organizationId: typeof value.org_id === "string" ? value.org_id : null,
    organizationName: null,
    surface: value.surface,
    interaction: value.interaction,
    mode: value.mode,
    sampleType: value.sample_type,
    durationMs: value.duration_ms,
    error: value.error,
    recordedAt: value.recorded_at,
  }];
}

function normalizePlatformSyncSample(value: unknown): PlatformSyncHealthSample[] {
  if (!isRecord(value)
    || typeof value.recorded_at !== "string"
    || typeof value.org_id !== "string"
    || typeof value.store_id !== "string"
    || typeof value.device_key !== "string"
    || typeof value.queue !== "string"
    || !PLATFORM_SYNC_HEALTH_QUEUES.includes(value.queue as PlatformSyncHealthSample["queue"])
    || typeof value.pending_count !== "number"
    || !Number.isInteger(value.pending_count)
    || typeof value.failed_count !== "number"
    || !Number.isInteger(value.failed_count)
    || typeof value.conflict_count !== "number"
    || !Number.isInteger(value.conflict_count)
    || (value.oldest_pending_at !== null && typeof value.oldest_pending_at !== "string")
    || typeof value.online !== "boolean") return [];
  const stuckCount = value.stuck_count === undefined ? 0 : value.stuck_count;
  if (typeof stuckCount !== "number" || !Number.isInteger(stuckCount) || stuckCount < 0 || stuckCount > value.pending_count) return [];
  const recordedAtMs = Date.parse(value.recorded_at);
  const successAt = value.last_successful_sync_at;
  const successAtMs = typeof successAt === "string" ? Date.parse(successAt) : null;
  const lastSuccessfulSyncAt = typeof successAt === "string" && successAtMs !== null && Number.isFinite(successAtMs) && Number.isFinite(recordedAtMs) && successAtMs <= recordedAtMs ? successAt : null;
  return [{
    queue: value.queue as PlatformSyncHealthSample["queue"],
    pendingCount: value.pending_count,
    failedCount: value.failed_count,
    conflictCount: value.conflict_count,
    stuckCount,
    oldestPendingAt: value.pending_count > 0 ? value.oldest_pending_at : null,
    lastSuccessfulSyncAt,
    organizationId: value.org_id,
    storeId: value.store_id,
    deviceKey: value.device_key,
    online: value.online,
    recordedAt: value.recorded_at,
  }];
}

function readAuditSnapshotString(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  return typeof value[key] === "string" && value[key].trim() ? value[key] : null;
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

export function humanizeRole(role: string | null | undefined) {
  return (role ?? "none")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
