"use client";

import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { formatPeso } from "@/lib/money";
import { calculateAdditionalBranchPriceQuote, calculateCatalogVariantPriceQuote, MAX_BRANCH_ENTITLEMENT, type BillingCatalog, type BillingVariant } from "@/lib/platform-operations";

type BranchCapacityMode = "prepaid" | "recurring" | "trial" | "complimentary" | "setup";

type BranchCapacityCardProps = {
  mode: BranchCapacityMode;
  activeBranches: number;
  branchEntitlement: number;
  catalog: BillingCatalog;
  currentVariant: BillingVariant | null;
  offeredVariants: BillingVariant[];
  currentPeriodLabel: string | null;
  paymentReady: boolean;
  initialTargetBranchCount?: number;
};

const MAX_VISIBLE_ADDITIONAL_BRANCHES = 20;

export default function BranchCapacityCard({ mode, activeBranches, branchEntitlement, catalog, currentVariant, offeredVariants, currentPeriodLabel, paymentReady, initialTargetBranchCount }: BranchCapacityCardProps) {
  const capacityBase = Math.max(activeBranches, branchEntitlement, catalog.includedBranchCount, 1);
  const maxAdditionalBranches = Math.max(Math.min(MAX_VISIBLE_ADDITIONAL_BRANCHES, MAX_BRANCH_ENTITLEMENT - capacityBase), 0);
  const initialAdditionalBranches = initialTargetBranchCount ? Math.max(initialTargetBranchCount - capacityBase, 1) : 1;
  const [additionalBranches, setAdditionalBranches] = useState(initialAdditionalBranches);
  const selectedAdditionalBranches = Math.min(Math.max(additionalBranches, 1), Math.max(maxAdditionalBranches, 1));
  const targetBranchCount = Math.min(capacityBase + selectedAdditionalBranches, MAX_BRANCH_ENTITLEMENT);
  const pricingVariant = currentVariant ?? offeredVariants[0] ?? null;
  const quote = useMemo(() => {
    if (!pricingVariant) return null;
    if (mode === "prepaid" || mode === "recurring") {
      return calculateAdditionalBranchPriceQuote(catalog, pricingVariant, capacityBase, targetBranchCount);
    }
    if (mode === "trial" || mode === "setup") {
      return calculateCatalogVariantPriceQuote(catalog, pricingVariant, targetBranchCount);
    }
    return null;
  }, [capacityBase, catalog, mode, pricingVariant, targetBranchCount]);

  const paymentHref = `/admin/billing?reason=additional_branch&target=${targetBranchCount}#checkout-heading`;
  const priceLabel = quote ? formatPeso(quote.termTotalCentavos) : formatPeso(catalog.additionalBranchPriceCentavos);
  const monthlyEquivalentLabel = quote ? formatPeso(quote.monthlyEquivalentCentavos) : formatPeso(catalog.additionalBranchPriceCentavos);
  const isOneTime = mode === "prepaid";
  const isRecurring = mode === "recurring";
  const isComplimentary = mode === "complimentary";
  const isAtCapacity = maxAdditionalBranches === 0;
  const cardTone = isOneTime
    ? "border-accent/35 bg-gradient-to-br from-primary via-primary to-primary-hover text-primary-fg shadow-[var(--shadow-pop)]"
    : isComplimentary
      ? "border-success/25 bg-success/10 text-ink shadow-[var(--shadow-card)]"
      : "border-line bg-surface text-ink shadow-[var(--shadow-card)]";
  const mutedTone = isOneTime ? "text-primary-fg/72" : "text-ink-muted";
  const eyebrow = isOneTime ? "Prepaid capacity" : isRecurring ? "Recurring capacity" : isComplimentary ? "Complimentary capacity" : "Plan capacity";
  const heading = isOneTime ? "Add branches in one payment." : isRecurring ? "Know your next branch cost." : isComplimentary ? "Your branches are covered." : "Plan your branch capacity.";
  const description = isOneTime
    ? "Buy the exact number of additional branch slots you need. Your current prepaid term and renewal date stay unchanged."
    : isRecurring
      ? "Preview the exact add-on for your next recurring invoice. New active branches are scheduled through Branches and billed with your subscription."
      : isComplimentary
        ? "Your complimentary Premium access bypasses branch charges while the grant is active."
        : "Choose how much capacity you want, then continue to Premium checkout with the target branch count already selected.";

  return (
    <section className={`relative mt-5 overflow-hidden rounded-[22px] border ${cardTone}`} aria-labelledby="branch-capacity-heading">
      {isOneTime && <>
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none bottom-0 left-0 h-px w-2/3 bg-gradient-to-r from-accent/75 to-transparent" />
      </>}

      <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isOneTime ? "bg-accent text-accent-fg shadow-[0_8px_20px_rgba(188,150,87,0.24)]" : "bg-primary text-primary-fg"}`}><AdminIcon name="branches" size={20} /></span>
              <div>
                <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${isOneTime ? "text-primary-fg/65" : "text-accent"}`}>{eyebrow}</p>
                <h2 id="branch-capacity-heading" className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">{heading}</h2>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-extrabold ${isOneTime ? "bg-primary-fg/15 text-primary-fg ring-1 ring-inset ring-primary-fg/15" : isComplimentary ? "bg-success/15 text-success" : "bg-primary-soft text-primary"}`}>
              <AdminIcon name={isComplimentary ? "check" : "star"} size={13} /> {isOneTime ? paymentReady ? "QR Ph or card" : "Payment setup needed" : isRecurring ? "Next billing cycle" : isComplimentary ? "No charge" : "Ready to configure"}
            </span>
          </div>

          <p className={`mt-4 max-w-xl text-sm leading-6 ${mutedTone}`}>{description}</p>

          <div className={`mt-6 grid gap-3 border-t pt-5 sm:grid-cols-3 ${isOneTime ? "border-primary-fg/15" : "border-line"}`}>
            <CapacityMetric inverse={isOneTime} label="Active now" value={`${activeBranches}`} detail={`${activeBranches === 1 ? "branch" : "branches"} in use`} />
            <CapacityMetric inverse={isOneTime} label="Paid capacity" value={`${capacityBase}`} detail={`${Math.max(capacityBase - catalog.includedBranchCount, 0)} paid add-on${Math.max(capacityBase - catalog.includedBranchCount, 0) === 1 ? "" : "s"}`} />
            <CapacityMetric inverse={isOneTime} label="After purchase" value={`${targetBranchCount}`} detail={`${selectedAdditionalBranches} more slot${selectedAdditionalBranches === 1 ? "" : "s"}`} />
          </div>

          {currentPeriodLabel && (isOneTime || isRecurring) && <p className={`mt-5 text-xs leading-5 ${mutedTone}`}>{isOneTime ? <>Available through <strong className={isOneTime ? "text-primary-fg" : "text-ink"}>{currentPeriodLabel}</strong>; this purchase does not restart or extend your current term.</> : <>Current billing period ends <strong className="text-ink">{currentPeriodLabel}</strong>; branch add-ons are included on the next recurring invoice.</>}</p>}
        </div>

        <aside className={`border-t p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7 ${isOneTime ? "border-primary-fg/15" : "border-line"}`} aria-label="Branch capacity purchase">
          <div className={`rounded-2xl border p-4 sm:p-5 ${isOneTime ? "border-primary-fg/12 bg-primary-fg/10" : "border-primary/10 bg-primary/5"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-xs font-extrabold uppercase tracking-[0.14em] ${isOneTime ? "text-primary-fg/65" : "text-accent"}`}>Add branches</p>
                <p className={`mt-1 text-base font-extrabold ${isOneTime ? "text-primary-fg" : "text-ink"}`}>{isAtCapacity ? "Capacity limit reached" : "How many more?"}</p>
              </div>
              <AdminIcon name="plus" size={17} />
            </div>

            {!isAtCapacity && <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${isOneTime ? "border-primary-fg/15 bg-primary-fg/10" : "border-line bg-surface-raised"}`}>
              <span className={`text-xs font-extrabold uppercase tracking-wide ${isOneTime ? "text-primary-fg/70" : "text-ink-muted"}`}>Additional slots</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdditionalBranches((value) => Math.max(1, value - 1))} disabled={selectedAdditionalBranches <= 1} aria-label="Remove one additional branch slot" className={`grid h-8 w-8 place-items-center rounded-lg border text-base font-extrabold transition disabled:cursor-not-allowed disabled:opacity-35 ${isOneTime ? "border-primary-fg/20 text-primary-fg hover:bg-primary-fg/10" : "border-line-strong text-ink hover:bg-raised"}`}>−</button>
                <output aria-live="polite" className={`min-w-8 text-center text-lg font-extrabold tabular-nums ${isOneTime ? "text-primary-fg" : "text-ink"}`}>{selectedAdditionalBranches}</output>
                <button type="button" onClick={() => setAdditionalBranches((value) => Math.min(maxAdditionalBranches, value + 1))} disabled={selectedAdditionalBranches >= maxAdditionalBranches} aria-label="Add one additional branch slot" className={`grid h-8 w-8 place-items-center rounded-lg border text-base font-extrabold transition disabled:cursor-not-allowed disabled:opacity-35 ${isOneTime ? "border-primary-fg/20 text-primary-fg hover:bg-primary-fg/10" : "border-line-strong text-ink hover:bg-raised"}`}>+</button>
              </div>
            </div>}

            <div className={`mt-4 border-t border-dashed pt-3 ${isOneTime ? "border-primary-fg/20" : "border-line"}`}>
              <div className="flex items-end justify-between gap-3"><span className={`text-xs font-extrabold uppercase tracking-wide ${isOneTime ? "text-primary-fg/70" : "text-ink-muted"}`}>{isComplimentary ? "Price" : isRecurring ? "Next invoice add-on" : isOneTime ? "Pay once" : "Plan total"}</span><strong className={`text-2xl font-extrabold tracking-[-0.04em] tabular-nums ${isOneTime ? "text-primary-fg" : "text-primary"}`}>{isComplimentary ? "Included" : priceLabel}</strong></div>
              {!isComplimentary && <p className={`mt-1 text-[11px] leading-4 ${isOneTime ? "text-primary-fg/65" : "text-ink-muted"}`}>{isOneTime ? `For ${selectedAdditionalBranches} additional branch slot${selectedAdditionalBranches === 1 ? "" : "s"} through the current prepaid term` : isRecurring ? `${monthlyEquivalentLabel}/month equivalent · applied on renewal` : `${monthlyEquivalentLabel}/month equivalent · checkout will confirm the term`}</p>}
            </div>

            {isAtCapacity ? <p className={`mt-4 rounded-xl border px-3 py-2.5 text-xs leading-5 ${isOneTime ? "border-warning/25 bg-warning/10 text-primary-fg" : "border-warning/30 bg-warning/10 text-ink"}`}>Your organization is at the maximum supported branch entitlement. Contact support if you need a larger workspace.</p> : isComplimentary ? <Link href="/admin/branches" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Manage branches <AdminIcon name="arrow" size={14} /></Link> : isRecurring ? <Link href="/admin/branches" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Add from Branches <AdminIcon name="arrow" size={14} /></Link> : <Link href={paymentHref} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${isOneTime ? "bg-accent text-accent-fg hover:bg-accent-hover" : "bg-primary text-primary-fg hover:bg-primary-hover"}`}>{isOneTime ? "Review payment" : "Choose plan & pay"} <AdminIcon name="arrow" size={14} /></Link>}
            {!isComplimentary && !isRecurring && !isAtCapacity && <p className={`mt-3 text-[11px] leading-4 ${isOneTime ? "text-primary-fg/65" : "text-ink-muted"}`}>{isOneTime ? "Your entitlement is updated only after PayMongo confirms payment." : "No branch is activated until payment is confirmed."}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function CapacityMetric({ label, value, detail, inverse }: { label: string; value: string; detail: string; inverse: boolean }) {
  return <div className={`rounded-xl border p-3 ${inverse ? "border-primary-fg/15 bg-primary-fg/10" : "border-line bg-surface-raised/60"}`}><p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${inverse ? "text-primary-fg/60" : "text-ink-subtle"}`}>{label}</p><strong className="mt-1 block text-xl font-extrabold tracking-[-0.04em] tabular-nums">{value}</strong><span className={`mt-0.5 block truncate text-xs ${inverse ? "text-primary-fg/65" : "text-ink-muted"}`}>{detail}</span></div>;
}
