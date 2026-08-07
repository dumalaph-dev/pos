"use client";

import { useEffect, useState, type FormEvent } from "react";

type CheckoutVariant = {
  id: string;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  discountPercent: number;
};

type SubscriptionCheckoutProps = {
  variants: CheckoutVariant[];
  policyGateOpen: boolean;
  providerReady: boolean;
  publicKey: string | null;
  apiBaseUrl: string;
  ownerEmail: string;
};

type PaymentIntentResponse = {
  ok?: boolean;
  message?: string;
  paymentIntentId?: string;
  clientKey?: string | null;
  paymentIntentStatus?: string;
};

export default function SubscriptionCheckout({ variants, policyGateOpen, providerReady, publicKey, apiBaseUrl, ownerEmail }: SubscriptionCheckoutProps) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvc, setCvc] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");

  useEffect(() => {
    const paymentIntentId = new URLSearchParams(window.location.search).get("payment_intent_id");
    if (!paymentIntentId) return;

    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPending(true);
      setMessageKind("success");
      setMessage("Verifying your payment with PayMongo…");

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
          setMessage("PayMongo is waiting for a new payment method. Check the card details and try checkout again.");
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

  const selectedVariant = variants.find((variant) => variant.id === selectedId) ?? variants[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!selectedVariant) return setCheckoutError("Choose a subscription option first.");
    if (!publicKey) return setCheckoutError("PayMongo public key is not configured yet.");

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
      const intent = await startSubscription(selectedVariant.id);
      if (!intent.paymentIntentId) throw new Error(intent.message || "PayMongo did not return a payment intent.");
      if (intent.paymentIntentStatus === "succeeded") {
        setCheckoutSuccess("Payment confirmed. Your subscription status will update after the signed PayMongo webhook is received.");
        return;
      }
      if (!intent.clientKey) throw new Error("PayMongo did not return a client key for the first payment.");

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
      });
      const attachedAttributes = readAttributes(attached);
      const status = readString(attachedAttributes, "status");
      const redirectUrl = readNestedString(attachedAttributes, ["next_action", "redirect", "url"]);

      if (status === "awaiting_next_action" && redirectUrl) {
        const target = new URL(redirectUrl);
        if (target.protocol !== "https:") throw new Error("PayMongo returned an invalid authentication URL.");
        window.location.assign(target.toString());
        return;
      }
      if (status === "succeeded") {
        setCheckoutSuccess("Payment confirmed. Your subscription status will update after the signed PayMongo webhook is received.");
        return;
      }
      if (status === "processing") {
        setCheckoutSuccess("Payment is processing. Keep this page open and refresh your billing status in a moment.");
        return;
      }

      const providerError = readNestedString(attachedAttributes, ["last_payment_error", "detail"]);
      throw new Error(providerError || "PayMongo could not complete the first payment. Check the card details and try again.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Checkout could not be completed. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!policyGateOpen) {
    return <CheckoutNotice title="Checkout is locked by policy" detail="The platform owner must publish both the billing policy and support policy before an organization can start a paid subscription." tone="warning" />;
  }
  if (!providerReady) {
    return <CheckoutNotice title="PayMongo checkout is being prepared" detail="The platform owner must configure the public key, secret key, webhook secret, and PayMongo Subscriptions activation before checkout can collect a payment." tone="neutral" />;
  }
  if (variants.length === 0) {
    return <CheckoutNotice title="No subscription options are available" detail="Ask the platform owner to enable at least one billing option in Platform Operations." tone="neutral" />;
  }

  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Start subscription</p>
          <h3 className="mt-1 text-xl font-extrabold">Choose how you want to pay</h3>
          <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Your first payment starts the selected recurring schedule. PayMongo may ask for 3D Secure verification.</p>
        </div>
        <span className="rounded-pill bg-success/10 px-3 py-1.5 text-xs font-extrabold text-success">Policy gate open</span>
      </div>

      <form className="mt-5 space-y-5" onSubmit={submit}>
        <fieldset>
          <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Subscription option</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {variants.map((variant) => (
              <label key={variant.id} className={`cursor-pointer rounded-card border p-4 transition ${selectedId === variant.id ? "border-primary bg-primary-soft ring-1 ring-primary/20" : "border-line bg-raised hover:border-line-strong"}`}>
                <span className="flex items-start gap-3">
                  <input type="radio" name="subscription_variant" value={variant.id} checked={selectedId === variant.id} onChange={() => setSelectedId(variant.id)} className="mt-1 accent-primary" />
                  <span className="min-w-0"><strong className="block text-sm font-extrabold text-ink">{variant.label}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{variant.priceLabel} {variant.cadenceLabel}{variant.discountPercent > 0 ? ` · ${variant.discountPercent}% discount` : ""}</span></span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink sm:col-span-2" htmlFor="checkout-cardholder">Cardholder name<input id="checkout-cardholder" value={cardholderName} onChange={(event) => setCardholderName(event.target.value)} autoComplete="cc-name" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="Juan Dela Cruz" /></label>
          <label className="block text-sm font-semibold text-ink sm:col-span-2" htmlFor="checkout-card-number">Card number<input id="checkout-card-number" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} inputMode="numeric" autoComplete="cc-number" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="4343 4343 4343 4345" /></label>
          <label className="block text-sm font-semibold text-ink" htmlFor="checkout-expiry-month">Expiry month<input id="checkout-expiry-month" value={expiryMonth} onChange={(event) => setExpiryMonth(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" autoComplete="cc-exp-month" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="12" /></label>
          <label className="block text-sm font-semibold text-ink" htmlFor="checkout-expiry-year">Expiry year<input id="checkout-expiry-year" value={expiryYear} onChange={(event) => setExpiryYear(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="cc-exp-year" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="2030" /></label>
          <label className="block text-sm font-semibold text-ink" htmlFor="checkout-cvc">Security code<input id="checkout-cvc" value={cvc} onChange={(event) => setCvc(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="cc-csc" className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-4 py-3 text-ink outline-none transition focus:border-primary" placeholder="123" /></label>
        </div>

        {message && <p role="status" aria-live="polite" className={`rounded-btn border px-4 py-3 text-sm font-semibold leading-5 ${messageKind === "success" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{message}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-btn bg-accent px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Connecting to PayMongo…" : `Start ${selectedVariant?.label ?? "subscription"}`}</button>
        <p className="text-xs leading-5 text-ink-muted">Card details are sent directly from this browser to PayMongo for tokenization. Dumala POS receives only the tokenized payment method and signed payment status.</p>
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

async function startSubscription(variantId: string) {
  const response = await fetch("/api/billing/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ variantId }),
  });
  const payload = await response.json() as PaymentIntentResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.message || "Checkout could not be started.");
  return payload;
}

async function createPaymentMethod(input: { publicKey: string; apiBaseUrl: string; cardholderName: string; cardNumber: string; expiryMonth: number; expiryYear: number; cvc: string; ownerEmail: string }) {
  const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/v1/payment_methods`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${window.btoa(`${input.publicKey}:`)}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          type: "card",
          details: {
            card_number: input.cardNumber,
            exp_month: input.expiryMonth,
            exp_year: input.expiryYear,
            cvc: input.cvc,
          },
          billing: {
            name: input.cardholderName,
            email: input.ownerEmail || undefined,
          },
        },
      },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(providerError(payload) || "PayMongo could not tokenize the card.");
  const id = readNestedString(payload, ["data", "id"]);
  if (!id) throw new Error("PayMongo did not return a payment method token.");
  return id;
}

async function attachPaymentMethod(input: { publicKey: string; apiBaseUrl: string; paymentIntentId: string; clientKey: string; paymentMethodId: string }) {
  const returnUrl = new URL("/admin/billing", window.location.origin);
  returnUrl.searchParams.set("payment_intent_id", input.paymentIntentId);
  const response = await fetch(`${input.apiBaseUrl.replace(/\/$/, "")}/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}/attach`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${window.btoa(`${input.publicKey}:`)}`,
    },
    body: JSON.stringify({ data: { attributes: { payment_method: input.paymentMethodId, client_key: input.clientKey, return_url: returnUrl.toString() } } }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(providerError(payload) || "PayMongo could not attach the payment method.");
  return payload;
}

function providerError(payload: Record<string, unknown>) {
  const errors = payload.errors;
  if (!Array.isArray(errors)) return "";
  const first = errors[0];
  if (!first || typeof first !== "object") return "";
  const detail = (first as Record<string, unknown>).detail;
  return typeof detail === "string" ? detail : "";
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
  return <div className={`mt-6 rounded-card border px-4 py-4 text-sm leading-6 ${tone === "warning" ? "border-warning/30 bg-warning/10 text-ink" : "border-line bg-raised text-ink-muted"}`}><p className="font-extrabold text-ink">{title}</p><p className="mt-1">{detail}</p></div>;
}
