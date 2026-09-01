"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatPeso } from "@/lib/money";
import { promotionValueLabel, type PlatformPromotion, type PlatformPromotionPerformance } from "@/lib/platform-promotions";
import { savePlatformPromotion, togglePlatformPromotion, type PlatformActionState } from "./actions";

type PromotionSummary = PlatformPromotion & {
  started: number;
  converted: number;
  discountGivenCentavos: number;
  revenueCentavos: number;
  conversionRate: number;
};

const INITIAL_STATE: PlatformActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function PromoMarketingEditor({ schemaAvailable, promotions, performance, canManage }: { schemaAvailable: boolean; promotions: PlatformPromotion[]; performance: PlatformPromotionPerformance[]; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(savePlatformPromotion, INITIAL_STATE);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");

  const summaries = summarizePromotions(promotions, performance);

  return (
    <>
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
        <form action={formAction} className="rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="create-promotion-heading">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Create a campaign</p>
              <h2 id="create-promotion-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Add a promotion code</h2>
              <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Codes are global and can be applied to a customer&apos;s Premium checkout.</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="tag" size={17} /></span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-code">Code
              <input id="promotion-code" name="code" type="text" required maxLength={32} placeholder="WELCOME20" className={`${CONTROL_CLASS} uppercase`} disabled={!canManage || !schemaAvailable || pending} />
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-name">Internal name
              <input id="promotion-name" name="name" type="text" required maxLength={80} placeholder="New customer welcome" className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending} />
            </label>
          </div>

          <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-description">Description
            <textarea id="promotion-description" name="description" rows={2} maxLength={240} placeholder="A short note for your team about when to use this offer." className={`${CONTROL_CLASS} resize-y`} disabled={!canManage || !schemaAvailable || pending} />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr]">
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-type">Discount type
              <select id="promotion-type" name="discount_type" value={discountType} onChange={(event) => setDiscountType(event.target.value as "percentage" | "fixed")} className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed PHP amount</option>
              </select>
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-value">Value
              <div className="relative">
                <input id="promotion-value" name="discount_value" type="number" min="0.01" max={discountType === "percentage" ? "100" : "10000"} step="0.01" required placeholder={discountType === "percentage" ? "20" : "500"} className={`${CONTROL_CLASS} pr-9`} disabled={!canManage || !schemaAvailable || pending} />
                <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs font-extrabold text-ink-muted">{discountType === "percentage" ? "%" : "₱"}</span>
              </div>
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-scope">Applies to
              <select id="promotion-scope" name="applies_to" defaultValue="all" className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending}>
                <option value="all">All plans</option>
                <option value="monthly">Monthly only</option>
                <option value="annual">Annual options only</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-starts">Starts (Singapore time, optional)
              <input id="promotion-starts" name="starts_at" type="datetime-local" className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending} />
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-ends">Ends (Singapore time, optional)
              <input id="promotion-ends" name="ends_at" type="datetime-local" className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending} />
            </label>
            <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="promotion-limit">Redemption limit
              <input id="promotion-limit" name="max_redemptions" type="number" min="1" max="1000000" step="1" placeholder="Unlimited" className={CONTROL_CLASS} disabled={!canManage || !schemaAvailable || pending} />
            </label>
          </div>

          {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-xl border px-3 py-2.5 text-sm font-semibold ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
          {!schemaAvailable && <p role="status" className="mt-4 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">Promotion storage is not active yet. Apply <code className="font-extrabold">0040_platform_promotions.sql</code> before saving a code.</p>}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-md text-xs leading-5 text-ink-muted">One business can convert each code once. Pause a campaign at any time without deleting its history.</p>
            <button type="submit" disabled={!canManage || !schemaAvailable || pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : "Create promotion"}<AdminIcon name="plus" size={14} /></button>
          </div>
          {!canManage && <p role="status" className="mt-3 rounded-xl border border-line bg-raised px-3 py-2.5 text-xs font-semibold leading-5 text-ink-muted">Promotion changes are limited to Billing and Owner operators. Your role can still review campaign performance.</p>}
        </form>

        <aside className="rounded-[20px] border border-line bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:p-6" aria-labelledby="promotion-measurement-heading">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-fg/65">Measurement model</p>
          <h2 id="promotion-measurement-heading" className="mt-1 text-xl font-extrabold">Know which offers earn conversion.</h2>
          <p className="mt-2 text-sm leading-5 text-primary-fg/72">Every code records an attempted checkout and a confirmed payment, so performance is based on paid outcomes rather than clicks alone.</p>
          <div className="mt-5 space-y-2.5">
            <MeasurementRow label="Started" detail="Code applied and checkout opened" />
            <MeasurementRow label="Converted" detail="Payment confirmed by the provider" />
            <MeasurementRow label="Revenue" detail="Final plan value after discount" />
          </div>
        </aside>
      </section>

      <section className="mt-5 overflow-hidden rounded-[20px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="promotion-performance-heading">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Campaign performance</p>
            <h2 id="promotion-performance-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Live promotion codes</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">Compare usage, conversion, discount cost, and revenue before deciding what to keep running.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="chart" size={13} /> {summaries.length} campaign{summaries.length === 1 ? "" : "s"}</span>
        </div>

        {summaries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><AdminIcon name="tag" size={19} /></span>
            <p className="mt-3 text-sm font-extrabold text-ink">No promotion codes yet</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Create your first code above. Its performance will appear here after the first checkout attempt.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-raised text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Promotion</th><th className="px-4 py-3 font-extrabold">Offer</th><th className="px-4 py-3 font-extrabold">Status</th><th className="px-4 py-3 font-extrabold">Conversion</th><th className="px-4 py-3 text-right font-extrabold">Discount given</th><th className="px-4 py-3 text-right font-extrabold">Revenue</th><th className="px-6 py-3 text-right font-extrabold">Action</th></tr></thead>
              <tbody className="divide-y divide-line">{summaries.map((promotion) => <PromotionRow key={promotion.id} promotion={promotion} schemaAvailable={schemaAvailable} canManage={canManage} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function PromotionRow({ promotion, schemaAvailable, canManage }: { promotion: PromotionSummary; schemaAvailable: boolean; canManage: boolean }) {
  return (
    <tr className="align-middle transition hover:bg-raised/55">
      <td className="px-6 py-4"><strong className="block font-extrabold text-primary">{promotion.code}</strong><span className="mt-1 block max-w-[220px] truncate text-xs text-ink-muted">{promotion.name}{promotion.description ? ` · ${promotion.description}` : ""}</span></td>
      <td className="px-4 py-4"><span className="inline-flex rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">{promotionValueLabel(promotion)}</span><span className="mt-1 block text-xs text-ink-muted">{scopeLabel(promotion.appliesTo)}</span></td>
      <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${promotion.isActive ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{promotion.isActive ? "Active" : "Paused"}</span><span className="mt-1 block text-xs text-ink-muted">{dateRangeLabel(promotion)}</span></td>
      <td className="px-4 py-4"><strong className="tabular-nums font-extrabold text-ink">{promotion.converted}/{promotion.started}</strong><span className="mt-1 block text-xs text-ink-muted">{promotion.conversionRate}% conversion</span></td>
      <td className="px-4 py-4 text-right"><strong className="tabular-nums font-extrabold text-danger">-{formatPeso(promotion.discountGivenCentavos)}</strong><span className="mt-1 block text-xs text-ink-muted">{promotion.maxRedemptions ? `${promotion.converted}/${promotion.maxRedemptions} used` : "No limit"}</span></td>
      <td className="px-4 py-4 text-right"><strong className="tabular-nums font-extrabold text-ink">{formatPeso(promotion.revenueCentavos)}</strong><span className="mt-1 block text-xs text-ink-muted">After discount</span></td>
      <td className="px-6 py-4 text-right"><PromotionToggleButton promotion={promotion} schemaAvailable={schemaAvailable} canManage={canManage} /></td>
    </tr>
  );
}

function PromotionToggleButton({ promotion, schemaAvailable, canManage }: { promotion: PromotionSummary; schemaAvailable: boolean; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(togglePlatformPromotion, INITIAL_STATE);
  return <form action={formAction} className="inline-flex flex-col items-end gap-1"><input type="hidden" name="promotion_id" value={promotion.id} readOnly /><input type="hidden" name="is_active" value={String(promotion.isActive)} readOnly /><button type="submit" disabled={!canManage || !schemaAvailable || pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : promotion.isActive ? "Pause" : "Activate"}</button>{state.message && !state.ok && <span className="max-w-[170px] text-[10px] font-semibold text-danger">{state.message}</span>}</form>;
}

function MeasurementRow({ label, detail }: { label: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-xl bg-primary-fg/10 px-3 py-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-accent-fg"><AdminIcon name="check" size={11} /></span><span><strong className="block text-xs font-extrabold">{label}</strong><span className="mt-0.5 block text-[11px] leading-4 text-primary-fg/65">{detail}</span></span></div>;
}

function summarizePromotions(promotions: PlatformPromotion[], performance: PlatformPromotionPerformance[]): PromotionSummary[] {
  const performanceByPromotion = new Map(performance.map((summary) => [summary.promotionId, summary]));
  return promotions.map((promotion) => {
    const summary = performanceByPromotion.get(promotion.id);
    const started = summary?.started ?? 0;
    const converted = summary?.converted ?? 0;
    return {
      ...promotion,
      started,
      converted,
      discountGivenCentavos: summary?.discountGivenCentavos ?? 0,
      revenueCentavos: summary?.revenueCentavos ?? 0,
      conversionRate: started ? Math.round((converted / started) * 100) : 0,
    };
  });
}

function scopeLabel(value: PlatformPromotion["appliesTo"]) {
  return value === "all" ? "All plans" : value === "monthly" ? "Monthly only" : "Annual only";
}

function dateRangeLabel(promotion: PlatformPromotion) {
  if (promotion.endsAt) return `Ends ${formatDate(promotion.endsAt)}`;
  if (promotion.startsAt) return `Starts ${formatDate(promotion.startsAt)}`;
  return "Always on until paused";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(value));
}
