import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { getCheckoutReadiness, isPolicyGateOpen } from "@/lib/platform-operations";
import { readPayMongoSubscriptionReadiness, readPlatformOperations, payMongoConfiguration, supportCasesSchemaAvailable } from "@/lib/platform-operations-server";
import { PlatformMetric, PlatformMigrationNotice, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "../PlatformUI";
import { countByOrg, formatDate, readPlatformDirectory } from "../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const [directory, operations, supportCasesReady, paymongoSubscriptionReadiness] = await Promise.all([
    readPlatformDirectory(admin),
    readPlatformOperations(admin),
    supportCasesSchemaAvailable(admin),
    readPayMongoSubscriptionReadiness(),
  ]);

  const { organizations, profiles, stores, employees, authEmailById, organizationsResult } = directory;
  const { catalog, policies } = operations;
  const policyGateOpen = isPolicyGateOpen(policies);
  const paymongo = payMongoConfiguration();
  const publishedPolicies = Number(policies.billing.status === "published") + Number(policies.support.status === "published");
  const activeSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "active").length;
  const trialSubscriptions = organizations.filter((organization) => organization.subscription_status && normalizeSubscriptionStatus(organization.subscription_status) === "trialing").length;
  const storesByOrg = countByOrg(stores);
  const activeStores = stores.filter((store) => store.is_active).length;
  const activeStaff = employees.filter((employee) => employee.is_active).length;
  const accountOperationsReady = organizationsResult.accountFieldsAvailable && policies.schemaAvailable && supportCasesReady;
  const checkoutReadiness = getCheckoutReadiness({
    catalog,
    policies,
    paymongo: {
      secretKeyConfigured: paymongo.secretKeyConfigured,
      publicKeyConfigured: paymongo.publicKeyConfigured,
      keyModeConsistent: paymongo.keyModeConsistent,
      webhookSecretConfigured: paymongo.webhookSecretConfigured,
      subscriptionsEnabled: paymongo.subscriptionsEnabled,
      subscriptionApiAvailable: paymongoSubscriptionReadiness.subscriptionsApiAvailable,
      subscriptionPaymentMethods: paymongoSubscriptionReadiness.subscriptionPaymentMethods,
    },
  });
  const checkoutReady = checkoutReadiness.ready;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Platform command center"
          title="Platform overview"
          description="See what needs attention across subscription revenue, workspace access, policy gates, and account operations."
          actions={<>
            <Link href="/platform/plans" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={14} /> Manage plans</Link>
            <Link href="/admin" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Owner dashboard</Link>
          </>}
        />

        {(!organizationsResult.subscriptionFieldsAvailable || !organizationsResult.accountFieldsAvailable || !catalog.schemaAvailable || !policies.schemaAvailable || !supportCasesReady) && <PlatformMigrationNotice migrations={["0027_platform_operations.sql", "0028_support_cases.sql"]} />}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
          <PlatformMetric label="Businesses" value={organizations.length} detail={`${activeSubscriptions} active subscriptions · ${trialSubscriptions} in trial`} icon="dashboard" />
          <PlatformMetric label="Active stores" value={activeStores} detail={`${stores.length} total branches`} icon="customers" />
          <PlatformMetric label="Active staff" value={activeStaff} detail={`${employees.length} employee records`} icon="employees" />
          <PlatformMetric label="Policy gate" value={`${publishedPolicies}/2`} detail={policyGateOpen ? "Ready for gated actions" : "Checkout and actions locked"} icon="lock" />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Workspace map" title="Manage the platform by feature" description="Each area now has one job, so the control you need is never buried in a long page." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FeatureLink href="/platform/plans" icon="wallet" label="Plans & Pricing" detail={`${catalog.variants.filter((variant) => variant.isActive).length} live offers · ${formatPeso(catalog.monthlyPriceCentavos)} monthly base`} />
              <FeatureLink href="/platform/users" icon="customers" label="Users" detail={`${profiles.length} user profiles across ${organizations.length} businesses`} />
              <FeatureLink href="/platform/policies" icon="lock" label="Policies" detail={`${publishedPolicies}/2 published · controls stay gated until complete`} />
              <FeatureLink href="/platform/operations" icon="refresh" label="Operations" detail={accountOperationsReady ? "Lifecycle and support controls are available" : "Finish migrations before using account controls"} />
            </div>
          </article>

          <article className="rounded-[22px] border border-line bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-fg/12"><AdminIcon name={policyGateOpen ? "check" : "alert"} size={19} /></span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/65">Operational readiness</p>
                <h2 className="mt-1 text-xl font-extrabold">{policyGateOpen ? "Policies are open" : "Policies need attention"}</h2>
                <p className="mt-1 text-sm leading-6 text-primary-fg/72">Publishing both policies unlocks the account lifecycle, support, and checkout actions.</p>
              </div>
            </div>
            <div className="mt-5 space-y-2.5">
              <ReadinessRow label="Billing policy" ready={policies.billing.status === "published"} detail={policies.billing.status === "published" ? "Published" : "Draft"} dark />
              <ReadinessRow label="Support policy" ready={policies.support.status === "published"} detail={policies.support.status === "published" ? "Published" : "Draft"} dark />
              <ReadinessRow label="Checkout provider" ready={checkoutReady} detail={checkoutReady ? "Ready" : "Setup incomplete"} dark />
              <ReadinessRow label="Account operations" ready={accountOperationsReady && policyGateOpen} detail={accountOperationsReady && policyGateOpen ? "Ready" : "Locked"} dark />
            </div>
            <Link href={policyGateOpen ? "/platform/operations" : "/platform/policies"} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary-fg px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg">{policyGateOpen ? "Open operations" : "Review policies"}<AdminIcon name="arrow" size={14} /></Link>
          </article>
        </section>

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="recent-businesses-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Recent workspaces" title="Business directory" description="A quick view of the latest accounts. Open Users for access records or Operations for lifecycle controls." action={<Link href="/platform/users" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">View all users <AdminIcon name="arrow" size={13} /></Link>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Team</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Created</th></tr></thead>
              <tbody className="divide-y divide-line">
                {organizations.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-ink-muted">No business accounts yet.</td></tr> : organizations.slice(0, 6).map((organization) => {
                  const owner = organization.owner_profile_id ? profileById.get(organization.owner_profile_id) : undefined;
                  const subscription = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
                  const plan = getBillingPlan(organization.subscription_plan);
                  return <tr key={organization.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><strong className="block font-extrabold">{organization.name}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.id.slice(0, 8)}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? "Owner profile pending"}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "—"}</span></td><td className="px-6 py-4"><strong>{storesByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">stores connected</span></td><td className="px-6 py-4">{subscription ? <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${subscriptionTone(subscription)}`}>{subscriptionStatusLabel(subscription)}</span> : <span className="inline-flex rounded-full bg-raised px-2.5 py-1 text-xs font-extrabold text-ink-muted">Not connected</span>}<span className="mt-2 block text-xs font-semibold text-ink-muted">{plan.name} · {formatPeso(catalog.monthlyPriceCentavos)}/month</span></td><td className="whitespace-nowrap px-6 py-4 text-ink-muted">{formatDate(organization.created_at)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureLink({ href, icon, label, detail }: { href: string; icon: "wallet" | "customers" | "lock" | "refresh"; label: string; detail: string }) {
  return <Link href={href} className="group flex min-h-[104px] items-start gap-3 rounded-[18px] border border-line bg-raised/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-primary-fg"><AdminIcon name={icon} size={16} /></span><span><strong className="block text-sm font-extrabold">{label}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></span><AdminIcon name="arrow" size={14} /></Link>;
}

function ReadinessRow({ label, detail, ready, dark = false }: { label: string; detail: string; ready: boolean; dark?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${dark ? "bg-primary-fg/10" : "bg-raised"}`}><span className={`text-xs font-extrabold ${dark ? "text-primary-fg" : "text-ink"}`}>{label}</span><span className={`flex items-center gap-1.5 text-right text-[11px] font-bold ${ready ? dark ? "text-[#d8edcf]" : "text-success" : dark ? "text-primary-fg/60" : "text-ink-muted"}`}><span className={`grid h-4 w-4 place-items-center rounded-full ${ready ? "bg-success text-primary-fg" : dark ? "bg-primary-fg/15 text-primary-fg/60" : "bg-secondary text-ink-muted"}`}><AdminIcon name={ready ? "check" : "alert"} size={10} /></span>{detail}</span></div>;
}
