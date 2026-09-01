"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  PLATFORM_SYNC_HEALTH_QUEUES,
  PLATFORM_SYNC_HEALTH_STALE_AFTER_MS,
  PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS,
  syncHealthFreshnessLabel,
  syncHealthQueueLabel,
  syncHealthStatusLabel,
  type PlatformSyncHealthBranchRow,
  type PlatformSyncHealthFreshness,
  type PlatformSyncHealthMetrics,
  type PlatformSyncHealthOrganizationRow,
  type PlatformSyncHealthQueue,
  type PlatformSyncHealthQueueRow,
  type PlatformSyncHealthStatus,
  type PlatformSyncHealthSummary,
} from "@/lib/platform-sync-health";

const STATUS_FILTERS: Array<"all" | PlatformSyncHealthStatus> = ["all", "healthy", "needs_attention", "stale", "no_data"];
const FRESHNESS_FILTERS: Array<"all" | PlatformSyncHealthFreshness> = ["all", "fresh", "stale", "no_data"];
const QUEUE_FILTERS: Array<"all" | PlatformSyncHealthQueue> = ["all", ...PLATFORM_SYNC_HEALTH_QUEUES];

type BranchView = {
  row: PlatformSyncHealthBranchRow;
  metrics: PlatformSyncHealthMetrics;
  status: PlatformSyncHealthStatus;
  freshness: PlatformSyncHealthFreshness;
};

