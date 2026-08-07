import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { BillingCatalogEditor } from "@/app/platform/BillingCatalogEditor";
import { OrganizationOperations } from "@/app/platform/OrganizationOperations";
import { PlatformPolicyEditor, PolicyCardHeading } from "@/app/platform/PlatformPolicyEditor";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { isPolicyGateOpen } from "@/lib/platform-operations";
import { readPlatformOperations, payMongoConfiguration, supportCasesSchemaAvailable } from "@/lib/platform-operations-server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type OrganizationRecord = {
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

  const [organizationsResult, operations, supportCasesReady, profilesResult, storesResult, employeesResult, authUsersResult] = await Promise.all([
    readOrganizations(admin),
    readPlatformOperations(admin),
    supportCasesSchemaAvailable(admin),
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
  const { catalog, policies } = operations;
  const policyGateOpen = isPolicyGateOpen(policies);
  const publishedPolicies = Number(policies.billing.status === "published") + Number(policies.support.status === "published");
  const paymongo = payMongoConfiguration();
  const checkoutReady = policyGateOpen && paymongo.secretKeyConfigured && paymongo.publicKeyConfigured && paymongo.keyModeConsistent && paymongo.webhookSecretConfigured && paymongo.subscriptionsEnabled;
  const accountOperationsSchemaReady = organizationsResult.accountFieldsAvailable && policies.schemaAvailable && supportCasesReady;

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
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Platform operations</p>
              <span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">Policy-first mode</span>
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Run the platform with guardrails</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Define the billing and support contract before turning on checkout, account suspension, or support actions for business accounts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondary-hover">Owner login</Link>
            <span className="rounded-btn border border-line bg-surface px-4 py-3 text-xs font-bold text-ink-muted">{user.email}</span>
          </div>
        </header>

        {(!organizationsResult.subscriptionFieldsAvailable || !organizationsResult.accountFieldsAvailable || !catalog.schemaAvailable || !policies.schemaAvailable || !supportCasesReady) && <div role="status" className="mt-6 rounded-card border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">Platform operations is showing safe defaults or locked controls because the latest database migrations are not fully available. Apply <code className="font-extrabold">0027_platform_operations.sql</code> and <code className="font-extrabold">0028_support_cases.sql</code> before using the complete console.</div>}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
          <Metric label="Businesses" value={organizations.length} detail="Registered workspaces" />
          <Metric label="Active stores" value={stores.filter((store) => store.is_active).length} detail={`${stores.length} total branches`} />
          <Metric label="Active staff" value={employees.filter((employee) => employee.is_active).length} detail={`${employees.length} employee records`} />
          <Metric label="Policy gate" value={`${publishedPolicies}/2`} detail={policyGateOpen ? "Ready for integration" : "Checkout and actions locked"} />
        </section>

        <section className="mt-8 overflow-hidden rounded-card border border-primary/20 bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:p-6" aria-labelledby="policy-gate-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-fg/12"><AdminIcon name={policyGateOpen ? "check" : "alert"} size={19} /></span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/65">Operational gate</p>
                <h2 id="policy-gate-heading" className="mt-1 text-xl font-extrabold">{policyGateOpen ? "Both policies are published" : "Publish both policies before enabling actions"}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-primary-fg/72">Checkout, account suspension, and support mutations remain unavailable while either policy is still a draft. Publishing a policy records its version for future audit history.</p>
              </div>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-2">
              <PolicyGateStatus label="Billing policy" published={policies.billing.status === "published"} />
              <PolicyGateStatus label="Support policy" published={policies.support.status === "published"} />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_minmax(330px,0.82fr)]" aria-label="Platform policy and pricing setup">
          <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="pricing-heading">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="wallet" size={18} /></span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Subscription catalog</p>
                <h2 id="pricing-heading" className="mt-1 text-xl font-extrabold">Set the price customers will see</h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Manage the monthly base price, enable 1-, 2-, or 3-year offers, and tune the discount for each annual duration.</p>
              </div>
            </div>
            <BillingCatalogEditor catalog={catalog} />
          </article>

          <div className="space-y-5">
            <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="billing-policy-heading">
              <PolicyCardHeading policy={policies.billing} />
              <div id="billing-policy-heading"><PlatformPolicyEditor policy={policies.billing} schemaAvailable={policies.schemaAvailable} /></div>
            </article>
            <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="support-policy-heading">
              <PolicyCardHeading policy={policies.support} />
              <div id="support-policy-heading"><PlatformPolicyEditor policy={policies.support} schemaAvailable={policies.schemaAvailable} /></div>
            </article>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" aria-label="Payment provider and gated actions">
          <article className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="paymongo-heading">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><AdminIcon name="refresh" size={18} /></span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Payment provider</p>
                <h2 id="paymongo-heading" className="mt-1 text-xl font-extrabold">PayMongo readiness</h2>
                <p className="mt-1 text-sm leading-5 text-ink-muted">Recurring billing stays server-side. No secret key is sent to the browser.</p>
              </div>
            </div>
            <div className="mt-5 space-y-2.5">
              <ReadinessRow label="Secret API key" ready={paymongo.secretKeyConfigured} detail={paymongo.secretKeyConfigured ? "Configured on the server" : "Add PAYMONGO_SECRET_KEY"} />
              <ReadinessRow label="Public API key" ready={paymongo.publicKeyConfigured} detail={paymongo.publicKeyConfigured ? "Safe browser tokenization key configured" : "Add NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY"} />
              <ReadinessRow label="Key mode" ready={paymongo.keyModeConsistent} detail={paymongo.keyModeConsistent ? "Public and secret keys match" : "Use both test keys or both live keys"} />
              <ReadinessRow label="Webhook signature secret" ready={paymongo.webhookSecretConfigured} detail={paymongo.webhookSecretConfigured ? "Ready to verify events" : "Add PAYMONGO_WEBHOOK_SECRET"} />
              <ReadinessRow label="Subscriptions capability" ready={paymongo.subscriptionsEnabled} detail={paymongo.subscriptionsEnabled ? "Marked ready for integration" : "Request activation, then set the server flag"} />
            </div>
            <p className="mt-5 rounded-btn bg-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">The owner billing page now has the policy-gated first-payment flow. Provider activation, test-mode payment, and signed webhook delivery must pass before live checkout is enabled.</p>
          </article>

          <article className="rounded-card border border-dashed border-line-strong bg-surface-raised p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="actions-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Next phase</p>
                <h2 id="actions-heading" className="mt-1 text-xl font-extrabold">Operational actions</h2>
                <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Subscription checkout is wired in the owner Billing page behind the same gates. Account suspension and support workflows are available from each business row once both policies are published.</p>
              </div>
              <span className="rounded-pill bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink">Locked</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <LockedAction icon="wallet" label="Subscription checkout" detail={checkoutReady ? "Available from the owner Billing page" : policyGateOpen ? "Finish PayMongo setup" : "Publish billing + support policies"} href={checkoutReady ? "/admin/billing" : undefined} />
              <LockedAction icon="alert" label="Suspend account" detail={accountOperationsSchemaReady && policyGateOpen ? "Use the business directory controls" : policyGateOpen ? "Apply the platform operations migrations" : "Publish both policies first"} href={accountOperationsSchemaReady && policyGateOpen ? "#directory-heading" : undefined} hrefLabel="Open directory" />
              <LockedAction icon="help" label="Open support case" detail={accountOperationsSchemaReady && policyGateOpen ? "Use the business directory controls" : policyGateOpen ? "Apply the platform operations migrations" : "Publish both policies first"} href={accountOperationsSchemaReady && policyGateOpen ? "#directory-heading" : undefined} hrefLabel="Open directory" />
            </div>
          </article>
        </section>

        <section className="mt-8 overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="directory-heading">
          <div className="flex flex-col gap-2 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Account operations</p>
              <h2 id="directory-heading" className="mt-1 text-xl font-extrabold">Business directory</h2>
            </div>
            <div className="text-right text-xs font-semibold text-ink-muted"><span className="block">{activeSubscriptions} active · {trialSubscriptions} in trial</span><span className="mt-1 block">Showing up to 100 recent organizations</span></div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[840px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Stores</th><th className="px-6 py-3 font-extrabold">Staff</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Created</th></tr></thead>
              <tbody className="divide-y divide-line">
                {organizations.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-muted">No business accounts yet.</td></tr> : organizations.map((organization) => {
                  const owner = organization.owner_profile_id ? profileById.get(organization.owner_profile_id) : undefined;
                  const subscription = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
                  const plan = getBillingPlan(organization.subscription_plan);
                  return <tr key={organization.id} className="align-top"><td className="px-6 py-4"><strong className="block font-extrabold">{organization.name}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.id.slice(0, 8)}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? "Owner profile pending"}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "—"}</span></td><td className="px-6 py-4"><strong>{activeStoresByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {storesByOrg.get(organization.id) ?? 0} active</span></td><td className="px-6 py-4"><strong>{activeEmployeesByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">of {employeesByOrg.get(organization.id) ?? 0} records active</span></td><td className="px-6 py-4">{subscription ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${subscriptionTone(subscription)}`}>{subscriptionStatusLabel(subscription)}</span> : <span className="inline-flex rounded-full bg-raised px-2.5 py-1 text-xs font-extrabold text-ink-muted">Not connected</span>}<span className="mt-2 block text-xs font-semibold text-ink-muted">{plan.name} · {formatPeso(catalog.monthlyPriceCentavos)}/month</span></td><td className="whitespace-nowrap px-6 py-4 text-ink-muted">{formatDate(organization.created_at)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="operations-controls-heading">
          <div className="flex flex-col gap-2 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Lifecycle and support</p>
              <h2 id="operations-controls-heading" className="mt-1 text-xl font-extrabold">Business controls</h2>
            </div>
            <p className="max-w-xl text-xs font-semibold leading-5 text-ink-muted">Each action is recorded in the organization audit trail. The controls stay disabled until the billing and support policies are both published.</p>
          </div>
          {organizations.length === 0 ? <p className="py-8 text-center text-sm text-ink-muted">No business accounts to manage.</p> : <div className="grid gap-4 pt-5 xl:grid-cols-2">{organizations.map((organization) => <article key={organization.id} className="rounded-card border border-line bg-raised p-4"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold">{organization.name}</h3><p className="mt-1 text-xs font-semibold text-ink-muted">Account operations for {organization.id.slice(0, 8)}</p></div><span className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-extrabold ${organization.account_status === "suspended" ? "bg-danger-soft text-danger" : "bg-success/10 text-success"}`}>{organization.account_status === "suspended" ? "Suspended" : "Active"}</span></div>{organization.account_status === "suspended" && organization.suspension_reason && <p className="mb-4 rounded-btn bg-danger-soft px-3 py-2 text-xs font-semibold leading-5 text-danger">Reason: {organization.suspension_reason}</p>}<OrganizationOperations orgId={organization.id} orgName={organization.name} accountStatus={organization.account_status ?? "active"} suspensionReason={organization.suspension_reason ?? null} policyGateOpen={policyGateOpen} schemaAvailable={accountOperationsSchemaReady} /></article>)}</div>}
        </section>

        <p className="mt-5 text-xs leading-5 text-ink-muted">This console owns the policy, pricing, account lifecycle, and support setup. Every mutation is server-guarded and remains unavailable until both the billing and support policies are published.</p>
      </div>
    </main>
  );
}

async function readOrganizations(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const rich = await admin.from("organizations").select("id, name, created_at, owner_profile_id, subscription_status, subscription_plan, subscription_current_period_end, account_status, suspension_reason, suspended_at").order("created_at", { ascending: false }).limit(100);
  if (!rich.error) return { records: (rich.data ?? []) as OrganizationRecord[], subscriptionFieldsAvailable: true, accountFieldsAvailable: true };

  const basic = await admin.from("organizations").select("id, name, created_at, owner_profile_id").order("created_at", { ascending: false }).limit(100);
  return { records: (basic.data ?? []) as OrganizationRecord[], subscriptionFieldsAvailable: false, accountFieldsAvailable: false };
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

function PolicyGateStatus({ label, published }: { label: string; published: boolean }) {
  return <div className="flex min-w-[142px] items-center gap-2 rounded-btn bg-primary-fg/10 px-3 py-2.5 text-xs font-extrabold"><span className={`grid h-5 w-5 place-items-center rounded-full ${published ? "bg-success text-primary-fg" : "bg-primary-fg/20 text-primary-fg/75"}`}><AdminIcon name={published ? "check" : "alert"} size={12} /></span><span><span className="block text-[10px] uppercase tracking-wide text-primary-fg/60">{label}</span><span className="mt-0.5 block">{published ? "Published" : "Draft"}</span></span></div>;
}

function ReadinessRow({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-btn bg-raised px-3 py-2.5"><span className="text-xs font-extrabold text-ink">{label}</span><span className={`text-right text-[11px] font-bold ${ready ? "text-success" : "text-ink-muted"}`}>{detail}</span></div>;
}

function LockedAction({ icon, label, detail, href, hrefLabel }: { icon: "wallet" | "alert" | "help"; label: string; detail: string; href?: string; hrefLabel?: string }) {
  return <div className="rounded-card border border-line bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-raised text-ink-muted"><AdminIcon name={icon} size={17} /></span><p className="mt-3 text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>{href ? <Link href={href} className="mt-4 block w-full rounded-btn bg-primary px-3 py-2.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-primary-fg">{hrefLabel ?? "Open owner billing"}</Link> : <button type="button" disabled className="mt-4 w-full rounded-btn bg-secondary px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted disabled:cursor-not-allowed">Locked</button>}</div>;
}

function PlatformAccessDenied() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Platform access is restricted</h1><p className="mt-3 text-sm leading-6 text-ink-muted">This account is not on the platform administrator allowlist.</p><Link href="/login" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to owner login</Link></div></main>;
}

function PlatformUnavailable({ detail }: { detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">Platform console unavailable</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p></div></main>;
}
