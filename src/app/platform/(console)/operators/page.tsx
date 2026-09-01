import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { PlatformOperatorsPanel } from "@/app/platform/PlatformOperatorsPanel";
import type { PlatformOperatorRole } from "@/lib/platform-operators";
import { readPlatformOperators, requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";

export const dynamic = "force-dynamic";

export default async function PlatformOperatorsPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const admin = actor.admin;
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;
  const result = await readPlatformOperators(admin);
  const activeRecords = result.records.filter((record) => record.is_active);
  const roleCounts = new Map<PlatformOperatorRole, number>();
  for (const record of activeRecords) roleCounts.set(record.role, (roleCounts.get(record.role) ?? 0) + 1);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Security workspace"
          title="Operators"
          description="Manage platform-console membership without a redeploy. Roles are checked again inside every server action, and membership changes remain auditable."
          actions={<>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Account operations</Link>
            <Link href="/platform/policies" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Review policies</Link>
          </>}
        />

        {!result.schemaAvailable && <div role="status" className="mt-6 rounded-[18px] border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">The bootstrap Owner is available, but membership management is locked until migration <code className="mx-1 font-extrabold">0077_platform_operators.sql</code> is applied.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operator summary">
          <PlatformMetric label="Active operators" value={activeRecords.length} detail={`${result.records.length - activeRecords.length} revoked record${result.records.length - activeRecords.length === 1 ? "" : "s"}`} icon="employees" />
          <PlatformMetric label="Owner operators" value={roleCounts.get("owner") ?? 0} detail="Can manage the operator directory" icon="lock" />
          <PlatformMetric label="Billing operators" value={roleCounts.get("billing") ?? 0} detail="Plans, promotions, and entitlements" icon="wallet" />
          <PlatformMetric label="Support operators" value={roleCounts.get("support") ?? 0} detail="Support and lifecycle controls" icon="help" />
        </section>

        <PlatformOperatorsPanel records={result.records} auditLogs={result.auditLogs} schemaAvailable={result.schemaAvailable} currentRole={actor.role} />

        <section className="mt-6 rounded-[22px] border border-primary/15 bg-primary-soft/45 p-5 sm:p-6" aria-labelledby="operator-boundary-heading">
          <PlatformSectionHeading eyebrow="Boundary notes" title="The bootstrap owner is intentionally different" description="Emails in PLATFORM_ADMIN_EMAILS always resolve as Owner so a deployment setting can recover a locked-out operator table. They appear here for visibility but cannot be demoted or revoked from this page." />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BoundaryNote icon="lock" title="Server checked" detail="Page visibility never replaces the role check inside a mutation." />
            <BoundaryNote icon="history" title="No hard delete" detail="Revocation keeps the identity and its evidence for review." />
            <BoundaryNote icon="check" title="Last owner protected" detail="The database refuses demoting or revoking the final active Owner." />
          </div>
        </section>
      </div>
    </main>
  );
}

function BoundaryNote({ icon, title, detail }: { icon: "lock" | "history" | "check"; title: string; detail: string }) {
  return <article className="rounded-[18px] border border-primary/15 bg-surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><h3 className="mt-3 text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}
