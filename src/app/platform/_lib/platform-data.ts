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
import {
  PLATFORM_AUDIT_DATE_FILTERS,
  PLATFORM_AUDIT_SOURCE_FILTERS,
  type PlatformAuditDateFilter,
  type PlatformAuditEvent,
  type PlatformAuditSourceFilter,
} from "@/lib/platform-audit";
import {
  summarizePlatformSchemaBackfill,
  summarizePlatformSchemaDrift,
  type PlatformSchemaBackfillRow,
  type PlatformSchemaDriftSummary,
  type PlatformSchemaMigration,
} from "@/lib/platform-schema-drift";
import { PLATFORM_SCHEMA_MANIFEST } from "@/lib/platform-schema-manifest";
import { summarizePlatformDevices, type PlatformRegisteredDevice } from "@/lib/platform-devices";
import { normalizePlatformSearchQuery } from "@/lib/platform-search";
import {
  PLATFORM_ATTENTION_CATEGORIES,
  PLATFORM_ATTENTION_SEVERITIES,
  PLATFORM_ATTENTION_STATES,
  type PlatformAttentionCategory,
  type PlatformAttentionOccurrence,
  type PlatformAttentionSeverity,
  type PlatformAttentionState,
} from "@/lib/platform-attention";

export type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PlatformSearchResultKind = "organization" | "profile" | "support_case";

export type PlatformSearchResult = {
  id: string;
  kind: PlatformSearchResultKind;
  title: string;
  detail: string;
  meta: string;
  href: string;
};

export type PlatformSearchResultSet = {
  query: string;
  results: PlatformSearchResult[];
  organizationsAvailable: boolean;
  profilesAvailable: boolean;
  supportCasesAvailable: boolean;
  hasMore: boolean;
};

export type PlatformBillingEventMetadata = {
  id: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  processedAt: string | null;
  receivedAt: string;
};

export type PlatformBillingEventResult = {
  query: string;
  status: "all" | "processed" | "unprocessed";
  records: PlatformBillingEventMetadata[];
  schemaAvailable: boolean;
  hasMore: boolean;
  asOf: string;
};

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
  platform_account_version?: number | null;
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
  version?: number;
  assigned_to?: string | null;
  assigned_at?: string | null;
  policy_version?: number | null;
  first_response_at?: string | null;
  first_response_by?: string | null;
  resolution_reason?: string | null;
  notes?: SupportCaseNoteRecord[];
  events?: SupportCaseEventRecord[];
};

export type SupportCaseNoteRecord = {
  id: string;
  case_id: string;
  author_id: string | null;
  author_email: string | null;
  note_type: "internal" | "operator_response";
  body: string;
  created_at: string;
};

export type SupportCaseEventRecord = {
  id: string;
  case_id: string;
  event_type: "opened" | "status_changed" | "assigned" | "unassigned" | "note_added" | "first_response_recorded";
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_email: string | null;
  reason: string | null;
  metadata: unknown;
  created_at: string;
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
  total: number | null;
  hasMore: boolean;
  asOf: string;
};

export type PlatformDirectoryPage = {
  organizationsResult: OrganizationsResult & {
    page: number;
    pageSize: number;
    query: string;
  };
  organizations: OrganizationRecord[];
  profiles: ProfileRecord[];
  stores: StoreRecord[];
  employees: EmployeeRecord[];
  authEmailById: Map<string, string>;
  relatedRecordsAvailable: boolean;
  relatedRecordsComplete: boolean;
  trialFeedbackByOrg: Map<string, TrialFeedbackRecord>;
  trialFeedbackAvailable: boolean;
  trialFeedbackComplete: boolean;
  trialFeedbackStorage: TrialFeedbackStorage;
  trialFeedbackWorkflowAvailable: boolean;
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
  trialFeedbackComplete: boolean;
  trialFeedbackStorage: TrialFeedbackStorage;
  trialFeedbackWorkflowAvailable: boolean;
};

export type PlatformHomeSummary = {
  asOf: string;
  totalBusinesses: number | null;
  activeSubscriptions: number | null;
  trialSubscriptions: number | null;
  suspendedAccounts: number | null;
  totalProfiles: number | null;
  totalStores: number | null;
  activeStores: number | null;
  totalEmployees: number | null;
  activeEmployees: number | null;
  organizationsAvailable: boolean;
  subscriptionFieldsAvailable: boolean;
  accountFieldsAvailable: boolean;
  profilesAvailable: boolean;
  storesAvailable: boolean;
  employeesAvailable: boolean;
};

export type PlatformEntitlementRecords = {
  accessGrantsByOrg: Map<string, ComplimentaryAccessGrant[]>;
  trialExtensionsByOrg: Map<string, TrialExtensionRecord[]>;
  accessGrantsSchemaAvailable: boolean;
  accessGrantAdjustmentSchemaAvailable: boolean;
  trialExtensionsSchemaAvailable: boolean;
  hasMore: boolean;
};

export type PlatformSupportCaseResult = {
  records: Array<SupportCaseRecord & { organizationName: string }>;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  hasMore: boolean;
  total: number | null;
  asOf: string;
};

export type PlatformSupportQueueStatus = "active" | "all" | SupportCaseRecord["status"];
export type PlatformSupportQueuePriority = "all" | SupportCaseRecord["priority"];
export type PlatformSupportQueueResult = {
  records: Array<SupportCaseRecord & { organizationName: string }>;
  query: string;
  status: PlatformSupportQueueStatus;
  priority: PlatformSupportQueuePriority;
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  asOf: string;
};

export type PlatformAttentionStateFilter = "active" | "all" | PlatformAttentionState;
export type PlatformAttentionPage = {
  records: PlatformAttentionOccurrence[];
  query: string;
  category: "all" | PlatformAttentionCategory;
  severity: "all" | PlatformAttentionSeverity;
  state: PlatformAttentionStateFilter;
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  operatorsAvailable: boolean;
  asOf: string;
};

export type PlatformAuditResult = {
  events: PlatformAuditEvent[];
  schemaAvailable: boolean;
  operatorAuditSchemaAvailable: boolean;
  announcementAuditSchemaAvailable: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  asOf: string;
  filters: PlatformAuditPageFilters;
};

export type PlatformAuditPageFilters = {
  search: string;
  source: PlatformAuditSourceFilter;
  action: string;
  organizationId: string;
  dateRange: PlatformAuditDateFilter;
  asOf: string;
};

export type PlatformFleetHealthResult = {
  asOf: string;
  summaries: PlatformFleetHealthSummaries;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  hasMore: boolean;
  timingMetricsAvailable: boolean;
};

export type PlatformSchemaDriftResult = {
  asOf: string;
  summary: PlatformSchemaDriftSummary;
  backfill: PlatformSchemaBackfillRow[];
  ledgerReadable: boolean;
  backfillAvailable: boolean;
};

export type PlatformSyncHealthResult = {
  summary: PlatformSyncHealthSummary;
  schemaAvailable: boolean;
  enhancedMetricsAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  hasMore: boolean;
};

const PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT = 10000;
const PLATFORM_SYNC_HEALTH_SAMPLE_LIMIT = 10000;

export async function readOrganizations(admin: PlatformAdminClient): Promise<OrganizationsResult> {
  const asOf = new Date().toISOString();
  const rich = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count, subscription_pending_branch_count, subscription_updated_at, account_status, suspension_reason, suspended_at, platform_account_version", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!rich.error) {
    const records = (rich.data ?? []) as OrganizationRecord[];
    return {
      records,
      subscriptionFieldsAvailable: true,
      accountFieldsAvailable: true,
      total: typeof rich.count === "number" ? rich.count : null,
      hasMore: typeof rich.count === "number" ? rich.count > records.length : records.length === 1000,
      asOf,
    };
  }

  const legacy = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at, platform_account_version", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!legacy.error) {
    const records = (legacy.data ?? []) as OrganizationRecord[];
    return {
      records,
      subscriptionFieldsAvailable: true,
      accountFieldsAvailable: true,
      total: typeof legacy.count === "number" ? legacy.count : null,
      hasMore: typeof legacy.count === "number" ? legacy.count > records.length : records.length === 1000,
      asOf,
    };
  }

  const basic = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1000);
  const records = (basic.data ?? []) as OrganizationRecord[];

  return {
    records,
    subscriptionFieldsAvailable: false,
    accountFieldsAvailable: false,
    total: typeof basic.count === "number" ? basic.count : null,
    hasMore: typeof basic.count === "number" ? basic.count > records.length : records.length === 1000,
    asOf,
  };
}

