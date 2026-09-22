import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import {
  platformAttentionCategoryLabel,
  platformAttentionSeverityLabel,
  platformAttentionStateLabel,
  type PlatformAttentionCategory,
  type PlatformAttentionSeverity,
  type PlatformAttentionState,
} from "@/lib/platform-attention";
import { PlatformAttentionRefresh, PlatformAttentionOccurrenceOperations } from "../../PlatformAttentionOperations";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";
import { formatDate, readPlatformAttentionPage } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

type AttentionSearchParams = Promise<{
  q?: string | string[] | undefined;
  category?: string | string[] | undefined;
  severity?: string | string[] | undefined;
  state?: string | string[] | undefined;
  page?: string | string[] | undefined;
}>;

type AttentionOperator = { id: string; email: string; role: "owner" | "billing" | "support" | "read_only" };

export default async function PlatformAttentionPage({ searchParams }: { searchParams: AttentionSearchParams }) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const result = await readPlatformAttentionPage(actor.admin, first(params.q), first(params.category), first(params.severity), first(params.state), first(params.page));
  const operatorsResult = await actor.admin.from("platform_operators").select("id, email, role").eq("is_active", true).order("email");
  const operators = (operatorsResult.data ?? []).flatMap((row): AttentionOperator[] => {
    if (!row || typeof row.id !== "string" || typeof row.email !== "string" || !["owner", "billing", "support", "read_only"].includes(row.role)) return [];
    return [{ id: row.id, email: row.email, role: row.role as AttentionOperator["role"] }];
  });
  const canManage = hasPlatformOperatorPermission(actor.role, "attention_manage");
  const openCount = result.records.filter((record) => record.state === "open").length;
  const acknowledgedCount = result.records.filter((record) => record.state === "acknowledged").length;
  const snoozedCount = result.records.filter((record) => record.state === "snoozed").length;
  const criticalCount = result.records.filter((record) => record.severity === "critical" && record.state !== "resolved").length;
  const pageStart = result.records.length === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const pageEnd = result.records.length === 0 ? 0 : pageStart + result.records.length - 1;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Wave 2 · D2 attention occurrences"
          title="Attention workbench"
          description="Capture recurring platform signals as durable occurrences, then acknowledge, assign, or snooze them without losing source evidence or recurrence history."
          actions={<>
            <PlatformAttentionRefresh canManage={canManage} schemaAvailable={result.schemaAvailable} />
            <Link href="/platform" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="dashboard" size={14} /> Overview</Link>
          </>}
        />

        {!result.schemaAvailable && <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">The durable attention table is unavailable. Apply Supabase migration 0089_platform_attention_occurrences.sql before refreshing or changing attention state.</div>}
        {result.schemaAvailable && (!result.organizationsAvailable || !result.storesAvailable || !result.operatorsAvailable) && <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Some context records could not be resolved for this page. Occurrence state remains available; missing names are left explicit.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Attention summary">
          <PlatformMetric label="Visible occurrences" value={result.records.length} detail={result.total === null ? "Total unavailable" : `${pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`} of ${result.total}`} icon="alert" />
          <PlatformMetric label="Open" value={openCount} detail="Needs an operator decision" icon="bell" />
          <PlatformMetric label="Acknowledged" value={acknowledgedCount} detail="Owned, not resolved" icon="employees" />
          <PlatformMetric label="Snoozed" value={snoozedCount} detail="Will resurface by deadline" icon="clock" />
          <PlatformMetric label="Critical" value={criticalCount} detail="Visible page" icon="alert" />
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="attention-queue-heading">
          <div className="border-b border-line px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Durable operator queue</p>
                <h2 id="attention-queue-heading" className="mt-1 text-xl font-extrabold">Current conditions and recurrence history</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Refresh evaluates the existing bounded billing, access, support, sync, and readiness readers. Missing source data never auto-resolves a condition.</p>
              </div>
              <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-4xl" role="search">
                <label htmlFor="attention-search" className="sr-only">Search attention occurrences</label>
                <input id="attention-search" name="q" type="search" defaultValue={result.query} placeholder="Search issue, key, or detail" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" />
                <select name="category" defaultValue={result.category} className="min-h-11 rounded-xl border border-line-strong bg-raised px-3 text-xs font-extrabold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Attention category"><option value="all">All categories</option>{(["billing", "support", "sync", "access", "readiness"] as PlatformAttentionCategory[]).map((value) => <option key={value} value={value}>{platformAttentionCategoryLabel(value)}</option>)}</select>
                <select name="severity" defaultValue={result.severity} className="min-h-11 rounded-xl border border-line-strong bg-raised px-3 text-xs font-extrabold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Attention severity"><option value="all">All severities</option>{(["critical", "high", "medium", "low"] as PlatformAttentionSeverity[]).map((value) => <option key={value} value={value}>{platformAttentionSeverityLabel(value)}</option>)}</select>
                <select name="state" defaultValue={result.state} className="min-h-11 rounded-xl border border-line-strong bg-raised px-3 text-xs font-extrabold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Attention state"><option value="active">Active</option><option value="all">All states</option>{(["open", "acknowledged", "snoozed", "resolved"] as PlatformAttentionState[]).map((value) => <option key={value} value={value}>{platformAttentionStateLabel(value)}</option>)}</select>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="filter" size={14} /> Apply</button>
                {(result.query || result.category !== "all" || result.severity !== "all" || result.state !== "active") && <Link href="/platform/attention" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
              </form>
            </div>
            <p className="mt-4 text-xs font-semibold text-ink-muted" role="status">{result.records.length === 0 ? "Showing 0" : `Showing ${pageStart}–${pageEnd}`} {result.total === null ? "matching occurrences" : `of ${result.total} matching occurrences`} · as of {formatDate(result.asOf)}</p>
          </div>

          {result.records.length === 0
            ? <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-success/10 text-success"><AdminIcon name="check" size={20} /></span><h3 className="mt-4 text-base font-extrabold">{result.schemaAvailable ? "No occurrences match these filters" : "Attention state is unavailable"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">{result.schemaAvailable ? "Refresh the queue to evaluate current platform signals, or clear one or more filters." : "Apply migration 0089 before using durable attention state."}</p></div>
            : <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-2">{result.records.map((record) => <AttentionOccurrenceCard key={record.id} occurrence={record} operators={operators} canManage={canManage} schemaAvailable={result.schemaAvailable} />)}</div>}

          <AttentionPagination page={result.page} pageSize={result.pageSize} total={result.total} hasMore={result.hasMore} query={result.query} category={result.category} severity={result.severity} state={result.state} rowCount={result.records.length} />
        </section>

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="attention-boundary-heading">
          <PlatformSectionHeading eyebrow="D2 boundary" title="Durable state, source-owned resolution" description="Acknowledgement, ownership, snooze, version conflicts, and recurrence are durable. Only a recovered source condition resolves an occurrence; source outages remain unknown until their reader recovers." />
        </section>
      </div>
    </main>
  );
}

function AttentionOccurrenceCard({ occurrence, operators, canManage, schemaAvailable }: { occurrence: import("@/lib/platform-attention").PlatformAttentionOccurrence; operators: AttentionOperator[]; canManage: boolean; schemaAvailable: boolean }) {
  const tone = occurrence.severity === "critical" ? "border-danger/30 bg-danger-soft/45" : occurrence.severity === "high" ? "border-warning/35 bg-warning/10" : "border-line bg-raised/45";
  return <article className={`rounded-[18px] border p-4 ${tone}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-ink-muted">{platformAttentionCategoryLabel(occurrence.category)} · {occurrence.logicalKey}</p><h3 className="mt-1 text-base font-extrabold leading-6">{occurrence.title}</h3></div><div className="flex flex-wrap justify-end gap-1.5"><span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">{platformAttentionSeverityLabel(occurrence.severity)}</span><span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">{platformAttentionStateLabel(occurrence.state)}</span></div></div>
    <p className="mt-3 text-sm leading-6 text-ink-muted">{occurrence.detail}</p>
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-ink-muted"><span>{occurrence.organizationName ?? "Organization unavailable"}</span>{occurrence.branchName && <span>· {occurrence.branchName}</span>}<span>· Seen {formatDate(occurrence.lastSeenAt)}</span><span>· Recurrence {occurrence.recurrenceCount}</span></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-muted"><Link href={occurrence.href} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{occurrence.actionLabel}<AdminIcon name="arrow" size={13} /></Link>{occurrence.assignedEmail && <span className="rounded-lg bg-surface px-2.5 py-1.5">Owner: {occurrence.assignedEmail}</span>}{occurrence.snoozedUntil && <span className="rounded-lg bg-surface px-2.5 py-1.5">Resurfaces {formatDate(occurrence.snoozedUntil)}</span>}</div>
    <PlatformAttentionOccurrenceOperations occurrence={occurrence} operators={operators} canManage={canManage} schemaAvailable={schemaAvailable} />
  </article>;
}

function AttentionPagination({ page, pageSize, total, hasMore, query, category, severity, state, rowCount }: { page: number; pageSize: number; total: number | null; hasMore: boolean; query: string; category: string; severity: string; state: string; rowCount: number }) {
  const start = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = rowCount === 0 ? 0 : start + rowCount - 1;
  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (category !== "all") params.set("category", category);
    if (severity !== "all") params.set("severity", severity);
    if (state !== "active") params.set("state", state);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return search ? `/platform/attention?${search}` : "/platform/attention";
  };
  return <nav className="flex flex-col gap-3 border-t border-line bg-raised/40 px-5 py-4 text-xs font-semibold text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-label="Attention pages"><span>{total === null ? `${start === 0 ? 0 : `${start}–${end}`} visible` : `${start === 0 ? 0 : `${start}–${end}`} of ${total}`}</span><div className="flex items-center gap-2">{page > 1 ? <Link href={href(page - 1)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft">Previous</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Previous</span>}{hasMore ? <Link href={href(page + 1)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft">Next</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Next</span>}</div></nav>;
}
