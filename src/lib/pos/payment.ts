import type { Centavos } from "../money.ts";
import type { PaymentPreview, RuntimePaymentMethod } from "./types.ts";

export type PaymentValidation = {
  valid: boolean;
  tendered: Centavos | null;
  changeDue: Centavos | null;
  reason: string | null;
};

export function parseTenderedCentavos(value: string | number): Centavos {
  const pesos = typeof value === "number" ? value : Number(value);
  return Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : 0;
}

export function paymentReferenceValid(method: RuntimePaymentMethod, reference: string): boolean {
  if (method === "cash") return true;
  return method === "card" ? /^\d{4}$/.test(reference.trim()) : reference.trim().length >= 4;
}

export function calculatePayment(
  total: Centavos,
  method: RuntimePaymentMethod,
  tendered: Centavos | null,
  reference: string,
): PaymentValidation {
  if (method === "cash") {
    const cash = tendered ?? 0;
    if (cash < total || cash <= 0) {
      return { valid: false, tendered: cash, changeDue: null, reason: "Cash tendered is less than the order total." };
    }
    return { valid: true, tendered: cash, changeDue: cash - total, reason: null };
  }

  if (!paymentReferenceValid(method, reference)) {
    return { valid: false, tendered: null, changeDue: null, reason: "Enter a valid payment reference." };
  }
  return { valid: true, tendered: null, changeDue: null, reason: null };
}

export function paymentPreview(
  total: Centavos,
  method: RuntimePaymentMethod,
  tendered: Centavos | null,
): PaymentPreview {
  return {
    method,
    tendered: method === "cash" ? tendered : null,
    changeDue: method === "cash" && tendered !== null && tendered >= total ? tendered - total : null,
  };
}