/**
 * Read only aggregate counts for the Home summary. These head/count queries
 * keep the command center truthful without loading every organization, branch,
 * profile, or employee row into the request.
 */
export async function readPlatformHomeSummary(admin: PlatformAdminClient): Promise<PlatformHomeSummary> {
  const asOf = new Date().toISOString();
  const [organizations, activeSubscriptions, trialSubscriptions, suspendedAccounts, profiles, stores, activeStores, employees, activeEmployees] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("subscription_status", "trialing"),
    admin.from("organizations").select("id", { count: "exact", head: true }).eq("account_status", "suspended"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("stores").select("id", { count: "exact", head: true }),
    admin.from("stores").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("employee_records").select("id", { count: "exact", head: true }),
    admin.from("employee_records").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  const count = (result: { count: number | null; error: unknown }) => result.error ? null : typeof result.count === "number" ? result.count : null;

  return {
    asOf,
    totalBusinesses: count(organizations),
    activeSubscriptions: count(activeSubscriptions),
    trialSubscriptions: count(trialSubscriptions),
    suspendedAccounts: count(suspendedAccounts),
    totalProfiles: count(profiles),
    totalStores: count(stores),
    activeStores: count(activeStores),
    totalEmployees: count(employees),
    activeEmployees: count(activeEmployees),
    organizationsAvailable: !organizations.error,
    subscriptionFieldsAvailable: !activeSubscriptions.error && !trialSubscriptions.error,
    accountFieldsAvailable: !suspendedAccounts.error,
    profilesAvailable: !profiles.error,
    storesAvailable: !stores.error && !activeStores.error,
    employeesAvailable: !employees.error && !activeEmployees.error,
  };
}

/**
 * Bounded organization directory read. The page owns the cursor and search
 * state; related rows are fetched only for the organizations visible on that
 * page. This is intentionally separate from the legacy all-directory reader
 * so the remaining profile view can migrate without changing other screens.
 */
export async function readPlatformDirectoryPage(
  admin: PlatformAdminClient,
  rawQuery: string | null | undefined,
  rawPage: string | number | null | undefined,
  options: { includeTrialFeedback?: boolean } = {},
): Promise<PlatformDirectoryPage> {
  const asOf = new Date().toISOString();
  const query = normalizePlatformSearchQuery(typeof rawQuery === "string" ? rawQuery : null);
  const pageSize = 50;
  const parsedPage = typeof rawPage === "number" ? rawPage : Number.parseInt(typeof rawPage === "string" ? rawPage : "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(Math.trunc(parsedPage), 1), 10_000) : 1;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchPattern = `%${escapePostgrestLikePattern(query)}%`;
  const buildOrganizationQuery = (fields: string) => {
    let request = admin
      .from("organizations")
      .select(fields, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (query) {
      if (isUuid(query)) request = request.eq("id", query);
      else request = request.ilike("name", searchPattern);
    }
    return request.range(from, to);
  };

  let organizationsResult = await buildOrganizationQuery("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count, subscription_pending_branch_count, subscription_updated_at, account_status, suspension_reason, suspended_at");
  let subscriptionFieldsAvailable = !organizationsResult.error;
  let accountFieldsAvailable = !organizationsResult.error;
  if (organizationsResult.error) {
    organizationsResult = await buildOrganizationQuery("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at");
    subscriptionFieldsAvailable = !organizationsResult.error;
    accountFieldsAvailable = !organizationsResult.error;
  }
  if (organizationsResult.error) {
    organizationsResult = await buildOrganizationQuery("id, name, created_at, owner_profile_id, settings");
    subscriptionFieldsAvailable = false;
    accountFieldsAvailable = false;
  }

  const organizations = (organizationsResult.data ?? []) as unknown as OrganizationRecord[];
  const organizationIds = organizations.map((organization) => organization.id).filter((id): id is string => typeof id === "string" && isUuid(id));
  const [profilesResult, storesResult, employeesResult] = await Promise.all([
    organizationIds.length > 0
      ? admin.from("profiles").select("id, org_id, full_name, role, is_active").in("org_id", organizationIds).order("full_name").limit(5000)
      : Promise.resolve({ data: [], error: null }),
    organizationIds.length > 0
      ? admin.from("stores").select("id, org_id, name, is_active").in("org_id", organizationIds).order("name").limit(5000)
      : Promise.resolve({ data: [], error: null }),
    organizationIds.length > 0
      ? admin.from("employee_records").select("id, org_id, role, is_active").in("org_id", organizationIds).order("id").limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const stores = (storesResult.data ?? []) as StoreRecord[];
  const employees = (employeesResult.data ?? []) as EmployeeRecord[];
  const relatedRecordsAvailable = !profilesResult.error && !storesResult.error && !employeesResult.error;
  const relatedRecordsComplete = relatedRecordsAvailable && profiles.length < 5000 && stores.length < 5000 && employees.length < 5000;

  const authUsersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authEmailById = new Map((authUsersResult.data?.users ?? [])
    .filter((authUser) => typeof authUser.id === "string" && typeof authUser.email === "string" && authUser.email.length > 0)
    .map((authUser) => [authUser.id, authUser.email as string] as const));
  const total = typeof organizationsResult.count === "number" ? organizationsResult.count : null;
  let trialFeedback: TrialFeedbackRecord[] = [];
  let trialFeedbackStorage: TrialFeedbackStorage = "unavailable";
  let trialFeedbackWorkflowAvailable = false;
  let trialFeedbackAvailable = false;
  let trialFeedbackComplete = true;
  if (options.includeTrialFeedback && organizationIds.length > 0) {
    const richFeedbackResult = await admin
      .from("trial_feedback")
      .select("org_id, submitted_by, reason, details, wants_discount, status, platform_notes, acted_at, acted_by, updated_at")
      .in("org_id", organizationIds)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (!richFeedbackResult.error) {
      trialFeedback = (richFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
      trialFeedbackStorage = "table";
      trialFeedbackWorkflowAvailable = true;
      trialFeedbackAvailable = true;
      trialFeedbackComplete = richFeedbackResult.data?.length !== 5000;
    } else {
      const legacyFeedbackResult = await admin
        .from("trial_feedback")
        .select("org_id, submitted_by, reason, details, wants_discount, updated_at")
        .in("org_id", organizationIds)
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (!legacyFeedbackResult.error) {
        trialFeedback = (legacyFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
        trialFeedbackStorage = "table_legacy";
        trialFeedbackAvailable = true;
        trialFeedbackComplete = legacyFeedbackResult.data?.length !== 5000;
      } else {
        trialFeedback = organizations
          .map((organization) => readSettingsTrialFeedback(organization))
          .filter((feedback): feedback is TrialFeedbackRecord => feedback !== null);
        trialFeedbackStorage = "settings";
        trialFeedbackWorkflowAvailable = true;
        trialFeedbackAvailable = true;
      }
    }
  }

  return {
    organizationsResult: {
      records: organizations,
      subscriptionFieldsAvailable,
      accountFieldsAvailable,
      page,
      pageSize,
      total,
      hasMore: total === null ? organizations.length === pageSize : to + 1 < total,
      query,
      asOf,
    },
    organizations,
    profiles,
    stores,
    employees,
    authEmailById,
    relatedRecordsAvailable,
    relatedRecordsComplete,
    trialFeedbackByOrg: new Map(trialFeedback.map((feedback) => [feedback.org_id, feedback])),
    trialFeedbackAvailable,
    trialFeedbackComplete,
    trialFeedbackStorage,
    trialFeedbackWorkflowAvailable,
  };
}

/**
 * Search only the small amount of metadata needed to route an operator to an
 * account. This intentionally excludes authentication payloads, order data,
 * customer data, case descriptions, and provider payloads. The page supplies
 * the support permission so a billing/read-only operator never gets support
 * subjects through the global search path.
 */
export async function readPlatformSearch(
  admin: PlatformAdminClient,
  rawQuery: string | null | undefined,
  includeSupportCases: boolean,
): Promise<PlatformSearchResultSet> {
  const query = normalizePlatformSearchQuery(rawQuery);
  const empty: PlatformSearchResultSet = {
    query,
    results: [],
    organizationsAvailable: true,
    profilesAvailable: true,
    supportCasesAvailable: includeSupportCases,
    hasMore: false,
  };
  if (query.length < 2) return empty;

  const pattern = `%${escapePostgrestLikePattern(query)}%`;
  const [organizationsResult, profilesResult] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, subscription_status, account_status")
      .ilike("name", pattern)
      .order("name", { ascending: true })
      .limit(8),
    admin
      .from("profiles")
      .select("id, org_id, full_name, role, is_active")
      .ilike("full_name", pattern)
      .order("full_name", { ascending: true })
      .limit(8),
  ]);

  const supportCasesResult = includeSupportCases
    ? await admin
      .from("support_cases")
      .select("id, org_id, subject, status, priority, updated_at")
      .ilike("subject", pattern)
      .order("updated_at", { ascending: false })
      .limit(8)
    : null;

  const exactOrganizationResult = isUuid(query)
    ? await admin.from("organizations").select("id, name, subscription_status, account_status").eq("id", query).maybeSingle()
    : null;
  const exactProfileResult = isUuid(query)
    ? await admin.from("profiles").select("id, org_id, full_name, role, is_active").eq("id", query).maybeSingle()
    : null;
  const exactSupportCaseResult = includeSupportCases && isUuid(query)
    ? await admin.from("support_cases").select("id, org_id, subject, status, priority, updated_at").eq("id", query).maybeSingle()
    : null;

  const organizationRows = [
    ...(exactOrganizationResult?.data ? [exactOrganizationResult.data] : []),
    ...(organizationsResult.data ?? []),
  ] as Array<{ id: string; name: string | null; subscription_status: string | null; account_status: string | null }>;
  const profileRows = [
    ...(exactProfileResult?.data ? [exactProfileResult.data] : []),
    ...(profilesResult.data ?? []),
  ] as Array<{ id: string; org_id: string; full_name: string | null; role: string | null; is_active: boolean | null }>;
  const supportRows = [
    ...(exactSupportCaseResult?.data ? [exactSupportCaseResult.data] : []),
    ...(supportCasesResult?.data ?? []),
  ] as Array<{ id: string; org_id: string; subject: string | null; status: string | null; priority: string | null; updated_at: string | null }>;

  const relatedOrganizationIds = [...new Set([
    ...profileRows.map((row) => row.org_id),
    ...supportRows.map((row) => row.org_id),
  ].filter((id): id is string => typeof id === "string" && isUuid(id)))];
  const relatedOrganizationsResult = relatedOrganizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", relatedOrganizationIds)
    : null;
  const organizationNames = new Map<string, string>();
  for (const row of organizationRows) {
    if (typeof row.id === "string") organizationNames.set(row.id, readPlatformSearchName(row.name));
  }
  for (const row of relatedOrganizationsResult?.data ?? []) {
    if (typeof row.id === "string") organizationNames.set(row.id, readPlatformSearchName(row.name));
  }

  const results: PlatformSearchResult[] = [];
  const seen = new Set<string>();
  const add = (result: PlatformSearchResult) => {
    const key = `${result.kind}:${result.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(result);
  };

  for (const row of organizationRows) {
    if (typeof row.id !== "string") continue;
    const status = [row.subscription_status, row.account_status].filter((value): value is string => Boolean(value)).join(" · ");
    add({
      id: row.id,
      kind: "organization",
      title: readPlatformSearchName(row.name),
      detail: status || "Workspace account",
      meta: row.id,
      href: `/platform/organizations/${row.id}`,
    });
  }
  for (const row of profileRows) {
    if (typeof row.id !== "string" || typeof row.org_id !== "string") continue;
    add({
      id: row.id,
      kind: "profile",
      title: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : "Unnamed user",
      detail: `${row.role || "User"} · ${row.is_active === false ? "Inactive" : "Active"}`,
      meta: organizationNames.get(row.org_id) ?? "Workspace unavailable",
      href: `/platform/organizations/${row.org_id}`,
    });
  }
  for (const row of supportRows) {
    if (typeof row.id !== "string" || typeof row.org_id !== "string") continue;
    add({
      id: row.id,
      kind: "support_case",
      title: typeof row.subject === "string" && row.subject.trim() ? row.subject.trim() : "Untitled support case",
      detail: `${row.status || "Open"} · ${row.priority || "Normal"}`,
      meta: organizationNames.get(row.org_id) ?? "Workspace unavailable",
      href: `/platform/organizations/${row.org_id}`,
    });
  }

  return {
    query,
    results,
    organizationsAvailable: !organizationsResult.error,
    profilesAvailable: !profilesResult.error,
    supportCasesAvailable: includeSupportCases ? !supportCasesResult?.error : true,
    hasMore: (organizationsResult.data?.length ?? 0) >= 8
      || (profilesResult.data?.length ?? 0) >= 8
      || (supportCasesResult?.data?.length ?? 0) >= 8,
  };
}

/**
 * Read provider receipt metadata without exposing payment/customer payloads.
 * `processed_at` is deliberately presented as a handler marker; the current
 * schema does not prove that an account was reconciled successfully.
 */
export async function readPlatformBillingEvents(
  admin: PlatformAdminClient,
  rawQuery: string | null | undefined,
  rawStatus: string | null | undefined,
): Promise<PlatformBillingEventResult> {
  const query = normalizePlatformSearchQuery(rawQuery);
  const status = rawStatus === "processed" || rawStatus === "unprocessed" ? rawStatus : "all";
  const asOf = new Date().toISOString();
  const buildQuery = () => {
    let request = admin
      .from("billing_provider_events")
      .select("id, provider, provider_event_id, event_type, processed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (status === "processed") request = request.not("processed_at", "is", null);
    if (status === "unprocessed") request = request.is("processed_at", null);
    return request;
  };

  const eventTypeResult = query
    ? await buildQuery().ilike("event_type", `%${escapePostgrestLikePattern(query)}%`)
    : await buildQuery();
  const exactIdResult = query
    ? await buildQuery().eq("provider_event_id", query)
    : null;
  const eventTypeRows = Array.isArray(eventTypeResult.data) ? eventTypeResult.data : [];
  const exactIdRows = Array.isArray(exactIdResult?.data) ? exactIdResult.data : [];
  const records: PlatformBillingEventMetadata[] = [];
  const seen = new Set<string>();
  for (const row of [...exactIdRows, ...eventTypeRows]) {
    if (typeof row.id !== "string" || seen.has(row.id)) continue;
    seen.add(row.id);
    if (typeof row.provider_event_id !== "string" || typeof row.event_type !== "string" || typeof row.created_at !== "string") continue;
    records.push({
      id: row.id,
      provider: typeof row.provider === "string" && row.provider.trim() ? row.provider : "Unknown provider",
      providerEventId: row.provider_event_id,
      eventType: row.event_type,
      processedAt: typeof row.processed_at === "string" ? row.processed_at : null,
      receivedAt: row.created_at,
    });
  }
  records.sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
  return {
    query,
    status,
    records,
    schemaAvailable: !eventTypeResult.error && (exactIdResult ? !exactIdResult.error : true),
    hasMore: eventTypeRows.length >= 100 || exactIdRows.length >= 100,
    asOf,
  };
}

function escapePostgrestLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function readPlatformSearchName(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "Unnamed organization";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  let trialFeedbackComplete = true;

  if (!richFeedbackResult.error) {
    trialFeedback = (richFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
    trialFeedbackStorage = "table";
    trialFeedbackWorkflowAvailable = true;
    trialFeedbackComplete = richFeedbackResult.data?.length !== 10000;
  } else {
    const legacyFeedbackResult = await admin
      .from("trial_feedback")
      .select("org_id, submitted_by, reason, details, wants_discount, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000);

    if (!legacyFeedbackResult.error) {
      trialFeedback = (legacyFeedbackResult.data ?? []).map((feedback) => normalizeTrialFeedbackRecord(feedback));
      trialFeedbackStorage = "table_legacy";
      trialFeedbackComplete = legacyFeedbackResult.data?.length !== 10000;
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
    trialFeedbackComplete,
    trialFeedbackStorage,
    trialFeedbackWorkflowAvailable,
  };
}

/**
 * Read the bounded support metadata needed by the platform attention inbox.
 * The overview does not need case descriptions or tenant payloads, so keep
 * this query intentionally narrow and resolve organization names separately.
 */
export async function readPlatformSupportCases(admin: PlatformAdminClient): Promise<PlatformSupportCaseResult> {
  const asOf = new Date().toISOString();
  const limit = 250;
  const casesResult = await admin
    .from("support_cases")
    .select("id, org_id, created_by, subject, priority, status, first_response_due_at, created_at, updated_at, resolved_at, version, assigned_to, assigned_at, policy_version, first_response_at, first_response_by, resolution_reason", { count: "exact" })
    .in("status", ["open", "in_progress", "waiting_on_customer"])
    .order("first_response_due_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (casesResult.error) return { records: [], schemaAvailable: false, organizationsAvailable: true, hasMore: false, total: null, asOf };

  const rawData = Array.isArray(casesResult.data) ? casesResult.data : [];
  const rawRows = rawData.slice(0, limit);
  const organizationIds = [...new Set(rawRows
    .map((row) => isRecord(row) && typeof row.org_id === "string" ? row.org_id : null)
    .filter((id): id is string => id !== null))];
  const organizationsResult = organizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", organizationIds)
    : null;
  const names = new Map<string, string>();
  for (const row of organizationsResult?.data ?? []) {
    if (typeof row.id === "string") names.set(row.id, typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization");
  }
  const records = rawRows.flatMap((row): Array<SupportCaseRecord & { organizationName: string }> => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.subject !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return [];
    const priority = row.priority === "urgent" ? "urgent" : "normal";
    const status = row.status === "in_progress" || row.status === "waiting_on_customer" ? row.status : "open";
    return [{
      id: row.id,
      org_id: row.org_id,
      created_by: typeof row.created_by === "string" ? row.created_by : "",
      subject: row.subject,
      description: "",
      priority,
      status,
      first_response_due_at: typeof row.first_response_due_at === "string" ? row.first_response_due_at : row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
      version: typeof row.version === "number" ? row.version : 1,
      assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
      assigned_at: typeof row.assigned_at === "string" ? row.assigned_at : null,
      policy_version: typeof row.policy_version === "number" ? row.policy_version : null,
      first_response_at: typeof row.first_response_at === "string" ? row.first_response_at : null,
      first_response_by: typeof row.first_response_by === "string" ? row.first_response_by : null,
      resolution_reason: typeof row.resolution_reason === "string" ? row.resolution_reason : null,
      organizationName: names.get(row.org_id) ?? "Unnamed organization",
    }];
  });

  return {
    records,
    schemaAvailable: true,
    organizationsAvailable: !organizationsResult?.error,
    hasMore: (typeof casesResult.count === "number" && casesResult.count > limit) || rawData.length > limit,
    total: typeof casesResult.count === "number" ? casesResult.count : null,
    asOf,
  };
}

export async function readPlatformSupportQueuePage(
  admin: PlatformAdminClient,
  rawQuery: string | null | undefined,
  rawStatus: string | null | undefined,
  rawPriority: string | null | undefined,
  rawPage: string | number | null | undefined,
): Promise<PlatformSupportQueueResult> {
  const query = normalizePlatformSearchQuery(rawQuery);
  const statusValues: PlatformSupportQueueStatus[] = ["active", "all", "open", "in_progress", "waiting_on_customer", "resolved", "closed"];
  const priorityValues: PlatformSupportQueuePriority[] = ["all", "normal", "urgent"];
  const status = statusValues.includes(rawStatus as PlatformSupportQueueStatus) ? rawStatus as PlatformSupportQueueStatus : "active";
  const priority = priorityValues.includes(rawPriority as PlatformSupportQueuePriority) ? rawPriority as PlatformSupportQueuePriority : "all";
  const parsedPage = typeof rawPage === "number" ? rawPage : Number.parseInt(typeof rawPage === "string" ? rawPage : "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(Math.trunc(parsedPage), 1), 10_000) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const asOf = new Date().toISOString();
  let request = admin
    .from("support_cases")
    .select("id, org_id, created_by, subject, priority, status, first_response_due_at, created_at, updated_at, resolved_at, version, assigned_to, assigned_at, policy_version, first_response_at, first_response_by, resolution_reason", { count: "exact" })
    .order("first_response_due_at", { ascending: true })
    .order("id", { ascending: true });
  if (status === "active") request = request.in("status", ["open", "in_progress", "waiting_on_customer"]);
  else if (status !== "all") request = request.eq("status", status);
  if (priority !== "all") request = request.eq("priority", priority);
  if (query) {
    const pattern = `%${escapePostgrestLikePattern(query)}%`;
    request = isUuid(query) ? request.eq("org_id", query) : request.ilike("subject", pattern);
  }
  const casesResult = await request.range(from, to);
  if (casesResult.error) {
    return { records: [], query, status, priority, page, pageSize, total: null, hasMore: false, schemaAvailable: false, organizationsAvailable: true, asOf };
  }
  const rawRows = Array.isArray(casesResult.data) ? casesResult.data : [];
  const organizationIds = [...new Set(rawRows
    .map((row) => isRecord(row) && typeof row.org_id === "string" ? row.org_id : null)
    .filter((id): id is string => id !== null))];
  const organizationsResult = organizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", organizationIds)
    : null;
  const names = new Map<string, string>();
  for (const row of organizationsResult?.data ?? []) {
    if (typeof row.id === "string") names.set(row.id, typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization");
  }
  const records = rawRows.flatMap((row): Array<SupportCaseRecord & { organizationName: string }> => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.subject !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return [];
    const priorityValue = row.priority === "urgent" ? "urgent" : "normal";
    const statusValue = row.status === "in_progress" || row.status === "waiting_on_customer" || row.status === "resolved" || row.status === "closed" ? row.status : "open";
    return [{
      id: row.id,
      org_id: row.org_id,
      created_by: typeof row.created_by === "string" ? row.created_by : "",
      subject: row.subject,
      description: "",
      priority: priorityValue,
      status: statusValue,
      first_response_due_at: typeof row.first_response_due_at === "string" ? row.first_response_due_at : row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
      version: typeof row.version === "number" ? row.version : 1,
      assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : null,
      assigned_at: typeof row.assigned_at === "string" ? row.assigned_at : null,
      policy_version: typeof row.policy_version === "number" ? row.policy_version : null,
      first_response_at: typeof row.first_response_at === "string" ? row.first_response_at : null,
      first_response_by: typeof row.first_response_by === "string" ? row.first_response_by : null,
      resolution_reason: typeof row.resolution_reason === "string" ? row.resolution_reason : null,
      organizationName: names.get(row.org_id) ?? "Unnamed organization",
    }];
  });
  const total = typeof casesResult.count === "number" ? casesResult.count : null;
  return {
    records,
    query,
    status,
    priority,
    page,
    pageSize,
    total,
    hasMore: total === null ? records.length === pageSize : to + 1 < total,
    schemaAvailable: true,
    organizationsAvailable: !organizationsResult?.error,
    asOf,
  };
}

export async function readPlatformAttentionPage(
  admin: PlatformAdminClient,
  rawQuery: string | null | undefined,
  rawCategory: string | null | undefined,
  rawSeverity: string | null | undefined,
  rawState: string | null | undefined,
  rawPage: string | number | null | undefined,
): Promise<PlatformAttentionPage> {
  const asOf = new Date().toISOString();
  const query = normalizePlatformSearchQuery(rawQuery);
  const category = PLATFORM_ATTENTION_CATEGORIES.includes(rawCategory as PlatformAttentionCategory) ? rawCategory as PlatformAttentionCategory : "all";
  const severity = PLATFORM_ATTENTION_SEVERITIES.includes(rawSeverity as PlatformAttentionSeverity) ? rawSeverity as PlatformAttentionSeverity : "all";
  const stateValues: PlatformAttentionStateFilter[] = ["active", "all", ...PLATFORM_ATTENTION_STATES];
  const state = stateValues.includes(rawState as PlatformAttentionStateFilter) ? rawState as PlatformAttentionStateFilter : "active";
  const parsedPage = typeof rawPage === "number" ? rawPage : Number.parseInt(typeof rawPage === "string" ? rawPage : "1", 10);
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(Math.trunc(parsedPage), 1), 10_000) : 1;
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const fields = "id, logical_key, condition_fingerprint, source, category, severity, title, detail, organization_id, branch_id, href, action_label, source_created_at, first_seen_at, last_seen_at, state, acknowledged_at, acknowledged_by, assigned_to, assigned_at, snoozed_until, snooze_reason, resolved_at, resolution_reason, recurrence_count, version, created_at, updated_at";
  let request = admin
    .from("platform_attention_occurrences")
    .select(fields, { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (category !== "all") request = request.eq("category", category);
  if (severity !== "all") request = request.eq("severity", severity);
  if (state === "active") request = request.in("state", ["open", "acknowledged", "snoozed"]);
  else if (state !== "all") request = request.eq("state", state);
  if (query) {
    const searchPattern = `%${escapePostgrestLikePattern(query)}%`;
    request = request.or(`logical_key.ilike.${searchPattern},title.ilike.${searchPattern},detail.ilike.${searchPattern}`);
  }
  const result = await request;
  if (result.error) {
    return {
      records: [], query, category, severity, state, page, pageSize, total: null, hasMore: false,
      schemaAvailable: false, organizationsAvailable: true, storesAvailable: true, operatorsAvailable: true, asOf,
    };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const organizationIds = [...new Set(rows.flatMap((row) => isRecord(row) && typeof row.organization_id === "string" ? [row.organization_id] : []))];
  const storeIds = [...new Set(rows.flatMap((row) => isRecord(row) && typeof row.branch_id === "string" ? [row.branch_id] : []))];
  const operatorIds = [...new Set(rows.flatMap((row) => isRecord(row) && typeof row.assigned_to === "string" ? [row.assigned_to] : []))];
  const [organizationsResult, storesResult, operatorsResult] = await Promise.all([
    organizationIds.length > 0 ? admin.from("organizations").select("id, name").in("id", organizationIds) : Promise.resolve({ data: [], error: null }),
    storeIds.length > 0 ? admin.from("stores").select("id, name").in("id", storeIds) : Promise.resolve({ data: [], error: null }),
    operatorIds.length > 0 ? admin.from("platform_operators").select("id, email").in("id", operatorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const organizationNames = new Map<string, string>();
  for (const row of organizationsResult.data ?? []) if (isRecord(row) && typeof row.id === "string") organizationNames.set(row.id, readPlatformSearchName(typeof row.name === "string" ? row.name : null));
  const storeNames = new Map<string, string>();
  for (const row of storesResult.data ?? []) if (isRecord(row) && typeof row.id === "string") storeNames.set(row.id, readPlatformSearchName(typeof row.name === "string" ? row.name : null));
  const operatorEmails = new Map<string, string>();
  for (const row of operatorsResult.data ?? []) if (isRecord(row) && typeof row.id === "string" && typeof row.email === "string") operatorEmails.set(row.id, row.email);

  const records = rows.flatMap((row): PlatformAttentionOccurrence[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.logical_key !== "string" || typeof row.condition_fingerprint !== "string" || typeof row.source !== "string" || typeof row.category !== "string" || typeof row.severity !== "string" || typeof row.title !== "string" || typeof row.detail !== "string" || typeof row.href !== "string" || typeof row.action_label !== "string" || typeof row.first_seen_at !== "string" || typeof row.last_seen_at !== "string" || typeof row.state !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return [];
    if (!PLATFORM_ATTENTION_CATEGORIES.includes(row.source as PlatformAttentionCategory) || !PLATFORM_ATTENTION_CATEGORIES.includes(row.category as PlatformAttentionCategory) || !PLATFORM_ATTENTION_SEVERITIES.includes(row.severity as PlatformAttentionSeverity) || !PLATFORM_ATTENTION_STATES.includes(row.state as PlatformAttentionState)) return [];
    return [{
      id: row.id,
      logicalKey: row.logical_key,
      conditionFingerprint: row.condition_fingerprint,
      source: row.source as PlatformAttentionCategory,
      category: row.category as PlatformAttentionCategory,
      severity: row.severity as PlatformAttentionSeverity,
      title: row.title,
      detail: row.detail,
      organizationId: typeof row.organization_id === "string" ? row.organization_id : null,
      organizationName: typeof row.organization_id === "string" ? organizationNames.get(row.organization_id) ?? null : null,
      branchId: typeof row.branch_id === "string" ? row.branch_id : null,
      branchName: typeof row.branch_id === "string" ? storeNames.get(row.branch_id) ?? null : null,
      href: row.href,
      actionLabel: row.action_label,
      sourceCreatedAt: typeof row.source_created_at === "string" ? row.source_created_at : null,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      state: row.state as PlatformAttentionState,
      acknowledgedAt: typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
      acknowledgedBy: typeof row.acknowledged_by === "string" ? row.acknowledged_by : null,
      assignedTo: typeof row.assigned_to === "string" ? row.assigned_to : null,
      assignedEmail: typeof row.assigned_to === "string" ? operatorEmails.get(row.assigned_to) ?? null : null,
      assignedAt: typeof row.assigned_at === "string" ? row.assigned_at : null,
      snoozedUntil: typeof row.snoozed_until === "string" ? row.snoozed_until : null,
      snoozeReason: typeof row.snooze_reason === "string" ? row.snooze_reason : null,
      resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
      resolutionReason: typeof row.resolution_reason === "string" ? row.resolution_reason : null,
      recurrenceCount: typeof row.recurrence_count === "number" ? row.recurrence_count : 1,
      version: typeof row.version === "number" ? row.version : 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });

  return {
    records,
    query,
    category,
    severity,
    state,
    page,
    pageSize,
    total: typeof result.count === "number" ? result.count : null,
    hasMore: typeof result.count === "number" ? to + 1 < result.count : rows.length === pageSize,
    schemaAvailable: true,
    organizationsAvailable: !organizationsResult.error,
    storesAvailable: !storesResult.error,
    operatorsAvailable: !operatorsResult.error,
    asOf,
  };
}

export async function readPlatformEntitlementRecords(admin: PlatformAdminClient, organizationIds?: string[]): Promise<PlatformEntitlementRecords> {
  const [grantsResult, trialExtensionsResult] = await Promise.all([
    readAllPlatformAccessGrants(admin, organizationIds),
    readAllPlatformTrialExtensions(admin, organizationIds),
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
    hasMore: grantsResult.hasMore || trialExtensionsResult.hasMore,
  };
}

export async function readPlatformAudit(admin: PlatformAdminClient): Promise<PlatformAuditResult> {
  return readPlatformAuditPage(admin, {});
}

/**
 * Read a deterministic page from the three platform audit sources. Each
 * source advances independently with a keyset cursor, then the page is
 * merged by created_at/id. This prevents a capped read from one source from
 * hiding newer rows from another source.
 */
export async function readPlatformAuditPage(
  admin: PlatformAdminClient,
  rawFilters: Partial<PlatformAuditPageFilters> & { cursor?: string | null; asOf?: string | null },
): Promise<PlatformAuditResult> {
  const filters = normalizePlatformAuditFilters(rawFilters);
  const cursor = decodePlatformAuditCursor(rawFilters.cursor ?? null);
  const pageSize = 50;
  const searchPattern = filters.search ? `%${escapePostgrestLikePattern(filters.search)}%` : null;
  const dateStart = filters.dateRange === "24h"
    ? new Date(Date.parse(filters.asOf) - 24 * 60 * 60 * 1000).toISOString()
    : filters.dateRange === "7d"
      ? new Date(Date.parse(filters.asOf) - 7 * 24 * 60 * 60 * 1000).toISOString()
      : filters.dateRange === "30d"
        ? new Date(Date.parse(filters.asOf) - 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

  const readSource = async (source: AuditSourceKey) => {
    if (filters.source === "organization" && source !== "organization") return { rows: [] as unknown[], available: true, hasMore: false };
    if (filters.source === "operator" && source !== "operator") return { rows: [] as unknown[], available: true, hasMore: false };
    if (filters.source === "announcement" && source !== "announcement") return { rows: [] as unknown[], available: true, hasMore: false };
    if (filters.organizationId !== "all" && source !== "organization") return { rows: [] as unknown[], available: true, hasMore: false };

    const sourceCursor = cursor?.[source] ?? null;
    let request = source === "organization"
      ? admin.from("audit_logs").select("id, org_id, actor_id, action, entity, entity_id, before, after, created_at")
      : source === "operator"
        ? admin.from("platform_operator_audit_logs").select("id, operator_id, action, actor_id, actor_email, before, after, created_at")
        : admin.from("platform_announcement_audit_logs").select("id, announcement_id, action, actor_id, actor_email, before, after, created_at");
    request = request.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (source === "organization") request = request.like("action", "platform.%");
    if (filters.action !== "all") request = request.eq("action", filters.action);
    if (filters.organizationId !== "all") request = request.eq("org_id", filters.organizationId);
    if (dateStart) request = request.gte("created_at", dateStart);
    request = request.lte("created_at", filters.asOf);
    if (searchPattern) {
      const searchColumns = source === "organization"
        ? ["action", "entity", "entity_id", "actor_id"]
        : ["action", "actor_id", "actor_email"];
      request = request.or(searchColumns.map((column) => `${column}.ilike.${searchPattern}`).join(","));
    }
    if (sourceCursor && isSafeAuditCursorKey(sourceCursor)) {
      request = request.or(`created_at.lt.${sourceCursor.createdAt},and(created_at.eq.${sourceCursor.createdAt},id.lt.${sourceCursor.id})`);
    }
    const result = await request.limit(pageSize + 1);
    return {
      rows: Array.isArray(result.data) ? result.data as unknown[] : [],
      available: !result.error,
      hasMore: Array.isArray(result.data) && result.data.length > pageSize,
    };
  };

  const [organizationSource, operatorSource, announcementSource] = await Promise.all([
    readSource("organization"),
    readSource("operator"),
    readSource("announcement"),
  ]);
  const organizationIds = [...new Set(organizationSource.rows
    .map((row) => isRecord(row) && typeof row.org_id === "string" ? row.org_id : null)
    .filter((id): id is string => id !== null))];
  const organizationNamesResult = organizationIds.length > 0
    ? await admin.from("organizations").select("id, name").in("id", organizationIds)
    : null;
  const organizationNames = new Map<string, string>(
    (organizationNamesResult?.data ?? []).flatMap((row) => typeof row.id === "string"
      ? [[row.id, typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed organization"] as [string, string]]
      : []),
  );

  const records = [
    ...organizationSource.rows.flatMap((row) => normalizePlatformAuditRow(row, "organization", organizationNames)),
    ...operatorSource.rows.flatMap((row) => normalizePlatformAuditRow(row, "operator", organizationNames)),
    ...announcementSource.rows.flatMap((row) => normalizePlatformAuditRow(row, "announcement", organizationNames)),
  ].sort(comparePlatformAuditRows);
  const pageRecords = records.slice(0, pageSize);
  const nextCursorValue: PlatformAuditCursor = {
    organization: cursor?.organization ?? null,
    operator: cursor?.operator ?? null,
    announcement: cursor?.announcement ?? null,
  };
  const sourceResults: Record<AuditSourceKey, { hasMore: boolean }> = {
    organization: organizationSource,
    operator: operatorSource,
    announcement: announcementSource,
  };
  for (const source of Object.keys(sourceResults) as AuditSourceKey[]) {
    const last = [...pageRecords].reverse().find((record) => record.sourceKey === source);
    if (last) nextCursorValue[source] = { createdAt: last.event.createdAt, id: last.event.id };
    else if (!sourceResults[source].hasMore) nextCursorValue[source] = null;
  }
  const hasMore = Object.values(sourceResults).some((sourceResult) => sourceResult.hasMore);
  const nextCursor = hasMore && pageRecords.length > 0 ? encodePlatformAuditCursor(nextCursorValue) : null;

  return {
    events: pageRecords.map((record) => record.event),
    schemaAvailable: organizationSource.available,
    operatorAuditSchemaAvailable: operatorSource.available,
    announcementAuditSchemaAvailable: announcementSource.available,
    hasMore: nextCursor !== null,
    nextCursor,
    asOf: filters.asOf,
    filters,
  };
}

type AuditSourceKey = "organization" | "operator" | "announcement";
type PlatformAuditCursorKey = { createdAt: string; id: string };
type PlatformAuditCursor = Record<AuditSourceKey, PlatformAuditCursorKey | null>;
type PlatformAuditRow = { sourceKey: AuditSourceKey; event: PlatformAuditEvent };

function normalizePlatformAuditFilters(rawFilters: Partial<PlatformAuditPageFilters> & { asOf?: string | null }): PlatformAuditPageFilters {
  const source = PLATFORM_AUDIT_SOURCE_FILTERS.includes(rawFilters.source as PlatformAuditSourceFilter)
    ? rawFilters.source as PlatformAuditSourceFilter
    : "all";
  const dateRange = PLATFORM_AUDIT_DATE_FILTERS.includes(rawFilters.dateRange as PlatformAuditDateFilter)
    ? rawFilters.dateRange as PlatformAuditDateFilter
    : "all";
  const search = normalizePlatformSearchQuery(rawFilters.search ?? null).replace(/[^a-zA-Z0-9@ _-]/g, " ").replace(/\s+/g, " ").trim();
  const actionValue = typeof rawFilters.action === "string" ? rawFilters.action.trim().slice(0, 120) : "";
  const action = /^[a-zA-Z0-9_.-]+$/.test(actionValue) ? actionValue : "all";
  const organizationId = isUuid(rawFilters.organizationId ?? "") ? rawFilters.organizationId as string : "all";
  const parsedAsOf = Date.parse(rawFilters.asOf ?? "");
  const asOf = Number.isFinite(parsedAsOf) ? new Date(parsedAsOf).toISOString() : new Date().toISOString();
  return { search, source, action, organizationId, dateRange, asOf };
}

function normalizePlatformAuditRow(row: unknown, sourceKey: AuditSourceKey, organizationNames: Map<string, string>): PlatformAuditRow[] {
  if (!isRecord(row) || typeof row.id !== "string" || typeof row.action !== "string" || typeof row.created_at !== "string") return [];
  const before = row.before;
  const after = row.after;
  if (sourceKey === "organization") {
    const organizationId = typeof row.org_id === "string" ? row.org_id : null;
    return [{
      sourceKey,
      event: {
        id: row.id,
        source: "organization",
        organizationId,
        organizationName: organizationId ? organizationNames.get(organizationId) ?? null : null,
        action: row.action,
        entity: typeof row.entity === "string" ? row.entity : null,
        entityId: typeof row.entity_id === "string" ? row.entity_id : null,
        actorId: typeof row.actor_id === "string" ? row.actor_id : readAuditSnapshotString(after, "platform_actor_id") ?? readAuditSnapshotString(after, "operator_id") ?? readAuditSnapshotString(before, "platform_actor_id"),
        actorEmail: readAuditSnapshotString(after, "platform_actor_email") ?? readAuditSnapshotString(after, "actor_email") ?? readAuditSnapshotString(before, "platform_actor_email"),
        before,
        after,
        createdAt: row.created_at,
      },
    }];
  }
  return [{
    sourceKey,
    event: {
      id: row.id,
      source: sourceKey === "operator" ? "operator" : "announcement",
      organizationId: null,
      organizationName: "Platform-wide",
      action: row.action,
      entity: sourceKey === "operator" ? "platform_operators" : "platform_announcements",
      entityId: typeof (sourceKey === "operator" ? row.operator_id : row.announcement_id) === "string" ? sourceKey === "operator" ? row.operator_id as string : row.announcement_id as string : null,
      actorId: typeof row.actor_id === "string" ? row.actor_id : null,
      actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
      before,
      after,
      createdAt: row.created_at,
    },
  }];
}

function comparePlatformAuditRows(left: PlatformAuditRow, right: PlatformAuditRow) {
  const rightTime = Date.parse(right.event.createdAt);
  const leftTime = Date.parse(left.event.createdAt);
  const timeDifference = (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  if (timeDifference !== 0) return timeDifference;
  const idDifference = right.event.id.localeCompare(left.event.id);
  if (idDifference !== 0) return idDifference;
  return left.sourceKey.localeCompare(right.sourceKey);
}

function isSafeAuditCursorKey(value: PlatformAuditCursorKey) {
  return Number.isFinite(Date.parse(value.createdAt)) && /^[a-zA-Z0-9_-]+$/.test(value.id);
}

function encodePlatformAuditCursor(cursor: PlatformAuditCursor) {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodePlatformAuditCursor(value: string | null): PlatformAuditCursor | null {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlatformAuditCursor>;
    const result = {} as PlatformAuditCursor;
    for (const source of ["organization", "operator", "announcement"] as AuditSourceKey[]) {
      const entry = parsed[source];
      result[source] = entry && typeof entry.createdAt === "string" && typeof entry.id === "string" && isSafeAuditCursorKey(entry) ? { createdAt: entry.createdAt, id: entry.id } : null;
    }
    return result;
  } catch {
    try {
      return decodePlatformAuditCursor(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
}

export async function readPlatformFleetHealth(admin: PlatformAdminClient, requestedAsOf = new Date().toISOString()): Promise<PlatformFleetHealthResult> {
  const parsedAsOf = Date.parse(requestedAsOf);
  const asOf = Number.isFinite(parsedAsOf) ? new Date(parsedAsOf).toISOString() : new Date().toISOString();
  const lookbackStart = new Date(Date.parse(asOf) - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [attributedSamplesResult, organizationsResult] = await Promise.all([
    admin
      .from("admin_performance_samples")
      .select("id, org_id, recorded_at, surface, interaction, mode, sample_type, duration_ms, error, ttfb_ms, transfer_ms, browser_settle_ms", { count: "exact" })
      .gte("recorded_at", lookbackStart)
      .lte("recorded_at", asOf)
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT),
    admin.from("organizations").select("id, name").order("name").limit(1000),
  ]);

  let rawSamples: unknown[] = Array.isArray(attributedSamplesResult.data) ? attributedSamplesResult.data : [];
  let sampleCount = attributedSamplesResult.count;
  let schemaAvailable = !attributedSamplesResult.error;
  let timingMetricsAvailable = !attributedSamplesResult.error;
  if (attributedSamplesResult.error) {
    const attributedLegacySamplesResult = await admin
      .from("admin_performance_samples")
      .select("id, org_id, recorded_at, surface, interaction, mode, sample_type, duration_ms, error", { count: "exact" })
      .gte("recorded_at", lookbackStart)
      .lte("recorded_at", asOf)
      .order("recorded_at", { ascending: false })
      .limit(PLATFORM_FLEET_HEALTH_SAMPLE_LIMIT);
    if (!attributedLegacySamplesResult.error) {
      rawSamples = Array.isArray(attributedLegacySamplesResult.data) ? attributedLegacySamplesResult.data : [];
      sampleCount = attributedLegacySamplesResult.count;
      schemaAvailable = true;
      timingMetricsAvailable = false;
    } else {
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
      timingMetricsAvailable = false;
    }
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
    timingMetricsAvailable,
  };
}

async function readPlatformSyncInputs(admin: PlatformAdminClient, requestedAsOf = new Date().toISOString()) {
  const parsedAsOf = Date.parse(requestedAsOf);
  const asOf = Number.isFinite(parsedAsOf) ? new Date(parsedAsOf).toISOString() : new Date().toISOString();
  const [richSamplesResult, organizationsResult, storesResult] = await Promise.all([
    admin
      .from("admin_sync_health_snapshots")
      .select("id, recorded_at, org_id, store_id, device_key, queue, pending_count, failed_count, conflict_count, stuck_count, oldest_pending_at, last_successful_sync_at, online", { count: "exact" })
      .order("recorded_at", { ascending: false })
      .order("id")
      .limit(PLATFORM_SYNC_HEALTH_SAMPLE_LIMIT),
    admin.from("organizations").select("id, name", { count: "exact" }).order("name").order("id").limit(1000),
    admin.from("stores").select("id, org_id, name, is_active", { count: "exact" }).order("name").order("id").limit(10000),
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
      .order("id")
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
    samples, organizations, stores, asOf,
    schemaAvailable: !samplesResult.error,
    enhancedMetricsAvailable,
    organizationsAvailable: !organizationsResult.error,
    storesAvailable: !storesResult.error,
    hasMore: (samplesResult.count ?? rawSamples.length) > rawSamples.length
      || (organizationsResult.count ?? organizations.length) > organizations.length
      || (storesResult.count ?? stores.length) > stores.length,
  };
}

export async function readPlatformSyncHealth(admin: PlatformAdminClient, requestedAsOf = new Date().toISOString()): Promise<PlatformSyncHealthResult> {
  const { samples, organizations, stores, asOf, ...availability } = await readPlatformSyncInputs(admin, requestedAsOf);
  return { summary: summarizePlatformSyncHealth(samples, organizations, stores, asOf), ...availability };
}

export async function readPlatformDevices(admin: PlatformAdminClient) {
  const [inputs, devicesResult] = await Promise.all([
    readPlatformSyncInputs(admin),
    admin.from("devices")
      .select("id, org_id, store_id, name, device_prefix, is_active, last_seen_at", { count: "exact" })
      .order("id").limit(10000),
  ]);
  const devices = (Array.isArray(devicesResult.data) ? devicesResult.data : []).flatMap((row): PlatformRegisteredDevice[] => {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.org_id !== "string" || typeof row.store_id !== "string" || typeof row.device_prefix !== "string") return [];
    return [{
      id: row.id, organizationId: row.org_id, storeId: row.store_id,
      name: typeof row.name === "string" && row.name.trim() ? row.name : "Unnamed device",
      devicePrefix: row.device_prefix, isActive: row.is_active !== false,
      lastSeenAt: typeof row.last_seen_at === "string" ? row.last_seen_at : null,
    }];
  });
  return {
    summary: summarizePlatformDevices(inputs.samples, inputs.organizations, inputs.stores, devices, inputs.asOf),
    schemaAvailable: inputs.schemaAvailable,
    enhancedMetricsAvailable: inputs.enhancedMetricsAvailable,
    organizationsAvailable: inputs.organizationsAvailable,
    storesAvailable: inputs.storesAvailable,
    devicesAvailable: !devicesResult.error,
    hasMore: inputs.hasMore || (devicesResult.count ?? devices.length) > devices.length,
  };
}

export async function readPlatformSchemaDrift(admin: PlatformAdminClient): Promise<PlatformSchemaDriftResult> {
  const asOf = new Date().toISOString();
  const [ledgerResult, organizationsResult, storesResult, slugStoresResult, roleOrgsResult, snapshotStoresResult] = await Promise.all([
    admin.rpc("platform_schema_migrations"),
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("stores").select("id", { count: "exact", head: true }),
    admin.from("stores").select("id", { count: "exact", head: true }).not("staff_login_slug", "is", null),
    admin.from("employee_roles").select("org_id").limit(10000),
    admin.from("admin_sync_health_snapshots").select("store_id").limit(10000),
  ]);

  // The ledger read depends on migration 0084. Before it is applied the page
  // still renders, reporting every shipped migration as unverified rather than
  // claiming a sync it could not check.
  const applied = ledgerResult.error ? null : normalizePlatformSchemaMigrations(ledgerResult.data);
  const summary = summarizePlatformSchemaDrift(PLATFORM_SCHEMA_MANIFEST, applied);

  const organizationCount = organizationsResult.count ?? 0;
  const storeCount = storesResult.count ?? 0;
  const distinctRoleOrgs = countDistinctColumn(roleOrgsResult.data, "org_id");
  const distinctSnapshotStores = countDistinctColumn(snapshotStoresResult.data, "store_id");

  const backfill = summarizePlatformSchemaBackfill([
    {
      key: "staff_login_slug",
      label: "Branch staff-login slugs",
      detail: "Branches with the human-readable /staff/{slug} entry link backfilled.",
      introducedIn: "0033",
      total: storeCount,
      ready: slugStoresResult.count ?? 0,
    },
    {
      key: "employee_roles",
      label: "Default employee roles",
      detail: "Organizations with the four default employee roles seeded.",
      introducedIn: "0049",
      total: organizationCount,
      ready: distinctRoleOrgs,
    },
    {
      key: "sync_health",
      label: "Branches reporting sync telemetry",
      detail: "Branches that have sent at least one sync heartbeat.",
      introducedIn: "0080",
      total: storeCount,
      ready: distinctSnapshotStores,
    },
  ]);

  return {
    asOf,
    summary,
    backfill,
    ledgerReadable: !ledgerResult.error,
    backfillAvailable: !organizationsResult.error && !storesResult.error,
  };
}

function normalizePlatformSchemaMigrations(value: unknown): PlatformSchemaMigration[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): PlatformSchemaMigration[] => {
    if (!isRecord(row) || typeof row.version !== "string" || !row.version.trim()) return [];
    return [{ version: row.version, name: typeof row.name === "string" ? row.name : "" }];
  });
}

function countDistinctColumn(value: unknown, column: string) {
  if (!Array.isArray(value)) return 0;
  const seen = new Set<string>();
  for (const row of value) {
    if (isRecord(row) && typeof row[column] === "string") seen.add(row[column]);
  }
  return seen.size;
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
    admin.from("support_cases").select("id, org_id, created_by, subject, description, priority, status, first_response_due_at, created_at, updated_at, resolved_at, version, assigned_to, assigned_at, policy_version, first_response_at, first_response_by, resolution_reason").eq("org_id", organizationId).order("created_at", { ascending: false }),
    readOrganizationTrialFeedback(admin, organizationId),
    admin.from("audit_logs").select("id, action, entity, entity_id, before, after, created_at").eq("org_id", organizationId).order("created_at", { ascending: false }).limit(100),
    admin.from("platform_referral_codes").select("id, code, referrer_org_id, referrer_profile_id, is_active, created_at, updated_at").eq("referrer_org_id", organizationId).eq("is_active", true).limit(1).maybeSingle(),
    admin.from("platform_referrals").select("id, referral_code_id, referrer_org_id, referrer_profile_id, referred_user_id, referred_profile_id, referred_org_id, status, captured_at, qualified_at, rewarded_at, reward_grant_id, rejection_reason, created_at, updated_at").eq("referrer_org_id", organizationId).order("created_at", { ascending: false }).limit(1000),
    admin.from("platform_referrals").select("id, referral_code_id, referrer_org_id, referrer_profile_id, referred_user_id, referred_profile_id, referred_org_id, status, captured_at, qualified_at, rewarded_at, reward_grant_id, rejection_reason, created_at, updated_at").eq("referred_org_id", organizationId).order("created_at", { ascending: false }).limit(1000),
    admin.from("platform_referral_reward_ledger").select("id, referral_id, referrer_org_id, grant_id, reward_type, reward_days, status, issued_at, revoked_at, metadata").eq("referrer_org_id", organizationId).order("issued_at", { ascending: false }).limit(1000),
  ]);

  const supportCases = !supportResult.error ? (supportResult.data ?? []) as SupportCaseRecord[] : [];
  const supportCaseIds = supportCases.map((supportCase) => supportCase.id);
  const [supportNotesResult, supportEventsResult] = supportCaseIds.length > 0
    ? await Promise.all([
      admin.from("support_case_notes").select("id, case_id, author_id, author_email, note_type, body, created_at").in("case_id", supportCaseIds).order("created_at", { ascending: true }),
      admin.from("support_case_events").select("id, case_id, event_type, from_status, to_status, actor_id, actor_email, reason, metadata, created_at").in("case_id", supportCaseIds).order("created_at", { ascending: true }),
    ])
    : [{ error: null, data: [] }, { error: null, data: [] }];
  const notesByCase = new Map<string, SupportCaseNoteRecord[]>();
  for (const row of supportNotesResult.data ?? []) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.case_id !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string") continue;
    const note: SupportCaseNoteRecord = {
      id: row.id,
      case_id: row.case_id,
      author_id: typeof row.author_id === "string" ? row.author_id : null,
      author_email: typeof row.author_email === "string" ? row.author_email : null,
      note_type: row.note_type === "operator_response" ? "operator_response" : "internal",
      body: row.body,
      created_at: row.created_at,
    };
    notesByCase.set(note.case_id, [...(notesByCase.get(note.case_id) ?? []), note]);
  }
  const eventsByCase = new Map<string, SupportCaseEventRecord[]>();
  for (const row of supportEventsResult.data ?? []) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.case_id !== "string" || typeof row.event_type !== "string" || typeof row.created_at !== "string") continue;
    const eventType = ["opened", "status_changed", "assigned", "unassigned", "note_added", "first_response_recorded"].includes(row.event_type)
      ? row.event_type as SupportCaseEventRecord["event_type"]
      : "note_added";
    const event: SupportCaseEventRecord = {
      id: row.id,
      case_id: row.case_id,
      event_type: eventType,
      from_status: typeof row.from_status === "string" ? row.from_status : null,
      to_status: typeof row.to_status === "string" ? row.to_status : null,
      actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
      actor_email: typeof row.actor_email === "string" ? row.actor_email : null,
      reason: typeof row.reason === "string" ? row.reason : null,
      metadata: row.metadata,
      created_at: row.created_at,
    };
    eventsByCase.set(event.case_id, [...(eventsByCase.get(event.case_id) ?? []), event]);
  }
  for (const supportCase of supportCases) {
    supportCase.notes = notesByCase.get(supportCase.id) ?? [];
    supportCase.events = eventsByCase.get(supportCase.id) ?? [];
  }
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
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_billing_variant_id, subscription_provider_plan_id, subscription_provider_subscription_id, subscription_provider_payment_intent_id, subscription_entitled_branch_count, subscription_pending_branch_count, subscription_updated_at, account_status, suspension_reason, suspended_at, platform_account_version")
    .eq("id", organizationId)
    .maybeSingle();

  if (!rich.error && rich.data) return rich.data as OrganizationRecord;

  const legacy = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, settings, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at, platform_account_version")
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
    ttfbMs: readOptionalMilliseconds(value.ttfb_ms),
    transferMs: readOptionalMilliseconds(value.transfer_ms),
    browserSettleMs: readOptionalMilliseconds(value.browser_settle_ms),
    error: value.error,
    recordedAt: value.recorded_at,
  }];
}

function readOptionalMilliseconds(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 120_000 ? Math.round(parsed) : null;
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
