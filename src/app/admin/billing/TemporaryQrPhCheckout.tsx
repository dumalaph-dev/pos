"use client";

import { useEffect, useState } from "react";
import { formatBillingDate } from "@/lib/billing";

type CheckoutVariant = {
  id: string;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  monthlyEquivalentLabel: string;
  discountPercent: number;
};

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

const SESSION_STORAGE_KEY = "dumala:temporary-qrph-checkout-session";

export default function TemporaryQrPhCheckout({
  variants,
  policyGateOpen,
  providerReady,
  providerDetail,
}: TemporaryQrPhCheckoutProps) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
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
        const response = await fetch(`/api/billing/qrph/status?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`, {
          headers: { Accept: "application/json" },
        });
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
        body: JSON.stringify({ variantId: selectedVariant.id }),
      });
      const payload = await response.json() as CheckoutResponse;
      if (!response.ok || !payload.ok || !payload.checkoutSessionId || !payload.checkoutUrl) {
        throw new Error(payload.message || "Secure checkout could not be started.");
      }

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

  if (!policyGateOpen) {
    return <CheckoutNotice title="Online payment is unavailable" detail="Please try again later or contact support if you need help starting your plan." tone="warning" />;
  }
  if (!providerReady) {
    return <CheckoutNotice title="Online payment is unavailable" detail={providerDetail} tone="neutral" />;
  }
  if (variants.length === 0) {
    return <CheckoutNotice title="No plans are available" detail="Please contact support to continue." tone="neutral" />;
  }

  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Payment options</p>
          <h3 className="mt-1 text-xl font-extrabold">Pay with QR Ph</h3>
          <p className="mt-1 max-w-xl text-sm leading-5 text-ink-muted">Pay securely by scanning the QR code with GCash, Maya, or your banking app. No card details are required.</p>
        </div>
        <span className="rounded-pill bg-warning/15 px-3 py-1.5 text-xs font-extrabold text-ink">One-time payment</span>
      </div>

      <div className="mt-4 rounded-btn border border-warning/25 bg-warning/10 px-4 py-3 text-xs leading-5 text-ink">
        Pay once for your selected plan. Your Premium access will be available through the date shown on your billing page.
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Choose a plan</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {variants.map((variant) => (
            <label key={variant.id} className={`cursor-pointer rounded-card border p-4 transition ${selectedId === variant.id ? "border-primary bg-primary-soft ring-1 ring-primary/20" : "border-line bg-raised hover:border-line-strong"}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="temporary_qrph_variant" value={variant.id} checked={selectedId === variant.id} onChange={() => setSelectedId(variant.id)} className="mt-1 accent-primary" />
                <span className="min-w-0"><strong className="block text-sm font-extrabold text-ink">{variant.label}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{variant.priceLabel} {variant.cadenceLabel}{variant.discountPercent > 0 ? ` · Save ${variant.discountPercent}%` : ""}</span>{variant.cadenceLabel !== "per month" && <span className="mt-1 block text-xs font-semibold text-primary">About {variant.monthlyEquivalentLabel}/month</span>}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {message && <p role="status" aria-live="polite" className={`mt-5 rounded-btn border px-4 py-3 text-sm font-semibold leading-5 ${messageKind === "success" ? "border-success/25 bg-success/10 text-success" : messageKind === "neutral" ? "border-line bg-raised text-ink-muted" : "border-danger/25 bg-danger-soft text-danger"}`}>{message}</p>}
      <button type="button" onClick={() => void submit()} disabled={pending} className="mt-5 w-full rounded-btn bg-accent px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Opening secure checkout…" : `Continue to secure checkout${selectedVariant ? ` · ${selectedVariant.priceLabel}` : ""}`}</button>
      <p className="mt-3 text-xs leading-5 text-ink-muted">Your payment is securely confirmed before Premium access is enabled.</p>
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
