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

export function stockThreshold(minStock: number | string | null | undefined): number {
  if (minStock === null || minStock === undefined || (typeof minStock === "string" && minStock.trim() === "")) return LOW_STOCK_THRESHOLD;
  const value = Number(minStock);
  return Number.isFinite(value) && value >= 0 ? value : LOW_STOCK_THRESHOLD;
}

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

export function stockStatus(value: number | undefined, minStock?: number | string | null): "unknown" | "out" | "low" | "ok" {
  if (value === undefined) return "unknown";
  if (value <= 0) return "out";
  if (value <= stockThreshold(minStock)) return "low";
  return "ok";
}

/** Use recorded weight for per-kilogram lines and item quantity for all others. */
export function salesQuantity(line: { qty: number | string | null | undefined; weight_kg?: number | string | null }): number {
  const weight = Number(line.weight_kg);
  if (Number.isFinite(weight) && weight > 0) return weight;
  const quantity = Number(line.qty);
  return Number.isFinite(quantity) ? quantity : 0;
}
