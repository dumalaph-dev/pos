"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { filterPlatformDevices, type PlatformDeviceRow, type PlatformDevicesSummary } from "@/lib/platform-devices";
import { syncHealthQueueLabel, syncHealthStatusLabel, type PlatformSyncHealthStatus } from "@/lib/platform-sync-health";
import { PlatformMetric } from "./PlatformUI";

type Props = {
  summary: PlatformDevicesSummary;
  schemaAvailable: boolean;
  enhancedMetricsAvailable: boolean;
  organizationsAvailable: boolean;
  storesAvailable: boolean;
  devicesAvailable: boolean;
  hasMore: boolean;
};

const controlClass = "min-h-11 rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const statuses: PlatformSyncHealthStatus[] = ["needs_attention", "stale", "no_data", "healthy"];

export function PlatformDeviceInventory({ summary, schemaAvailable, enhancedMetricsAvailable, organizationsAvailable, storesAvailable, devicesAvailable, hasMore }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [branch, setBranch] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(50);
  const rows = filterPlatformDevices(summary.rows, { search, status, branch, includeInactive });
  const branchOptions = new Map(summary.branches.map((store) => [store.id, `${store.organizationName} / ${store.name}`]));
  for (const row of summary.rows) if (!branchOptions.has(row.storeId)) branchOptions.set(row.storeId, `${row.organizationName} / ${row.storeName}`);
  const emptyBranches = summary.branches.filter((store) => store.entryCount === 0
    && (includeInactive || store.isActive) && (branch === "all" || store.id === branch)
    && (status === "all" || status === "no_data")
    && `${store.organizationName} ${store.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const partial = hasMore || !schemaAvailable || !devicesAvailable || !organizationsAvailable || !storesAvailable;

  return <>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold leading-5 text-ink-muted">Snapshot taken <Timestamp value={summary.asOf} />. Refresh to update health.</p>
      <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className={`${controlClass} disabled:cursor-wait disabled:opacity-60`}>{refreshing ? "Refreshing…" : "Refresh inventory"}</button>
    </div>
    {partial && <div role="status" className="mt-4 rounded-2xl border border-warning/35 bg-warning/10 p-4 text-sm leading-6">
      <strong>Inventory is incomplete.</strong>
      {!schemaAvailable && <p>Queue telemetry could not be loaded. Health and queue counts are unavailable.</p>}
      {!devicesAvailable && <p>Registered devices could not be loaded. Browser reporters are shown where available.</p>}
      {(!organizationsAvailable || !storesAvailable) && <p>Some organization or branch information could not be loaded.</p>}
      {hasMore && <p>The read limit was reached. Entries and queue totals may be partial; a missing entry does not confirm that a terminal has never reported.</p>}
    </div>}
    {schemaAvailable && !enhancedMetricsAvailable && <p role="status" className="mt-4 rounded-2xl border border-warning/35 bg-warning/10 p-4 text-sm">Exact stuck counts and successful-sync timestamps are unavailable. Pending age and failures still inform health.</p>}

    <section aria-label="Filter device inventory" onChange={() => setVisibleLimit(50)} className="mt-6 rounded-[22px] border border-line bg-surface p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <label className="grid gap-2 text-xs font-extrabold">Search terminals<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organization, branch, device name or ID" className={`${controlClass} w-full min-w-0`} /></label>
        <label className="grid gap-2 text-xs font-extrabold">Branch<select value={branch} onChange={(event) => setBranch(event.target.value)} className={`${controlClass} w-full min-w-0`}><option value="all">All branches</option>{[...branchOptions].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="grid gap-2 text-xs font-extrabold">Health<select value={status} onChange={(event) => setStatus(event.target.value)} className={controlClass}><option value="all">All health states</option>{statuses.map((value) => <option key={value} value={value}>{syncHealthStatusLabel(value)}</option>)}</select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} className="h-4 w-4 accent-primary" /> Include inactive devices and branches</label>
        <button type="button" onClick={() => { setSearch(""); setStatus("all"); setBranch("all"); setIncludeInactive(false); }} className={`${controlClass} text-primary`}>Clear filters</button>
      </div>
    </section>

    <section aria-label="Filtered inventory totals" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <PlatformMetric label="Entries shown" value={rows.length} detail={`${rows.filter((row) => row.device).length} registered · ${rows.filter((row) => !row.device).length} unmatched browsers`} />
      <PlatformMetric label="Needs attention" value={schemaAvailable ? rows.filter((row) => row.status === "needs_attention").length : "Unavailable"} detail="Failures, conflicts, stuck work or offline reports" />
      <PlatformMetric label="Stale queues" value={schemaAvailable ? rows.filter((row) => row.freshness === "stale").length : "Unavailable"} detail="At least one queue silent for over 30 minutes" />
      <PlatformMetric label="No telemetry" value={schemaAvailable ? rows.filter((row) => row.status === "no_data").length : "Unavailable"} detail={partial ? "Missing records may reflect a partial read" : "Registered entries without queue heartbeats"} />
    </section>

    <p role="status" className="mt-6 text-xs font-semibold text-ink-muted">{rows.length} matching {rows.length === 1 ? "entry" : "entries"}{partial ? " in a partial inventory" : ""}. Registered devices and unmatched browser IDs may represent the same physical tablet.</p>
    <section aria-label="Device and terminal entries" aria-busy={refreshing} className="mt-3 space-y-3">
      {rows.slice(0, visibleLimit).map((row) => <DeviceCard key={row.key} row={row} enhanced={enhancedMetricsAvailable} telemetryAvailable={schemaAvailable} />)}
      {rows.length === 0 && <div className="rounded-[22px] border border-dashed border-line-strong bg-surface px-5 py-8 text-sm text-ink-muted">{summary.rows.length === 0 ? "No device or terminal entries are available yet. Registered devices and browser heartbeats will appear here when available." : "No entries match these filters. Try another branch or clear the filters."}</div>}
    </section>
    {rows.length > visibleLimit && <button type="button" onClick={() => setVisibleLimit((limit) => limit + 50)} className={`${controlClass} mt-4`}>Show more entries ({visibleLimit} of {rows.length} visible)</button>}
    {emptyBranches.length > 0 && <section className="mt-6 rounded-[22px] border border-line bg-surface p-5" aria-labelledby="empty-device-branches">
      <h2 id="empty-device-branches" className="text-sm font-extrabold">Branches with no inventory entries</h2>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{partial ? "No entries were returned for these branches in this partial read." : "No registered devices or browser heartbeats have been recorded for these branches."}</p>
      <ul className="mt-3 space-y-2 text-sm">{emptyBranches.map((store) => <li key={store.id}><Link className="font-bold text-primary underline" href={`/platform/organizations/${store.organizationId}`}>{store.organizationName}</Link> / {store.name}{!store.isActive && " · Inactive branch"}</li>)}</ul>
    </section>}
  </>;
}

function DeviceCard({ row, enhanced, telemetryAvailable }: { row: PlatformDeviceRow; enhanced: boolean; telemetryAvailable: boolean }) {
  const hasTelemetry = row.reporterCount > 0;
  return <article className="overflow-hidden rounded-[22px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs font-semibold text-ink-muted"><Link href={`/platform/organizations/${row.organizationId}`} className="text-primary underline focus-visible:outline-2 focus-visible:outline-primary">{row.organizationName}</Link> / {row.storeName}</p>
        <h2 className="mt-2 break-words text-lg font-extrabold">{row.device?.name ?? `Browser ${row.deviceKey}`}</h2>
        <p className="mt-1 break-all text-xs text-ink-muted">{row.device ? `Registered device · Prefix ${row.device.devicePrefix}` : "Unmatched browser reporter"}{row.deviceKey && ` · Browser ID ${row.deviceKey}`}</p>
        {(!row.branchActive || row.device?.isActive === false) && <p className="mt-1 text-xs font-bold text-ink-muted">{!row.branchActive ? "Inactive branch" : "Inactive device"}</p>}
      </div>
      <div className="grid gap-2 text-right">{telemetryAvailable ? <HealthBadge status={row.status} /> : <span className="text-xs font-bold text-ink-muted">Health unavailable</span>}{row.freshness === "stale" && row.status !== "stale" && <span className="text-xs font-semibold text-ink-muted">Also has stale queue reports</span>}</div>
    </div>
    <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Metric label="Pending orders" value={hasTelemetry ? row.queues.find((queue) => queue.queue === "orders")?.pendingCount ?? "Not reported" : "—"} />
      <Metric label="Failed items" value={hasTelemetry ? row.failedCount : "—"} />
      <Metric label="Stuck items" value={hasTelemetry && enhanced ? row.stuckCount : "—"} />
      <Metric label="Conflicts" value={hasTelemetry ? row.conflictCount : "—"} />
    </dl>
    <div className="mt-4 grid gap-3 border-t border-line pt-4 text-xs leading-5 sm:grid-cols-2">
      <p><strong className="block">Last heartbeat</strong><Timestamp value={row.lastReportedAt} empty={telemetryAvailable ? "No telemetry recorded" : "Unavailable"} /></p>
      <p><strong className="block">Last successful sync (any queue)</strong><Timestamp value={enhanced ? row.lastSuccessfulSyncAt : null} empty={enhanced ? "No success recorded" : "Unavailable"} /></p>
    </div>
    <details className="mt-4 rounded-xl border border-line bg-raised/35">
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-extrabold text-primary focus-visible:outline-2 focus-visible:outline-primary">Terminal details and queues</summary>
      <div className="space-y-3 border-t border-line p-3 text-xs leading-5">
        {row.device && <p className="break-all"><strong>Registration ID:</strong> {row.device.id}<br /><strong>Device record last seen:</strong> <Timestamp value={row.device.lastSeenAt} empty="Not recorded" /><br /><span className="text-ink-muted">Device record activity does not confirm a successful queue sync.</span></p>}
        {!row.device && <p className="text-ink-muted">This browser ID has no exact device-prefix match in this branch. A named registration may exist separately. Browser storage resets can create a new ID.</p>}
        {row.device && !hasTelemetry && <p className="text-ink-muted">No matching browser heartbeat was returned for this registration. A browser with a different ID may be listed separately.</p>}
        {row.queues.map((queue) => <div key={queue.queue} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">{syncHealthQueueLabel(queue.queue)}</h3><HealthBadge status={queue.status} /></div>
          <p className="mt-2">{queue.pendingCount} pending · {queue.failedCount} failed · {queue.conflictCount} conflicts · {enhanced ? queue.stuckCount : "Unknown"} stuck</p>
          <p>Last heartbeat: <Timestamp value={queue.lastReportedAt} /></p>
          <p>Last success: <Timestamp value={enhanced ? queue.lastSuccessfulSyncAt : null} empty={enhanced ? "No success recorded" : "Unavailable"} /></p>
          <p>Oldest pending: <Timestamp value={queue.oldestPendingAt} empty={queue.pendingCount > 0 ? "Age not reported" : "None queued"} /></p>
        </div>)}
      </div>
    </details>
  </article>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-1 text-lg font-extrabold tnums">{value}</dd></div>;
}

function HealthBadge({ status }: { status: PlatformSyncHealthStatus }) {
  const tone = status === "needs_attention" ? "bg-danger-soft text-danger" : status === "healthy" ? "bg-success/10 text-success" : status === "stale" ? "bg-warning/15 text-ink" : "bg-raised text-ink-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${tone}`}>{syncHealthStatusLabel(status)}</span>;
}

function Timestamp({ value, empty = "Not recorded" }: { value: string | null; empty?: string }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span className="text-ink-muted">{empty}</span>;
  return <time dateTime={value}>{new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" }).format(new Date(value))} SGT</time>;
}
