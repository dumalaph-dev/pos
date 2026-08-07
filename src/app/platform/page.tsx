import Link from "next/link";
import { redirect } from "next/navigation";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type OrganizationRecord = {
  id: string;
  name: string;
  created_at: string;
  owner_profile_id: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  subscription_current_period_end?: string | null;
};

type ProfileRecord = { id: string; org_id: string; full_name: string | null; role: string; is_active: boolean };
type StoreRecord = { id: string; org_id: string; name: string; is_active: boolean };
type EmployeeRecord = { id: string; org_id: string; role: string; is_active: boolean };

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/platform/login");
  if (!isPlatformAdminEmail(user.email)) return <PlatformAccessDenied />;

  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const organizationsResult = await readOrganizations(admin);
  const [profilesResult, storesResult, employeesResult, authUsersResult] = await Promise.all([
    admin.from("profiles").select("id, org_id, full_name, role, is_active").limit(10000),
    admin.from("stores").select("id, org_id, name, is_active").limit(10000),
    admin.from("employee_records").select("id, org_id, role, is_active").limit(10000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const organizations = organizationsResult.records;
  const profiles = (profilesResult.data ?? []) as ProfileRecord[];
  const stores = (storesResult.data ?? []) as StoreRecord[];
  const employees = (employeesResult.data ?? []) as EmployeeRecord[];
  const authUsers = authUsersResult.data?.users ?? [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const authEmailById = new Map(authUsers.map((authUser) => [authUser.id, authUser.email ?? ""]));

  const storesByOrg = countByOrg(stores);
  const activeStoresByOrg = countByOrg(stores.filter((store) => store.is_active));
  const employeesByOrg = countByOrg(employees);
  const activeEmployeesByOrg = countByOrg(employees.filter((employee) => employee.is_active));
  const activeSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "active").length;
  const trialSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "trialing").length;

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Platform operations</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Business accounts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">A read-only overview of businesses, stores, staff activity, and Premium subscription readiness.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondary-hover">Owner login</Link>
            <span className="rounded-btn border border-line bg-surface px-4 py-3 text-xs font-bold text-ink-muted">{user.email}</span>
          </div>
        </header>

        {!organizationsResult.subscriptionFieldsAvailable && <div role="status" className="mt-6 rounded-card border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold text-ink">Subscription fields are not available yet. Apply migration 0025 to enable Premium billing status tracking.</div>}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
          <Metric label="Businesses" value={organizations.length} detail="Registered workspaces" />
          <Metric label="Active stores" value={stores.filter((store) => store.is_active).length} detail={`${stores.length} total branches`} />
          <Metric label="Active staff" value={employees.filter((employee) => employee.is_active).length} detail={`${employees.length} employee records`} />
          <Metric label="Subscriptions" value={organizationsResult.subscriptionFieldsAvailable ? activeSubscriptions : "—"} detail={organizationsResult.subscriptionFieldsAvailable ? `${trialSubscriptions} in trial` : "Migration required"} />
        </section>

        <section className="mt-8 overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-2 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Latest accounts</p>
              <h2 className="mt-1 text-xl font-extrabold">Business directory</h2>
            </div>
            <p className="text-xs font-semibold text-ink-muted">Showing up to 100 recent organizations</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Stores</th><th className="px-6 py-3 font-extrabold">Staff</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Created</th></tr></thead>
              <tbody className="divide-y divide-line">
                {organizations.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-muted">No business accounts yet.</td></tr> : organizations.map((organization) => {
                  const owner = organization.owner_profile_id ? profileById.get(organization.owner_profile_id) : undefined;
                  const subscription = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
                  const plan = getBillingPlan(organization.subscription_plan);
                  return <tr key={organization.id} className="align-top"><td className="px-6 py-4"><strong className="block font-extrabold">{organization.name}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.id.slice(0, 8)}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? "Owner profile pending"}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "—"}</span></td><td className="px-6 py-4"><strong>{activeStoresByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {storesByOrg.get(organization.id) ?? 0} active</span></td><td className="px-6 py-4"><strong>{activeEmployeesByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {employeesByOrg.get(organization.id) ?? 0} records active</span></td><td className="px-6 py-4">{subscription ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${subscriptionTone(subscription)}`}>{subscriptionStatusLabel(subscription)}</span> : <span className="inline-flex rounded-full bg-raised px-2.5 py-1 text-xs font-extrabold text-ink-muted">Not connected</span>}<span className="mt-2 block text-xs font-semibold text-ink-muted">{plan.name} · {plan.priceLabel}/month</span></td><td className="whitespace-nowrap px-6 py-4 text-ink-muted">{formatDate(organization.created_at)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-5 text-xs leading-5 text-ink-muted">This first platform console is intentionally read-only. Add subscription checkout, account suspension, and support actions only after the billing and support policies are defined.</p>
      </div>
    </main>
  );
}

async function readOrganizations(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const rich = await admin.from("organizations").select("id, name, created_at, owner_profile_id, subscription_status, subscription_plan, subscription_current_period_end").order("created_at", { ascending: false }).limit(100);
  if (!rich.error) return { records: (rich.data ?? []) as OrganizationRecord[], subscriptionFieldsAvailable: true };

  const basic = await admin.from("organizations").select("id, name, created_at, owner_profile_id").order("created_at", { ascending: false }).limit(100);
  return { records: (basic.data ?? []) as OrganizationRecord[], subscriptionFieldsAvailable: false };
}

function countByOrg<T extends { org_id: string }>(rows: T[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  return counts;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p><p className="mt-3 text-3xl font-extrabold tracking-[-0.04em]">{value}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p></article>;
}

function PlatformAccessDenied() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Platform access is restricted</h1><p className="mt-3 text-sm leading-6 text-ink-muted">This account is not on the platform administrator allowlist.</p><Link href="/login" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to owner login</Link></div></main>;
}

function PlatformUnavailable({ detail }: { detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Platform console unavailable</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p></div></main>;
}
