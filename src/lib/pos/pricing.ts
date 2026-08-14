import { fixedLineTotal, type Centavos, weightLineTotal } from "../money.ts";
import type { CartLine, DiscountState, PosProduct } from "./types.ts";

export type SaleTotals = {
  subtotal: Centavos;
  discountAmount: Centavos;
  total: Centavos;
  vatAmount: Centavos;
  vatableSale: Centavos;
  vatExemptSale: Centavos;
};

export function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function lineTotal(product: Pick<PosProduct, "pricing_mode" | "price">, qty: number, weightKg: number | null): Centavos {
  if (product.pricing_mode === "per_kg") return weightLineTotal(product.price, Math.max(0, weightKg ?? 0));
  return fixedLineTotal(product.price, Math.max(0, qty));
}

export function cartSubtotal(lines: CartLine[]): Centavos {
  return lines.reduce((sum, line) => sum + Math.max(0, line.lineTotal), 0);
}

export function discountAmount(subtotal: Centavos, discount: DiscountState): Centavos {
  if (discount.type === "none") return 0;
  return Math.min(Math.max(0, subtotal), Math.round(Math.max(0, subtotal) * clampDiscountPercent(discount.pct) / 100));
}

/** Prices are VAT-inclusive. The returned VAT is rounded to the centavo. */
export function vatFromInclusiveTotal(total: Centavos, vatRate: number): Centavos {
  if (!Number.isFinite(vatRate) || vatRate <= 0 || total <= 0) return 0;
  return Math.min(total, Math.round(total * Math.min(1, vatRate) / (1 + Math.min(1, vatRate))));
}

export function discountRequiresApproval(discount: DiscountState, thresholdPercent: number): boolean {
  return discount.type === "custom" && clampDiscountPercent(discount.pct) > clampDiscountPercent(thresholdPercent);
}

export function saleTotals(
  lines: CartLine[],
  discount: DiscountState,
  options: { showVat: boolean; vatRate: number; vatExempt?: boolean },
): SaleTotals {
  const subtotal = cartSubtotal(lines);
  const appliedDiscount = discountAmount(subtotal, discount);
  const total = Math.max(0, subtotal - appliedDiscount);
  const vatExempt = options.vatExempt === true;
  const vatAmount = options.showVat && !vatExempt ? vatFromInclusiveTotal(total, options.vatRate) : 0;
  return {
    subtotal,
    discountAmount: appliedDiscount,
    total,
    vatAmount,
    vatableSale: vatExempt ? 0 : total - vatAmount,
    vatExemptSale: vatExempt ? total : 0,
  };
}
