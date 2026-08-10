"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPeso } from "@/lib/money";
import { billingVariantMonthlyEquivalent, calculateBillingVariantPrice, type BillingCatalog, type BillingVariant } from "@/lib/platform-operations";

type LandingPricingProps = {
  catalog: BillingCatalog;
  pricingIncludes: string[];
};

export default function LandingPricing({ catalog, pricingIncludes }: LandingPricingProps) {
  const configuredMonthly = catalog.variants.find((variant) => variant.intervalUnit === "month" && variant.intervalCount === 1);
  const fallbackVariant = configuredMonthly ?? catalog.variants[0];
  const offeredVariants = catalog.variants
    .filter((variant) => variant.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const publicVariants = offeredVariants.length > 0 ? offeredVariants : fallbackVariant ? [fallbackVariant] : [];
  const defaultVariant = publicVariants.find((variant) => variant.intervalUnit === "month") ?? publicVariants[0];
  const hasAnnualOptions = publicVariants.some((variant) => variant.intervalUnit === "year");
  const [selectedKey, setSelectedKey] = useState(defaultVariant ? variantKey(defaultVariant) : "");
  const selected = publicVariants.find((variant) => variantKey(variant) === selectedKey) ?? defaultVariant;

  if (!selected) return null;

  const isAnnual = selected.intervalUnit === "year";
  const months = isAnnual ? selected.intervalCount * 12 : 1;
  const price = calculateBillingVariantPrice(catalog.monthlyPriceCentavos, selected.intervalUnit, selected.intervalCount, selected.discountPercent);
  const monthlyEquivalent = billingVariantMonthlyEquivalent(catalog, selected);
  const monthlyCostForTerm = catalog.monthlyPriceCentavos * months;
  const savings = Math.max(0, monthlyCostForTerm - price);
  const durationLabel = billingDurationLabel(selected);
  const displayLabel = selected.label || durationLabel;

  return (
    <div className="mt-11 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div data-lp-reveal="left">
        <article className="flex h-full flex-col justify-center rounded-[24px] border border-dashed border-[#c9bfa6] bg-[#fdfaf3] p-7 text-center sm:p-9">
          <span className="lp-dot-pulse mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dfe7dc] text-[#16392b]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.4" />
              <path d="M12 7.2V12l3.3 2.1" />
            </svg>
          </span>
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[#b18448]">Start here</p>
          <p className="mt-2 text-[3.4rem] font-black leading-none tracking-[-0.06em] text-[#173a2b]">14</p>
          <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[#173a2b]">days free</p>
          <p className="mx-auto mt-4 max-w-[16rem] text-sm leading-6 text-[#68736a]">
            Use the complete current product with your own branch and team. No card is required, and there is no smaller trial
            version to evaluate.
          </p>
          <p className="mx-auto mt-5 max-w-[18rem] border-t border-[#eae3d5] pt-4 text-xs leading-5 text-[#68736a]">
            {hasAnnualOptions ? "You choose monthly or annual billing after the trial from the same options shown here." : "Monthly billing is the current public option after the trial."}
          </p>
        </article>
      </div>

      <div data-lp-reveal="right">
        <article className="relative h-full overflow-hidden rounded-[24px] border border-[#25503b] bg-[#15382a] p-7 text-[#fffaf1] shadow-[0_26px_54px_rgba(21,56,42,0.24)] sm:p-9">
          <div className="lp-dots pointer-events-none absolute inset-0 text-[#fffaf1] opacity-[0.05]" />
          <div className="lp-spin-slow pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full border border-dashed border-[#c39756]/30" />

          <div className="relative flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#c39756] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#16392b]">
              Premium workspace
            </span>
            <span className="rounded-full border border-[#3f5f4c] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#a9c4ae]">
              Same product in every option
            </span>
          </div>

          <div className="relative mt-6">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d1a05b]">Choose a billing term</p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose a billing term">
              {publicVariants.map((variant) => {
                const active = variantKey(variant) === variantKey(selected);
                const variantLabel = variant.label || billingDurationLabel(variant);
                return (
                  <button
                    key={variantKey(variant)}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedKey(variantKey(variant))}
                    className={`min-h-12 min-w-[112px] flex-1 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fffaf1] ${active ? "border-[#c39756] bg-[#c39756] text-[#16392b]" : "border-[#3f5f4c] bg-[#1a422f] text-[#e7eee5] hover:border-[#91ad96]"}`}
                  >
                    <span className="block truncate text-xs font-black">{variantLabel}</span>
                    <span className={`mt-1 block text-[10px] font-bold ${active ? "text-[#31563f]" : "text-[#a9c4ae]"}`}>
                      {variant.discountPercent > 0 ? `Save ${formatDiscount(variant.discountPercent)}` : "Flexible renewal"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative mt-6 rounded-2xl border border-[#2c5341] bg-[#17402f] p-5" aria-live="polite">
            <p className="text-sm font-black text-[#fffaf1]">{displayLabel} <span className="font-semibold text-[#a9c4ae]">· {durationLabel}</span></p>
            <p className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="text-[3.6rem] font-black leading-none tracking-[-0.06em] tabular-nums">{formatPeso(price)}</span>
              <span className="text-sm font-bold text-[#a9c4ae]">{isAnnual ? `/ ${durationLabel.toLowerCase()}` : "/ month"}</span>
            </p>
            <p className="mt-3 text-sm leading-6 text-[#cad6ca]">
              {isAnnual
                ? `Billed upfront for ${durationLabel.toLowerCase()}. That works out to about ${formatPeso(monthlyEquivalent)} per month.`
                : "Billed monthly after the trial. The complete workspace is included."}
            </p>
            {isAnnual && selected.discountPercent > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#58765f] bg-[#1d4834] px-3 py-2.5 text-xs font-black text-[#e5eee3]">
                <span>Save {formatDiscount(selected.discountPercent)}</span>
                <span className="text-[#b7cfb9]">{formatPeso(savings)} less than monthly billing</span>
              </div>
            )}
          </div>

          <ul className="relative mt-6 grid gap-2.5 border-t border-[#2c5341] pt-6 text-[13px] leading-5 text-[#dbe4da] sm:grid-cols-2">
            {pricingIncludes.map((item) => (
              <li key={item} className="flex gap-2.5">
                <BulletIcon />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/signup"
            className="lp-btn lp-btn--gold relative mt-7 inline-flex min-h-13 items-center gap-3 rounded-xl bg-[#c39756] px-5 py-3.5 text-sm font-black text-[#16392b] hover:bg-[#d4aa6b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fffaf1]"
          >
            Start your 14-day free trial <ArrowIcon />
          </Link>
          <p className="relative mt-3 text-xs text-[#9fb5a5]">{hasAnnualOptions ? "No card required. Annual terms are billed upfront; savings use the monthly price as the reference." : "No card required. The monthly price is the current public option."}</p>
          <p className="relative mt-4 border-t border-[#2c5341] pt-4 text-xs leading-5 text-[#a9c4ae]">
            <strong className="text-[#dbe4da]">Important:</strong> Dumala prints order slips today. It is not a BIR-accredited official receipt system, so keep your accredited process if your business requires one.
          </p>
        </article>
      </div>
    </div>
  );
}

function variantKey(variant: BillingVariant) {
  return `${variant.intervalUnit}-${variant.intervalCount}`;
}

function billingDurationLabel(variant: BillingVariant) {
  if (variant.intervalUnit === "month") return "Monthly";
  return `${variant.intervalCount} ${variant.intervalCount === 1 ? "year" : "years"}`;
}

function formatDiscount(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="lp-arrow h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10h13M11 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BulletIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#c39756]" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m3.2 8.3 3 3 6.6-6.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
