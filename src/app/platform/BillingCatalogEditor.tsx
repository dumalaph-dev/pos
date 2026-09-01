"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  billingVariantPriceLabel,
  calculateBillingVariantPrice,
  calculateSubscriptionPriceQuote,
  formatMonthlyPriceInput,
  type BillingCatalog,
  type BillingVariant,
} from "@/lib/platform-operations";
import { formatPeso } from "@/lib/money";
import { saveBillingCatalog, type PlatformActionState } from "./actions";

type DraftVariant = BillingVariant & { localKey: string };
type PreviewMode = "monthly" | "annual";

const INITIAL_STATE: PlatformActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";
const FEATURE_LIST = [
  "Owner workspace and business page",
  "One included active branch",
  "POS, inventory, and branch workflows",
  "Staff access and role controls",
  "Sales reports and export-ready records",
  "Offline-ready cashier operations",
  "Audited billing and support history",
];

export function BillingCatalogEditor({ catalog, canManage }: { catalog: BillingCatalog; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(saveBillingCatalog, INITIAL_STATE);
  const [monthlyPrice, setMonthlyPrice] = useState(formatMonthlyPriceInput(catalog.monthlyPriceCentavos));
  const [additionalBranchPrice, setAdditionalBranchPrice] = useState(formatMonthlyPriceInput(catalog.additionalBranchPriceCentavos));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("monthly");
  const [variants, setVariants] = useState<DraftVariant[]>(() => catalog.variants.map((variant, index) => ({ ...variant, localKey: variant.id ?? `new-${index}` })));
  const monthlyPriceCentavos = parseClientPrice(monthlyPrice) ?? catalog.monthlyPriceCentavos;
  const additionalBranchPriceCentavos = parseClientPrice(additionalBranchPrice) ?? catalog.additionalBranchPriceCentavos;
  const monthlyVariant = variants.find((variant) => variant.intervalUnit === "month") ?? variants[0];
  const annualVariants = variants.filter((variant) => variant.intervalUnit === "year");
  const annualPreview = annualVariants.find((variant) => variant.isActive) ?? annualVariants[0];
  const liveOfferCount = variants.filter((variant) => variant.isActive).length;
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

  const previewPrice = previewMode === "monthly"
    ? monthlyPriceCentavos
    : annualPreview
      ? calculateBillingVariantPrice(monthlyPriceCentavos, annualPreview.intervalUnit, annualPreview.intervalCount, annualPreview.discountPercent)
      : monthlyPriceCentavos;
  const previewLabel = previewMode === "monthly"
    ? "Premium Monthly"
    : annualPreview
      ? annualPreview.label || `${annualPreview.intervalCount}-year plan`
      : "Annual plan preview";

  return (
    <form action={formAction} className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-[var(--shadow-pop)]">
      <input type="hidden" name="variants" value={serializedVariants} readOnly />

      <section className="border-b border-line p-5 sm:p-7" aria-labelledby="current-plan-structure-heading">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Subscription catalog</p>
            <h2 id="current-plan-structure-heading" className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-ink sm:text-[28px]">Current plan structure</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Shape the plans customers see, keep the first branch in the base offer, and price every additional active branch consistently.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-2 text-ink-muted"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="eye" size={12} /></span>Customer visibility</span>
            <span className="rounded-full bg-primary-soft px-3 py-2 text-primary">{liveOfferCount} live {liveOfferCount === 1 ? "offer" : "offers"}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <PlanCard
            variant={monthlyVariant}
            monthlyPriceCentavos={monthlyPriceCentavos}
            featured
            onEdit={() => document.getElementById("pricing-settings")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          {annualVariants.slice(0, 3).map((variant) => (
            <PlanCard
              key={variant.localKey}
              variant={variant}
              monthlyPriceCentavos={monthlyPriceCentavos}
              onEdit={() => document.getElementById(`variant-${variant.localKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            />
          ))}
          <button type="button" onClick={addVariant} disabled={!canManage || !catalog.schemaAvailable || pending} className="group flex min-h-[222px] flex-col items-center justify-center rounded-[18px] border border-dashed border-line-strong bg-raised/45 px-5 text-center transition hover:-translate-y-1 hover:border-accent hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-ink-muted transition group-hover:border-accent group-hover:bg-primary-soft group-hover:text-primary"><AdminIcon name="plus" size={20} /></span>
            <span className="mt-4 text-sm font-extrabold text-ink">Add custom plan</span>
            <span className="mt-1 max-w-[165px] text-xs leading-5 text-ink-muted">Create another billing duration with its own discount.</span>
          </button>
        </div>
        {annualVariants.length > 3 && <p className="mt-3 text-right text-xs font-semibold text-ink-muted">{annualVariants.length - 3} additional option{annualVariants.length - 3 === 1 ? "" : "s"} available in pricing settings below.</p>}
      </section>

      <section className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[220px_minmax(0,1fr)_286px]" aria-label="Pricing settings and customer preview">
        <aside className="rounded-[18px] border border-primary/15 bg-primary-soft/45 p-4 sm:p-5" aria-labelledby="included-features-heading">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Included in every plan</p>
          <h3 id="included-features-heading" className="mt-2 text-lg font-extrabold tracking-[-0.025em] text-ink">What customers get</h3>
          <ul className="mt-5 space-y-3.5">
            {FEATURE_LIST.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-xs font-semibold leading-5 text-ink"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-primary/35 text-primary"><AdminIcon name="check" size={10} /></span><span>{feature}</span></li>)}
          </ul>
          <p className="mt-6 border-t border-primary/15 pt-4 text-[11px] leading-5 text-ink-muted">Keep plan differences focused on commitment, price, and the support promise. Feature entitlements should stay consistent until a tier model is defined.</p>
        </aside>

        <section id="pricing-settings" className="rounded-[18px] border border-line bg-raised/55" aria-labelledby="pricing-settings-heading">
          <div className="flex flex-col gap-2 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Control center</p>
              <h3 id="pricing-settings-heading" className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-ink">Pricing settings</h3>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1.5 text-[11px] font-extrabold text-primary"><AdminIcon name="check" size={12} /> PHP · Philippine peso</span>
          </div>

          <div className="divide-y divide-line">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <SettingCopy label="Monthly base price" detail="The reference price used to calculate every annual offer." />
              <div className="relative w-full sm:max-w-[190px]">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm font-extrabold text-ink-muted">₱</span>
                <input id="platform-monthly-price" name="monthly_price" type="text" inputMode="decimal" value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} className={`${CONTROL_CLASS} pl-7`} disabled={!canManage || !catalog.schemaAvailable || pending} aria-describedby="monthly-price-help" />
              </div>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <SettingCopy label="Additional active branch price" detail={`Monthly charge for each active branch beyond the ${catalog.includedBranchCount} included branch${catalog.includedBranchCount === 1 ? "" : "es"}.`} />
              <div className="relative w-full sm:max-w-[190px]">
                <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm font-extrabold text-ink-muted">₱</span>
                <input id="platform-additional-branch-price" name="additional_branch_price" type="text" inputMode="decimal" value={additionalBranchPrice} onChange={(event) => setAdditionalBranchPrice(event.target.value)} className={`${CONTROL_CLASS} pl-7`} disabled={!canManage || !catalog.schemaAvailable || pending} aria-describedby="monthly-price-help" />
              </div>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <SettingCopy label="Annual discount strategy" detail="Longer commitments can receive a deeper discount." />
              <span className="rounded-xl border border-line bg-surface px-3 py-2.5 text-right text-xs font-extrabold text-ink">Duration-based savings</span>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-extrabold text-ink">Billing options</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Edit labels, commitment length, customer visibility, and the PayMongo mapping for each cycle.</p>
                </div>
                <button type="button" onClick={addVariant} disabled={!canManage || !catalog.schemaAvailable || pending} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="plus" size={13} /> Add option</button>
              </div>

              <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {variants.map((variant, index) => <BillingOptionRow key={variant.localKey} variant={variant} index={index} catalog={catalog} monthlyPriceCentavos={monthlyPriceCentavos} pending={pending} canManage={canManage} updateVariant={updateVariant} />)}
              </div>
              {!catalog.schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">Pricing controls are previewing the default catalog. Apply migration <code className="font-extrabold">0068_branch_billing_pricing.sql</code> to save changes.</p>}
              {!canManage && <p role="status" className="mt-3 rounded-xl border border-line bg-raised px-3 py-2.5 text-xs font-semibold leading-5 text-ink-muted">Pricing changes are limited to Billing and Owner operators. Your role can still review the live catalog and customer preview.</p>}
            </div>
          </div>

          <p id="monthly-price-help" className="border-t border-line px-4 py-3 text-xs leading-5 text-ink-muted sm:px-5">The base price includes {catalog.includedBranchCount} active branch. Additional branches use the add-on price above. Catalog and base-price edits apply to new quotes; a customer&apos;s explicit branch change schedules the shared branch-aware price for the next cycle.</p>
        </section>

        <aside className="space-y-4">
          <BranchPricingPreview additionalBranchPriceCentavos={additionalBranchPriceCentavos} catalog={catalog} monthlyPriceCentavos={monthlyPriceCentavos} />
          <section className="rounded-[18px] border border-line bg-raised/55 p-4 sm:p-5" aria-labelledby="discount-structure-heading">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Savings logic</p>
            <h3 id="discount-structure-heading" className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-ink">Annual discount structure</h3>
            <p className="mt-1 text-xs leading-5 text-ink-muted">The longer they commit, the more they save.</p>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-[1fr_56px_92px] gap-2 bg-primary-soft/55 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted"><span>Cycle</span><span className="text-center">Off</span><span className="text-right">Customer pays</span></div>
              <div className="divide-y divide-line bg-surface">
                {[monthlyVariant, ...annualVariants.slice(0, 3)].filter(Boolean).map((variant) => <DiscountRow key={variant.localKey} variant={variant} monthlyPriceCentavos={monthlyPriceCentavos} />)}
              </div>
            </div>
          </section>

          <section className="rounded-[18px] border border-line bg-raised/55 p-4 sm:p-5" aria-labelledby="pricing-preview-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Customer view</p>
                <h3 id="pricing-preview-heading" className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-ink">Pricing preview</h3>
              </div>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="eye" size={15} /></span>
            </div>
            <div className="mt-4 grid grid-cols-2 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Preview billing cycle">
              <PreviewTab active={previewMode === "monthly"} onClick={() => setPreviewMode("monthly")} label="Monthly" />
              <PreviewTab active={previewMode === "annual"} onClick={() => setPreviewMode("annual")} label="Annual" />
            </div>
            <div className="mt-5 rounded-xl border border-primary/15 bg-primary-soft/45 p-4">
              <p className="text-sm font-extrabold text-ink">{previewLabel}</p>
              <p className="mt-2 flex items-baseline gap-1.5 text-primary"><span className="text-2xl font-extrabold tracking-[-0.04em] tabular-nums">{formatPeso(previewPrice)}</span><span className="text-xs font-bold text-ink-muted">/ {previewMode === "monthly" ? "month" : annualPreview ? `${annualPreview.intervalCount} year${annualPreview.intervalCount === 1 ? "" : "s"}` : "year"}</span></p>
              <ul className="mt-4 space-y-2 text-xs font-semibold text-ink-muted"><li className="flex items-center gap-2"><AdminIcon name="check" size={13} /> All platform features included</li><li className="flex items-center gap-2"><AdminIcon name="check" size={13} /> Price is calculated in PHP</li><li className="flex items-center gap-2"><AdminIcon name="check" size={13} /> {annualPreview && previewMode === "annual" ? `${annualPreview.discountPercent}% commitment savings` : "Flexible monthly renewal"}</li></ul>
            </div>
            <Link href="/admin/billing" className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Preview as customer <AdminIcon name="arrow" size={14} /></Link>
          </section>
        </aside>
      </section>

      {state.message && <p role={state.ok ? "status" : "alert"} className={`mx-4 mb-4 rounded-xl border px-4 py-3 text-sm font-semibold sm:mx-6 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
      <div className="flex flex-col gap-3 border-t border-line bg-panel/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-2.5 text-xs leading-5 text-ink-muted"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-primary/30 text-primary"><AdminIcon name="history" size={12} /></span><p><strong className="text-ink">New quotes use the saved base and branch prices.</strong><br />Base-price edits do not reprice existing subscribers; branch changes schedule the updated add-on plan.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="#discount-structure-heading" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Review discounts</Link>
          <button type="submit" disabled={!canManage || !catalog.schemaAvailable || pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving pricing…" : "Save changes"}<AdminIcon name="check" size={14} /></button>
        </div>
      </div>
    </form>
  );
}

function BranchPricingPreview({ catalog, monthlyPriceCentavos, additionalBranchPriceCentavos }: { catalog: BillingCatalog; monthlyPriceCentavos: number; additionalBranchPriceCentavos: number }) {
  const branchExamples = [catalog.includedBranchCount, catalog.includedBranchCount + 1, catalog.includedBranchCount + 2];

  return <section className="rounded-[18px] border border-accent/25 bg-accent/5 p-4 sm:p-5" aria-labelledby="branch-pricing-preview-heading">
    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Branch add-on</p>
    <h3 id="branch-pricing-preview-heading" className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-ink">Scale by active branch</h3>
    <p className="mt-1 text-xs leading-5 text-ink-muted">The first {catalog.includedBranchCount} active branch{catalog.includedBranchCount === 1 ? " is" : "es are"} included. Every branch after that adds {formatPeso(additionalBranchPriceCentavos)} per month.</p>
    <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {branchExamples.map((activeBranchCount) => {
        const quote = calculateSubscriptionPriceQuote({
          monthlyPriceCentavos,
          additionalBranchPriceCentavos,
          includedBranchCount: catalog.includedBranchCount,
          activeBranchCount,
          intervalUnit: "month",
          intervalCount: 1,
          discountPercent: 0,
        });
        return <div key={activeBranchCount} className="flex items-center justify-between gap-3 px-3 py-3">
          <div><p className="text-xs font-extrabold text-ink">{activeBranchCount} active branch{activeBranchCount === 1 ? "" : "es"}</p><p className="mt-0.5 text-[11px] font-semibold text-ink-muted">{quote.billableBranchCount === 0 ? "Included in base" : `+${quote.billableBranchCount} paid add-on${quote.billableBranchCount === 1 ? "" : "s"}`}</p></div>
          <p className="text-right text-sm font-extrabold tabular-nums text-primary">{formatPeso(quote.monthlyTotalCentavos)}<span className="ml-1 text-[10px] font-bold text-ink-muted">/mo</span></p>
        </div>;
      })}
    </div>
  </section>;
}

function PlanCard({ variant, monthlyPriceCentavos, featured = false, onEdit }: { variant: BillingVariant | undefined; monthlyPriceCentavos: number; featured?: boolean; onEdit: () => void }) {
  if (!variant) return null;
  const price = calculateBillingVariantPrice(monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent);
  const durationLabel = variant.intervalUnit === "month" ? "Monthly" : `${variant.intervalCount} year${variant.intervalCount === 1 ? "" : "s"}`;
  return <article className={`group relative flex min-h-[222px] flex-col overflow-hidden rounded-[18px] border p-4 transition hover:-translate-y-1 hover:shadow-[var(--shadow-pop)] ${featured ? "border-primary bg-primary text-primary-fg" : variant.isActive ? "border-accent/55 bg-raised" : "border-line bg-raised/55"}`}>
    {variant.discountPercent > 0 && <span className="absolute left-0 top-0 rounded-br-xl bg-accent px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent-fg">Save {formatDiscount(variant.discountPercent)}</span>}
    <div className={`flex items-start justify-between gap-2 ${variant.discountPercent > 0 ? "pt-5" : ""}`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${featured ? "bg-primary-fg/12 text-primary-fg" : variant.isActive ? "bg-primary-soft text-primary" : "bg-panel text-ink-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${variant.isActive ? "bg-success" : "bg-ink-subtle"}`} />{featured ? "Current plan" : variant.isActive ? "Live offer" : "Draft offer"}</span>
      <span className={featured ? "text-primary-fg/70" : "text-ink-muted"}><AdminIcon name={variant.intervalUnit === "month" ? "wallet" : "calendar"} size={19} /></span>
    </div>
    <div className="mt-5"><h3 className={`text-lg font-extrabold tracking-[-0.025em] ${featured ? "text-primary-fg" : "text-ink"}`}>{variant.intervalUnit === "month" ? "Premium" : variant.label || "Annual plan"}</h3><p className={`mt-1 text-xs font-bold ${featured ? "text-primary-fg/70" : "text-ink-muted"}`}>{durationLabel}</p></div>
    <p className={`mt-auto pt-5 text-xs leading-5 ${featured ? "text-primary-fg/75" : "text-ink-muted"}`}>{variant.intervalUnit === "month" ? "Flexible month-to-month access." : `${formatDiscount(variant.discountPercent)} savings for a longer commitment.`}</p>
    <div className="mt-4 flex items-baseline gap-1.5"><span className={`text-xl font-extrabold tracking-[-0.04em] tabular-nums ${featured ? "text-primary-fg" : "text-ink"}`}>{formatPeso(price)}</span><span className={`text-[10px] font-bold ${featured ? "text-primary-fg/65" : "text-ink-muted"}`}>/ {variant.intervalUnit === "month" ? "month" : `${variant.intervalCount} year${variant.intervalCount === 1 ? "" : "s"}`}</span></div>
    <button type="button" onClick={onEdit} className={`mt-3 text-left text-[10px] font-extrabold uppercase tracking-wide underline decoration-transparent underline-offset-4 transition group-hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 ${featured ? "text-primary-fg/75 focus-visible:outline-accent" : "text-primary focus-visible:outline-primary"}`}>Edit plan details</button>
  </article>;
}

function BillingOptionRow({ variant, index, catalog, monthlyPriceCentavos, pending, canManage, updateVariant }: { variant: DraftVariant; index: number; catalog: BillingCatalog; monthlyPriceCentavos: number; pending: boolean; canManage: boolean; updateVariant: (localKey: string, patch: Partial<DraftVariant>) => void }) {
  const priceLabel = billingVariantPriceLabel({ monthlyPriceCentavos }, variant);
  const isMonthly = variant.intervalUnit === "month";
  return <div id={`variant-${variant.localKey}`} className="scroll-mt-6 px-3 py-4 sm:px-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent">Option {index + 1}</p><p className="mt-1 text-sm font-extrabold text-ink">{variant.label || "Untitled option"}</p><p className="mt-1 text-xs font-semibold text-ink-muted">{priceLabel} · {isMonthly ? "monthly base" : `${variant.intervalCount}-year commitment`}</p></div>
      <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-raised px-3 text-xs font-extrabold text-ink"><input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(variant.localKey, { isActive: event.target.checked })} className="h-4 w-4 accent-primary" disabled={!canManage || !catalog.schemaAvailable || pending} /> Customer can buy this</label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_100px_112px_128px]">
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-label-${variant.localKey}`}>Display label<input id={`variant-label-${variant.localKey}`} type="text" value={variant.label} onChange={(event) => updateVariant(variant.localKey, { label: event.target.value })} className={CONTROL_CLASS} maxLength={80} disabled={!canManage || !catalog.schemaAvailable || pending} /></label>
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-unit-${variant.localKey}`}>Cycle<select id={`variant-unit-${variant.localKey}`} value={variant.intervalUnit} onChange={(event) => updateVariant(variant.localKey, { intervalUnit: event.target.value as BillingVariant["intervalUnit"], intervalCount: event.target.value === "month" ? 1 : Math.max(1, variant.intervalCount), discountPercent: event.target.value === "month" ? 0 : variant.discountPercent })} className={CONTROL_CLASS} disabled={!canManage || !catalog.schemaAvailable || pending}><option value="month">Month</option><option value="year">Year</option></select></label>
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-count-${variant.localKey}`}>Duration<div className="relative"><input id={`variant-count-${variant.localKey}`} type="number" min="1" max="10" step="1" value={variant.intervalCount} onChange={(event) => updateVariant(variant.localKey, { intervalCount: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })} className={`${CONTROL_CLASS} pr-12`} disabled={isMonthly || !canManage || !catalog.schemaAvailable || pending} /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[10px] font-bold text-ink-muted">{isMonthly ? "mo" : "yrs"}</span></div></label>
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-discount-${variant.localKey}`}>Discount<div className="relative"><input id={`variant-discount-${variant.localKey}`} type="number" min="0" max="100" step="0.01" value={variant.discountPercent} onChange={(event) => updateVariant(variant.localKey, { discountPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className={`${CONTROL_CLASS} pr-7`} disabled={isMonthly || !canManage || !catalog.schemaAvailable || pending} /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm font-extrabold text-ink-muted">%</span></div></label>
    </div>
    <details className="mt-3 rounded-xl border border-line bg-raised px-3 py-2.5">
      <summary className="cursor-pointer list-none text-[11px] font-extrabold text-primary outline-none focus-visible:underline">Advanced provider mapping <span className="font-semibold text-ink-muted">· optional</span></summary>
      <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`variant-paymongo-${variant.localKey}`}>PayMongo plan ID<input id={`variant-paymongo-${variant.localKey}`} type="text" value={variant.paymongoPlanId ?? ""} onChange={(event) => updateVariant(variant.localKey, { paymongoPlanId: event.target.value || null })} placeholder="plan_…" className={CONTROL_CLASS} disabled={!canManage || !catalog.schemaAvailable || pending} /></label>
    </details>
  </div>;
}

function SettingCopy({ label, detail }: { label: string; detail: string }) {
  return <div><p className="text-xs font-extrabold text-ink">{label}</p><p className="mt-1 max-w-[420px] text-xs leading-5 text-ink-muted">{detail}</p></div>;
}

function DiscountRow({ variant, monthlyPriceCentavos }: { variant: BillingVariant; monthlyPriceCentavos: number }) {
  const price = calculateBillingVariantPrice(monthlyPriceCentavos, variant.intervalUnit, variant.intervalCount, variant.discountPercent);
  const label = variant.intervalUnit === "month" ? "Monthly" : `${variant.intervalCount} Year${variant.intervalCount === 1 ? "" : "s"}`;
  return <div className="grid grid-cols-[1fr_56px_92px] items-center gap-2 px-3 py-3 text-xs"><span className="font-extrabold text-ink">{label}</span><span className={`rounded-md px-1.5 py-1 text-center text-[10px] font-extrabold ${variant.discountPercent > 0 ? "bg-primary-soft text-primary" : "text-ink-muted"}`}>{variant.discountPercent > 0 ? formatDiscount(variant.discountPercent) : "—"}</span><span className="text-right font-extrabold tabular-nums text-ink">{formatPeso(price)}</span></div>;
}

function PreviewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-8 rounded-lg px-2 py-1.5 text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${active ? "bg-primary text-primary-fg shadow-[var(--shadow-card)]" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}>{label}</button>;
}

function formatDiscount(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

function parseClientPrice(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [pesos, centavos = ""] = normalized.split(".");
  const result = Number(pesos) * 100 + Number(centavos.padEnd(2, "0") || "0");
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
