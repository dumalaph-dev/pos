"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";

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
};

export function CheckoutPlanPicker({ variants, selectedId, onChange, inputName }: { variants: CheckoutVariant[]; selectedId: string; onChange: (id: string) => void; inputName: string }) {
  return (
    <fieldset>
      <legend className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Choose a plan</legend>
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
