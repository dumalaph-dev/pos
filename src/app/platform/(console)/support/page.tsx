import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";
import { formatDate, readPlatformSupportQueuePage, type PlatformSupportQueuePriority, type PlatformSupportQueueStatus } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

type PlatformSupportSearchParams = Promise<{
  q?: string | string[] | undefined;
  status?: string | string[] | undefined;
  priority?: string | string[] | undefined;
  page?: string | string[] | undefined;
}>;

export default async function PlatformSupportPage({ searchParams }: { searchParams: PlatformSupportSearchParams }) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  if (actor.role === "billing") return <PlatformAccessDenied detail="Support case access is reserved for Support and Owner operators." />;

  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const result = await readPlatformSupportQueuePage(actor.admin, first(params.q), first(params.status), first(params.priority), first(params.page));
  const overdueCount = result.records.filter((record) => Date.parse(record.first_response_due_at) <= Date.parse(result.asOf) && record.status !== "resolved" && record.status !== "closed").length;
  const urgentCount = result.records.filter((record) => record.priority === "urgent" && record.status !== "resolved" && record.status !== "closed").length;
  const pageStart = result.records.length === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const pageEnd = result.records.length === 0 ? 0 : pageStart + result.records.length - 1;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Support workspace"
          title="Support queue"
          description="Review active support cases with bounded metadata, SLA timing, and direct organization context. Case descriptions and lifecycle changes stay behind the organization controls."
          actions={<>
            <Link href="/platform/search" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="search" size={14} /> Global search</Link>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Account controls</Link>
          </>}
        />

        {!result.schemaAvailable && <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">The support-case table is unavailable. Apply the support migration or review the platform database connection.</div>}
        {result.schemaAvailable && !result.organizationsAvailable && <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Cases are available, but organization names could not be resolved for this page. Case IDs remain usable.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Support queue summary">
          <PlatformMetric label="Cases on page" value={result.records.length} detail={result.total === null ? "Total unavailable" : `${pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`} of ${result.total}`} icon="help" />
          <PlatformMetric label="Urgent cases" value={urgentCount} detail="Visible page" icon="alert" />
          <PlatformMetric label="Overdue first response" value={overdueCount} detail="Visible active cases" icon="clock" />
          <PlatformMetric label="Queue state" value={result.status === "active" ? "Active" : "Filtered"} detail={result.priority === "all" ? "All priorities" : `${result.priority} priority`} icon="refresh" />
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="support-queue-heading">
          <div className="border-b border-line px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Read-only queue</p>
                <h2 id="support-queue-heading" className="mt-1 text-xl font-extrabold">Cases requiring context</h2>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Search case subjects or an exact organization UUID. Filters run in the database and reset pagination when submitted.</p>
              </div>
              <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-3xl" role="search">
                <label htmlFor="support-queue-search" className="sr-only">Search support cases</label>
                <input id="support-queue-search" name="q" type="search" defaultValue={result.query} placeholder="Search subject or organization UUID" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" />
                <select name="status" defaultValue={result.status} className="min-h-11 rounded-xl border border-line-strong bg-raised px-3 text-xs font-extrabold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Case status">
                  <option value="active">Active cases</option><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_on_customer">Waiting on customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                </select>
                <select name="priority" defaultValue={result.priority} className="min-h-11 rounded-xl border border-line-strong bg-raised px-3 text-xs font-extrabold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" aria-label="Case priority">
                  <option value="all">All priorities</option><option value="urgent">Urgent</option><option value="normal">Normal</option>
                </select>
                <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="filter" size={14} /> Apply</button>
                {(result.query || result.status !== "active" || result.priority !== "all") && <Link href="/platform/support" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
              </form>
            </div>
            <p className="mt-4 text-xs font-semibold text-ink-muted" role="status">{result.records.length === 0 ? "Showing 0" : `Showing ${pageStart}–${pageEnd}`} {result.total === null ? "matching records" : `of ${result.total} matching records`} · as of {formatDate(result.asOf)}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Case</th><th className="px-6 py-3 font-extrabold">Organization</th><th className="px-6 py-3 font-extrabold">Priority</th><th className="px-6 py-3 font-extrabold">Status</th><th className="px-6 py-3 font-extrabold">First response</th><th className="px-6 py-3 font-extrabold">Updated</th></tr></thead>
              <tbody className="divide-y divide-line">
                {result.records.length === 0 ? <tr><td colSpan={6} className="px-6 py-14 text-center text-ink-muted">{result.query || result.status !== "active" || result.priority !== "all" ? "No support cases match these filters." : "No active support cases."}</td></tr> : result.records.map((record) => {
                  const overdue = record.status !== "resolved" && record.status !== "closed" && Date.parse(record.first_response_due_at) <= Date.parse(result.asOf);
                  return <tr key={record.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><strong className="block font-extrabold">{record.subject}</strong><span className="mt-1 block text-xs text-ink-muted">{record.id}</span></td><td className="px-6 py-4"><Link href={`/platform/organizations/${record.org_id}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{record.organizationName}</Link><span className="mt-1 block text-xs text-ink-muted">{record.org_id}</span></td><td className="px-6 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${record.priority === "urgent" ? "bg-danger-soft text-danger" : "bg-secondary text-primary"}`}>{record.priority === "urgent" ? "Urgent" : "Normal"}</span></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-xs font-extrabold text-primary">{record.status.replaceAll("_", " ")}</span></td><td className="px-6 py-4"><span className={overdue ? "font-extrabold text-danger" : "font-semibold text-ink-muted"}>{formatDate(record.first_response_due_at)}</span>{overdue && <span className="mt-1 block text-xs font-extrabold text-danger">Overdue</span>}</td><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{formatDate(record.updated_at)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>

          <SupportPagination page={result.page} pageSize={result.pageSize} total={result.total} hasMore={result.hasMore} query={result.query} status={result.status} priority={result.priority} rowCount={result.records.length} />
        </section>

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="support-boundary-heading">
          <PlatformSectionHeading eyebrow="Data boundary" title="Metadata first" description="The queue intentionally excludes case descriptions, tenant order data, and direct lifecycle mutations. Open the organization record to review the existing support history and policy-gated controls." />
        </section>
      </div>
    </main>
  );
}

function SupportPagination({ page, pageSize, total, hasMore, query, status, priority, rowCount }: { page: number; pageSize: number; total: number | null; hasMore: boolean; query: string; status: PlatformSupportQueueStatus; priority: PlatformSupportQueuePriority; rowCount: number }) {
  const start = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = rowCount === 0 ? 0 : start + rowCount - 1;
  const label = total === null ? `${start === 0 ? 0 : `${start}–${end}`} visible` : `${start === 0 ? 0 : `${start}–${end}`} of ${total}`;
  return <nav className="flex flex-col gap-3 border-t border-line bg-raised/40 px-5 py-4 text-xs font-semibold text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-label="Support queue pages"><span>{label}</span><div className="flex items-center gap-2">{page > 1 ? <Link href={supportPageHref(page - 1, query, status, priority)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft">Previous</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Previous</span>}{hasMore ? <Link href={supportPageHref(page + 1, query, status, priority)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft">Next</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Next</span>}</div></nav>;
}

function supportPageHref(page: number, query: string, status: PlatformSupportQueueStatus, priority: PlatformSupportQueuePriority) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "active") params.set("status", status);
  if (priority !== "all") params.set("priority", priority);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/platform/support?${search}` : "/platform/support";
}
