"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";
import { formatPeso } from "@/lib/money";
import { BranchAddonPicker, CheckoutPlanPicker, priceCheckoutVariants, type CheckoutBranchPricing, type CheckoutVariant } from "./CheckoutPlanPicker";
import { PromotionCodeInput, type PromotionQuoteState } from "./PromotionCodeInput";

type SubscriptionCheckoutProps = {
  variants: CheckoutVariant[];
  branchPricing: CheckoutBranchPricing;
  policyGateOpen: boolean;
  providerReady: boolean;
  providerDetail: string;
  publicKey: string | null;
  apiBaseUrl: string;
  ownerEmail: string;
  targetActiveBranchCount?: number;
};

type PaymentIntentResponse = {
  ok?: boolean;
  message?: string;
  paymentIntentId?: string;
  clientKey?: string | null;
  paymentIntentStatus?: string;
};

type PromotionValidationResponse = {
  ok?: boolean;
  message?: string;
  code?: string | null;
  name?: string | null;
  discountAmountCentavos?: number;
  finalAmountCentavos?: number;
  variantId?: string;
};

export default function SubscriptionCheckout({ variants, branchPricing, policyGateOpen, providerReady, providerDetail, publicKey, apiBaseUrl, ownerEmail, targetActiveBranchCount: initialTargetActiveBranchCount }: SubscriptionCheckoutProps) {
  const defaultTargetBranchCount = Math.max(initialTargetActiveBranchCount ?? branchPricing.activeBranchCount, branchPricing.activeBranchCount, 1);
  const initialTargetBranchCount = Math.min(defaultTargetBranchCount, branchPricing.maxBranchCount);
  const [targetBranchCount, setTargetBranchCount] = useState(initialTargetBranchCount);
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoQuote, setPromoQuote] = useState<PromotionQuoteState | null>(null);
  const [promoMessage, setPromoMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [promoPending, setPromoPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [legalAcknowledged, setLegalAcknowledged] = useState(false);

  useEffect(() => {
    const paymentIntentId = new URLSearchParams(window.location.search).get("payment_intent_id");
    if (!paymentIntentId) return;

    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPending(true);
      setMessageKind("success");
      setMessage("Verifying your payment…");

      try {
        const response = await fetch(`/api/billing/payment-intent?payment_intent_id=${encodeURIComponent(paymentIntentId)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json() as { ok?: boolean; status?: string; message?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.message || "The payment status could not be verified.");
        if (cancelled) return;
        if (payload.status === "succeeded") {
          setMessage("Payment confirmed. Your subscription is active.");
        } else if (payload.status === "processing") {
          setMessage("Payment is still processing. Refresh your billing status in a moment.");
        } else {
          setMessageKind("error");
          setMessage("Your payment method needs attention. Check the card details and try again.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessageKind("error");
          setMessage(error instanceof Error ? error.message : "The payment status could not be verified.");
        }
      } finally {
        if (!cancelled) {
          setPending(false);
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const checkoutTarget = targetBranchCount > branchPricing.activeBranchCount ? targetBranchCount : undefined;
  const pricedVariants = useMemo(() => priceCheckoutVariants(variants, branchPricing, targetBranchCount), [branchPricing, targetBranchCount, variants]);
  const selectedVariant = pricedVariants.find((variant) => variant.id === selectedId) ?? pricedVariants[0];
  const discountedAmount = promoQuote?.variantId === selectedId ? promoQuote.finalAmountCentavos : selectedVariant?.baseAmountCentavos ?? 0;

  function selectVariant(id: string) {
    setSelectedId(id);
    setPromoQuote(null);
    setPromoMessage(null);
  }

  function selectTarget(value: number) {
    setTargetBranchCount(value);
    setPromoQuote(null);
    setPromoMessage(null);
    setMessage(null);
  }

  async function applyPromotion() {
    const code = promoCode.trim();
    if (!selectedVariant) return setPromoMessage({ kind: "error", text: "Choose a plan before applying a code." });
    if (!code) return setPromoMessage({ kind: "error", text: "Enter a discount code first." });

    setPromoPending(true);
    setPromoMessage(null);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/promotion/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ code, variantId: selectedVariant.id, targetActiveBranchCount: checkoutTarget }),
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedVariant) return setCheckoutError("Choose a plan first.");
    if (!publicKey) return setCheckoutError("Online payment is not ready. Please contact support.");
    if (!legalAcknowledged) return setCheckoutError("Review and accept the Terms of Service and Billing Policy before paying.");

    const normalizedCardNumber = cardNumber.replace(/\D/g, "");
    const month = Number(expiryMonth);
    const year = Number(expiryYear);
    const currentYear = new Date().getFullYear();
    if (cardholderName.trim().length < 2) return setCheckoutError("Enter the cardholder name.");
    if (normalizedCardNumber.length < 12 || normalizedCardNumber.length > 19) return setCheckoutError("Enter a valid card number.");
    if (!Number.isInteger(month) || month < 1 || month > 12) return setCheckoutError("Enter a valid expiry month.");
    if (!Number.isInteger(year) || year < currentYear || year > currentYear + 30) return setCheckoutError("Enter a valid expiry year.");
    if (!/^\d{3,4}$/.test(cvc)) return setCheckoutError("Enter the card security code.");

    setPending(true);
    try {
       const intent = await startSubscription(selectedVariant.id, promoQuote?.code ?? "", checkoutTarget, {
         termsVersion: LEGAL_DOCUMENT_VERSION,
         privacyNoticeVersion: LEGAL_DOCUMENT_VERSION,
       });
      if (!intent.paymentIntentId) throw new Error(intent.message || "We could not start the payment. Please try again.");
      if (intent.paymentIntentStatus === "succeeded") {
        setCheckoutSuccess("Payment confirmed. Your Premium plan is now active.");
        return;
      }
      if (!intent.clientKey) throw new Error("We could not securely prepare the payment. Please try again.");

      const paymentMethodId = await createPaymentMethod({
        publicKey,
        apiBaseUrl,
        cardholderName: cardholderName.trim(),
        cardNumber: normalizedCardNumber,
        expiryMonth: month,
        expiryYear: year,
        cvc,
        ownerEmail,
      });
      const attached = await attachPaymentMethod({
        publicKey,
        apiBaseUrl,
        paymentIntentId: intent.paymentIntentId,
        clientKey: intent.clientKey,
        paymentMethodId,
        targetActiveBranchCount: checkoutTarget,
      });
      const attachedAttributes = readAttributes(attached);
      const status = readString(attachedAttributes, "status");
      const redirectUrl = readNestedString(attachedAttributes, ["next_action", "redirect", "url"]);

      if (status === "awaiting_next_action" && redirectUrl) {
        const target = new URL(redirectUrl);
        if (target.protocol !== "https:") throw new Error("The secure verification link is invalid.");
        window.location.assign(target.toString());
        return;
      }
      if (status === "succeeded") {
        setCheckoutSuccess("Payment confirmed. Your Premium plan is now active.");
        return;
      }
      if (status === "processing") {
        setCheckoutSuccess("Payment is processing. Keep this page open and refresh your billing status in a moment.");
        return;
      }

      const providerError = readNestedString(attachedAttributes, ["last_payment_error", "detail"]);
      throw new Error(providerError || "Your payment could not be completed. Check the card details and try again.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout could not be completed. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!policyGateOpen) return <CheckoutNotice title="Online payment is unavailable" detail="Please try again later or contact support if you need help starting your plan." tone="warning" />;
  if (!providerReady) return <CheckoutNotice title="Online payment is unavailable" detail={providerDetail} tone="neutral" />;
  if (pricedVariants.length === 0) return <CheckoutNotice title="No plans are available" detail="Please contact support to continue." tone="neutral" />;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Secure payment</p>
          <h3 className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Complete checkout</h3>
          <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Your card is tokenized by PayMongo. Dumala POS never stores the full card number.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-extrabold text-success"><AdminIcon name="lock" size={13} /> Secure by PayMongo</span>
      </div>

      <form className="mt-5" onSubmit={submit}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.18fr)_minmax(260px,0.82fr)]">
          <div className="space-y-4">
            <CheckoutPlanPicker variants={pricedVariants} selectedId={selectedId} onChange={selectVariant} inputName="subscription_variant" />
            <BranchAddonPicker pricing={branchPricing} targetActiveBranchCount={targetBranchCount} onChange={selectTarget} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-extrabold text-ink sm:col-span-2" htmlFor="checkout-cardholder">Cardholder name<input id="checkout-cardholder" value={cardholderName} onChange={(event) => setCardholderName(event.target.value)} autoComplete="cc-name" className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="Juan Dela Cruz" /></label>
              <label className="block text-xs font-extrabold text-ink sm:col-span-2" htmlFor="checkout-card-number">Card number<input id="checkout-card-number" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" autoComplete="cc-number" className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold tabular-nums text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="4120 0000 0000 0007" /></label>
              <label className="block text-xs font-extrabold text-ink" htmlFor="checkout-expiry-month">Expiry month<input id="checkout-expiry-month" value={expiryMonth} onChange={(event) => setExpiryMonth(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" autoComplete="cc-exp-month" className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold tabular-nums text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="12" /></label>
              <label className="block text-xs font-extrabold text-ink" htmlFor="checkout-expiry-year">Expiry year<input id="checkout-expiry-year" value={expiryYear} onChange={(event) => setExpiryYear(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="cc-exp-year" className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold tabular-nums text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="2030" /></label>
              <label className="block text-xs font-extrabold text-ink" htmlFor="checkout-cvc">Security code<input id="checkout-cvc" value={cvc} onChange={(event) => setCvc(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" className="mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold tabular-nums text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="123" /></label>
            </div>
          </div>

          <aside className="h-fit rounded-[16px] border border-line bg-surface-raised p-4" aria-label="Checkout summary">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Order summary</p><h4 className="mt-1 text-base font-extrabold">Premium plan</h4></div><AdminIcon name="wallet" size={17} /></div>
            <div className="mt-4 space-y-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-ink-muted">{selectedVariant?.label ?? "Selected plan"}</span><span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">Selected</span></div>{promoQuote?.variantId === selectedId && <div className="flex items-center justify-between gap-3 text-success"><span>{promoQuote.code} discount</span><span className="font-extrabold tabular-nums">-{formatPeso(promoQuote.discountAmountCentavos)}</span></div>}</div>
            {selectedVariant && <p className="mt-2 text-[11px] leading-4 text-ink-muted">{selectedVariant.activeBranchCount} active branch{selectedVariant.activeBranchCount === 1 ? "" : "es"} · {selectedVariant.billableBranchCount === 0 ? "first branch included" : `${selectedVariant.billableBranchCount} additional branch add-on${selectedVariant.billableBranchCount === 1 ? "" : "s"}`}</p>}
            <div className="mt-4 border-t border-dashed border-line pt-3"><div className="flex items-end justify-between gap-3"><span className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">Due today</span><strong className="text-2xl font-extrabold tracking-[-0.04em] tabular-nums text-primary">{formatPeso(discountedAmount)}</strong></div><p className="mt-1 text-[11px] leading-4 text-ink-muted">{selectedVariant?.cadenceLabel === "per month" ? "Billed monthly" : "One payment for the selected term"}</p></div>
             <div className="mt-4"><PromotionCodeInput value={promoCode} onChange={(value) => { setPromoCode(value); setPromoQuote(null); setPromoMessage(null); }} onApply={() => void applyPromotion()} pending={promoPending} quote={promoQuote?.variantId === selectedId ? promoQuote : null} message={promoMessage} /></div>
            {message && <p role="status" aria-live="polite" className={`mt-4 rounded-xl border px-3 py-2.5 text-xs font-semibold leading-5 ${messageKind === "success" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{message}</p>}
            <label className="mt-4 flex items-start gap-3 text-[11px] leading-5 text-ink-muted" htmlFor="checkout-legal-acknowledged">
              <input id="checkout-legal-acknowledged" type="checkbox" checked={legalAcknowledged} onChange={(event) => setLegalAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
              <span>I agree to the <Link href="/legal/terms" target="_blank" rel="noreferrer" className="font-extrabold text-primary underline underline-offset-4">Terms of Service</Link> and <Link href="/legal/billing" target="_blank" rel="noreferrer" className="font-extrabold text-primary underline underline-offset-4">Billing and Refunds Policy</Link>, and acknowledge the <Link href="/legal/privacy" target="_blank" rel="noreferrer" className="font-extrabold text-primary underline underline-offset-4">Privacy Notice</Link>.</span>
            </label>
            <button type="submit" disabled={pending} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Processing payment…" : `Start Premium · ${formatPeso(discountedAmount)}`}<AdminIcon name="arrow" size={14} /></button>
            <p className="mt-3 text-[11px] leading-4 text-ink-muted">Secure verification may be requested by your bank before the plan is activated.</p>
          </aside>
        </div>
      </form>
    </div>
  );

  function setCheckoutError(value: string) {
    setMessageKind("error");
    setMessage(value);
  }

  function setCheckoutSuccess(value: string) {
    setMessageKind("success");
    setMessage(value);
  }
}

async function startSubscription(variantId: string, promoCode: string, targetActiveBranchCount: number | undefined, legalAcceptance: { termsVersion: string; privacyNoticeVersion: string }) {
  const response = await fetch("/api/billing/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ variantId, promoCode, targetActiveBranchCount, legalAcceptance }),
  });
  const payload = await response.json() as PaymentIntentResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.message || "Checkout could not be started.");
  return payload;
}

async function createPaymentMethod(input: { publicKey: string; apiBaseUrl: string; cardholderName: string; cardNumber: string; expiryMonth: number; expiryYear: number; cvc: string; ownerEmail: string }) {
  const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/v1/payment_methods`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${window.btoa(`${input.publicKey}:`)}` },
    body: JSON.stringify({ data: { attributes: { type: "card", details: { card_number: input.cardNumber, exp_month: input.expiryMonth, exp_year: input.expiryYear, cvc: input.cvc }, billing: { name: input.cardholderName, email: input.ownerEmail || undefined } } } }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(providerError(payload) || "We could not securely process the card details.");
  const id = readNestedString(payload, ["data", "id"]);
  if (!id) throw new Error("We could not securely process the card details.");
  return id;
}

async function attachPaymentMethod(input: { publicKey: string; apiBaseUrl: string; paymentIntentId: string; clientKey: string; paymentMethodId: string; targetActiveBranchCount?: number }) {
  const returnUrl = new URL("/admin/billing", window.location.origin);
  returnUrl.searchParams.set("payment_intent_id", input.paymentIntentId);
  if (input.targetActiveBranchCount !== undefined) {
    returnUrl.searchParams.set("reason", "additional_branch");
    returnUrl.searchParams.set("target", String(input.targetActiveBranchCount));
  }
  const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}/attach`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Basic ${window.btoa(`${input.publicKey}:`)}` },
    body: JSON.stringify({ data: { attributes: { payment_method: input.paymentMethodId, client_key: input.clientKey, return_url: returnUrl.toString() } } }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(providerError(payload) || "We could not complete the payment. Please try again.");
  return payload;
}

function providerError(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.errors)) return "";
  const first = payload.errors[0];
  if (!isRecord(first)) return "";
  return typeof first.detail === "string" ? first.detail : "";
}

function readAttributes(payload: unknown) {
  const value = readNested(payload, ["data", "attributes"]);
  return isRecord(value) ? value : {};
}

function readNestedString(value: unknown, path: string[]) {
  const nested = readNested(value, path);
  return typeof nested === "string" ? nested : null;
}

function readString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : null;
}

function readNested(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function CheckoutNotice({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "neutral" }) {
  return <div className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-5 ${tone === "warning" ? "border-warning/30 bg-warning/10 text-ink" : "border-line bg-raised text-ink-muted"}`}><p className="font-extrabold text-ink">{title}</p><p className="mt-1">{detail}</p></div>;
}
