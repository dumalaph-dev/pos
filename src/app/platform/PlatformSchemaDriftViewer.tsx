"use client";

import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  schemaDriftStatusDetail,
  schemaDriftStatusLabel,
  type PlatformSchemaBackfillRow,
  type PlatformSchemaDriftSummary,
  type PlatformSchemaMigrationRow,
} from "@/lib/platform-schema-drift";

type StateFilter = "all" | PlatformSchemaMigrationRow["state"];

const STATE_FILTERS: StateFilter[] = ["all", "applied", "pending", "unknown_remote"];

function stateLabel(state: StateFilter) {
  switch (state) {
    case "all": return "All";
    case "applied": return "Applied";
    case "pending": return "Pending";
    default: return "Unknown remote";
  }
}

export function PlatformSchemaDriftViewer({ asOf, summary, backfill, ledgerReadable, backfillAvailable }: {
  asOf: string;
  summary: PlatformSchemaDriftSummary;
  backfill: PlatformSchemaBackfillRow[];
  ledgerReadable: boolean;
  backfillAvailable: boolean;
}) {
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>("all");
  const normalizedSearch = search.trim().toLowerCase();

  const rows = useMemo(() => summary.rows.filter((row) => {
    if (state !== "all" && row.state !== state) return false;
    if (!normalizedSearch) return true;
    return `${row.version} ${row.name}`.toLowerCase().includes(normalizedSearch);
  }).slice().reverse(), [normalizedSearch, state, summary.rows]);

  const tone = summary.status === "in_sync" ? "success" : summary.status === "no_data" ? "default" : "danger";

  return (
    <>
      <div className="mt-6 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold tracking-[-0.03em]">Migration ledger</h2>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{schemaDriftStatusDetail(summary)}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Snapshot as of {formatTimestamp(asOf)}</p>
          </div>
          <StatusPill tone={tone} label={schemaDriftStatusLabel(summary.status)} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Migration ledger summary">
          <Metric icon="chart" label="Shipped in this deployment" value={summary.expectedCount} detail={summary.latestExpected ? `Latest ${summary.latestExpected.version}` : "None"} />
          <Metric icon="check" label="Applied to the database" value={ledgerReadable ? summary.appliedCount : "—"} detail={summary.latestApplied ? `Latest ${summary.latestApplied.version}` : ledgerReadable ? "None" : "Ledger unreadable"} />
          <Metric icon="alert" label="Pending" value={summary.pending.length} detail="Shipped but never applied" tone={summary.pending.length > 0 ? "danger" : "default"} />
          <Metric icon="alert" label="Unknown remote" value={summary.unknownRemote.length} detail="Applied but not in this deployment" tone={summary.unknownRemote.length > 0 ? "danger" : "default"} />
        </div>

        {!ledgerReadable && <Note tone="warning">The migration ledger could not be read. Apply migration <code className="font-mono">0084_schema_drift_readout.sql</code>, which adds the service-role-only reader this page depends on. Until then every shipped migration is listed as unverified rather than confirmed applied.</Note>}
        {summary.pending.length > 0 && <Note tone="danger">{summary.pending.length} migration{summary.pending.length === 1 ? "" : "s"} ship in this deployment but {summary.pending.length === 1 ? "is" : "are"} not applied: {summary.pending.map((entry) => entry.version).join(", ")}. Run the linked push before relying on any surface that depends on {summary.pending.length === 1 ? "it" : "them"}.</Note>}
        {summary.unknownRemote.length > 0 && <Note tone="danger">{summary.unknownRemote.length} applied version{summary.unknownRemote.length === 1 ? " is" : "s are"} not present in this deployment: {summary.unknownRemote.map((entry) => entry.version).join(", ")}. That means an out-of-band apply or a migration file removed after it shipped; the next push will compare against a ledger this build cannot explain.</Note>}
        {summary.renamed.length > 0 && <Note tone="warning">{summary.renamed.length} applied migration{summary.renamed.length === 1 ? "" : "s"} {summary.renamed.length === 1 ? "has" : "have"} been renamed since {summary.renamed.length === 1 ? "it was" : "they were"} applied: {summary.renamed.map((entry) => `${entry.version} (${entry.appliedName} to ${entry.expectedName})`).join(", ")}. Renaming an applied file does not change the ledger row.</Note>}

        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
          <label className="flex-1">
            <span className="sr-only">Search migrations</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by version or name" className="min-h-10 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm font-semibold outline-none focus-visible:border-primary" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by state">
            {STATE_FILTERS.map((candidate) => (
              <button key={candidate} type="button" onClick={() => setState(candidate)} aria-pressed={state === candidate} className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${state === candidate ? "border-primary bg-primary-soft text-primary" : "border-line-strong bg-surface text-ink-muted hover:border-primary"}`}>{stateLabel(candidate)}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-extrabold uppercase tracking-[0.08em] text-ink-muted">
                <th scope="col" className="py-2 pr-3">Version</th>
                <th scope="col" className="py-2 pr-3">Name</th>
                <th scope="col" className="py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.version}-${row.state}`} className="border-b border-line/60">
                  <td className="py-2 pr-3 font-mono text-xs font-bold">{row.version}</td>
                  <td className="py-2 pr-3 font-semibold">{row.name || <span className="text-ink-muted">-</span>}</td>
                  <td className="py-2"><StatePill state={row.state} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-xs font-semibold text-ink-muted">No migration matches this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-[22px] border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-extrabold tracking-[-0.03em]">Per-organization readiness</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">Every organization shares one database, so they are all on the same ledger position by construction. What can differ per tenant is whether the data a migration introduced actually reached them — a backfill that skipped a row, or a tenant that has not yet produced the telemetry a table expects.</p>

        {!backfillAvailable && <Note tone="warning">Organization and branch counts could not be read, so readiness is not shown.</Note>}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {backfill.map((row) => (
            <article key={row.key} className="rounded-[18px] border border-line bg-surface-muted/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-extrabold">{row.label}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${row.complete ? "bg-success/12 text-success" : "bg-warning/15 text-ink"}`}>{row.complete ? "Complete" : `${row.outstanding} left`}</span>
              </div>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.04em]">{row.ready}<span className="text-base font-bold text-ink-muted"> / {row.total}</span></p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{row.detail}</p>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Introduced in {row.introducedIn}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

function StatusPill({ tone, label }: { tone: "success" | "danger" | "default"; label: string }) {
  const classes = tone === "success" ? "bg-success/12 text-success" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary";
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${classes}`}><AdminIcon name={tone === "success" ? "check" : "alert"} size={13} /> {label}</span>;
}

function StatePill({ state }: { state: PlatformSchemaMigrationRow["state"] }) {
  const classes = state === "applied" ? "bg-success/12 text-success" : "bg-danger-soft text-danger";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold ${classes}`}>{stateLabel(state)}</span>;
}

function Metric({ icon, label, value, detail, tone = "default" }: { icon: "chart" | "check" | "alert"; label: string; value: number | string; detail: string; tone?: "default" | "danger" }) {
  return (
    <article className="rounded-[18px] border border-line bg-surface-muted/40 p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}><AdminIcon name={icon} size={16} /></span>
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-[-0.04em] ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </article>
  );
}

function Note({ tone, children }: { tone: "warning" | "danger"; children: React.ReactNode }) {
  const classes = tone === "danger" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/25 bg-warning/10 text-ink";
  return <p role="status" className={`mt-3 rounded-xl border px-3.5 py-3 text-xs font-semibold leading-5 ${classes}`}>{children}</p>;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}
