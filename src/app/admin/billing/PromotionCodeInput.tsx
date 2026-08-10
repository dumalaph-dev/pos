"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatPeso } from "@/lib/money";

export type PromotionQuoteState = {
  code: string;
  name: string | null;
  discountAmountCentavos: number;
  finalAmountCentavos: number;
  variantId: string;
};

export function PromotionCodeInput({ value, onChange, onApply, pending, quote, message }: { value: string; onChange: (value: string) => void; onApply: () => void; pending: boolean; quote: PromotionQuoteState | null; message: { kind: "error" | "success"; text: string } | null }) {
  return (
    <div className="rounded-xl border border-line bg-raised p-3">
      <div className="flex items-center justify-between gap-3"><label htmlFor="checkout-promotion-code" className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Discount code</label><AdminIcon name="tag" size={14} /></div>
      <div className="mt-2 flex items-stretch gap-2">
        <input id="checkout-promotion-code" type="text" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onApply(); } }} placeholder="Enter code" autoCapitalize="characters" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold uppercase text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
        <button type="button" onClick={onApply} disabled={pending || !value.trim()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-primary bg-surface px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Checking…" : "Apply"}<AdminIcon name="arrow" size={13} /></button>
      </div>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className={`mt-2 flex items-start gap-1.5 text-[11px] font-semibold leading-4 ${message.kind === "success" ? "text-success" : "text-danger"}`}><AdminIcon name={message.kind === "success" ? "check" : "alert"} size={13} />{message.text}</p>}
      {quote && <p className="mt-2 text-[11px] font-semibold text-success">{quote.name ? `${quote.name} applied.` : "Promotion applied."} You save {formatPeso(quote.discountAmountCentavos)} today.</p>}
    </div>
  );
}
