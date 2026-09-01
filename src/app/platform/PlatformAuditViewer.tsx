"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  filterPlatformAuditEvents,
  platformAuditActionLabel,
  platformAuditDateFilterLabel,
  platformAuditSourceFilterLabel,
  platformAuditSourceLabel,
  PLATFORM_AUDIT_DATE_FILTERS,
  PLATFORM_AUDIT_SOURCE_FILTERS,
  type PlatformAuditDateFilter,
  type PlatformAuditEvent,
  type PlatformAuditSourceFilter,
} from "@/lib/platform-audit";

export function PlatformAuditViewer({ events, schemaAvailable, operatorAuditSchemaAvailable, hasMore, asOf }: {
  events: PlatformAuditEvent[];
  schemaAvailable: boolean;
  operatorAuditSchemaAvailable: boolean;
  hasMore: boolean;
  asOf: string;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<PlatformAuditSourceFilter>("all");
  const [action, setAction] = useState("all");
  const [organizationId, setOrganizationId] = useState("all");
  const [dateRange, setDateRange] = useState<PlatformAuditDateFilter>("all");
  const actionOptions = useMemo(() => [...new Set(events.map((event) => event.action))].sort((left, right) => platformAuditActionLabel(left).localeCompare(platformAuditActionLabel(right))), [events]);
  const organizationOptions = useMemo(() => {
    const organizations = new Map<string, string>();
    for (const event of events) {
      if (event.organizationId) organizations.set(event.organizationId, event.organizationName ?? "Unnamed organization");
    }
    return [...organizations.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [events]);
  const filteredEvents = useMemo(() => filterPlatformAuditEvents(events, { search, source, action, organizationId, dateRange, asOf }), [events, search, source, action, organizationId, dateRange, asOf]);
  const filtersActive = Boolean(search.trim()) || source !== "all" || action !== "all" || organizationId !== "all" || dateRange !== "all";

  function clearFilters() {
    setSearch("");
    setSource("all");
    setAction("all");
    setOrganizationId("all");
    setDateRange("all");
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="platform-audit-viewer-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Cross-org read surface</p>
            <h2 id="platform-audit-viewer-heading" className="mt-1 text-xl font-extrabold">Platform audit trail</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">Review platform-actor changes across organizations. Tenant order, customer, and staff activity is intentionally excluded from this view.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="history" size={13} /> {filteredEvents.length} visible</span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_minmax(180px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,0.7fr)_minmax(180px,0.9fr)]" aria-label="Audit filters">
          <label className="relative block">
            <span className="sr-only">Search audit events</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><AdminIcon name="search" size={14} /></span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, organization, actor" className="w-full rounded-xl border border-line-strong bg-raised py-2.5 pl-9 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Event source</span>
            <select value={source} onChange={(event) => setSource(event.target.value as PlatformAuditSourceFilter)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {PLATFORM_AUDIT_SOURCE_FILTERS.map((option) => <option key={option} value={option}>{platformAuditSourceFilterLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Action</span>
            <select value={action} onChange={(event) => setAction(event.target.value)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              <option value="all">All actions</option>
              {actionOptions.map((option) => <option key={option} value={option}>{platformAuditActionLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Time window</span>
            <select value={dateRange} onChange={(event) => setDateRange(event.target.value as PlatformAuditDateFilter)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {PLATFORM_AUDIT_DATE_FILTERS.map((option) => <option key={option} value={option}>{platformAuditDateFilterLabel(option)}</option>)}
            </select>
          </label>
          <label className="block md:col-span-2 xl:col-span-1">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Organization</span>
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              <option value="all">All organizations</option>
              {organizationOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>Showing {filteredEvents.length} of {events.length}{hasMore ? " loaded events" : " events"} · as of {formatDateTime(asOf)}</span>
          {filtersActive && <button type="button" onClick={clearFilters} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Clear filters</button>}
        </div>
        {hasMore && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Showing the newest 500 platform events. Narrow the time window as the audit history grows.</p>}
        {!schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-xs font-semibold leading-5 text-danger">Organization platform audit rows could not be loaded. Refresh the page or review the platform database connection.</p>}
        {!operatorAuditSchemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Operator membership events are unavailable until migration <code className="rounded bg-surface px-1">0077_platform_operators.sql</code> is applied.</p>}
      </div>

      {filteredEvents.length === 0
        ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-raised text-ink-muted"><AdminIcon name="history" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{filtersActive ? "No audit events match" : "No platform audit events yet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{filtersActive ? "Clear one or more filters to review the newest platform actions." : "Audited platform actions will appear here as operators manage the platform."}</p></div>
        : <div className="divide-y divide-line">{filteredEvents.map((event) => <PlatformAuditEventCard key={`${event.source}-${event.id}`} event={event} />)}</div>}
    </section>
  );
}

function PlatformAuditEventCard({ event }: { event: PlatformAuditEvent }) {
  const organization = event.organizationId && event.organizationName
    ? <Link href={`/platform/organizations/${event.organizationId}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{event.organizationName}</Link>
    : <span className="font-extrabold text-ink">{event.organizationName ?? "Platform-wide"}</span>;
  const actor = event.actorEmail ?? (event.actorId ? "Platform actor" : "Actor unavailable");

  return <article className="px-5 py-5 sm:px-6">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${actionTone(event.action)}`}>{platformAuditActionLabel(event.action)}</span>
          <span className="inline-flex rounded-full bg-raised px-2.5 py-1 text-[10px] font-extrabold text-ink-muted">{platformAuditSourceLabel(event.source)}</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-ink-muted">{organization}{event.entity ? <> <span aria-hidden="true">·</span> {event.entity}{event.entityId ? ` · ${shortId(event.entityId)}` : ""}</> : null}</p>
        <p className="mt-1 text-xs font-semibold text-ink-muted">Actor: <span className="text-ink">{actor}</span>{event.actorId && <span className="ml-1" title={event.actorId}>· {shortId(event.actorId)}</span>}</p>
      </div>
      <time className="whitespace-nowrap text-xs font-semibold text-ink-muted" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
    </div>

    <details className="mt-4 rounded-xl border border-line bg-raised/55">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-extrabold text-primary outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-primary/20">View before and after snapshots <span aria-hidden="true" className="float-right text-ink-muted">⌄</span></summary>
      <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
        <AuditSnapshot label="Before" value={event.before} />
        <AuditSnapshot label="After" value={event.after} />
      </div>
    </details>
  </article>;
}

function AuditSnapshot({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 rounded-lg border border-line bg-surface p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] font-semibold leading-5 text-ink-muted">{formatSnapshot(value)}</pre></div>;
}

function formatSnapshot(value: unknown) {
  if (value === null || value === undefined) return "No snapshot";
  try {
    return JSON.stringify(value, null, 2) ?? "No snapshot";
  } catch {
    return "Snapshot unavailable";
  }
}

function actionTone(action: string) {
  if (action.includes("suspended") || action.includes("revoked")) return "bg-danger-soft text-danger";
  if (action.includes("created") || action.includes("invited") || action.includes("reactivated")) return "bg-success/10 text-success";
  if (action.includes("support") || action.includes("feedback")) return "bg-warning/15 text-ink";
  return "bg-primary-soft text-primary";
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
