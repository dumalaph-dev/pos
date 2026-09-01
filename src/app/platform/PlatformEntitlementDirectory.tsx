"use client";

import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  filterPlatformEntitlementSummaries,
  PLATFORM_ENTITLEMENT_FILTERS,
  platformEntitlementFilterLabel,
  type PlatformEntitlementFilter,
  type PlatformEntitlementSummary,
} from "@/lib/platform-entitlements";
import { PlatformEntitlementCard } from "./PlatformEntitlementCard";

export function PlatformEntitlementDirectory({ summaries, grantSchemaAvailable, adjustmentSchemaAvailable, trialSchemaAvailable, policyGateOpen, canManage }: {
  summaries: PlatformEntitlementSummary[];
  grantSchemaAvailable: boolean;
  adjustmentSchemaAvailable: boolean;
  trialSchemaAvailable: boolean;
  policyGateOpen: boolean;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlatformEntitlementFilter>("all");
  const filtered = useMemo(() => filterPlatformEntitlementSummaries(summaries, search, filter), [summaries, search, filter]);

  return <section className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="entitlement-controls-heading">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Entitlement controls</p><h2 id="entitlement-controls-heading" className="mt-1 text-xl font-extrabold">Account access at a glance</h2><p className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">See the trial window, current grant, paid branch capacity, and the reason access exists. Extend, grant, adjust, or revoke from this page; the full record keeps the complete timeline.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative block min-w-[240px]" htmlFor="platform-entitlement-search"><span className="sr-only">Search organizations</span><AdminIcon name="search" size={14} /><input id="platform-entitlement-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organization or ID" className="w-full rounded-xl border border-line-strong bg-raised py-2.5 pl-9 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /></label>
        <label className="block min-w-[220px]" htmlFor="platform-entitlement-filter"><span className="sr-only">Filter entitlement state</span><select id="platform-entitlement-filter" value={filter} onChange={(event) => setFilter(event.target.value as PlatformEntitlementFilter)} className="w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">{PLATFORM_ENTITLEMENT_FILTERS.map((option) => <option key={option} value={option}>{platformEntitlementFilterLabel(option)}</option>)}</select></label>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted"><span>Showing <strong className="text-ink">{filtered.length}</strong> of <strong className="text-ink">{summaries.length}</strong> organizations</span>{(search || filter !== "all") && <button type="button" onClick={() => { setSearch(""); setFilter("all"); }} className="text-primary hover:underline">Clear search and filter</button>}</div>
    {(!grantSchemaAvailable || !trialSchemaAvailable) && <p role="status" className="mt-4 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3 text-xs font-semibold leading-5 text-ink">Some entitlement controls are read-only until migrations <code className="rounded bg-surface px-1">0052/0054</code> and <code className="rounded bg-surface px-1">0075</code> are applied. Existing subscription state remains visible.</p>}
    {filtered.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-raised px-4 py-10 text-center text-sm leading-6 text-ink-muted">No organizations match this entitlement search.</div> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{filtered.map((summary) => <PlatformEntitlementCard key={summary.organizationId} summary={summary} grantSchemaAvailable={grantSchemaAvailable} adjustmentSchemaAvailable={adjustmentSchemaAvailable} trialSchemaAvailable={trialSchemaAvailable} policyGateOpen={policyGateOpen} canManage={canManage} />)}</div>}
  </section>;
}
