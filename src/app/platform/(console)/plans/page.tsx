import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatPeso } from "@/lib/money";
import { readPlatformOperations } from "@/lib/platform-operations-server";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { BillingCatalogEditor } from "@/app/platform/BillingCatalogEditor";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";

export const dynamic = "force-dynamic";

export default async function PlatformPlansPage() {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  const admin = actor.admin;

  const { catalog } = await readPlatformOperations(admin);
  const activeVariants = catalog.variants.filter((variant) => variant.isActive);
  const annualVariants = catalog.variants.filter((variant) => variant.intervalUnit === "year");

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Revenue workspace"
          title="Plans & Pricing"
          description="Shape the subscription catalog customers see: the base price includes the first active branch, while every additional branch is priced as a monthly add-on."
          actions={<>
            <Link href="/admin/billing" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="eye" size={14} /> Preview checkout</Link>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Payment readiness <AdminIcon name="arrow" size={14} /></Link>
          </>}
        />

        {!catalog.schemaAvailable && <div role="status" className="mt-6 rounded-[18px] border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">Pricing is showing safe defaults because the latest billing catalog columns are not available yet. Apply <code className="mx-1 font-extrabold">0068_branch_billing_pricing.sql</code> before saving changes.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Pricing summary">
          <PlatformMetric label="Monthly base" value={formatPeso(catalog.monthlyPriceCentavos)} detail="Source price for all offers" icon="wallet" />
          <PlatformMetric label="Additional branch" value={formatPeso(catalog.additionalBranchPriceCentavos)} detail={`Per branch beyond ${catalog.includedBranchCount} included`} icon="branches" />
          <PlatformMetric label="Live offers" value={activeVariants.length} detail="Visible to customers" icon="dashboard" />
          <PlatformMetric label="Annual options" value={annualVariants.length} detail="Duration-based savings" icon="refresh" />
          <PlatformMetric label="Currency" value={catalog.currency} detail="Philippine peso" icon="customers" />
        </section>

        <section className="mt-6">
          <BillingCatalogEditor catalog={catalog} canManage={hasPlatformOperatorPermission(actor.role, "billing_manage")} />
        </section>

        <section className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <PlatformSectionHeading eyebrow="Pricing guardrails" title="Keep pricing changes easy to review" description="Pricing is intentionally separated from policy and provider configuration so a catalog edit stays focused." />
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <GuidanceCard number="01" title="Set the base" detail="Start with the monthly amount. The first active branch is included." />
            <GuidanceCard number="02" title="Price branches" detail="Set the monthly add-on for every active branch after the included branch." />
            <GuidanceCard number="03" title="Add commitments" detail="Use annual variants to define duration and customer savings." />
            <GuidanceCard number="04" title="Publish the rules" detail="Review the billing policy separately before enabling checkout actions." href="/platform/policies" />
          </div>
        </section>
      </div>
    </main>
  );
}

function GuidanceCard({ number, title, detail, href }: { number: string; title: string; detail: string; href?: string }) {
  const content = <><span className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{number}</span><h3 className="mt-2 text-sm font-extrabold">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>{href && <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-primary">Open policies <AdminIcon name="arrow" size={12} /></span>}</>;
  return href ? <Link href={href} className="rounded-[18px] border border-line bg-raised/60 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{content}</Link> : <article className="rounded-[18px] border border-line bg-raised/60 p-4">{content}</article>;
}
