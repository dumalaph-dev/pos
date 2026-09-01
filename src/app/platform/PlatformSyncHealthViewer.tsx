"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  PLATFORM_SYNC_HEALTH_QUEUES,
  PLATFORM_SYNC_HEALTH_STALE_AFTER_MS,
  PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS,
  syncHealthQueueLabel,
  syncHealthStatusLabel,
  type PlatformSyncHealthBranchRow,
  type PlatformSyncHealthMetrics,
  type PlatformSyncHealthQueue,
  type PlatformSyncHealthQueueRow,
  type PlatformSyncHealthStatus,
  type PlatformSyncHealthSummary,
} from "@/lib/platform-sync-health";

const STATUS_FILTERS: Array<"all" | PlatformSyncHealthStatus> = ["all", "healthy", "needs_attention", "stale", "no_data"];
const QUEUE_FILTERS: Array<"all" | PlatformSyncHealthQueue> = ["all", ...PLATFORM_SYNC_HEALTH_QUEUES];

export function PlatformSyncHealthViewer({ summary, schemaAvailable, organizationsAvailable, storesAvailable, hasMore }: {
  summary: PlatformSyncHealthSummary;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  hasMore: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PlatformSyncHealthStatus>("all");
  const [queue, setQueue] = useState<"all" | PlatformSyncHealthQueue>("all");
  const normalizedSearch = search.trim().toLowerCase();
  const branchViews = useMemo(() => summary.branchRows.map((row) => {
    const queueRow = queue === "all" ? null : summary.queueRows.find((candidate) => candidate.storeId === row.storeId && candidate.queue === queue);
    return {
      row,
      metrics: queueRow ?? row,
      status: queueRow?.status ?? row.status,
    };
  }).filter(({ row, status: rowStatus }) => {
    if (status !== "all" && rowStatus !== status) return false;
    if (!normalizedSearch) return true;
    return [row.organizationName, row.organizationId, row.storeName, row.storeId].join(" ").toLowerCase().includes(normalizedSearch);
  }), [normalizedSearch, queue, status, summary.branchRows, summary.queueRows]);
  const organizationIds = new Set(branchViews.map(({ row }) => row.organizationId));
  const organizationViews = summary.organizationRows.filter((row) => {
    if (organizationIds.has(row.organizationId)) return true;
    return !normalizedSearch && status === "all" && queue === "all" && row.branchCount === 0;
  });
  const visibleMetrics = branchViews.map(({ metrics }) => metrics);
  const healthyBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "healthy").length;
  const attentionBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "needs_attention").length;
  const staleBranches = branchViews.filter(({ status: rowStatus }) => rowStatus === "stale").length;
  const pendingCount = visibleMetrics.reduce((total, metrics) => total + metrics.pendingCount, 0);
  const failedCount = visibleMetrics.reduce((total, metrics) => total + metrics.failedCount, 0);
  const conflictCount = visibleMetrics.reduce((total, metrics) => total + metrics.conflictCount, 0);
  const filtersActive = Boolean(normalizedSearch) || status !== "all" || queue !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setQueue("all");
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="platform-sync-health-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Cross-org read surface</p>
            <h2 id="platform-sync-health-heading" className="mt-1 text-xl font-extrabold">Sync &amp; outbox health</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">See whether active branches are reporting a healthy local queue. Pending, failed, and conflict counts are bounded snapshots; order and mutation payloads never leave the terminal.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="refresh" size={13} /> {summary.overall.reporterCount} reporting terminal{summary.overall.reporterCount === 1 ? "" : "s"}</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sync health summary">
          <HealthMetric icon="branches" label="Healthy branches" value={`${healthyBranches}/${branchViews.length}`} detail={`${attentionBranches} attention · ${staleBranches} stale`} tone={attentionBranches > 0 ? "danger" : staleBranches > 0 ? "warning" : "success"} />
          <HealthMetric icon="refresh" label="Pending depth" value={pendingCount} detail={queue === "all" ? "All queues" : syncHealthQueueLabel(queue)} tone={pendingCount > 0 ? "warning" : "default"} />
          <HealthMetric icon="alert" label="Failed items" value={failedCount} detail={`${conflictCount} conflict${conflictCount === 1 ? "" : "s"} · current snapshot`} tone={failedCount + conflictCount > 0 ? "danger" : "default"} />
          <HealthMetric icon="clock" label="Last report" value={formatAge(summary.overall.lastReportedAt, summary.asOf)} detail={`${organizationViews.length} organization${organizationViews.length === 1 ? "" : "s"} in view`} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.35fr)_minmax(180px,0.4fr)]" aria-label="Sync health filters">
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
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>Showing {branchViews.length} branch{branchViews.length === 1 ? "" : "es"} · as of {formatDateTime(summary.asOf)}</span>
          {filtersActive && <button type="button" onClick={clearFilters} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Clear filters</button>}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-ink-muted">Stale after {Math.round(PLATFORM_SYNC_HEALTH_STALE_AFTER_MS / 60_000)} minutes · stuck after {Math.round(PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS / 60_000)} minutes</p>
        {hasMore && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">The snapshot reader reached its limit. Narrow the source data or review the newest reports before treating the view as complete.</p>}
        {!schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Sync health telemetry is unavailable from this deployment. Apply the sync-health schema before relying on the no-telemetry states.</p>}
        {!organizationsAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Organization names could not be loaded. Refresh the page or review the platform database connection.</p>}
        {!storesAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Branch names could not be loaded. The health rows are withheld until branch scope is available.</p>}
      </div>

      {branchViews.length === 0
        ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-raised text-ink-muted"><AdminIcon name="refresh" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{filtersActive ? "No branches match" : "No sync telemetry yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{filtersActive ? "Clear one or more filters to review the available branch signals." : "Active POS and admin sessions will appear here after they report their bounded queue counters."}</p></div>
        : <div className="space-y-3 p-4 sm:p-5">{organizationViews.map((organization) => {
          const branches = branchViews.filter(({ row }) => row.organizationId === organization.organizationId);
          return <OrganizationHealthCard key={organization.organizationId} organization={organization} branches={branches} queueRows={summary.queueRows} asOf={summary.asOf} open={filtersActive} />;
        })}</div>}
    </section>
  );
}

