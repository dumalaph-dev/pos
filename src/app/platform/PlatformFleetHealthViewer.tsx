"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  FLEET_HEALTH_ERROR_THRESHOLD_PCT,
  fleetHealthStatusLabel,
  fleetHealthSurfaceLabel,
  fleetHealthWindowLabel,
  PLATFORM_FLEET_HEALTH_WINDOWS,
  type PlatformFleetHealthOrganizationRow,
  type PlatformFleetHealthStatus,
  type PlatformFleetHealthSummaries,
  type PlatformFleetHealthWindow,
} from "@/lib/platform-fleet-health";

const STATUS_FILTERS: Array<"all" | PlatformFleetHealthStatus> = ["all", "healthy", "needs_attention", "stale", "no_data"];

export function PlatformFleetHealthViewer({ summaries, schemaAvailable, organizationsAvailable, hasMore }: {
  summaries: PlatformFleetHealthSummaries;
  schemaAvailable: boolean;
  organizationsAvailable: boolean;
  hasMore: boolean;
}) {
  const [window, setWindow] = useState<PlatformFleetHealthWindow>("30d");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PlatformFleetHealthStatus>("all");
  const summary = summaries[window];
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return summary.organizationRows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!normalizedSearch) return true;
      return [row.organizationName, row.organizationId].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [search, status, summary.organizationRows]);
  const healthyCount = summary.organizationRows.filter((row) => row.status === "healthy").length;
  const filtersActive = Boolean(search.trim()) || status !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("all");
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="platform-fleet-health-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Cross-org read surface</p>
            <h2 id="platform-fleet-health-heading" className="mt-1 text-xl font-extrabold">Fleet health signals</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">Compare bounded admin performance telemetry by organization. Error rate and freshness flag where a workspace needs a closer look without exposing tenant records.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="chart" size={13} /> {summary.overall.sampleCount} samples</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Fleet health summary">
          <HealthMetric icon="chart" label="Samples" value={summary.overall.sampleCount} detail={fleetHealthWindowLabel(window)} />
          <HealthMetric icon="clock" label="P95 duration" value={formatMilliseconds(summary.overall.p95DurationMs)} detail="Admin interaction latency" />
          <HealthMetric icon="alert" label="Error rate" value={`${summary.overall.errorRatePct}%`} detail={`${summary.overall.errorCount} failed samples`} tone={summary.overall.errorRatePct >= FLEET_HEALTH_ERROR_THRESHOLD_PCT ? "danger" : "default"} />
          <HealthMetric icon="branches" label="Healthy orgs" value={`${healthyCount}/${summary.organizationRows.length}`} detail="Fresh and below error threshold" tone={healthyCount === summary.organizationRows.length ? "success" : "default"} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.35fr)_minmax(180px,0.45fr)]" aria-label="Fleet health filters">
          <label className="relative block">
            <span className="sr-only">Search organizations</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><AdminIcon name="search" size={14} /></span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations" className="w-full rounded-xl border border-line-strong bg-raised py-2.5 pl-9 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Time window</span>
            <select value={window} onChange={(event) => setWindow(event.target.value as PlatformFleetHealthWindow)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {PLATFORM_FLEET_HEALTH_WINDOWS.map((option) => <option key={option} value={option}>{fleetHealthWindowLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Health status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | PlatformFleetHealthStatus)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {STATUS_FILTERS.map((option) => <option key={option} value={option}>{option === "all" ? "All statuses" : fleetHealthStatusLabel(option)}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>Showing {filteredRows.length} of {summary.organizationRows.length} organizations · {fleetHealthWindowLabel(window).toLowerCase()} · as of {formatDateTime(summary.asOf)}</span>
          {filtersActive && <button type="button" onClick={clearFilters} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Clear filters</button>}
        </div>
        {hasMore && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">The sample window reached the reader limit. Narrow the time window to inspect the newest telemetry.</p>}
        {!schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Organization attribution is unavailable from this deployment. Legacy samples remain visible as unattributed history until the fleet-health schema is applied.</p>}
        {schemaAvailable && summary.unattributedSampleCount > 0 && <p role="status" className="mt-3 rounded-xl border border-primary/15 bg-primary-soft/45 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">{summary.unattributedSampleCount} historical sample{summary.unattributedSampleCount === 1 ? " is" : "s are"} not assigned to an organization because they were recorded before attribution was added. New authenticated admin sessions will be attributable.</p>}
        {!organizationsAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Organization names could not be loaded. Refresh the page or review the platform database connection.</p>}
      </div>

      {filteredRows.length === 0
        ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-raised text-ink-muted"><AdminIcon name="chart" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{filtersActive ? "No organizations match" : "No fleet telemetry yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{filtersActive ? "Clear one or more filters to review the available fleet signals." : "New authenticated admin sessions will appear here after they report a bounded performance sample."}</p></div>
        : <div className="overflow-x-auto"><table className="min-w-[940px] w-full text-left text-sm"><thead className="bg-raised text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Organization</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Status</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Samples</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">P50 / P95</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Error rate</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Last sample</th><th scope="col" className="px-5 py-3 font-extrabold sm:px-6">Breakdown</th></tr></thead><tbody className="divide-y divide-line">{filteredRows.map((row) => <FleetHealthRow key={row.organizationId ?? "unattributed"} row={row} surfaceRows={summary.surfaceRows} asOf={summary.asOf} />)}</tbody></table></div>}
    </section>
  );
}

function HealthMetric({ icon, label, value, detail, tone = "default" }: { icon: "chart" | "clock" | "alert" | "branches"; label: string; value: string | number; detail: string; tone?: "default" | "danger" | "success" }) {
  return <article className="rounded-[18px] border border-line bg-raised/55 p-4"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone === "danger" ? "bg-danger-soft text-danger" : tone === "success" ? "bg-success/10 text-success" : "bg-primary-soft text-primary"}`}><AdminIcon name={icon} size={15} /></span></div><p className={`mt-3 text-2xl font-extrabold tracking-[-0.04em] ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p></article>;
}

function FleetHealthRow({ row, surfaceRows, asOf }: { row: PlatformFleetHealthOrganizationRow; surfaceRows: PlatformFleetHealthViewerSurfaceRow[]; asOf: string }) {
  const breakdown = surfaceRows.filter((surface) => surface.organizationId === row.organizationId);
  const organization = row.organizationId
    ? <Link href={`/platform/organizations/${row.organizationId}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{row.organizationName}</Link>
    : <span className="font-extrabold text-ink">{row.organizationName}</span>;

  return <tr className="align-top transition hover:bg-raised/45"><td className="px-5 py-4 sm:px-6"><div>{organization}</div><span className="mt-1 block text-xs text-ink-muted">{row.organizationId ? shortId(row.organizationId) : "Samples without org attribution"}</span></td><td className="px-5 py-4 sm:px-6"><StatusBadge status={row.status} /></td><td className="px-5 py-4 sm:px-6"><strong className="tnums font-extrabold">{row.sampleCount}</strong><span className="mt-1 block text-xs text-ink-muted">{row.surfaceCount ? `${row.surfaceCount} surface${row.surfaceCount === 1 ? "" : "s"}` : "No samples"}</span></td><td className="px-5 py-4 sm:px-6 whitespace-nowrap"><strong className="tnums font-extrabold">{formatMilliseconds(row.p50DurationMs)}</strong><span className="text-ink-muted"> / </span><strong className="tnums font-extrabold">{formatMilliseconds(row.p95DurationMs)}</strong><span className="mt-1 block text-xs text-ink-muted">milliseconds</span></td><td className="px-5 py-4 sm:px-6"><strong className={`tnums font-extrabold ${row.errorRatePct >= FLEET_HEALTH_ERROR_THRESHOLD_PCT ? "text-danger" : "text-ink"}`}>{row.errorRatePct}%</strong><span className="mt-1 block text-xs text-ink-muted">{row.errorCount} error{row.errorCount === 1 ? "" : "s"}</span></td><td className="px-5 py-4 sm:px-6 whitespace-nowrap"><time dateTime={row.lastSampleAt ?? undefined}>{formatDateTime(row.lastSampleAt)}</time><span className="mt-1 block text-xs text-ink-muted">{row.lastSampleAt ? freshnessLabel(row.lastSampleAt, asOf) : "No telemetry"}</span></td><td className="px-5 py-4 sm:px-6">{breakdown.length > 0 ? <details><summary className="cursor-pointer text-xs font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">View surfaces</summary><div className="mt-2 min-w-52 space-y-2 rounded-xl border border-line bg-raised p-3">{breakdown.map((surface) => <div key={surface.surface} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-ink">{fleetHealthSurfaceLabel(surface.surface)}</span><span className="tnums whitespace-nowrap font-extrabold text-ink-muted">{surface.sampleCount} · {formatMilliseconds(surface.p95DurationMs)}</span></div>)}</div></details> : <span className="text-xs font-semibold text-ink-muted">No samples</span>}</td></tr>;
}

type PlatformFleetHealthViewerSurfaceRow = {
  organizationId: string | null;
  surface: string;
  sampleCount: number;
  p95DurationMs: number | null;
};

function StatusBadge({ status }: { status: PlatformFleetHealthStatus }) {
  const tone = status === "needs_attention" ? "bg-danger-soft text-danger" : status === "healthy" ? "bg-success/10 text-success" : status === "stale" ? "bg-warning/15 text-ink" : "bg-raised text-ink-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${tone}`}><span className={`h-1.5 w-1.5 rounded-full ${status === "needs_attention" ? "bg-danger" : status === "healthy" ? "bg-success" : status === "stale" ? "bg-accent" : "bg-ink-muted"}`} />{fleetHealthStatusLabel(status)}</span>;
}

function formatMilliseconds(value: number | null) {
  return value === null ? "—" : `${value} ms`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}

function freshnessLabel(value: string, asOf: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Timestamp unavailable";
  const asOfTimestamp = Date.parse(asOf);
  const ageHours = Math.max(0, Math.round(((Number.isFinite(asOfTimestamp) ? asOfTimestamp : Date.now()) - timestamp) / (60 * 60 * 1000)));
  return ageHours === 0 ? "Less than an hour ago" : `${ageHours} hour${ageHours === 1 ? "" : "s"} ago`;
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
