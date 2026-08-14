"use client";

import { useEffect, useReducer } from "react";
import { OverlayDialog } from "@/components/ui/OverlayLayer";
import { formatPeso } from "@/lib/money";
import { calculatePayment, parseTenderedCentavos, paymentPreview as buildPaymentPreview } from "@/lib/pos/payment";
import { paymentReducer } from "@/lib/pos/state-machines";
import type { PaymentPreview, RuntimePaymentMethod } from "@/lib/pos/types";

export default function ChargeModal({
  total,
  availablePaymentMethods,
  onConfirm,
  onPaymentState,
  onClose,
}: {
  total: number;
  availablePaymentMethods: RuntimePaymentMethod[];
  onConfirm: (method: RuntimePaymentMethod, tendered: number | null, payRef: string) => void;
  onPaymentState?: (preview: PaymentPreview) => void;
  onClose: () => void;
}) {
  const methods: RuntimePaymentMethod[] = availablePaymentMethods.length ? availablePaymentMethods : ["cash"];
  const [paymentState, dispatchPayment] = useReducer(paymentReducer, {
    phase: "editing",
    method: methods[0],
    tendered: "",
    reference: "",
    error: null,
  });
  const { method, tendered, reference: ref } = paymentState;
  const tenderedCents = parseTenderedCentavos(tendered);
  const validation = calculatePayment(total, method, method === "cash" ? tenderedCents : null, ref);
  const change = tenderedCents - total;

  useEffect(() => {
    onPaymentState?.({
      ...buildPaymentPreview(total, method, method === "cash" ? tenderedCents : null),
    });
  }, [method, onPaymentState, tenderedCents, total]);

  const confirm = () => {
    if (!validation.valid) {
      dispatchPayment({ type: "invalid", error: validation.reason ?? "Enter valid payment details." });
      return;
    }
    onConfirm(method, validation.tendered, ref.trim());
  };

  return (
    <OverlayDialog
      onClose={onClose}
      titleId="pos-charge-dialog-title"
      backdropClassName="fixed inset-0 flex items-center justify-center bg-ink/40 p-4"
      dialogClassName="w-full max-w-sm rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]"
    >
      <p id="pos-charge-dialog-title" className="text-sm font-bold uppercase tracking-wide text-ink-muted">Charge</p>
      <p className="tnums mt-1 text-3xl font-extrabold text-accent">{formatPeso(total)}</p>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {methods.map((paymentMethod) => (
          <button
            key={paymentMethod}
            type="button"
            onClick={() => dispatchPayment({ type: "method_changed", method: paymentMethod })}
            className={`rounded-btn py-2 text-sm font-bold capitalize ${method === paymentMethod ? "bg-primary text-primary-fg" : "bg-secondary text-ink"}`}
          >
            {paymentMethod === "gcash" ? "GCash" : paymentMethod[0].toUpperCase() + paymentMethod.slice(1)}
          </button>
        ))}
      </div>

      {method === "cash" ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              ["Exact", String(total / 100)],
              ["₱500", "500"],
              ["₱1000", "1000"],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => dispatchPayment({ type: "tendered_changed", value })}
                className="rounded-pill bg-secondary px-3 py-1.5 text-sm font-bold text-ink"
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={tendered}
            onChange={(event) => dispatchPayment({ type: "tendered_changed", value: event.target.value })}
            inputMode="decimal"
            placeholder="Amount tendered"
            aria-label="Cash amount tendered"
            className="tnums mt-2 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-right text-xl font-bold text-ink outline-none focus:border-primary"
          />
          <p className={`tnums mt-2 text-right text-2xl font-extrabold ${change >= 0 ? "text-success" : "text-warning"}`}>
            {validation.changeDue !== null ? formatPeso(validation.changeDue) : "Insufficient"}
          </p>
          {validation.changeDue !== null && <p className="text-right text-xs text-ink-muted">Change due</p>}
        </div>
      ) : (
        <input
          value={ref}
          onChange={(event) => dispatchPayment({ type: "reference_changed", value: event.target.value })}
          placeholder={method === "card" ? "Card last 4 digits" : "Reference number"}
          inputMode={method === "card" ? "numeric" : "text"}
          aria-label={method === "card" ? "Card last four digits" : "Payment reference"}
          className="tnums mt-3 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
      )}

      {paymentState.error && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{paymentState.error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!validation.valid}
          className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </OverlayDialog>
  );
}
