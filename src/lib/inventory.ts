export const STOCK_MOVEMENT_TYPES = [
  "receive",
  "yield_in",
  "yield_out",
  "sale",
  "waste",
  "adjust",
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export type StockMovementLike = {
  type: string;
  qty: number | string;
};

/** The first backoffice signal for products without a configured threshold. */
export const LOW_STOCK_THRESHOLD = 2;

export function stockMovementDelta(type: string, qty: number): number {
  if (type === "receive" || type === "yield_in") return qty;
  if (type === "yield_out" || type === "sale" || type === "waste") return -qty;
  // Adjustments are signed deltas: +5 adds five units, -2 removes two.
  return qty;
}

export function stockOnHand(movements: StockMovementLike[]): number {
  return movements.reduce(
    (total, movement) =>
      total + stockMovementDelta(movement.type, Number(movement.qty)),
    0,
  );
}

export function formatStockQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function stockStatus(value: number | undefined): "unknown" | "out" | "low" | "ok" {
  if (value === undefined) return "unknown";
  if (value <= 0) return "out";
  if (value <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}
