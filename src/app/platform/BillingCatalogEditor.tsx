"use client";

import { useActionState, useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  billingVariantPriceLabel,
  calculateBillingVariantPrice,
  formatMonthlyPriceInput,
  type BillingCatalog,
  type BillingVariant,
} from "@/lib/platform-operations";
import { formatPeso } from "@/lib/money";
import { saveBillingCatalog, type PlatformActionState } from "./actions";

type DraftVariant = BillingVariant & { localKey: string };

const INITIAL_STATE: PlatformActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function BillingCatalogEditor({ catalog }: { catalog: BillingCatalog }) {
  const [state, formAction, pending] = useActionState(saveBillingCatalog, INITIAL_STATE);
  const [monthlyPrice, setMonthlyPrice] = useState(formatMonthlyPriceInput(catalog.monthlyPriceCentavos));
  const [variants, setVariants] = useState<DraftVariant[]>(() => catalog.variants.map((variant, index) => ({ ...variant, localKey: variant.id ?? `new-${index}` })));
  const monthlyPriceCentavos = parseClientPrice(monthlyPrice) ?? catalog.monthlyPriceCentavos;
  const serializedVariants = useMemo(() => JSON.stringify(variants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    intervalUnit: variant.intervalUnit,
    intervalCount: variant.intervalCount,
    discountPercent: variant.discountPercent,
    paymongoPlanId: variant.paymongoPlanId,
    isActive: variant.isActive,
    sortOrder: variant.sortOrder,
  }))), [variants]);

  function updateVariant(localKey: string, patch: Partial<DraftVariant>) {
    setVariants((current) => current.map((variant) => variant.localKey === localKey ? { ...variant, ...patch } : variant));
  }

  function addVariant() {
    setVariants((current) => [
      ...current,
      {
        id: null,
        localKey: `new-${Date.now()}`,
        label: "New annual option",
        intervalUnit: "year",
        intervalCount: 1,
        discountPercent: 10,
        paymongoPlanId: null,
        isActive: false,
        sortOrder: current.length,
      },
    ]);
  }

  return (
    <form action={formAction} className="mt-5 space-y-5">
      <input type="hidden" name="variants" value={serializedVariants} readOnly />

      <div className="rounded-card border border-primary/15 bg-primary-soft/45 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg"><AdminIcon name="wallet" size={17} /></span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Base price</p>
            <label className="mt-1 block text-sm font-extrabold text-ink" htmlFor="platform-monthly-price">Monthly subscription price</label>
            <div className="relative mt-1 max-w-[220px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm font-extrabold text-ink-muted">₱</span>
              <input id="platform-monthly-price" name="monthly_price" type="text" inputMode="decimal" value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} className={`${CONTROL_CLASS} pl-7`} disabled={!catalog.schemaAvailable || pending} aria-describedby="monthly-price-help" />
            </div>
            <p id="monthly-price-help" className="mt-2 text-xs leading-5 text-ink-muted">Annual totals are calculated from this base price, then reduced by each option&apos;s discount.</p>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Billing options</p>
            <h3 className="mt-1 text-lg font-extrabold">Monthly first, annual when ready</h3>
          </div>
          <button type="button" onClick={addVariant} disabled={!catalog.schemaAvailable || pending} className="inline-flex items-center gap-2 rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="plus" size={14} /> Add option</button>
        </div>

        <div className="mt-3 space-y-3">
          {variants.map((variant, index) => {
            const priceLabel = billingVariantPriceLabel({ monthlyPriceCentavos }, variant);
            const totalPrice = calculateBillingVariantPrice(monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent);
            return (
              <article key={variant.localKey} className={`rounded-card border p-4 transition ${variant.isActive ? "border-primary/30 bg-surface" : "border-line bg-surface-raised/70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Option {index + 1}</p>
                    <h4 className="mt-1 text-base font-extrabold">{variant.label || "Untitled option"}</h4>
                  </div>
                  <label className="inline-flex min-h-9 items-center gap-2 rounded-pill bg-raised px-3 text-xs font-extrabold text-ink">
                    <input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(variant.localKey, { isActive: event.target.checked })} className="h-4 w-4 accent-primary" disabled={!catalog.schemaAvailable || pending} />
                    Offered to customers
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_140px_140px]">
                  <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-label-${variant.localKey}`}>Display label
                    <input id={`variant-label-${variant.localKey}`} type="text" value={variant.label} onChange={(event) => updateVariant(variant.localKey, { label: event.target.value })} className={CONTROL_CLASS} maxLength={80} disabled={!catalog.schemaAvailable || pending} />
                  </label>
                  <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-unit-${variant.localKey}`}>Cycle
                    <select id={`variant-unit-${variant.localKey}`} value={variant.intervalUnit} onChange={(event) => updateVariant(variant.localKey, { intervalUnit: event.target.value as BillingVariant["intervalUnit"], intervalCount: event.target.value === "month" ? 1 : Math.max(1, variant.intervalCount), discountPercent: event.target.value === "month" ? 0 : variant.discountPercent })} className={CONTROL_CLASS} disabled={!catalog.schemaAvailable || pending}>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </label>
                  <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-count-${variant.localKey}`}>Duration
                    <div className="relative">
                      <input id={`variant-count-${variant.localKey}`} type="number" min="1" max="10" step="1" value={variant.intervalCount} onChange={(event) => updateVariant(variant.localKey, { intervalCount: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} className={`${CONTROL_CLASS} pr-14`} disabled={variant.intervalUnit === "month" || !catalog.schemaAvailable || pending} />
                      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[11px] font-bold text-ink-muted">{variant.intervalUnit === "year" ? "years" : "month"}</span>
                    </div>
                  </label>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-end">
                  <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-discount-${variant.localKey}`}>Discount
                    <div className="relative">
                      <input id={`variant-discount-${variant.localKey}`} type="number" min="0" max="100" step="0.01" value={variant.discountPercent} onChange={(event) => updateVariant(variant.localKey, { discountPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className={`${CONTROL_CLASS} pr-8`} disabled={variant.intervalUnit === "month" || !catalog.schemaAvailable || pending} />
                      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-extrabold text-ink-muted">%</span>
                    </div>
                  </label>
                  <div className="rounded-btn bg-raised px-3 py-2.5 text-sm">
                    <span className="font-extrabold text-ink">{priceLabel}</span>
                    <span className="ml-2 text-xs font-semibold text-ink-muted">{variant.intervalUnit === "year" ? `${variant.intervalCount}-year total · ${variant.discountPercent}% off list` : "per month"}</span>
                    {variant.intervalUnit === "year" && <span className="mt-1 block text-xs font-semibold text-ink-muted">Effective monthly price: {formatPeso(Math.round(totalPrice / (variant.intervalCount * 12)))}</span>}
                  </div>
                </div>

                <label className="mt-3 block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-paymongo-${variant.localKey}`}>PayMongo plan ID <span className="font-semibold normal-case tracking-normal text-ink-subtle">(optional until provider setup)</span>
                  <input id={`variant-paymongo-${variant.localKey}`} type="text" value={variant.paymongoPlanId ?? ""} onChange={(event) => updateVariant(variant.localKey, { paymongoPlanId: event.target.value || null })} placeholder="plan_…" className={CONTROL_CLASS} disabled={!catalog.schemaAvailable || pending} />
                </label>
              </article>
            );
          })}
        </div>
      </div>

      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-4 py-3 text-sm font-semibold ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
      {!catalog.schemaAvailable && <p role="status" className="rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-xs font-semibold leading-5 text-ink">Pricing controls are previewing the default catalog. Apply migration <code className="font-extrabold">0027_platform_operations.sql</code> to save changes.</p>}
      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-ink-muted">Price edits apply to new checkouts. Existing PayMongo subscriptions should stay attached to their original provider plan until a migration is explicitly designed.</p>
        <button type="submit" disabled={!catalog.schemaAvailable || pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-primary px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving pricing…" : "Save pricing"}</button>
      </div>
    </form>
  );
}

function parseClientPrice(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [pesos, centavos = ""] = normalized.split(".");
  const result = Number(pesos) * 100 + Number(centavos.padEnd(2, "0") || "0");
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
