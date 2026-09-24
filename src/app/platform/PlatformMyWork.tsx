import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { platformMyWorkSeverityLabel, platformMyWorkSourceLabel, type PlatformMyWorkItem, type PlatformMyWorkRead } from "@/lib/platform-my-work";
import { PlatformSectionHeading } from "./PlatformUI";

export function PlatformMyWork({ work }: { work: PlatformMyWorkRead }) {
  const criticalCount = work.items.filter((item) => item.severity === "critical").length;
  const unavailableSources = Object.entries(work.sourceAvailability).filter(([, available]) => !available).map(([source]) => source);
  const queueUnavailable = unavailableSources.length > 0;
  return <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-label="My work queue">
    <div className="border-b border-line px-5 py-5 sm:px-6">
      <PlatformSectionHeading
        eyebrow="My work"
        title="Assigned work for this operator"
        description="Cases, attention occurrences, and internal follow-ups assigned to the signed-in platform operator. Each card returns to its source workflow."
        action={<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${criticalCount > 0 ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}`}><AdminIcon name={criticalCount > 0 ? "alert" : "check"} size={13} /> {work.items.length} active</span>}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-muted"><span>As of {formatDate(work.asOf)}</span>{work.hasMore && <span className="text-warning">Showing the first 50 assignments</span>}</div>
      {unavailableSources.length > 0 && <p role="status" className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink-muted">Some assignment sources are unavailable right now; the queue does not treat unavailable data as empty.</p>}
    </div>
    {work.items.length === 0
      ? <div className="px-6 py-12 text-center"><span className={`mx-auto grid h-11 w-11 place-items-center rounded-2xl ${queueUnavailable ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}><AdminIcon name={queueUnavailable ? "alert" : "check"} size={20} /></span><h3 className="mt-4 text-base font-extrabold">{queueUnavailable ? "Assignment sources unavailable" : "No active assignments"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{queueUnavailable ? "This queue may be incomplete until the unavailable assignment sources recover." : "New work appears here after an owner assigns a case, attention occurrence, or internal follow-up to this operator."}</p></div>
      : <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{work.items.map((item) => <MyWorkCard key={`${item.source}:${item.id}`} item={item} />)}</div>}
  </section>;
}

function MyWorkCard({ item }: { item: PlatformMyWorkItem }) {
  const tone = item.severity === "critical" ? "border-danger/30 bg-danger-soft/45" : item.severity === "high" ? "border-warning/35 bg-warning/10" : "border-line bg-raised/45";
  const badgeTone = item.severity === "critical" ? "bg-danger text-white" : item.severity === "high" ? "bg-warning/25 text-ink" : "bg-secondary text-primary";
  return <article className={`flex min-h-[170px] flex-col rounded-[18px] border p-4 ${tone}`}>
    <div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-primary"><AdminIcon name={item.source === "follow_up" ? "check" : item.source === "support_case" ? "help" : "bell"} size={17} /></span><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${badgeTone}`}>{platformMyWorkSeverityLabel(item.severity)}</span></div>
    <div className="mt-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-ink-muted">{platformMyWorkSourceLabel(item.source)} · {item.status.replaceAll("_", " ")}</p><h3 className="mt-1 text-sm font-extrabold leading-5">{item.title}</h3><p className="mt-2 text-xs leading-5 text-ink-muted">{item.detail}</p></div>
    {item.organizationName && <p className="mt-3 text-xs font-extrabold text-ink">{item.organizationName}</p>}
    <div className="mt-auto flex items-center justify-between gap-3 pt-4"><span className="text-[11px] font-semibold text-ink-muted">{item.dueAt ? `Due ${formatDate(item.dueAt)}` : "No due date"}</span><Link href={item.href} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Open source <AdminIcon name="arrow" size={13} /></Link></div>
  </article>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
