import { createAdminClient } from "@/lib/employee-auth";

export type PlatformAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type OrganizationRecord = {
  id: string;
  name: string;
  created_at: string;
  owner_profile_id: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_current_period_end?: string | null;
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
};

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
};

export async function readOrganizations(admin: PlatformAdminClient): Promise<OrganizationsResult> {
  const rich = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!rich.error) {
    return {
      records: (rich.data ?? []) as OrganizationRecord[],
      subscriptionFieldsAvailable: true,
      accountFieldsAvailable: true,
    };
  }

  const basic = await admin
    .from("organizations")
    .select("id, name, created_at, owner_profile_id")
    .order("created_at", { ascending: false })
    .limit(100);

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

  return {
    organizationsResult,
    organizations: organizationsResult.records,
    profiles,
    stores,
    employees,
    authEmailById: new Map(authUsers.map((authUser) => [authUser.id, authUser.email ?? ""])),
  };
}

export function countByOrg<T extends { org_id: string }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  return counts;
}

export function formatDate(value: string) {
  const date = new Date(value);
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
