import type { CartLine } from "./types.ts";

/** Applies the local sale projection only; the authoritative ledger remains the server RPC. */
export function applySaleToStock(stockByProductId: Record<string, number>, lines: CartLine[]): Record<string, number> {
  const next = { ...stockByProductId };
  for (const line of lines) {
    if (!line.product.track_stock || typeof next[line.product.id] !== "number") continue;
    next[line.product.id] -= line.weightKg ?? line.qty;
  }
  return next;
}

export function saleQuantity(line: Pick<CartLine, "qty" | "weightKg">): number {
  return line.weightKg ?? line.qty;
}
