/**
 * P8 shifts, X-readings and Z-readings (PRD §6.5).
 *
 * The reading itself is computed in Postgres by the `shift_reading` RPC so the
 * till the cashier sees, the expected cash `close_shift` reconciles against,
 * and the figures sealed into `z_readings` can never drift apart. This module
 * only parses that payload and shares the formatting between the POS and the
 * backoffice.
 */

export const ACTIVE_SHIFT_KEY = "pos.shift.active.v1";

export type ShiftPaymentMethod = "cash" | "gcash" | "maya" | "card";

export type ShiftReading = {
  shiftId: string;
  orgId: string;
  storeId: string;
  deviceId: string | null;
  cashierId: string;
  shiftNo: string | null;
  openedAt: string;
  closedAt: string | null;
  isOpen: boolean;
  note: string | null;
  businessDate: string;

  orderCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  vatableSale: number;
  vatAmount: number;
  vatExemptSale: number;
  qtySold: number;
  kgSold: number;

  discountedOrderCount: number;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;

  cashSales: number;
  gcashSales: number;
  mayaSales: number;
  cardSales: number;

  openingCash: number;
  cashRefunds: number;
  expectedCash: number;
  declaredCash: number | null;
  cashVariance: number | null;
  varianceThreshold: number;
};

/** The shift a device is currently ringing sales into. */
export type ActiveShift = {
  id: string;
  storeId: string;
  cashierId: string;
  shiftNo: string | null;
  openedAt: string;
  openingCash: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Parse one `shift_reading` payload. Returns null when the shape is unusable. */
export function parseShiftReading(value: unknown): ShiftReading | null {
  if (!isRecord(value)) return null;
  const shiftId = str(value.shift_id);
  const storeId = str(value.store_id);
  const openedAt = str(value.opened_at);
  if (!shiftId || !storeId || !openedAt) return null;

  return {
    shiftId,
    orgId: str(value.org_id),
    storeId,
    deviceId: nullableStr(value.device_id),
    cashierId: str(value.cashier_id),
    shiftNo: nullableStr(value.shift_no),
    openedAt,
    closedAt: nullableStr(value.closed_at),
    isOpen: value.is_open !== false,
    note: nullableStr(value.note),
    businessDate: str(value.business_date),

    orderCount: num(value.order_count),
    grossSales: num(value.gross_sales),
    discountTotal: num(value.discount_total),
    netSales: num(value.net_sales),
    vatableSale: num(value.vatable_sale),
    vatAmount: num(value.vat_amount),
    vatExemptSale: num(value.vat_exempt_sale),
    qtySold: num(value.qty_sold),
    kgSold: num(value.kg_sold),

    discountedOrderCount: num(value.discounted_order_count),
    voidCount: num(value.void_count),
    voidTotal: num(value.void_total),
    refundCount: num(value.refund_count),
    refundTotal: num(value.refund_total),

    cashSales: num(value.cash_sales),
    gcashSales: num(value.gcash_sales),
    mayaSales: num(value.maya_sales),
    cardSales: num(value.card_sales),

    openingCash: num(value.opening_cash),
    cashRefunds: num(value.cash_refunds),
    expectedCash: num(value.expected_cash),
    declaredCash: nullableNum(value.declared_cash),
    cashVariance: nullableNum(value.cash_variance),
    varianceThreshold: num(value.variance_threshold, 10000),
  };
}

/** Parse a `shift_reading_list` payload, dropping any unusable entries. */
export function parseShiftReadingList(value: unknown): ShiftReading[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseShiftReading).filter((reading): reading is ShiftReading => reading !== null);
}

export function parseActiveShift(value: unknown): ActiveShift | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const storeId = str(value.storeId);
  const cashierId = str(value.cashierId);
  if (!id || !storeId || !cashierId) return null;
  return {
    id,
    storeId,
    cashierId,
    shiftNo: nullableStr(value.shiftNo),
    openedAt: str(value.openedAt),
    openingCash: num(value.openingCash),
  };
}

/** Reads the device's active shift, ignoring one that belongs elsewhere. */
export function readActiveShift(storeId: string | null, cashierId: string | null): ActiveShift | null {
  if (!storeId || !cashierId) return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SHIFT_KEY);
    if (!raw) return null;
    const shift = parseActiveShift(JSON.parse(raw) as unknown);
    if (!shift || shift.storeId !== storeId || shift.cashierId !== cashierId) return null;
    return shift;
  } catch {
    return null;
  }
}

export function writeActiveShift(shift: ActiveShift | null) {
  try {
    if (shift) localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(shift));
    else localStorage.removeItem(ACTIVE_SHIFT_KEY);
  } catch {
    // Privacy modes can deny localStorage. The shift still exists server-side;
    // the device simply re-resolves it on the next load.
  }
}

const SHIFT_TIME = new Intl.DateTimeFormat("en-PH", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "Asia/Singapore",
});

const SHIFT_CLOCK = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Singapore",
});

export function formatShiftTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : SHIFT_TIME.format(date);
}

export function formatShiftClock(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : SHIFT_CLOCK.format(date);
}

export function formatShiftDuration(openedAt: string, closedAt: string | null): string {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const minutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export type VarianceTone = "balanced" | "short" | "over";

export function varianceTone(variance: number | null, threshold: number): VarianceTone {
  if (variance === null || Math.abs(variance) <= Math.min(threshold, 0) || variance === 0) return "balanced";
  return variance < 0 ? "short" : "over";
}

/** "Short ₱120.00" / "Over ₱50.00" / "Balanced" — the label a counter reads. */
export function varianceLabel(variance: number | null, format: (centavos: number) => string): string {
  if (variance === null) return "Not counted";
  if (variance === 0) return "Balanced";
  return variance < 0 ? `Short ${format(Math.abs(variance))}` : `Over ${format(variance)}`;
}

export function shiftLabel(reading: Pick<ShiftReading, "shiftNo" | "shiftId">): string {
  return reading.shiftNo ?? `Shift ${reading.shiftId.slice(0, 8)}`;
}
