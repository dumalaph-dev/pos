import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformSyncHealthViewer } from "@/app/platform/PlatformSyncHealthViewer";
import { PlatformAccessDenied, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";
import { readPlatformSyncHealth } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformSyncHealthPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  if (!actor.admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening sync health." />;

  const result = await readPlatformSyncHealth(actor.admin);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Operational readiness</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] sm:text-4xl">Sync &amp; outbox health</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">See whether active branches are reporting a healthy local queue, and find stuck offline work before a pilot tablet goes quiet.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/platform/fleet" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="chart" size={14} /> Fleet health</Link>
            <Link href="/platform/audit" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="history" size={14} /> Audit log</Link>
          </div>
        </header>

        <PlatformSyncHealthViewer summary={result.summary} schemaAvailable={result.schemaAvailable} enhancedMetricsAvailable={result.enhancedMetricsAvailable} organizationsAvailable={result.organizationsAvailable} storesAvailable={result.storesAvailable} hasMore={result.hasMore} />

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="platform-sync-boundary-heading">
          <PlatformSectionHeading eyebrow="Read boundary" title="Queue counters only" description="The platform sees bounded branch heartbeats, not local order payloads, inventory mutation contents, customer data, or staff activity." />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BoundaryNote icon="refresh" title="Current queue depth" detail="POS orders, audit events, and admin changes report pending, failed, and conflict counts from the local outbox." />
            <BoundaryNote icon="clock" title="Freshness is explicit" detail="A branch is stale after 30 minutes without a heartbeat; an outbox is stuck when its oldest pending item is over 15 minutes old." />
            <BoundaryNote icon="lock" title="Read-only" detail="The page has no retry, delete, or tenant-data controls. Recovery still happens on the branch device through the existing sync engine." />
          </div>
        </section>
      </div>
    </main>
  );
}

function BoundaryNote({ icon, title, detail }: { icon: "refresh" | "clock" | "lock"; title: string; detail: string }) {
  return <article className="rounded-[18px] border border-primary/15 bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><h2 className="mt-3 text-sm font-extrabold">{title}</h2><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}
