import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { readPlatformBillingEvents, type PlatformBillingEventMetadata } from "../../_lib/platform-data";
import { formatDate } from "../../_lib/platform-data";
import { PlatformAccessDenied, PlatformMetric, PlatformMigrationNotice, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";

export const dynamic = "force-dynamic";

type PlatformBillingSearchParams = Promise<{ q?: string | string[] | undefined; status?: string | string[] | undefined }>;

export default async function PlatformBillingPage({ searchParams }: { searchParams: PlatformBillingSearchParams }) {
  const actor = await requirePlatformOperator("billing_manage");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const query = await searchParams;
  const rawQuery = Array.isArray(query.q) ? query.q[0] : query.q;
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const events = await readPlatformBillingEvents(actor.admin, rawQuery, rawStatus);
  const processedCount = events.records.filter((event) => event.processedAt !== null).length;
  const unprocessedCount = events.records.length - processedCount;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1320px]">
        <PlatformPageHeader
          eyebrow="Revenue evidence"
          title="Billing event receipts"
          description="Inspect provider delivery metadata and handler markers while reconciliation evidence is being built. This view never treats a receipt as proof that money or account state was reconciled."
          actions={<><Link href="/platform/plans" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={14} /> Plans &amp; pricing</Link><Link href="/platform" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="dashboard" size={14} /> Overview</Link></>}
        />

        {!events.schemaAvailable && <PlatformMigrationNotice migrations={["0027_platform_operations.sql"]} />}

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Billing event summary">
          <PlatformMetric label="Visible receipts" value={events.records.length} detail={events.hasMore ? "Showing the newest 100 matching records" : "Within the selected filter"} icon="history" />
          <PlatformMetric label="Handler marked" value={processedCount} detail="Processed timestamp is present" icon="check" />
          <PlatformMetric label="No marker" value={unprocessedCount} detail="Needs evidence before recovery decisions" icon="alert" />
        </section>

        <section className="mt-6 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="billing-event-filter-heading">
          <PlatformSectionHeading eyebrow="Receipt search" title="Filter provider events" description="Search event types or an exact provider event ID. Raw payloads and payment details remain outside this first read-only slice." />
          <form method="get" className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto] md:items-end" role="search">
            <div><label htmlFor="billing-event-query" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Event type or ID</label><input id="billing-event-query" name="q" type="search" defaultValue={events.query} placeholder="subscription.invoice.payment_failed" className="min-h-11 w-full rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" /></div>
            <div><label htmlFor="billing-event-status" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Handler marker</label><select id="billing-event-status" name="status" defaultValue={events.status} className="min-h-11 w-full rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"><option value="all">All receipts</option><option value="processed">Marker present</option><option value="unprocessed">Marker absent</option></select></div>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="search" size={14} /> Apply</button>
            {(events.query || events.status !== "all") && <Link href="/platform/billing" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="billing-event-results-heading">
          <div className="px-5 py-5 sm:px-6"><PlatformSectionHeading eyebrow="Provider delivery" title="Receipt metadata" description={`As of ${formatDate(events.asOf)} · ${events.hasMore ? "The list is bounded; refine the filter for older matches." : "No additional matching rows were detected."}`} /></div>
          <div className="overflow-x-auto">
            <table className="min-w-[840px] w-full text-left text-sm">
              <caption className="sr-only">Billing provider receipt metadata</caption>
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th scope="col" className="px-6 py-3 font-extrabold">Received</th><th scope="col" className="px-6 py-3 font-extrabold">Event type</th><th scope="col" className="px-6 py-3 font-extrabold">Provider event ID</th><th scope="col" className="px-6 py-3 font-extrabold">Handler marker</th><th scope="col" className="px-6 py-3 font-extrabold">Provider</th></tr></thead>
              <tbody className="divide-y divide-line">
                {events.records.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-ink-muted">{events.query || events.status !== "all" ? "No receipts match the selected filter." : "No billing provider receipts are available."}</td></tr> : events.records.map((event) => <BillingEventRow key={event.id} event={event} />)}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-warning/10 px-5 py-4 text-xs leading-5 text-ink-muted sm:px-6">A processed timestamp means the current handler marked the receipt complete. It does not prove that the event matched an organization, changed subscription state, or collected payment. Reconciliation and safe recovery remain separate planned work.</div>
        </section>
      </div>
    </main>
  );
}

function BillingEventRow({ event }: { event: PlatformBillingEventMetadata }) {
  return <tr className="align-top transition hover:bg-raised/55"><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{formatDate(event.receivedAt)}</td><td className="px-6 py-4"><strong className="block font-extrabold">{event.eventType}</strong><span className="mt-1 block text-xs text-ink-muted">Receipt metadata only</span></td><td className="px-6 py-4"><code className="break-all text-xs font-semibold text-ink-muted">{event.providerEventId}</code></td><td className="px-6 py-4">{event.processedAt ? <span className="inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-extrabold text-success">Marked {formatDate(event.processedAt)}</span> : <span className="inline-flex rounded-full bg-warning/15 px-2.5 py-1 text-xs font-extrabold text-ink">No marker</span>}</td><td className="px-6 py-4 text-xs font-extrabold text-ink-muted">{event.provider}</td></tr>;
}
