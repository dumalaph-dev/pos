"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import type { PlatformEntitlementTimelineItem } from "@/lib/platform-entitlements";

export function PlatformEntitlementTimeline({ items, compact = false }: { items: PlatformEntitlementTimelineItem[]; compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-2" : "space-y-3"} aria-label="Combined entitlement timeline">
      {items.length === 0 ? <li className="rounded-xl border border-dashed border-line-strong bg-raised px-4 py-5 text-sm leading-6 text-ink-muted">No trial, grant, subscription, or suspension history is available.</li> : items.map((item) => <TimelineItem key={item.id} item={item} compact={compact} />)}
    </ol>
  );
}

function TimelineItem({ item, compact }: { item: PlatformEntitlementTimelineItem; compact: boolean }) {
  const tone = item.state === "current" || item.state === "active"
    ? "border-success/25 bg-success/10 text-success"
    : item.state === "scheduled"
      ? "border-primary/20 bg-primary-soft text-primary"
      : item.state === "revoked"
        ? "border-line bg-raised text-ink-muted"
        : "border-warning/25 bg-warning/10 text-ink";
  return <li className={`flex items-start gap-3 rounded-xl border px-3.5 ${compact ? "py-2.5" : "py-3"} ${tone}`}>
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface/75"><AdminIcon name={timelineIcon(item.kind)} size={13} /></span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <strong className="text-xs font-extrabold">{item.label}</strong>
        <span className="text-[10px] font-extrabold uppercase tracking-wide opacity-70">{timelineStateLabel(item.state)}</span>
      </span>
      <span className="mt-1 block text-[11px] leading-4 opacity-80">{item.detail}</span>
      {(item.startsAt || item.endsAt) && <span className="mt-1 block text-[10px] font-semibold opacity-65">{formatTimelineDate(item.startsAt)}{item.endsAt ? ` → ${formatTimelineDate(item.endsAt)}` : " → ongoing"}</span>}
    </span>
  </li>;
}

function timelineIcon(kind: PlatformEntitlementTimelineItem["kind"]): "bell" | "star" | "wallet" | "lock" | "alert" {
  switch (kind) {
    case "trial":
    case "trial_extension": return "bell";
    case "grant": return "star";
    case "subscription": return "wallet";
    default: return "lock";
  }
}

function timelineStateLabel(state: PlatformEntitlementTimelineItem["state"]) {
  switch (state) {
    case "current": return "Current";
    case "scheduled": return "Scheduled";
    case "active": return "Active";
    case "revoked": return "Revoked";
    default: return "Ended";
  }
}

function formatTimelineDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
