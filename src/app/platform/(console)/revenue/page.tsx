import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatPeso } from "@/lib/money";
import type { PlatformRevenueContribution, PlatformRevenuePlanMixEntry } from "@/lib/platform-revenue";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied, PlatformMetric, PlatformMigrationNotice, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";
import { formatDate, readPlatformRevenue } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformRevenuePage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const revenue = await readPlatformRevenue(actor.admin);
  const { readout, organizationsResult } = revenue;
  const coverageLabel = organizationsResult.hasMore
    ? `${organizationsResult.records.length} shown of ${organizationsResult.total ?? "an unknown total"}`
    : `${organizationsResult.records.length} organizations`;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Revenue readout"
          title="Contracted revenue"
          description="Normalize current recurring contract terms into a monthly run rate, then keep paid commitments separate from trial, complimentary, and prepaid access."
          actions={<>
            <Link href="/platform/plans" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={14} /> Plans &amp; pricing</Link>
            <Link href="/platform/billing" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="history" size={14} /> Billing evidence</Link>
            <Link href="/platform" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="dashboard" size={14} /> Overview</Link>
          </>}
        />

        {!revenue.catalogSchemaAvailable && <PlatformMigrationNotice migrations={["0027_platform_operations.sql", "0068_branch_billing_pricing.sql"]} />}
        {!organizationsResult.subscriptionFieldsAvailable && <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Subscription, billing-variant, or billed-branch fields are unavailable. Contributions stay unsupported rather than guessing a contract amount; apply the subscription and branch-entitlement migrations before using this readout.</div>}

        <section className="mt-6 rounded-[22px] border border-primary/20 bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:p-6" aria-labelledby="contracted-definition-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Definition</p>
              <h2 id="contracted-definition-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">Contracted, not collected</h2>
              <p className="mt-2 text-sm leading-6 text-primary-fg/75">This is a current-catalog estimate of recurring contract value. It is not cash collected, payment settlement, invoice revenue, or a historical revenue series.</p>
            </div>
            <div className="rounded-2xl border border-primary-fg/15 bg-primary-fg/10 px-4 py-3 text-sm lg:min-w-[250px]">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-fg/60">Readout as of</p>
              <p className="mt-1 font-extrabold">{formatAsOf(readout.asOf)}</p>
              <p className="mt-1 text-xs font-semibold text-primary-fg/65">{coverageLabel} · Asia/Singapore</p>
            </div>
          </div>
          <p className="mt-5 border-t border-primary-fg/15 pt-4 text-xs leading-5 text-primary-fg/70">Active and past-due recurring subscriptions contribute. Annual terms are divided by their term months; stored entitled branch capacity is priced with the current catalog. Trials, complimentary-only access, paused/incomplete/canceled states, and temporary QRPH access do not contribute MRR.</p>
        </section>

        {(organizationsResult.hasMore || revenue.accessGrantsHasMore) && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">This readout is bounded: {organizationsResult.hasMore ? `${coverageLabel} are included, so unseen organizations are not in the totals` : "organization coverage is complete"}{revenue.accessGrantsHasMore ? "; current complimentary grants reached the reader limit" : ""}. Treat the displayed MRR and ARR as partial until coverage is complete.</div>}
        {!revenue.accessGrantsSchemaAvailable && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Complimentary-access data is unavailable. Contracted MRR still excludes trial and access-grant-only organizations where their subscription state is visible, but the unbilled-access breakdown is incomplete until <code className="font-extrabold">0052_platform_access_grants.sql</code> is applied.</div>}
        {readout.unsupportedOrganizationCount > 0 && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">{readout.unsupportedOrganizationCount} recurring organization{readout.unsupportedOrganizationCount === 1 ? " has" : "s have"} no trusted current-catalog mapping or billed branch quantity. Those amounts are labeled unsupported and are not silently substituted into MRR.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Contracted revenue summary">
          <PlatformMetric label="Normalized MRR" value={formatRevenue(readout.contractedMrrCentavos)} detail={`${readout.contractedOrganizationCount} contracted commitments · not collected`} icon="wallet" />
          <PlatformMetric label="ARR run-rate" value={formatRevenue(readout.arrCentavos)} detail="12× contracted MRR · not annual cash" icon="chart" />
          <PlatformMetric label="Active contracts" value={readout.activeOrganizationCount} detail={`${formatRevenue(readout.activeMrrCentavos)} normalized MRR`} icon="check" />
          <PlatformMetric label="Past-due MRR" value={formatRevenue(readout.pastDueMrrCentavos)} detail={`${readout.pastDueOrganizationCount} contracted accounts at collection risk`} icon="alert" />
          <PlatformMetric label="Unbilled access" value={readout.unbilledAccess.totalOrganizationCount} detail={`${readout.unbilledAccess.trialOrganizationCount} trial · ${readout.unbilledAccess.complimentaryOrganizationCount} complimentary`} icon="lock" />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="plan-mix-heading">
            <PlatformSectionHeading eyebrow="Recurring mix" title="Plan mix" description="Recognized recurring commitments grouped by the stored billing variant. The current product has one Premium plan, so billing cycle is the meaningful mix." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{readout.contractedOrganizationCount} orgs</span>} />
            <div className="mt-5 space-y-4">
              {readout.planMix.length === 0 ? <p className="rounded-2xl border border-dashed border-line-strong bg-raised/50 px-4 py-8 text-center text-sm text-ink-muted">No mapped recurring commitments are available in this readout.</p> : readout.planMix.map((entry) => <PlanMixRow key={entry.key} entry={entry} totalMrrCentavos={readout.contractedMrrCentavos} />)}
            </div>
            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <MixNote label="Recurring" value={readout.contractedOrganizationCount} detail="Included in MRR" />
              <MixNote label="Temporary QRPH" value={readout.prepaidOrganizationCount} detail="Billed separately" />
              <MixNote label="Unsupported" value={readout.unsupportedOrganizationCount} detail="Needs contract evidence" />
            </div>
          </article>

          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="unbilled-access-heading">
            <PlatformSectionHeading eyebrow="Access without recurring MRR" title="Unbilled access" description="Access can be active even when no recurring contract value is recognized. These organizations stay out of MRR." />
            <dl className="mt-5 divide-y divide-line">
              <AccessRow label="Trial access" value={readout.unbilledAccess.trialOrganizationCount} detail="Current trial status" />
              <AccessRow label="Complimentary access" value={readout.unbilledAccess.complimentaryOrganizationCount} detail="Current platform grant" />
              <AccessRow label="Overlap" value={readout.unbilledAccess.trialAndComplimentaryOrganizationCount} detail="Trial and grant on the same organization" />
              <AccessRow label="Total unique access" value={readout.unbilledAccess.totalOrganizationCount} detail="Union of trial and complimentary access" />
            </dl>
            <div className="mt-5 rounded-2xl border border-accent/25 bg-secondary/55 p-4 text-xs leading-5 text-ink-muted"><strong className="text-ink">Why this matters:</strong> a current grant contributes zero MRR but does not erase an independently mapped paid subscription. Temporary QRPH access is billed separately and is shown as excluded rather than unbilled.</div>
          </article>
        </section>

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="top-contributors-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Account contributions" title="Top contributing organizations" description="The largest recognized recurring commitments by normalized MRR. Past-due subscriptions remain visible and are labeled as at risk." action={<span className="text-xs font-semibold text-ink-muted">Top {readout.topContributors.length} · {formatRevenue(readout.contractedMrrCentavos)} total</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <caption className="sr-only">Top organizations contributing to contracted monthly recurring revenue</caption>
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th scope="col" className="px-6 py-3 font-extrabold">Organization</th><th scope="col" className="px-6 py-3 font-extrabold">Contract</th><th scope="col" className="px-6 py-3 font-extrabold">Branches</th><th scope="col" className="px-6 py-3 font-extrabold">Status</th><th scope="col" className="px-6 py-3 text-right font-extrabold">Normalized MRR</th><th scope="col" className="px-6 py-3 text-right font-extrabold">ARR run-rate</th></tr></thead>
              <tbody className="divide-y divide-line">
                {readout.topContributors.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-muted">No mapped recurring contributors are available.</td></tr> : readout.topContributors.map((contribution) => <ContributorRow key={contribution.organizationId} contribution={contribution} />)}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-raised/60 px-5 py-4 text-xs leading-5 text-ink-muted sm:px-6">Amounts use the current catalog and stored entitled branch capacity. They are contract run-rate estimates, not provider-collected cash; open Billing evidence for receipt metadata.</div>
        </section>

        <section className="mt-6 rounded-[22px] border border-line bg-raised/55 p-5 text-xs leading-5 text-ink-muted sm:p-6" aria-labelledby="revenue-method-heading">
          <h2 id="revenue-method-heading" className="text-sm font-extrabold text-ink">Calculation boundary</h2>
          <p className="mt-2">The readout prices active and past-due recurring subscriptions from the current catalog, divides the stored term total by its term months, and multiplies normalized MRR by 12 for ARR. It does not infer historical discounts, payment settlement, refunds, fees, churn, or revenue movement from current account state.</p>
          <p className="mt-2">Source coverage: {coverageLabel} · catalog {revenue.catalogSchemaAvailable ? "available" : "fallback defaults"} · grant table {revenue.accessGrantsSchemaAvailable ? "available" : "unavailable"} · last read {formatDate(readout.asOf)}.</p>
        </section>
      </div>
    </main>
  );
}

function PlanMixRow({ entry, totalMrrCentavos }: { entry: PlatformRevenuePlanMixEntry; totalMrrCentavos: number }) {
  const width = totalMrrCentavos > 0 ? Math.min(Math.max((entry.mrrCentavos / totalMrrCentavos) * 100, 0), 100) : 0;
  return <div className="rounded-2xl border border-line bg-raised/55 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-extrabold">{entry.label}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{entry.organizationCount} organization{entry.organizationCount === 1 ? "" : "s"} · {entry.intervalMonths} month{entry.intervalMonths === 1 ? "" : "s"}</p></div><div className="text-right"><p className="text-base font-extrabold tabular-nums">{formatRevenue(entry.mrrCentavos)}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{entry.sharePercent.toFixed(1)}%</p></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-label={`${entry.label} is ${entry.sharePercent.toFixed(1)} percent of contracted MRR`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.sharePercent}><span className="block h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${width}%` }} /></div></div>;
}

function MixNote({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-xl border border-line bg-raised/55 p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">{label}</p><p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p><p className="mt-0.5 text-xs font-semibold text-ink-muted">{detail}</p></div>;
}

function AccessRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="flex items-center justify-between gap-4 py-3"><div><dt className="text-sm font-extrabold">{label}</dt><dd className="mt-1 text-xs font-semibold text-ink-muted">{detail}</dd></div><strong className="text-2xl font-extrabold tabular-nums">{value}</strong></div>;
}

function ContributorRow({ contribution }: { contribution: PlatformRevenueContribution }) {
  const isPastDue = contribution.state === "past_due";
  return <tr className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><Link href={`/platform/organizations/${contribution.organizationId}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{contribution.organizationName}</Link><span className="mt-1 block text-xs text-ink-muted">{contribution.organizationId.slice(0, 8)}</span></td><td className="px-6 py-4"><strong className="block">{contribution.planLabel}</strong><span className="mt-1 block text-xs font-semibold text-ink-muted">{contribution.billingCycleLabel ?? "Billing cycle unavailable"}{contribution.discountPercent ? ` · ${contribution.discountPercent}% discount` : ""}</span></td><td className="px-6 py-4"><strong>{contribution.entitledBranchCount ?? "Unknown"}</strong><span className="mt-1 block text-xs text-ink-muted">entitled{contribution.pendingBranchCount ? ` · ${contribution.pendingBranchCount} pending` : ""}</span></td><td className="px-6 py-4">{isPastDue ? <span className="inline-flex rounded-full bg-warning/15 px-2.5 py-1 text-xs font-extrabold text-ink">Past due</span> : <span className="inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-extrabold text-success">Contracted</span>}</td><td className="px-6 py-4 text-right font-extrabold tabular-nums">{formatRevenue(contribution.normalizedMrrCentavos ?? 0)}</td><td className="px-6 py-4 text-right font-extrabold tabular-nums">{formatRevenue((contribution.normalizedMrrCentavos ?? 0) * 12)}</td></tr>;
}

function formatRevenue(centavos: number) {
  return formatPeso(Math.round(centavos));
}

function formatAsOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
