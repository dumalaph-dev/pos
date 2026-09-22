import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformSchemaDriftViewer } from "@/app/platform/PlatformSchemaDriftViewer";
import { PlatformAccessDenied, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";
import { readPlatformSchemaDrift } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformSchemaDriftPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  if (!actor.admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening schema drift." />;

  const result = await readPlatformSchemaDrift(actor.admin);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Operational readiness</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.055em] sm:text-4xl">Schema drift</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Whether the migrations this deployment ships match the ones the database has applied. This replaces reading the answer off a terminal and hand-typing it into the tracker after every hosted pass.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/platform/sync" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Sync health</Link>
            <Link href="/platform/fleet" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="chart" size={14} /> Fleet health</Link>
          </div>
        </header>

        <PlatformSchemaDriftViewer asOf={result.asOf} summary={result.summary} backfill={result.backfill} ledgerReadable={result.ledgerReadable} backfillAvailable={result.backfillAvailable} />

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="platform-schema-boundary-heading">
          <PlatformSectionHeading eyebrow="Read boundary" title="Versions and names only" description="The ledger read returns each migration's version and name. The statements column holds the full SQL text of every migration and is never selected, and the page has no apply, retry, or rollback control." />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BoundaryNote icon="alert" title="Pending is the deployment ahead" detail="A migration ships in this build but the database never applied it. Everything depending on it is silently absent." />
            <BoundaryNote icon="alert" title="Unknown remote is worse" detail="The database applied a version this build does not carry — an out-of-band apply, or a file deleted after it shipped." />
            <BoundaryNote icon="lock" title="One database, one position" detail="Tenancy is enforced by RLS inside a single database, so no organization can sit on a different ledger position." />
          </div>
        </section>
      </div>
    </main>
  );
}

function BoundaryNote({ icon, title, detail }: { icon: "alert" | "lock"; title: string; detail: string }) {
  return <article className="rounded-[18px] border border-primary/15 bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><h2 className="mt-3 text-sm font-extrabold">{title}</h2><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}
