import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAuditViewer } from "@/app/platform/PlatformAuditViewer";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";
import { readPlatformAudit } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformAuditPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  if (!actor.admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform audit viewer." />;

  const asOf = new Date().toISOString();
  const result = await readPlatformAudit(actor.admin);
  const organizationCount = new Set(result.events.map((event) => event.organizationId).filter((id): id is string => Boolean(id))).size;
  const actorCount = new Set(result.events.map((event) => event.actorId ?? event.actorEmail).filter((actorKey): actorKey is string => Boolean(actorKey))).size;
  const recentEventCount = result.events.filter((event) => {
    const createdAt = Date.parse(event.createdAt);
    return Number.isFinite(createdAt) && createdAt >= Date.parse(asOf) - 24 * 60 * 60 * 1000;
  }).length;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Governance & traceability"
          title="Platform audit"
          description="Read the cross-organization actions taken by platform operators. This surface is read-only and deliberately excludes tenant order, customer, and staff activity."
          actions={<>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Account operations</Link>
            <Link href="/platform/operators" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Operator membership</Link>
          </>}
        />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Platform audit summary">
          <PlatformMetric label="Events loaded" value={result.events.length} detail={result.hasMore ? "Newest 500 shown" : "Complete available history"} icon="history" />
          <PlatformMetric label="Organizations" value={organizationCount} detail="With platform actions in view" icon="branches" />
          <PlatformMetric label="Actors" value={actorCount} detail="Distinct platform identities" icon="employees" />
          <PlatformMetric label="Last 24 hours" value={recentEventCount} detail="Recent platform events" icon="clock" />
        </section>

        <PlatformAuditViewer
          events={result.events}
          schemaAvailable={result.schemaAvailable}
          operatorAuditSchemaAvailable={result.operatorAuditSchemaAvailable}
          hasMore={result.hasMore}
          asOf={asOf}
        />

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="platform-audit-boundary-heading">
          <PlatformSectionHeading eyebrow="Read boundary" title="Platform actions only" description="The viewer reads the platform audit namespace and operator membership audit table. It does not query tenant order, customer, or staff records, and it has no mutation controls." />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BoundaryNote icon="filter" title="Scoped query" detail="Organization audit rows are limited to actions matching platform.% before they reach the viewer." />
            <BoundaryNote icon="history" title="Evidence retained" detail="Before and after snapshots remain available for reviewing why an operator action changed access or account state." />
            <BoundaryNote icon="lock" title="Read-only" detail="Every platform role can review the trace; no audit-table write or delete path is exposed here." />
          </div>
        </section>
      </div>
    </main>
  );
}

function BoundaryNote({ icon, title, detail }: { icon: "filter" | "history" | "lock"; title: string; detail: string }) {
  return <article className="rounded-[18px] border border-primary/15 bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><h3 className="mt-3 text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}