function HealthMetric({ icon, label, value, detail, tone = "default" }: { icon: "refresh" | "branches" | "alert" | "clock"; label: string; value: string | number; detail: string; tone?: "default" | "danger" | "warning" | "success" }) {
  return <article className="rounded-[18px] border border-line bg-raised/55 p-4"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning/15 text-warning" : tone === "success" ? "bg-success/10 text-success" : "bg-primary-soft text-primary"}`}><AdminIcon name={icon} size={15} /></span></div><p className={`mt-3 text-2xl font-extrabold tracking-[-0.04em] ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p></article>;
}

function OrganizationHealthCard({ organization, branches, queueRows, asOf, open }: {
  organization: { organizationId: string; organizationName: string; branchCount: number; status: PlatformSyncHealthStatus };
  branches: Array<{ row: PlatformSyncHealthBranchRow; metrics: PlatformSyncHealthMetrics; status: PlatformSyncHealthStatus }>;
  queueRows: PlatformSyncHealthQueueRow[];
  asOf: string;
  open: boolean;
}) {
  const organizationLink = <Link href={`/platform/organizations/${organization.organizationId}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.organizationName}</Link>;
  const summary = branches.reduce((metrics, branch) => mergeMetrics(metrics, branch.metrics), emptyMetrics());
  return (
    <details open={open} className="overflow-hidden rounded-[18px] border border-line bg-raised/35">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1"><span className="block text-[10px] font-extrabold uppercase tracking-[0.13em] text-ink-muted">Organization</span><span className="mt-1 block truncate text-sm">{organizationLink}</span></span>
        <span className="text-xs font-semibold text-ink-muted">{branches.length} branch{branches.length === 1 ? "" : "es"} · {summary.reporterCount} reporter{summary.reporterCount === 1 ? "" : "s"}</span>
        <StatusBadge status={organization.status} />
      </summary>
      <div className="border-t border-line bg-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>{summary.pendingCount} pending · {summary.failedCount} failed · {summary.conflictCount} conflict{summary.conflictCount === 1 ? "" : "s"}</span>
          <span>Latest report {formatAge(summary.lastReportedAt, asOf)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1020px] w-full text-left text-xs">
            <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th scope="col" className="px-3 py-2">Branch</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Pending</th><th scope="col" className="px-3 py-2">Failed</th><th scope="col" className="px-3 py-2">Conflicts</th><th scope="col" className="px-3 py-2">Oldest pending</th><th scope="col" className="px-3 py-2">Last report</th><th scope="col" className="px-3 py-2">Queues</th></tr></thead>
            <tbody className="divide-y divide-line/70">{branches.map(({ row, metrics, status }) => <BranchHealthRow key={row.storeId} row={row} metrics={metrics} status={status} queueRows={queueRows.filter((queueRow) => queueRow.storeId === row.storeId)} asOf={asOf} />)}</tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function BranchHealthRow({ row, metrics, status, queueRows, asOf }: { row: PlatformSyncHealthBranchRow; metrics: PlatformSyncHealthMetrics; status: PlatformSyncHealthStatus; queueRows: PlatformSyncHealthQueueRow[]; asOf: string }) {
  return <tr className="align-top transition hover:bg-raised/45"><td className="px-3 py-3"><strong className="block font-extrabold text-ink">{row.storeName}</strong><span className="mt-1 block text-[10px] text-ink-muted">{shortId(row.storeId)} · {metrics.reporterCount} reporter{metrics.reporterCount === 1 ? "" : "s"}</span></td><td className="px-3 py-3"><StatusBadge status={status} /></td><td className="px-3 py-3"><strong className="tnums font-extrabold">{metrics.pendingCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">{metrics.oldestPendingAt ? `${formatAge(metrics.oldestPendingAt, asOf)} old` : "No queue depth"}</span></td><td className="px-3 py-3"><strong className={`tnums font-extrabold ${metrics.failedCount > 0 ? "text-danger" : "text-ink"}`}>{metrics.failedCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">Failed items</span></td><td className="px-3 py-3"><strong className={`tnums font-extrabold ${metrics.conflictCount > 0 ? "text-danger" : "text-ink"}`}>{metrics.conflictCount}</strong><span className="mt-1 block text-[10px] text-ink-muted">Needs review</span></td><td className="px-3 py-3 whitespace-nowrap">{metrics.oldestPendingAt ? <><time dateTime={metrics.oldestPendingAt}>{formatDateTime(metrics.oldestPendingAt)}</time><span className="mt-1 block text-[10px] text-ink-muted">{isStuck(metrics.oldestPendingAt, asOf) ? "Past stuck threshold" : "Within queue window"}</span></> : <span className="text-ink-muted">None queued</span>}</td><td className="px-3 py-3 whitespace-nowrap">{metrics.lastReportedAt ? <><time dateTime={metrics.lastReportedAt}>{formatDateTime(metrics.lastReportedAt)}</time><span className="mt-1 block text-[10px] text-ink-muted">{formatAge(metrics.lastReportedAt, asOf)}</span></> : <span className="text-ink-muted">No telemetry</span>}</td><td className="px-3 py-3"><QueueBreakdown queueRows={queueRows} asOf={asOf} /></td></tr>;
}

function QueueBreakdown({ queueRows, asOf }: { queueRows: PlatformSyncHealthQueueRow[]; asOf: string }) {
  if (queueRows.length === 0) return <span className="text-ink-muted">No queue telemetry</span>;
  return <details><summary className="cursor-pointer font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">View queues</summary><div className="mt-2 min-w-[300px] space-y-2 rounded-xl border border-line bg-raised p-3">{queueRows.map((row) => <div key={row.queue} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[10px]"><span className="font-extrabold text-ink">{syncHealthQueueLabel(row.queue)}</span><StatusBadge status={row.status} compact /><span className="text-ink-muted">{row.pendingCount} pending · {row.failedCount} failed · {row.conflictCount} conflict{row.conflictCount === 1 ? "" : "s"}</span><span className="tnums text-right font-semibold text-ink-muted">{row.oldestPendingAt ? formatAge(row.oldestPendingAt, asOf) : "Clear"}</span></div>)}</div></details>;
}

function StatusBadge({ status, compact = false }: { status: PlatformSyncHealthStatus; compact?: boolean }) {
  const tone = status === "needs_attention" ? "bg-danger-soft text-danger" : status === "healthy" ? "bg-success/10 text-success" : status === "stale" ? "bg-warning/15 text-ink" : "bg-raised text-ink-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full ${compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"} font-extrabold ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "needs_attention" ? "bg-danger" : status === "healthy" ? "bg-success" : status === "stale" ? "bg-accent" : "bg-ink-muted"}`} />{syncHealthStatusLabel(status)}</span>;
}

