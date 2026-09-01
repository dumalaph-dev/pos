import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { isPolicyGateOpen } from "@/lib/platform-operations";
import { readPlatformOperations } from "@/lib/platform-operations-server";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { PlatformPolicyEditor, PolicyCardHeading } from "@/app/platform/PlatformPolicyEditor";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";

export const dynamic = "force-dynamic";

export default async function PlatformPoliciesPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  const admin = actor.admin;

  const { policies } = await readPlatformOperations(admin);
  const policyGateOpen = isPolicyGateOpen(policies);
  const publishedPolicies = Number(policies.billing.status === "published") + Number(policies.support.status === "published");

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Control center"
          title="Policies"
          description="Define the billing and support promises that protect owners and keep platform actions accountable."
          actions={<>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Open operations</Link>
            <Link href="/platform/plans" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Review pricing</Link>
          </>}
        />

        {!policies.schemaAvailable && <div role="status" className="mt-6 rounded-[18px] border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">Policy storage is not active yet. Apply <code className="mx-1 font-extrabold">0027_platform_operations.sql</code> before editing or publishing policies.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Policy summary">
          <PlatformMetric label="Published policies" value={`${publishedPolicies}/2`} detail={policyGateOpen ? "Operational gate is open" : "Both policies are required"} icon="lock" />
          <PlatformMetric label="Billing version" value={`v${policies.billing.version}`} detail={policies.billing.status === "published" ? "Published contract" : "Draft in review"} icon="wallet" />
          <PlatformMetric label="Support version" value={`v${policies.support.version}`} detail={policies.support.status === "published" ? "Published promise" : "Draft in review"} icon="customers" />
          <PlatformMetric label="Action state" value={policyGateOpen ? "Open" : "Locked"} detail="Checkout, lifecycle, and support" icon={policyGateOpen ? "refresh" : "lock"} />
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-primary/20 bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:p-6" aria-labelledby="policy-gate-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-fg/12"><AdminIcon name={policyGateOpen ? "check" : "alert"} size={19} /></span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary-fg/65">Operational gate</p>
                <h2 id="policy-gate-heading" className="mt-1 text-xl font-extrabold">{policyGateOpen ? "Both policies are published" : "Publish both policies before enabling actions"}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-primary-fg/72">Checkout, account suspension, and support mutations stay unavailable while either policy is still a draft. Every publish creates a new version for audit history.</p>
              </div>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-2">
              <GateStatus label="Billing policy" published={policies.billing.status === "published"} />
              <GateStatus label="Support policy" published={policies.support.status === "published"} />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-2" aria-label="Platform policy editors">
          <article id="billing-policy" className="scroll-mt-24 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PolicyCardHeading policy={policies.billing} />
            <PlatformPolicyEditor policy={policies.billing} schemaAvailable={policies.schemaAvailable} canManage={hasPlatformOperatorPermission(actor.role, "policy_manage")} />
          </article>
          <article id="support-policy" className="scroll-mt-24 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PolicyCardHeading policy={policies.support} />
            <PlatformPolicyEditor policy={policies.support} schemaAvailable={policies.schemaAvailable} canManage={hasPlatformOperatorPermission(actor.role, "policy_manage")} />
          </article>
        </section>

        <section className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <PlatformSectionHeading eyebrow="Why this matters" title="The gate keeps platform actions deliberate" description="Policies sit between configuration and execution. They make the rules visible before a change can affect an account or a customer payment." />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <PolicyPrinciple icon="wallet" title="Billing contract" detail="Trials, renewals, refunds, grace periods, and price-change notice." />
            <PolicyPrinciple icon="help" title="Support promise" detail="Response targets, support coverage, escalation, and recovery." />
            <PolicyPrinciple icon="history" title="Audit trail" detail="Each saved version is attributed so changes remain reviewable." />
          </div>
        </section>
      </div>
    </main>
  );
}

function GateStatus({ label, published }: { label: string; published: boolean }) {
  return <div className="flex min-w-[142px] items-center gap-2 rounded-xl bg-primary-fg/10 px-3 py-2.5 text-xs font-extrabold"><span className={`grid h-5 w-5 place-items-center rounded-full ${published ? "bg-success text-primary-fg" : "bg-primary-fg/20 text-primary-fg/75"}`}><AdminIcon name={published ? "check" : "alert"} size={12} /></span><span><span className="block text-[10px] uppercase tracking-wide text-primary-fg/60">{label}</span><span className="mt-0.5 block">{published ? "Published" : "Draft"}</span></span></div>;
}

function PolicyPrinciple({ icon, title, detail }: { icon: "wallet" | "help" | "history"; title: string; detail: string }) {
  return <article className="rounded-[18px] border border-line bg-raised/60 p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><h3 className="mt-3 text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}