export function PlatformSyncHealthViewer({ summary, schemaAvailable, enhancedMetricsAvailable, organizationsAvailable, storesAvailable, hasMore }: {
  summary: PlatformSyncHealthSummary;
  schemaAvailable: boolean;
  enhancedMetricsAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  hasMore: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PlatformSyncHealthStatus>("all");
  const [freshness, setFreshness] = useState<"all" | PlatformSyncHealthFreshness>("all");
  const [queue, setQueue] = useState<"all" | PlatformSyncHealthQueue>("all");
  const normalizedSearch = search.trim().toLowerCase();
  const branchViews = useMemo<BranchView[]>(() => summary.branchRows.map((row) => {
    const queueRow = queue === "all" ? null : summary.queueRows.find((candidate) => candidate.storeId === row.storeId && candidate.queue === queue);
    return {
      row,
      metrics: queueRow ?? row,
      status: queueRow?.status ?? row.status,
      freshness: queueRow?.freshness ?? row.freshness,
    };
  }).filter(({ row, status: rowStatus, freshness: rowFreshness }) => {
    if (status !== "all" && rowStatus !== status) return false;
    if (freshness !== "all" && rowFreshness !== freshness) return false;
    if (!normalizedSearch) return true;
    return [row.organizationName, row.organizationId, row.storeName, row.storeId].join(" ").toLowerCase().includes(normalizedSearch);
  }), [freshness, normalizedSearch, queue, status, summary.branchRows, summary.queueRows]);
  const organizationIds = new Set(branchViews.map(({ row }) => row.organizationId));
  const organizationViews = summary.organizationRows.filter((row) => {
    if (organizationIds.has(row.organizationId)) return true;
    return queue === "all"
      && row.branchCount === 0
      && (!normalizedSearch || [row.organizationName, row.organizationId].join(" ").toLowerCase().includes(normalizedSearch))
      && (status === "all" || row.status === status)
      && (freshness === "all" || row.freshness === freshness);
  });
  const visibleMetrics = branchViews.reduce((metrics, branch) => mergeMetrics(metrics, branch.metrics), emptyMetrics());
  const healthyBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "healthy").length;
  const attentionBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "needs_attention").length;
  const staleBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "stale").length;
  const noDataBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "no_data").length;
  const filtersActive = Boolean(normalizedSearch) || status !== "all" || freshness !== "all" || queue !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setFreshness("all");
    setQueue("all");
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="platform-sync-health-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Cross-org read surface</p>
            <h2 id="platform-sync-health-heading" className="mt-1 text-xl font-extrabold">Sync &amp; outbox health</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">See whether active branches are reporting a healthy local queue. Pending, stuck, failed, and conflict counts plus last successful sync are bounded snapshots; order and mutation payloads never leave the terminal.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="refresh" size={13} /> {visibleMetrics.reporterCount} reporting terminal{visibleMetrics.reporterCount === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Sync health summary">
          <HealthMetric icon="branches" label="Healthy branches" value={`${healthyBranches}/${branchViews.length}`} detail={`${attentionBranches} attention · ${staleBranches} stale · ${noDataBranches} no telemetry`} tone={attentionBranches > 0 ? "danger" : staleBranches > 0 || noDataBranches > 0 ? "warning" : "success"} />
          <HealthMetric icon="refresh" label="Pending depth" value={visibleMetrics.pendingCount} detail={queue === "all" ? "All queues" : syncHealthQueueLabel(queue)} tone={visibleMetrics.pendingCount > 0 ? "warning" : "default"} />
          <HealthMetric icon="clock" label="Stuck outbox" value={visibleMetrics.stuckCount} detail={`Older than ${Math.round(PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS / 60_000)} minutes`} tone={visibleMetrics.stuckCount > 0 ? "danger" : "default"} />
          <HealthMetric icon="alert" label="Failed sync items" value={visibleMetrics.failedCount} detail={`${visibleMetrics.conflictCount} conflict${visibleMetrics.conflictCount === 1 ? "" : "s"} · current snapshot`} tone={visibleMetrics.failedCount + visibleMetrics.conflictCount > 0 ? "danger" : "default"} />
          <HealthMetric icon="check" label="Last successful sync" value={formatAge(visibleMetrics.lastSuccessfulSyncAt, summary.asOf)} detail="Across the filtered view" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(170px,0.35fr)_minmax(170px,0.38fr)_minmax(170px,0.38fr)]" aria-label="Sync health filters">
          <label className="relative block">
            <span className="sr-only">Search organizations or branches</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><AdminIcon name="search" size={14} /></span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations or branches" className="w-full rounded-xl border border-line-strong bg-raised py-2.5 pl-9 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Queue</span>
            <select value={queue} onChange={(event) => setQueue(event.target.value as "all" | PlatformSyncHealthQueue)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {QUEUE_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All queues" : syncHealthQueueLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Health status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | PlatformSyncHealthStatus)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {STATUS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All statuses" : syncHealthStatusLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Freshness</span>
            <select value={freshness} onChange={(event) => setFreshness(event.target.value as "all" | PlatformSyncHealthFreshness)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {FRESHNESS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All freshness" : syncHealthFreshnessLabel(option)}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>Showing {branchViews.length} branch{branchViews.length === 1 ? "" : "es"} · {visibleMetrics.failedCount} failed sync item{visibleMetrics.failedCount === 1 ? "" : "s"} · as of {formatDateTime(summary.asOf)}</span>
          {filtersActive && <button type="button" onClick={clearFilters} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Clear filters</button>}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-ink-muted">Fresh after a report within {Math.round(PLATFORM_SYNC_HEALTH_STALE_AFTER_MS / 60_000)} minutes · stuck after {Math.round(PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS / 60_000)} minutes</p>
        {hasMore && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">The snapshot reader reached its limit. Narrow the source data or review the newest reports before treating the view as complete.</p>}
        {!schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Sync health telemetry is unavailable from this deployment. Apply the sync-health schema before relying on the no-telemetry states.</p>}
        {schemaAvailable && !enhancedMetricsAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Enhanced sync metrics are not available yet. Apply migration 0081 to show exact stuck outbox depth and last successful sync timestamps; legacy queue counters remain visible.</p>}
        {!organizationsAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Organization names could not be loaded. Refresh the page or review the platform database connection.</p>}
        {!storesAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Branch names could not be loaded. The health rows are withheld until branch scope is available.</p>}
      </div>

      {branchViews.length === 0
        ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-raised text-ink-muted"><AdminIcon name="refresh" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{filtersActive ? "No branches match" : "No sync telemetry yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{filtersActive ? "Clear one or more filters to review the available branch signals." : "Active POS and admin sessions will appear here after they report their bounded queue counters."}</p></div>
        : <div className="space-y-3 p-4 sm:p-5">{organizationViews.map((organization) => {
          const branches = branchViews.filter(({ row }) => row.organizationId === organization.organizationId);
          const selectedStatus = branches.reduce<PlatformSyncHealthStatus>((worst, branch) => worstStatus(worst, branch.status), branches.length > 0 ? "healthy" : organization.status);
          return <OrganizationHealthCard key={organization.organizationId} organization={organization} status={selectedStatus} branches={branches} queueRows={summary.queueRows} asOf={summary.asOf} open={filtersActive} />;
        })}</div>}
    </section>
  );
}

function HealthMetric({ icon, label, value, detail, tone = "default" }: { icon: "refresh" | "branches" | "alert" | "clock" | "check"; label: string; value: string | number; detail: string; tone?: "default" | "danger" | "warning" | "success" }) {
  return <article className="rounded-[18px] border border-line bg-raised/55 p-4"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning/15 text-warning" : tone === "success" ? "bg-success/10 text-success" : "bg-primary-soft text-primary"}`}><AdminIcon name={icon} size={15} /></span></div><p className={`mt-3 text-2xl font-extrabold tracking-[-0.04em] ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p></article>;
}

function OrganizationHealthCard({ organization, status, branches, queueRows, asOf, open }: {
  organization: PlatformSyncHealthOrganizationRow;
  status: PlatformSyncHealthStatus;
  branches: BranchView[];
  queueRows: PlatformSyncHealthQueueRow[];
  asOf: string;
  open: boolean;
}) {
  const organizationLink = <Link href={`/platform/organizations/${organization.organizationId}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.organizationName}</Link>;
  const branchSummary = branches.reduce((metrics, branch) => mergeMetrics(metrics, branch.metrics), emptyMetrics());
  return (
    <details open={open} className="overflow-hidden rounded-[18px] border border-line bg-raised/35">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-extrabold uppercase tracking-[0.13em] text-ink-muted">Organization</span><span className="mt-1 block truncate text-sm">{organizationLink}</span></span>
        <span className="text-xs font-semibold text-ink-muted">{branches.length} branch{branches.length === 1 ? "" : "es"} · {branchSummary.reporterCount} reporter{branchSummary.reporterCount === 1 ? "" : "s"}</span>
        <StatusBadge status={status} />
      </summary>
      <div className="border-t border-line bg-surface p-3 sm:p-4">
        {branches.length === 0
          ? <p className="rounded-xl border border-line bg-raised px-3.5 py-3 text-xs font-semibold leading-5 text-ink-muted">No active branch is available for this organization yet.</p>
          : <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
              <span>{branchSummary.pendingCount} pending · {branchSummary.stuckCount} stuck · {branchSummary.failedCount} failed · {branchSummary.conflictCount} conflict{branchSummary.conflictCount === 1 ? "" : "s"}</span>
              <span>Last successful sync {formatAge(branchSummary.lastSuccessfulSyncAt, asOf)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1300px] w-full text-left text-xs">
                <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th scope="col" className="px-3 py-2">Branch</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Pending</th><th scope="col" className="px-3 py-2">Stuck</th><th scope="col" className="px-3 py-2">Failed</th><th scope="col" className="px-3 py-2">Conflicts</th><th scope="col" className="px-3 py-2">Last successful sync</th><th scope="col" className="px-3 py-2">Oldest pending</th><th scope="col" className="px-3 py-2">Last report</th><th scope="col" className="px-3 py-2">Queues</th></tr></thead>
                <tbody className="divide-y divide-line/70">{branches.map(({ row, metrics, status: branchStatus }) => <BranchHealthRow key={row.storeId} row={row} metrics={metrics} status={branchStatus} queueRows={queueRows.filter((queueRow) => queueRow.storeId === row.storeId)} asOf={asOf} />)}</tbody>
              </table>
            </div>
          </>}
      </div>
    </details>
  );
}

function BranchHealthRow({ row, metrics, status, queueRows, asOf }: { row: PlatformSyncHealthBranchRow; metrics: PlatformSyncHealthMetrics; status: PlatformSyncHealthStatus; queueRows: PlatformSyncHealthQueueRow[]; asOf: string }) {
  return <tr className="align-top transition hover:bg-raised/45"><td className="px-3 py-3"><strong className="block font-extrabold text-ink">{row.storeName}</strong><span className="mt-1 block text-[10px] text-ink-muted">{shortId(row.storeId)} · {metrics.reporterCount} reporter{metrics.reporterCount === 1 ? "" : "s"}</span></td><td className="px-3 py-3"><StatusBadge status={status} /><span className="mt-1 block text-[10px] text-ink-muted">{syncHealthFreshnessLabel(metricsFreshness(metrics, asOf))}</span></td><td className="px-3 py-3"><strong className="tnums font-extrabold">{metrics.pendingCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">{metrics.oldestPendingAt ? `${formatAge(metrics.oldestPendingAt, asOf)} old` : "No queue depth"}</span></td><td className="px-3 py-3"><strong className={`tnums font-extrabold ${metrics.stuckCount > 0 ? "text-danger" : "text-ink"}`}>{metrics.stuckCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">{metrics.stuckCount > 0 ? "Past stuck threshold" : "Within queue window"}</span></td><td className="px-3 py-3"><strong className={`tnums font-extrabold ${metrics.failedCount > 0 ? "text-danger" : "text-ink"}`}>{metrics.failedCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">Failed sync items</span></td><td className="px-3 py-3"><strong className={`tnums font-extrabold ${metrics.conflictCount > 0 ? "text-danger" : "text-ink"}`}>{metrics.conflictCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">Needs review</span></td><td className="px-3 py-3 whitespace-nowrap">{metrics.lastSuccessfulSyncAt ? <><time dateTime={metrics.lastSuccessfulSyncAt}>{formatDateTime(metrics.lastSuccessfulSyncAt)}</time><span className="mt-1 block text-[10px] text-ink-muted">{formatAge(metrics.lastSuccessfulSyncAt, asOf)}</span></> : <span className="text-ink-muted">No success recorded</span>}</td><td className="px-3 py-3 whitespace-nowrap">{metrics.oldestPendingAt ? <><time dateTime={metrics.oldestPendingAt}>{formatDateTime(metrics.oldestPendingAt)}</time><span className="mt-1 block text-[10px] text-ink-muted">{isStuck(metrics.oldestPendingAt, asOf) ? "Past stuck threshold" : "Within queue window"}</span></> : <span className="text-ink-muted">None queued</span>}</td><td className="px-3 py-3 whitespace-nowrap">{metrics.lastReportedAt ? <><time dateTime={metrics.lastReportedAt}>{formatDateTime(metrics.lastReportedAt)}</time><span className="mt-1 block text-[10px] text-ink-muted">{formatAge(metrics.lastReportedAt, asOf)}</span></> : <span className="text-ink-muted">No telemetry</span>}</td><td className="px-3 py-3"><QueueBreakdown queueRows={queueRows} asOf={asOf} /></td></tr>;
}

function QueueBreakdown({ queueRows, asOf }: { queueRows: PlatformSyncHealthQueueRow[]; asOf: string }) {
  if (queueRows.length === 0) return <span className="text-ink-muted">No queue telemetry</span>;
  return <details><summary className="cursor-pointer font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">View queues</summary><div className="mt-2 min-w-[380px] space-y-2 rounded-xl border border-line bg-raised p-3">{queueRows.map((row) => <div key={row.queue} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[10px]"><span className="font-extrabold text-ink">{syncHealthQueueLabel(row.queue)}</span><StatusBadge status={row.status} compact /><span className="text-ink-muted">{row.pendingCount} pending · {row.stuckCount} stuck · {row.failedCount} failed · {row.conflictCount} conflict{row.conflictCount === 1 ? "" : "s"}</span><span className="tnums text-right font-semibold text-ink-muted">{row.lastSuccessfulSyncAt ? `Success ${formatAge(row.lastSuccessfulSyncAt, asOf)}` : row.oldestPendingAt ? `Oldest ${formatAge(row.oldestPendingAt, asOf)}` : "No success recorded"}</span></div>)}</div></details>;
}

function StatusBadge({ status, compact = false }: { status: PlatformSyncHealthStatus; compact?: boolean }) {
  const tone = status === "needs_attention" ? "bg-danger-soft text-danger" : status === "healthy" ? "bg-success/10 text-success" : status === "stale" ? "bg-warning/15 text-ink" : "bg-raised text-ink-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full ${compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"} font-extrabold ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "needs_attention" ? "bg-danger" : status === "healthy" ? "bg-success" : status === "stale" ? "bg-accent" : "bg-ink-muted"}`} />{syncHealthStatusLabel(status)}</span>;
}

function emptyMetrics(): PlatformSyncHealthMetrics {
  return { pendingCount: 0, failedCount: 0, conflictCount: 0, stuckCount: 0, oldestPendingAt: null, lastReportedAt: null, lastSuccessfulSyncAt: null, reporterCount: 0, offlineReporterCount: 0, queueCount: 0 };
}

function mergeMetrics(left: PlatformSyncHealthMetrics, right: PlatformSyncHealthMetrics): PlatformSyncHealthMetrics {
  const reporters = left.reporterCount + right.reporterCount;
  const lastReportedAt = !left.lastReportedAt || (right.lastReportedAt && right.lastReportedAt > left.lastReportedAt) ? right.lastReportedAt : left.lastReportedAt;
  const lastSuccessfulSyncAt = !left.lastSuccessfulSyncAt || (right.lastSuccessfulSyncAt && right.lastSuccessfulSyncAt > left.lastSuccessfulSyncAt) ? right.lastSuccessfulSyncAt : left.lastSuccessfulSyncAt;
  const oldestPendingAt = !left.oldestPendingAt || (right.oldestPendingAt && right.oldestPendingAt < left.oldestPendingAt) ? right.oldestPendingAt : left.oldestPendingAt;
  return {
    pendingCount: left.pendingCount + right.pendingCount,
    failedCount: left.failedCount + right.failedCount,
    conflictCount: left.conflictCount + right.conflictCount,
    stuckCount: left.stuckCount + right.stuckCount,
    oldestPendingAt,
    lastReportedAt,
    lastSuccessfulSyncAt,
    reporterCount: reporters,
    offlineReporterCount: left.offlineReporterCount + right.offlineReporterCount,
    queueCount: left.queueCount + right.queueCount,
  };
}

function metricsFreshness(metrics: PlatformSyncHealthMetrics, asOf: string) {
  if (metrics.reporterCount === 0 || !metrics.lastReportedAt) return "no_data" as const;
  return isOlderThan(metrics.lastReportedAt, asOf, PLATFORM_SYNC_HEALTH_STALE_AFTER_MS) ? "stale" as const : "fresh" as const;
}

function worstStatus(left: PlatformSyncHealthStatus, right: PlatformSyncHealthStatus) {
  return statusRank(left) <= statusRank(right) ? left : right;
}

function statusRank(status: PlatformSyncHealthStatus) {
  return status === "needs_attention" ? 0 : status === "stale" ? 1 : status === "no_data" ? 2 : 3;
}

function isOlderThan(value: string | null, asOf: string, thresholdMs: number) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  const asOfTimestamp = Date.parse(asOf);
  return Number.isFinite(timestamp) && Number.isFinite(asOfTimestamp) && asOfTimestamp - timestamp > thresholdMs;
}

function isStuck(value: string, asOf: string) {
  const timestamp = Date.parse(value);
  const asOfTimestamp = Date.parse(asOf);
  return Number.isFinite(timestamp) && Number.isFinite(asOfTimestamp) && asOfTimestamp - timestamp > PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS;
}

function formatAge(value: string | null, asOf: string) {
  if (!value) return "No success recorded";
  const timestamp = Date.parse(value);
  const asOfTimestamp = Date.parse(asOf);
  if (!Number.isFinite(timestamp) || !Number.isFinite(asOfTimestamp)) return "Unknown";
  const ageMinutes = Math.max(0, Math.round((asOfTimestamp - timestamp) / 60_000));
  if (ageMinutes < 1) return "Just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const ageHours = Math.round(ageMinutes / 60);
  if (ageHours < 48) return `${ageHours} hour${ageHours === 1 ? "" : "s"} ago`;
  const ageDays = Math.round(ageHours / 24);
  return `${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
