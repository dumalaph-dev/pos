"use client";

import { useEffect, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { formatBillingDate } from "@/lib/billing";
import { formatPeso } from "@/lib/money";
import { CheckoutPlanPicker, type CheckoutVariant } from "./CheckoutPlanPicker";
import { PromotionCodeInput, type PromotionQuoteState } from "./PromotionCodeInput";

type TemporaryQrPhCheckoutProps = {
  variants: CheckoutVariant[];
  policyGateOpen: boolean;
  providerReady: boolean;
  providerDetail: string;
};

type CheckoutResponse = {
  ok?: boolean;
  message?: string;
  checkoutSessionId?: string;
  checkoutUrl?: string;
};

type StatusResponse = {
  ok?: boolean;
  status?: "paid" | "pending" | "failed";
  message?: string;
  periodEnd?: string;
};

type PromotionValidationResponse = {
  ok?: boolean;
  message?: string;
  code?: string | null;
  name?: string | null;
  discountAmountCentavos?: number;
  finalAmountCentavos?: number;
};

const SESSION_STORAGE_KEY = "dumala:temporary-qrph-checkout-session";

export default function TemporaryQrPhCheckout({ variants, policyGateOpen, providerReady, providerDetail }: TemporaryQrPhCheckoutProps) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [promoCode, setPromoCode] = useState("");
  const [promoQuote, setPromoQuote] = useState<PromotionQuoteState | null>(null);
  const [promoMessage, setPromoMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [promoPending, setPromoPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success" | "neutral">("error");

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("qrph");
    if (!result) return;

    window.history.replaceState(null, "", window.location.pathname);
    if (result === "cancelled") {
      clearStoredSession();
      window.setTimeout(() => {
        setMessageKind("neutral");
        setMessage("The QR Ph checkout was cancelled. You can start it again when ready.");
      }, 0);
      return;
    }
    if (result !== "success") return;

    const checkoutSessionId = readStoredSession();
    if (!checkoutSessionId) {
      window.setTimeout(() => {
        setMessageKind("error");
        setMessage("We could not find this checkout on your browser. If you completed payment, please contact support before trying again.");
      }, 0);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const poll = async (attempt: number) => {
      if (cancelled) return;
      setPending(true);
      setMessageKind("neutral");
      setMessage(attempt === 0 ? "Payment returned. Confirming your payment…" : "Your payment is still being confirmed…");

      try {
        const response = await fetch(`/api/billing/qrph/status?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`, { headers: { Accept: "application/json" } });
        const payload = await response.json() as StatusResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.message || "The QR Ph payment could not be verified.");
        if (cancelled) return;

        if (payload.status === "paid") {
          clearStoredSession();
          setMessageKind("success");
          setMessage(`Payment confirmed. Your Premium access is active${payload.periodEnd ? ` through ${formatBillingDate(payload.periodEnd)}` : ""}.`);
          setPending(false);
          return;
        }
        if (payload.status === "failed") {
          clearStoredSession();
          setMessageKind("error");
          setMessage("Your payment could not be completed. Please start again and try again.");
          setPending(false);
          return;
        }
        if (attempt >= 10) {
          setMessageKind("neutral");
          setMessage("Your payment is still being confirmed. Please refresh this page in a moment.");
          setPending(false);
          return;
        }
        timer = window.setTimeout(() => void poll(attempt + 1), 2500);
      } catch (error) {
        if (cancelled) return;
        setMessageKind("error");
        setMessage(error instanceof Error ? error.message : "We could not verify this payment. Please try again.");
        setPending(false);
      }
    };

    void poll(0);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const selectedVariant = variants.find((variant) => variant.id === selectedId) ?? variants[0];
  const discountedAmount = promoQuote?.variantId === selectedId ? promoQuote.finalAmountCentavos : selectedVariant?.baseAmountCentavos ?? 0;

  function selectVariant(id: string) {
    setSelectedId(id);
    setPromoQuote(null);
    setPromoMessage(null);
  }

  async function applyPromotion() {
    const code = promoCode.trim();
    if (!selectedVariant) return setPromoMessage({ kind: "error", text: "Choose a plan before applying a code." });
    if (!code) return setPromoMessage({ kind: "error", text: "Enter a discount code first." });

    setPromoPending(true);
    setPromoMessage(null);
    try {
      const response = await fetch("/api/billing/promotion/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code, variantId: selectedVariant.id }),
      });
      const payload = await response.json() as PromotionValidationResponse;
      if (!response.ok || !payload.ok || !payload.code || typeof payload.finalAmountCentavos !== "number" || typeof payload.discountAmountCentavos !== "number") {
        throw new Error(payload.message || "That discount code could not be applied.");
      }
      setPromoCode(payload.code);
      setPromoQuote({ code: payload.code, name: payload.name ?? null, discountAmountCentavos: payload.discountAmountCentavos, finalAmountCentavos: payload.finalAmountCentavos, variantId: selectedVariant.id });
      setPromoMessage({ kind: "success", text: `${payload.code} is valid for this plan.` });
    } catch (error) {
      setPromoQuote(null);
      setPromoMessage({ kind: "error", text: error instanceof Error ? error.message : "That discount code could not be applied." });
    } finally {
      setPromoPending(false);
    }
  }

  async function submit() {
    if (!selectedVariant) {
      setMessageKind("error");
      setMessage("Choose a plan first.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/qrph", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ variantId: selectedVariant.id, promoCode: promoQuote?.code ?? "" }),
      });
      const payload = await response.json() as CheckoutResponse;
      if (!response.ok || !payload.ok || !payload.checkoutSessionId || !payload.checkoutUrl) throw new Error(payload.message || "Secure checkout could not be started.");

      const target = new URL(payload.checkoutUrl);
      if (target.protocol !== "https:") throw new Error("The secure checkout link is invalid.");
      storeSession(payload.checkoutSessionId);
      window.location.assign(target.toString());
    } catch (error) {
      setPending(false);
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Secure checkout could not be started. Try again.");
    }
  }

  if (!policyGateOpen) return <CheckoutNotice title="Online payment is unavailable" detail="Please try again later or contact support if you need help starting your plan." tone="warning" />;
  if (!providerReady) return <CheckoutNotice title="Online payment is unavailable" detail={providerDetail} tone="neutral" />;
  if (variants.length === 0) return <CheckoutNotice title="No plans are available" detail="Please contact support to continue." tone="neutral" />;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Secure payment</p>
          <h3 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Pay with QR Ph</h3>
          <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Scan with GCash, Maya, or your banking app. No card details are required.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink"><AdminIcon name="lock" size={13} /> Secure one-time payment</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(260px,0.82fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-ink">Pay once for the selected term. Your Premium access remains active through the date shown on the billing page.</div>
          <CheckoutPlanPicker variants={variants} selectedId={selectedId} onChange={selectVariant} inputName="temporary_qrph_variant" />
        </div>

        <aside className="h-fit rounded-[16px] border border-line bg-surface-raised p-4" aria-label="QR Ph checkout summary">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Order summary</p><h4 className="mt-1 text-base font-extrabold">Premium access</h4></div><AdminIcon name="wallet" size={17} /></div>
          <div className="mt-4 space-y-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-ink-muted">{selectedVariant?.label ?? "Selected plan"}</span><span className="font-extrabold tabular-nums text-ink">{formatPeso(selectedVariant?.baseAmountCentavos ?? 0)}</span></div>{promoQuote?.variantId === selectedId && <div className="flex items-center justify-between gap-3 text-success"><span>{promoQuote.code} discount</span><span className="font-extrabold tabular-nums">-{formatPeso(promoQuote.discountAmountCentavos)}</span></div>}</div>
          <div className="mt-4 border-t border-dashed border-line pt-3"><div className="flex items-end justify-between gap-3"><span className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">Pay once</span><strong className="text-2xl font-extrabold tracking-[-0.04em] tabular-nums text-primary">{formatPeso(discountedAmount)}</strong></div><p className="mt-1 text-[11px] leading-4 text-ink-muted">{selectedVariant?.cadenceLabel ?? "Selected term"}</p></div>
          <div className="mt-4"><PromotionCodeInput value={promoCode} onChange={(value) => { setPromoCode(value); setPromoQuote(null); setPromoMessage(null); }} onApply={() => void applyPromotion()} pending={promoPending} quote={promoQuote?.variantId === selectedId ? promoQuote : null} message={promoMessage} /></div>
          {message && <p role="status" aria-live="polite" className={`mt-4 rounded-xl border px-3 py-2.5 text-xs font-semibold leading-5 ${messageKind === "success" ? "border-success/25 bg-success/10 text-success" : messageKind === "neutral" ? "border-line bg-raised text-ink-muted" : "border-danger/25 bg-danger-soft text-danger"}`}>{message}</p>}
          <button type="button" onClick={() => void submit()} disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Opening secure checkout…" : `Continue · ${formatPeso(discountedAmount)}`}<AdminIcon name="arrow" size={14} /></button>
          <p className="mt-3 text-[11px] leading-4 text-ink-muted">Payment is securely confirmed before Premium access is enabled.</p>
        </aside>
      </div>
    </div>
  );
}

function storeSession(value: string) {
  try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, value); } catch { /* The webhook remains the source of truth. */ }
}

function readStoredSession() {
  try { return window.sessionStorage.getItem(SESSION_STORAGE_KEY); } catch { return null; }
}

function clearStoredSession() {
  try { window.sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* Ignore storage failures. */ }
}

function CheckoutNotice({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "neutral" }) {
  return <div className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-5 ${tone === "warning" ? "border-warning/30 bg-warning/10 text-ink" : "border-line bg-raised text-ink-muted"}`}><p className="font-extrabold text-ink">{title}</p><p className="mt-1">{detail}</p></div>;
}
