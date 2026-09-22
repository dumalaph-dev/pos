import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { getBillingPlan, normalizeSubscriptionStatus, subscriptionStatusLabel, subscriptionTone } from "@/lib/billing";
import { formatPeso } from "@/lib/money";
import { getCheckoutReadiness, isPolicyGateOpen, readPolicyNumber } from "@/lib/platform-operations";
import { readPayMongoSubscriptionReadiness, readPlatformOperations, payMongoConfiguration, supportCasesSchemaAvailable } from "@/lib/platform-operations-server";
import { platformOperatorRoleLabel } from "@/lib/platform-operators";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { derivePlatformEntitlementSummary } from "@/lib/platform-entitlements";
import { sortPlatformAttentionItems, type PlatformAttentionItem } from "@/lib/platform-attention";
import { syncHealthFreshnessLabel, syncHealthStatusLabel } from "@/lib/platform-sync-health";
import { PlatformAccessDenied, PlatformMetric, PlatformMigrationNotice, PlatformPageHeader, PlatformSectionHeading } from "../PlatformUI";
import { PlatformAttentionInbox } from "../PlatformAttentionInbox";
import { PlatformMyWork } from "../PlatformMyWork";
import { readPlatformMyWork } from "@/lib/platform-my-work-server";
import { countByOrg, formatDate, readPlatformDirectory, readPlatformEntitlementRecords, readPlatformHomeSummary, readPlatformSupportCases, readPlatformSyncHealth, type OrganizationRecord, type PlatformSupportCaseResult, type PlatformSyncHealthResult } from "../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  const admin = actor.admin;

  const canViewSupport = actor.role !== "billing";
  const [directory, operations, supportCasesReady, paymongoSubscriptionReadiness, syncHealth, supportCases, homeSummary, myWork] = await Promise.all([
    readPlatformDirectory(admin),
    readPlatformOperations(admin),
    supportCasesSchemaAvailable(admin),
    readPayMongoSubscriptionReadiness(),
    readPlatformSyncHealth(admin),
    canViewSupport ? readPlatformSupportCases(admin) : Promise.resolve({ records: [], schemaAvailable: false, organizationsAvailable: true, hasMore: false, total: null, asOf: new Date().toISOString() }),
    readPlatformHomeSummary(admin),
    readPlatformMyWork(admin, actor.email, canViewSupport),
  ]);

  const { organizations, profiles, stores, authEmailById, organizationsResult } = directory;
  const { catalog, policies } = operations;
  const policyGateOpen = isPolicyGateOpen(policies);
  const paymongo = payMongoConfiguration();
  const publishedPolicies = Number(policies.billing.status === "published") + Number(policies.support.status === "published");
  const storesByOrg = countByOrg(stores);
  const activeStoresByOrg = countByOrg(stores.filter((store) => store.is_active));
  const entitlementRecords = await readPlatformEntitlementRecords(admin);
  const trialDays = readPolicyNumber(policies.billing, "trialDays", 14);
  const entitlementSummaries = organizations.map((organization) => derivePlatformEntitlementSummary({
    organization,
    grants: entitlementRecords.accessGrantsByOrg.get(organization.id),
    trialExtensions: entitlementRecords.trialExtensionsByOrg.get(organization.id),
    activeBranchCount: activeStoresByOrg.get(organization.id) ?? 0,
    includedBranchCount: catalog.includedBranchCount,
    trialDays,
  }));
  const trialExpiring = entitlementSummaries.filter((summary) => summary.filterKeys.includes("trial_expiring")).length;
  const grantsExpiring = entitlementSummaries.filter((summary) => summary.filterKeys.includes("grant_expiring")).length;
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
  const attentionItems = buildAttentionItems({
    organizations,
    entitlementSummaries,
    policies,
    checkoutReady,
    syncHealth,
    supportCases: supportCases.records,
    canViewSupport,
  });

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Platform command center"
          title="Platform overview"
          description="See what needs attention across subscription revenue, workspace access, policy gates, and account operations."
          actions={<>
            <Link href="/platform/attention" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="bell" size={14} /> Needs attention</Link>
            <Link href="/platform/plans" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={14} /> Manage plans</Link>
            <Link href="/admin" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Owner dashboard</Link>
          </>}
        />

        {(!organizationsResult.subscriptionFieldsAvailable || !organizationsResult.accountFieldsAvailable || !catalog.schemaAvailable || !policies.schemaAvailable || !supportCasesReady) && <PlatformMigrationNotice migrations={["0027_platform_operations.sql", "0028_support_cases.sql", "0068_branch_billing_pricing.sql"]} />}
        <section className="mt-6 flex flex-col gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-xs font-semibold text-ink-muted shadow-[var(--shadow-card)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" aria-label="Home data context">
          <span><strong className="text-ink">Home preset:</strong> {platformOperatorRoleLabel(actor.role)} · {canViewSupport ? "Support and lifecycle signals visible" : "Support detail restricted"}</span>
          <span><strong className="text-ink">Summary as of:</strong> {formatPlatformTimestamp(homeSummary.asOf)}</span>
          <span><strong className="text-ink">Recent account coverage:</strong> {organizationsResult.hasMore ? `${organizations.length} shown of ${homeSummary.totalBusinesses ?? "an unknown total"}` : `${organizations.length} shown`}</span>
        </section>
        {(!homeSummary.organizationsAvailable || !homeSummary.subscriptionFieldsAvailable || !homeSummary.accountFieldsAvailable || !homeSummary.profilesAvailable || !homeSummary.storesAvailable || !homeSummary.employeesAvailable) && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Some Home summary counts are unavailable because one or more aggregate sources did not respond. Unknown values remain labeled; recent account detail is still available where its bounded reader succeeded.</div>}
        {canViewSupport && supportCases.hasMore && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status"><span>Attention includes the first 250 active support cases{supportCases.total === null ? "" : ` of ${supportCases.total}`}. Older matching cases are outside this overview sample.</span><Link href="/platform/operations#business-controls-heading" className="inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-xs font-extrabold text-primary transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Open operations</Link></div>}
        {canViewSupport && !supportCases.organizationsAvailable && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Support cases loaded without organization names. The case records remain visible, but organization links may be unavailable until the organization read recovers.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform summary">
          <PlatformMetric label="Businesses" value={homeSummary.totalBusinesses ?? "Unknown"} detail={`${homeSummary.activeSubscriptions ?? "Unknown"} active subscriptions · ${homeSummary.trialSubscriptions ?? "Unknown"} in trial`} icon="dashboard" />
          <PlatformMetric label="Active stores" value={homeSummary.activeStores ?? "Unknown"} detail={`${homeSummary.totalStores ?? "Unknown"} total branches`} icon="customers" />
          <PlatformMetric label="Active staff" value={homeSummary.activeEmployees ?? "Unknown"} detail={`${homeSummary.totalEmployees ?? "Unknown"} employee records`} icon="employees" />
          <PlatformMetric label="Policy gate" value={`${publishedPolicies}/2`} detail={policyGateOpen ? "Ready for gated actions" : "Checkout and actions locked"} icon="lock" />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Workspace map" title="Manage the platform by feature" description="Each area now has one job, so the control you need is never buried in a long page." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FeatureLink href="/platform/plans" icon="wallet" label="Plans & Pricing" detail={`${catalog.variants.filter((variant) => variant.isActive).length} live offers · ${formatPeso(catalog.monthlyPriceCentavos)} base · ${formatPeso(catalog.additionalBranchPriceCentavos)} per extra branch`} />
              <FeatureLink href="/platform/promotions" icon="tag" label="Promo & Marketing" detail="Create checkout codes and measure paid conversion" />
              <FeatureLink href="/platform/users" icon="customers" label="Users" detail={`${homeSummary.totalProfiles ?? "Unknown"} user profiles across ${homeSummary.totalBusinesses ?? "unknown"} businesses`} />
              <FeatureLink href="/platform/audit" icon="history" label="Audit log" detail="Review platform actions across organizations" />
              <FeatureLink href="/platform/fleet" icon="chart" label="Fleet health" detail="Review performance signals by organization" />
              <FeatureLink href="/platform/sync" icon="refresh" label="Sync & outbox" detail="Find stuck queues by branch" />
              <FeatureLink href="/platform/policies" icon="lock" label="Policies" detail={`${publishedPolicies}/2 published · controls stay gated until complete`} />
              <FeatureLink href="/platform/operations" icon="refresh" label="Operations" detail={accountOperationsReady ? `${trialExpiring + grantsExpiring} trial or grant expiry signal${trialExpiring + grantsExpiring === 1 ? "" : "s"} · access controls available` : "Finish migrations before using account controls"} />
              <FeatureLink href="/platform/announcements" icon="bell" label="Announcements" detail="Draft, schedule, and retire merchant updates" />
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
              <ReadinessRow label="Trial expiry" ready={trialExpiring === 0} detail={trialExpiring === 0 ? "No near-term expiry" : `${trialExpiring} within 7 days`} dark />
              <ReadinessRow label="Grant expiry" ready={grantsExpiring === 0} detail={grantsExpiring === 0 ? "No near-term expiry" : `${grantsExpiring} within 7 days`} dark />
            </div>
            <Link href={policyGateOpen ? "/platform/operations" : "/platform/policies"} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary-fg px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg">{policyGateOpen ? "Open operations" : "Review policies"}<AdminIcon name="arrow" size={14} /></Link>
          </article>
        </section>

        <PlatformAttentionInbox items={attentionItems} />
        <PlatformMyWork work={myWork} />

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="recent-businesses-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Recent workspaces" title="Business directory" description="A bounded view of the latest accounts. Open Users for access records or Operations for lifecycle controls." action={<div className="flex flex-wrap items-center gap-3"><span className="text-xs font-semibold text-ink-muted">{organizationsResult.hasMore ? `${organizations.length} recent of ${homeSummary.totalBusinesses ?? "an unknown total"}` : `${organizations.length} recent`}</span><Link href="/platform/users" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">View all users <AdminIcon name="arrow" size={13} /></Link></div>} />
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

function buildAttentionItems({
  organizations,
  entitlementSummaries,
  policies,
  checkoutReady,
  syncHealth,
  supportCases,
  canViewSupport,
}: {
  organizations: OrganizationRecord[];
  entitlementSummaries: Array<ReturnType<typeof derivePlatformEntitlementSummary>>;
  policies: Awaited<ReturnType<typeof readPlatformOperations>>["policies"];
  checkoutReady: boolean;
  syncHealth: PlatformSyncHealthResult;
  supportCases: PlatformSupportCaseResult["records"];
  canViewSupport: boolean;
}): PlatformAttentionItem[] {
  const items: PlatformAttentionItem[] = [];
  for (const organization of organizations) {
    const status = organization.subscription_status ? normalizeSubscriptionStatus(organization.subscription_status) : null;
    if (status === "past_due") items.push({ id: `billing:${organization.id}:past_due`, category: "billing", severity: "critical", title: "Payment is due", detail: "Subscription access may pause if the outstanding payment is not recovered.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review account" });
    if (status === "paused") items.push({ id: `billing:${organization.id}:paused`, category: "billing", severity: "critical", title: "Subscription is paused", detail: "Confirm whether this is a failed payment or an expired trial before restoring access.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review billing state" });
    if (status === "incomplete") items.push({ id: `billing:${organization.id}:incomplete`, category: "billing", severity: "high", title: "Subscription setup is incomplete", detail: "The owner has not completed the subscription setup needed for paid access.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review account" });
    if (organization.account_status === "suspended") items.push({ id: `access:${organization.id}:suspended`, category: "access", severity: "high", title: "Account is suspended", detail: organization.suspension_reason ? `Reason: ${organization.suspension_reason}` : "Review the account controls and recorded lifecycle history.", organizationName: organization.name, organizationId: organization.id, href: `/platform/organizations/${organization.id}`, actionLabel: "Review access" });
  }

  for (const summary of entitlementSummaries) {
    if (summary.filterKeys.includes("trial_expiring")) items.push({ id: `access:${summary.organizationId}:trial_expiring`, category: "access", severity: "high", title: "Trial ends within seven days", detail: summary.trial.endsAt ? `Access ends ${formatDate(summary.trial.endsAt)}.` : summary.accessDetail, organizationName: summary.organizationName, organizationId: summary.organizationId, href: `/platform/organizations/${summary.organizationId}`, actionLabel: "Review entitlement", createdAt: summary.trial.endsAt ?? undefined });
    if (summary.filterKeys.includes("grant_expiring")) items.push({ id: `access:${summary.organizationId}:grant_expiring`, category: "access", severity: "medium", title: "Complimentary access ends within seven days", detail: summary.currentGrant?.endsAt ? `Grant ends ${formatDate(summary.currentGrant.endsAt)}.` : "Review the current grant before access ends.", organizationName: summary.organizationName, organizationId: summary.organizationId, href: `/platform/organizations/${summary.organizationId}`, actionLabel: "Review grant", createdAt: summary.currentGrant?.endsAt });
  }

  if (canViewSupport) {
    const now = Date.now();
    for (const supportCase of supportCases) {
      const overdue = Date.parse(supportCase.first_response_due_at) <= now;
      items.push({ id: `support:${supportCase.id}`, category: "support", severity: supportCase.priority === "urgent" ? "critical" : overdue ? "high" : "medium", title: supportCase.priority === "urgent" ? `Urgent case: ${supportCase.subject}` : supportCase.subject, detail: `First response ${overdue ? "overdue" : "due"} ${formatDate(supportCase.first_response_due_at)} · ${supportCase.status.replaceAll("_", " ")}.`, organizationName: supportCase.organizationName, organizationId: supportCase.org_id, href: `/platform/organizations/${supportCase.org_id}`, actionLabel: "Open support history", createdAt: supportCase.first_response_due_at });
    }
  }

  for (const branch of syncHealth.summary.branchRows.filter((row) => row.status !== "healthy")) {
    const severity = branch.status === "needs_attention" ? "high" : "medium";
    const detail = branch.status === "needs_attention"
      ? `${branch.failedCount} failed · ${branch.conflictCount} conflict${branch.conflictCount === 1 ? "" : "s"} · ${branch.stuckCount} stuck.`
      : branch.status === "stale"
        ? `Last reporter update is ${syncHealthAge(branch.lastReportedAt, syncHealth.summary.asOf)} old.`
        : "No branch heartbeat is available yet.";
    items.push({ id: `sync:${branch.storeId}`, category: "sync", severity, title: `${syncHealthStatusLabel(branch.status)} at ${branch.storeName}`, detail: `${detail} ${syncHealthFreshnessLabel(branch.freshness)}.`, organizationName: branch.organizationName, organizationId: branch.organizationId, branchName: branch.storeName, href: "/platform/sync", actionLabel: "Open sync health", createdAt: branch.lastReportedAt ?? undefined });
  }

  if (policies.billing.status !== "published") items.push({ id: "readiness:billing-policy", category: "readiness", severity: "high", title: "Billing policy is still a draft", detail: "Checkout and billing actions remain gated until the billing policy is published.", href: "/platform/policies", actionLabel: "Review policies" });
  if (policies.support.status !== "published") items.push({ id: "readiness:support-policy", category: "readiness", severity: "high", title: "Support policy is still a draft", detail: "Support and account lifecycle actions remain gated until the support policy is published.", href: "/platform/policies", actionLabel: "Review policies" });
  if (!checkoutReady) items.push({ id: "readiness:checkout", category: "readiness", severity: "high", title: "Checkout setup is incomplete", detail: "Review the provider, subscription, and catalog readiness checks before sending owners to checkout.", href: "/platform/plans", actionLabel: "Review checkout setup" });

  return sortPlatformAttentionItems(items).slice(0, 60);
}

function syncHealthAge(value: string | null, asOf: string) {
  if (!value) return "unknown";
  const difference = Math.max(0, Date.parse(asOf) - Date.parse(value));
  const minutes = Math.round(difference / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function formatPlatformTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}

function FeatureLink({ href, icon, label, detail }: { href: string; icon: "wallet" | "customers" | "history" | "chart" | "lock" | "refresh" | "tag" | "bell"; label: string; detail: string }) {
  return <Link href={href} className="group flex min-h-[104px] items-start gap-3 rounded-[18px] border border-line bg-raised/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-primary-fg"><AdminIcon name={icon} size={16} /></span><span><strong className="block text-sm font-extrabold">{label}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></span><AdminIcon name="arrow" size={14} /></Link>;
}

function ReadinessRow({ label, detail, ready, dark = false }: { label: string; detail: string; ready: boolean; dark?: boolean }) {
  return <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${dark ? "bg-primary-fg/10" : "bg-raised"}`}><span className={`text-xs font-extrabold ${dark ? "text-primary-fg" : "text-ink"}`}>{label}</span><span className={`flex items-center gap-1.5 text-right text-[11px] font-bold ${ready ? dark ? "text-[#d8edcf]" : "text-success" : dark ? "text-primary-fg/60" : "text-ink-muted"}`}><span className={`grid h-4 w-4 place-items-center rounded-full ${ready ? "bg-success text-primary-fg" : dark ? "bg-primary-fg/15 text-primary-fg/60" : "bg-secondary text-ink-muted"}`}><AdminIcon name={ready ? "check" : "alert"} size={10} /></span>{detail}</span></div>;
}
