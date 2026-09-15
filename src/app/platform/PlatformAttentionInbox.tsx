"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import {
  PLATFORM_ATTENTION_CATEGORIES,
  PLATFORM_ATTENTION_SEVERITIES,
  platformAttentionCategoryLabel,
  platformAttentionSeverityLabel,
  type PlatformAttentionCategory,
  type PlatformAttentionItem,
  type PlatformAttentionSeverity,
} from "@/lib/platform-attention";
import { PlatformSectionHeading } from "./PlatformUI";

export function PlatformAttentionInbox({ items }: { items: PlatformAttentionItem[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PlatformAttentionCategory>("all");
  const [severity, setSeverity] = useState<"all" | PlatformAttentionSeverity>("all");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = useMemo(() => items.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (severity !== "all" && item.severity !== severity) return false;
    if (!normalizedSearch) return true;
    return [item.title, item.detail, item.organizationName, item.branchName, platformAttentionCategoryLabel(item.category)].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch);
  }), [category, normalizedSearch, items, severity]);

  const criticalCount = items.filter((item) => item.severity === "critical").length;
  const highCount = items.filter((item) => item.severity === "high").length;
  const filtersActive = Boolean(normalizedSearch) || category !== "all" || severity !== "all";

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setSeverity("all");
  }

  return (
    <section id="platform-attention-heading" className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-label="Needs attention inbox">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <PlatformSectionHeading
          eyebrow="Needs attention"
          title="One queue for the next decision"
          description="Payment risk, expiring access, support work, and branch health are gathered here with a direct path to the existing control."
          action={<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${items.length > 0 ? "bg-danger-soft text-danger" : "bg-success/10 text-success"}`}><AdminIcon name={items.length > 0 ? "alert" : "check"} size={13} /> {items.length} open item{items.length === 1 ? "" : "s"}</span>}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Attention summary">
          <AttentionMetric label="Critical" value={criticalCount} detail="Requires same-day review" tone="danger" />
          <AttentionMetric label="High" value={highCount} detail="Resolve before it spreads" tone="warning" />
          <AttentionMetric label="All signals" value={items.length} detail="Across billing, support, access, and sync" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(170px,0.35fr)_minmax(170px,0.35fr)]" aria-label="Attention filters">
          <label className="relative block">
            <span className="sr-only">Search attention items</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"><AdminIcon name="search" size={14} /></span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search organizations, branches, or issues" className="w-full rounded-xl border border-line-strong bg-raised py-2.5 pl-9 pr-3 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as "all" | PlatformAttentionCategory)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              <option value="all">All categories</option>
              {PLATFORM_ATTENTION_CATEGORIES.map((option) => <option key={option} value={option}>{platformAttentionCategoryLabel(option)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Severity</span>
            <select value={severity} onChange={(event) => setSeverity(event.target.value as "all" | PlatformAttentionSeverity)} className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              <option value="all">All severities</option>
              {PLATFORM_ATTENTION_SEVERITIES.map((option) => <option key={option} value={option}>{platformAttentionSeverityLabel(option)}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
          <span>Showing {filteredItems.length} of {items.length} item{items.length === 1 ? "" : "s"}</span>
          {filtersActive && <button type="button" onClick={clearFilters} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Clear filters</button>}
        </div>
      </div>

      {filteredItems.length === 0
        ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-success/10 text-success"><AdminIcon name="check" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{filtersActive ? "No items match" : "Everything is clear"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{filtersActive ? "Clear one or more filters to review the available attention signals." : "New payment, access, support, and sync signals will appear here when an operator needs to act."}</p></div>
        : <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{filteredItems.map((item) => <AttentionCard key={item.id} item={item} />)}</div>}
    </section>
  );
}

function AttentionCard({ item }: { item: PlatformAttentionItem }) {
  const tone = item.severity === "critical" ? "border-danger/30 bg-danger-soft/45" : item.severity === "high" ? "border-warning/35 bg-warning/10" : "border-line bg-raised/45";
  const badgeTone = item.severity === "critical" ? "bg-danger text-white" : item.severity === "high" ? "bg-warning/25 text-ink" : "bg-secondary text-primary";
  return <article className={`flex min-h-[190px] flex-col rounded-[18px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] ${tone}`}>
    <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-primary"><AdminIcon name={categoryIcon(item.category)} size={17} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${badgeTone}`}>{platformAttentionSeverityLabel(item.severity)}</span></div>
    <div className="mt-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-ink-muted">{platformAttentionCategoryLabel(item.category)}</p><h3 className="mt-1 text-sm font-extrabold leading-5">{item.title}</h3><p className="mt-2 text-xs leading-5 text-ink-muted">{item.detail}</p></div>
    {(item.organizationName || item.branchName) && <p className="mt-3 text-xs font-extrabold text-ink">{item.organizationName}{item.branchName ? <span className="font-semibold text-ink-muted"> · {item.branchName}</span> : null}</p>}
    <div className="mt-auto pt-4"><Link href={item.href} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{item.actionLabel}<AdminIcon name="arrow" size={13} /></Link></div>
  </article>;
}

function AttentionMetric({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "danger" | "warning" }) {
  return <article className="rounded-[16px] border border-line bg-raised/55 p-3.5"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{label}</p><span className={`grid h-7 w-7 place-items-center rounded-lg ${tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning/15 text-warning" : "bg-primary-soft text-primary"}`}><AdminIcon name={tone === "default" ? "dashboard" : "alert"} size={14} /></span></div><p className={`mt-2 text-2xl font-extrabold tracking-[-0.04em] ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p><p className="mt-1 text-[11px] font-semibold text-ink-muted">{detail}</p></article>;
}

function categoryIcon(category: PlatformAttentionCategory): AdminIconName {
  return category === "billing" ? "wallet" : category === "support" ? "help" : category === "sync" ? "refresh" : category === "access" ? "lock" : "alert";
}
