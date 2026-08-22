"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatPeso } from "@/lib/money";
import { calculateAdditionalBranchPriceQuote, calculateCatalogVariantPriceQuote, type BillingIntervalUnit, type SubscriptionCatalogPricing } from "@/lib/platform-operations";

export type CheckoutVariant = {
  id: string;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  monthlyEquivalentLabel: string;
  discountPercent: number;
  baseAmountCentavos: number;
  activeBranchCount: number;
  billableBranchCount: number;
  intervalUnit: BillingIntervalUnit;
  intervalCount: number;
};

export type CheckoutBranchPricing = {
  catalog: SubscriptionCatalogPricing;
  activeBranchCount: number;
  entitledBranchCount: number;
  mode: "subscription" | "additional_branch";
  maxBranchCount: number;
};

export function priceCheckoutVariants(variants: CheckoutVariant[], pricing: CheckoutBranchPricing, targetActiveBranchCount: number) {
  const targetCount = Math.max(Math.floor(targetActiveBranchCount), pricing.activeBranchCount, 1);
  const entitlementBase = Math.max(pricing.entitledBranchCount, pricing.activeBranchCount, 1);

  return variants.map((variant) => {
    const quote = pricing.mode === "additional_branch"
      ? calculateAdditionalBranchPriceQuote(pricing.catalog, variant, entitlementBase, targetCount)
      : calculateCatalogVariantPriceQuote(pricing.catalog, variant, targetCount);
    return {
      ...variant,
      priceLabel: formatPeso(quote.termTotalCentavos),
      monthlyEquivalentLabel: formatPeso(quote.monthlyEquivalentCentavos),
      baseAmountCentavos: quote.termTotalCentavos,
      activeBranchCount: quote.activeBranchCount,
      billableBranchCount: quote.billableBranchCount,
    };
  });
}

export function CheckoutPlanPicker({ variants, selectedId, onChange, inputName, legendLabel = "Choose a plan" }: { variants: CheckoutVariant[]; selectedId: string; onChange: (id: string) => void; inputName: string; legendLabel?: string }) {
  return (
    <fieldset>
      <legend className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">{legendLabel}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {variants.map((variant) => {
          const selected = selectedId === variant.id;
          return (
            <label key={variant.id} className={`cursor-pointer rounded-xl border px-3 py-2.5 transition ${selected ? "border-primary bg-primary-soft ring-1 ring-primary/15" : "border-line bg-raised hover:border-line-strong"}`}>
              <span className="flex items-start gap-2.5">
                <input type="radio" name={inputName} value={variant.id} checked={selected} onChange={() => onChange(variant.id)} className="mt-0.5 accent-primary" />
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm font-extrabold text-ink">{variant.label}</strong><span className="shrink-0 text-sm font-extrabold tabular-nums text-ink">{variant.priceLabel}</span></span><span className="mt-1 block text-[11px] leading-4 text-ink-muted">{variant.cadenceLabel}{variant.discountPercent > 0 ? ` · Save ${variant.discountPercent}%` : ""}{variant.cadenceLabel !== "per month" ? ` · About ${variant.monthlyEquivalentLabel}/month` : ""} · {variant.activeBranchCount} active branch{variant.activeBranchCount === 1 ? "" : "es"}{variant.billableBranchCount > 0 ? ` · ${variant.billableBranchCount} add-on${variant.billableBranchCount === 1 ? "" : "s"}` : ""}</span></span>
                {selected && <AdminIcon name="check" size={15} />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function BranchAddonPicker({ pricing, targetActiveBranchCount, onChange }: { pricing: CheckoutBranchPricing; targetActiveBranchCount: number; onChange: (value: number) => void }) {
  const baseBranchCount = pricing.mode === "additional_branch"
    ? Math.max(pricing.activeBranchCount, pricing.entitledBranchCount, 1)
    : Math.max(pricing.activeBranchCount, 1);
  const minimumTarget = pricing.mode === "additional_branch" ? baseBranchCount + 1 : Math.max(pricing.activeBranchCount, 1);
  const target = Math.min(Math.max(targetActiveBranchCount, minimumTarget), pricing.maxBranchCount);
  const additionalSlots = Math.max(target - baseBranchCount, 0);
  const maxAdditionalSlots = Math.max(pricing.maxBranchCount - baseBranchCount, 0);

  return (
    <section className="rounded-xl border border-accent/25 bg-accent/5 px-3.5 py-3.5" aria-labelledby="branch-add-on-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Branch add-on</p>
          <h3 id="branch-add-on-heading" className="mt-1 text-sm font-extrabold text-ink">Add branch slots to this checkout</h3>
          <p className="mt-1 text-[11px] leading-4 text-ink-muted">Your plan will cover up to {target} active branch{target === 1 ? "" : "es"} after payment.</p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><AdminIcon name="branches" size={15} /></span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Additional slots</p>
          <p className="mt-0.5 text-xs font-semibold text-ink">{additionalSlots} selected · {baseBranchCount} already covered</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onChange(Math.max(minimumTarget, target - 1))} disabled={target <= minimumTarget} aria-label="Remove one branch slot" className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-base font-extrabold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-35">−</button>
          <output aria-live="polite" className="min-w-16 text-center text-sm font-extrabold tabular-nums text-primary">{target} total</output>
          <button type="button" onClick={() => onChange(Math.min(pricing.maxBranchCount, target + 1))} disabled={target >= pricing.maxBranchCount || target >= baseBranchCount + maxAdditionalSlots} aria-label="Add one branch slot" className="grid h-8 w-8 place-items-center rounded-lg border border-line-strong text-base font-extrabold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-35">+</button>
        </div>
      </div>
    </section>
  );
}
