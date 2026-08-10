import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { createAdminClient } from "@/lib/employee-auth";
import { formatPeso } from "@/lib/money";
import { readPlatformPromotions } from "@/lib/platform-promotions-server";
import { PlatformMetric, PlatformPageHeader, PlatformUnavailable } from "../../PlatformUI";
import { PromoMarketingEditor } from "../../PromoMarketingEditor";

export const dynamic = "force-dynamic";

export default async function PlatformPromotionsPage() {
  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const { schemaAvailable, promotions, performance } = await readPlatformPromotions(admin);
  const activePromotions = promotions.filter((promotion) => promotion.isActive).length;
  const started = performance.reduce((total, promotion) => total + promotion.started, 0);
  const converted = performance.reduce((total, promotion) => total + promotion.converted, 0);
  const conversionRate = started ? Math.round((converted / started) * 100) : 0;
  const discountGiven = performance.reduce((total, promotion) => total + promotion.discountGivenCentavos, 0);
  const revenue = performance.reduce((total, promotion) => total + promotion.revenueCentavos, 0);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Growth workspace"
          title="Promo & Marketing"
          description="Create focused checkout offers, keep control of their availability, and see which promotions turn into paid Premium plans."
          actions={<>
            <Link href="/platform/plans" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={14} /> Plans & Pricing</Link>
            <Link href="/admin/billing" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="eye" size={14} /> Preview checkout</Link>
          </>}
        />

        {!schemaAvailable && <div role="status" className="mt-6 rounded-[18px] border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold leading-6 text-ink">Promotion management is showing an empty safe state because the campaign tables are not available yet. Apply <code className="mx-1 font-extrabold">0040_platform_promotions.sql</code> before creating codes.</div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Promotion summary">
          <PlatformMetric label="Active campaigns" value={activePromotions} detail={`${promotions.length} total codes`} icon="dashboard" />
          <PlatformMetric label="Converted checkouts" value={converted} detail={`${started} code attempts`} icon="refresh" />
          <PlatformMetric label="Conversion rate" value={`${conversionRate}%`} detail="Attempted to paid" icon="customers" />
          <PlatformMetric label="Revenue after offers" value={formatPeso(revenue)} detail={`${formatPeso(discountGiven)} discount given`} icon="wallet" />
        </section>

        <PromoMarketingEditor schemaAvailable={schemaAvailable} promotions={promotions} performance={performance} />
      </div>
    </main>
  );
}