function emptyMetrics(): PlatformSyncHealthMetrics {
  return { pendingCount: 0, failedCount: 0, conflictCount: 0, oldestPendingAt: null, lastReportedAt: null, reporterCount: 0, offlineReporterCount: 0, queueCount: 0 };
}

function mergeMetrics(left: PlatformSyncHealthMetrics, right: PlatformSyncHealthMetrics): PlatformSyncHealthMetrics {
  const reporters = left.reporterCount + right.reporterCount;
  const lastReportedAt = !left.lastReportedAt || (right.lastReportedAt && right.lastReportedAt > left.lastReportedAt) ? right.lastReportedAt : left.lastReportedAt;
  const oldestPendingAt = !left.oldestPendingAt || (right.oldestPendingAt && right.oldestPendingAt < left.oldestPendingAt) ? right.oldestPendingAt : left.oldestPendingAt;
  return {
    pendingCount: left.pendingCount + right.pendingCount,
    failedCount: left.failedCount + right.failedCount,
    conflictCount: left.conflictCount + right.conflictCount,
    oldestPendingAt,
    lastReportedAt,
    reporterCount: reporters,
    offlineReporterCount: left.offlineReporterCount + right.offlineReporterCount,
    queueCount: left.queueCount + right.queueCount,
  };
}

function isStuck(value: string, asOf: string) {
  const timestamp = Date.parse(value);
  const asOfTimestamp = Date.parse(asOf);
  return Number.isFinite(timestamp) && Number.isFinite(asOfTimestamp) && asOfTimestamp - timestamp > PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS;
}

function formatAge(value: string | null, asOf: string) {
  if (!value) return "None";
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
