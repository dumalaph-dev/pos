"use client";

import { useEffect, useState } from "react";
import { formatBillingDate } from "@/lib/billing";

type CheckoutVariant = {
  id: string;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  discountPercent: number;
};

type TemporaryQrPhCheckoutProps = {
  variants: CheckoutVariant[];
  policyGateOpen: boolean;
  providerReady: boolean;
  providerDetail: string;
  currentAccessCandidate: boolean;
  currentPeriodEnd: string | null;
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

const SESSION_STORAGE_KEY = "dumala:temporary-qrph-checkout-session";

export default function TemporaryQrPhCheckout({
  variants,
  policyGateOpen,
  providerReady,
  providerDetail,
  currentAccessCandidate,
  currentPeriodEnd,
}: TemporaryQrPhCheckoutProps) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "success" | "neutral">("error");
  const [currentAccessActive, setCurrentAccessActive] = useState(currentAccessCandidate);

  useEffect(() => {
    const periodEndMs = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
    const updateAccessState = () => {
      setCurrentAccessActive(currentAccessCandidate && Number.isFinite(periodEndMs) && periodEndMs > Date.now());
    };
    const initialUpdate = window.setTimeout(updateAccessState, 0);
    const refreshInterval = window.setInterval(updateAccessState, 60_000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(refreshInterval);
    };
  }, [currentAccessCandidate, currentPeriodEnd]);

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
        setMessage("PayMongo returned to Dumala POS, but this browser no longer has the checkout reference. Check your PayMongo dashboard or contact support before trying again.");
      }, 0);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const poll = async (attempt: number) => {
      if (cancelled) return;
      setPending(true);
      setMessageKind("neutral");
      setMessage(attempt === 0 ? "Payment returned from PayMongo. Confirming the signed QR Ph payment…" : "Payment is still being confirmed by PayMongo…");

      try {
        const response = await fetch(`/api/billing/qrph/status?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json() as StatusResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.message || "The QR Ph payment could not be verified.");
        if (cancelled) return;

        if (payload.status === "paid") {
          clearStoredSession();
          setMessageKind("success");
          setMessage(`Payment confirmed. Your temporary Premium access is active${payload.periodEnd ? ` through ${formatBillingDate(payload.periodEnd)}` : ""}.`);
          setPending(false);
          return;
        }
        if (payload.status === "failed") {
          clearStoredSession();
          setMessageKind("error");
          setMessage("PayMongo did not complete the QR Ph payment. Start a new checkout and try again.");
          setPending(false);
          return;
        }
        if (attempt >= 10) {
          setMessageKind("neutral");
          setMessage("The payment is not marked paid yet. Keep the PayMongo receipt, then refresh this page in a moment. Access is granted only after PayMongo confirms the payment.");
          setPending(false);
          return;
        }
        timer = window.setTimeout(() => void poll(attempt + 1), 2500);
      } catch (error) {
        if (cancelled) return;
        setMessageKind("error");
        setMessage(error instanceof Error ? error.message : "The QR Ph payment could not be verified.");
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
  async function submit() {
    if (!selectedVariant) {
      setMessageKind("error");
      setMessage("Choose a prepaid access option first.");
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/qrph", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ variantId: selectedVariant.id }),
      });
      const payload = await response.json() as CheckoutResponse;
      if (!response.ok || !payload.ok || !payload.checkoutSessionId || !payload.checkoutUrl) {
        throw new Error(payload.message || "QR Ph checkout could not be started.");
      }

      const target = new URL(payload.checkoutUrl);
      if (target.protocol !== "https:") throw new Error("PayMongo returned an invalid checkout URL.");
      storeSession(payload.checkoutSessionId);
      window.location.assign(target.toString());
    } catch (error) {
      setPending(false);
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "QR Ph checkout could not be started. Try again.");
    }
  }

  if (!policyGateOpen) {
    return <CheckoutNotice title="Checkout is locked by policy" detail="The platform owner must publish both the billing policy and support policy before an organization can start a paid access period." tone="warning" />;
  }
  if (!providerReady) {
    return <CheckoutNotice title="Temporary QR Ph checkout is not ready" detail={providerDetail} tone="neutral" />;
  }
  if (variants.length === 0) {
    return <CheckoutNotice title="No prepaid options are available" detail="Ask the platform owner to enable at least one billing option in Platform Operations." tone="neutral" />;
  }
  if (currentAccessActive) {
    return (
      <div className="mt-6 rounded-card border border-success/25 bg-success/10 px-4 py-4 text-sm leading-6 text-ink">
        <p className="font-extrabold text-success">Temporary Premium access is active</p>
        <p className="mt-1 text-ink-muted">This QR Ph payment does not auto-renew. Renew after {formatBillingDate(currentPeriodEnd)} or switch to recurring billing when Maya/card subscriptions are enabled.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Temporary payment option</p>
          <h3 className="mt-1 text-xl font-extrabold">Pay with QR Ph</h3>
          <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">PayMongo will open a hosted checkout where you scan a QR code with GCash, Maya, or a participating bank app. No card details are required.</p>
        </div>
        <span className="rounded-pill bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink">Manual renewal</span>
      </div>

      <div className="mt-4 rounded-btn border border-warning/25 bg-warning/10 px-4 py-3 text-xs leading-5 text-ink">
        QR Ph is a one-time prepaid payment. It will activate the selected access period after PayMongo confirms payment; it will not renew automatically while Maya/card subscription activation is pending.
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Prepaid access period</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {variants.map((variant) => (
            <label key={variant.id} className={`cursor-pointer rounded-card border p-4 transition ${selectedId === variant.id ? "border-primary bg-primary-soft ring-1 ring-primary/20" : "border-line bg-raised hover:border-line-strong"}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="temporary_qrph_variant" value={variant.id} checked={selectedId === variant.id} onChange={() => setSelectedId(variant.id)} className="mt-1 accent-primary" />
                <span className="min-w-0"><strong className="block text-sm font-extrabold text-ink">{variant.label}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{variant.priceLabel} {variant.cadenceLabel}{variant.discountPercent > 0 ? ` · ${variant.discountPercent}% discount` : ""}</span></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {message && <p role="status" aria-live="polite" className={`mt-5 rounded-btn border px-4 py-3 text-sm font-semibold leading-5 ${messageKind === "success" ? "border-success/25 bg-success/10 text-success" : messageKind === "neutral" ? "border-line bg-raised text-ink-muted" : "border-danger/25 bg-danger-soft text-danger"}`}>{message}</p>}
      <button type="button" onClick={() => void submit()} disabled={pending} className="mt-5 w-full rounded-btn bg-accent px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Opening PayMongo…" : `Continue with QR Ph${selectedVariant ? ` · ${selectedVariant.priceLabel}` : ""}`}</button>
      <p className="mt-3 text-xs leading-5 text-ink-muted">Payment is confirmed server-side through PayMongo&apos;s signed webhook or verified checkout status before access is activated. PayMongo will show the final QR Ph instructions on its hosted checkout page.</p>
    </div>
  );
}

function storeSession(value: string) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, value);
  } catch {
    /* The redirect still works; the webhook remains the source of truth. */
  }
}

function readStoredSession() {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* Ignore storage failures. */
  }
}

function CheckoutNotice({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "neutral" }) {
  return <div className={`mt-6 rounded-card border px-4 py-4 text-sm leading-6 ${tone === "warning" ? "border-warning/30 bg-warning/10 text-ink" : "border-line bg-raised text-ink-muted"}`}><p className="font-extrabold text-ink">{title}</p><p className="mt-1">{detail}</p></div>;
}
