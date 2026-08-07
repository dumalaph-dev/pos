/**
 * ESC/POS receipt builder (P3). Pure byte assembly — no printer hardware
 * needed to test. Money is centavos; amounts are rendered as pesos.
 * Paper widths: 52mm = 30 columns, 58mm = 32 columns, 80mm = 42 columns (font A).
 */
import { DEFAULT_PAPER_WIDTH, PAPER_WIDTH_COLUMNS, type PaperWidth } from "./paper-width.ts";

export type ReceiptItem = {
  name: string;
  qty: number;
  weightKg: number | null;
  lineTotal: number; // centavos
};

export type ReceiptData = {
  storeName: string;
  storeAddress?: string | null;
  storeTin?: string | null;
  orderNo: string;
  cashier: string;
  createdAt: Date;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  discountRef?: string | null;
  vatableSale: number;
  vatAmount: number;
  vatExemptSale: number;
  vatRate?: number;
  showVat?: boolean;
  total: number;
  paymentMethod: string;
  paymentRef?: string | null;
  amountTendered?: number | null;
  changeDue?: number | null;
  officialReceipt?: boolean; // false → "not an official receipt" line
  isReprint?: boolean;
  paperWidth?: PaperWidth;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
  showCashier?: boolean;
};

const peso = (centavos: number) =>
  (centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PAD = (n: number) => " ".repeat(n);

/* Transliterate to printer-safe ASCII (printers rarely have Unicode CPs). */
const TRANSLIT: Record<string, string> = {
  "₱": "P",
  ñ: "n",
  Ñ: "N",
  é: "e",
  è: "e",
  á: "a",
  í: "i",
  ó: "o",
  ú: "u",
  "–": "-",
  "—": "-",
  "•": "*",
  "✓": "",
  "…": "...",
};
function ascii(s: string): string {
  return s
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 128 ? ch : TRANSLIT[ch] ?? "?"))
    .join("");
}

function wrap(text: string, width: number): string[] {
  const clean = ascii(text);
  if (clean.length <= width) return [clean];
  const words = clean.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Shared ESC/POS text plumbing. Receipts and till readings print on the same
 * roll and must lay out identically, so both build through this writer.
 */
function createSlipWriter(width: number) {
  const out: number[] = [];

  const text = (s: string) => [...ascii(s)].map((c) => c.charCodeAt(0));
  const line = (
    s: string,
    opts: { align?: "left" | "center" | "right"; bold?: boolean; double?: boolean } = {},
  ) => {
    const alignMap = { left: 0, center: 1, right: 2 } as const;
    let mode = 0;
    if (opts.bold) mode |= 0x08;
    if (opts.double) mode |= 0x10;
    out.push(ESC, 0x21, mode);
    out.push(ESC, 0x61, alignMap[opts.align ?? "left"]);
    for (const w of wrap(s, width)) {
      out.push(...text(w), 0x0a);
    }
  };
  const rule = () => line("-".repeat(width));
  const blank = () => out.push(0x0a);

  const leftRight = (left: string, right: string, bold = false) => {
    const l = ascii(left);
    const r = ascii(right);
    const gap = Math.max(1, width - l.length - r.length);
    line(l + PAD(gap) + r, { bold });
  };

  return { out, line, rule, blank, leftRight };
}

export function buildReceipt(data: ReceiptData): Uint8Array {
  const width = PAPER_WIDTH_COLUMNS[data.paperWidth ?? DEFAULT_PAPER_WIDTH];
  const { out, line, rule, blank, leftRight } = createSlipWriter(width);

  out.push(ESC, 0x40); // init
  blank();
  line(data.storeName, { align: "center", bold: true, double: true });
  if (data.storeAddress) line(data.storeAddress, { align: "center" });
  if (data.storeTin) line(`TIN: ${data.storeTin}`, { align: "center" });
  if (data.receiptHeader) {
    for (const headerLine of data.receiptHeader.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      line(headerLine, { align: "center" });
    }
  }
  blank();
  rule();
  leftRight("Order #", data.orderNo, true);
  leftRight("Date", data.createdAt.toLocaleDateString("en-PH"));
  leftRight("Time", data.createdAt.toLocaleTimeString("en-PH"));
  if (data.showCashier !== false) leftRight("Cashier", data.cashier);
  if (data.isReprint) line("*** REPRINT ***", { align: "center", bold: true });
  rule();

  for (const item of data.items) {
    line(item.name);
    const qtyDesc =
      item.weightKg !== null ? `${item.weightKg.toFixed(2)} kg` : `x${item.qty}`;
    const unit = peso(item.lineTotal);
    line(
      PAD(2) + qtyDesc + PAD(Math.max(1, width - 2 - qtyDesc.length - unit.length)) + unit,
      { align: "left" },
    );
  }
  rule();

  leftRight("Subtotal", peso(data.subtotal));
  if (data.discountAmount > 0) {
    leftRight("Discount", "-" + peso(data.discountAmount));
    if (data.discountRef) line("  " + data.discountRef);
  }
  if (data.showVat !== false) {
    if (data.vatExemptSale > 0) leftRight("VAT-exempt sale", peso(data.vatExemptSale));
    leftRight("VATable sale", peso(data.vatableSale));
    leftRight(`VAT (${Math.round((data.vatRate ?? 0.12) * 100)}%)`, peso(data.vatAmount));
  }
  blank();
  line("TOTAL", { bold: true, double: true });
  line(peso(data.total), { align: "center", bold: true, double: true });
  blank();
  rule();
  line("Payment: " + data.paymentMethod.toUpperCase(), { bold: true });
  if (data.paymentRef) line("  Ref: " + data.paymentRef);
  if (data.amountTendered != null) leftRight("Tendered", peso(data.amountTendered));
  if (data.changeDue != null && data.changeDue >= 0) {
    leftRight("Change", peso(data.changeDue), true);
  }
  rule();

  if (!data.officialReceipt) {
    line("THIS IS NOT AN OFFICIAL RECEIPT", { align: "center", bold: true });
    blank();
  }
  if (data.receiptFooter) {
    for (const footerLine of data.receiptFooter.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      line(footerLine, { align: "center" });
    }
  }
  line("Salamat po!", { align: "center", bold: true });
  blank();
  out.push(ESC, 0x64, 3); // feed 3
  out.push(GS, 0x56, 0x66); // partial cut

  return Uint8Array.from(out);
}

/* ── Till readings (P8) ──────────────────────────────────────────────── */

export type ReadingSlipData = {
  kind: "X" | "Z";
  storeName: string;
  storeAddress?: string | null;
  storeTin?: string | null;
  shiftLabel: string;
  cashier: string;
  openedAt: Date;
  closedAt: Date | null;
  printedAt: Date;
  zNumber?: number | null;

  orderCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  vatableSale: number;
  vatAmount: number;
  vatExemptSale: number;
  vatRate?: number;
  showVat?: boolean;

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
  declaredCash?: number | null;
  cashVariance?: number | null;
  grandTotalAfter?: number | null;
  note?: string | null;
  paperWidth?: PaperWidth;
};

/**
 * X-reading (mid-shift, non-resetting) and Z-reading (sealed end-of-shift)
 * slip. Both print the same figures; a Z additionally carries its sequence
 * number and the branch's running grand total so the archive is self-evident
 * on paper (PRD §6.5).
 */
export function buildReadingSlip(data: ReadingSlipData): Uint8Array {
  const width = PAPER_WIDTH_COLUMNS[data.paperWidth ?? DEFAULT_PAPER_WIDTH];
  const { out, line, rule, blank, leftRight } = createSlipWriter(width);

  out.push(ESC, 0x40); // init
  blank();
  line(data.storeName, { align: "center", bold: true, double: true });
  if (data.storeAddress) line(data.storeAddress, { align: "center" });
  if (data.storeTin) line(`TIN: ${data.storeTin}`, { align: "center" });
  blank();
  line(data.kind === "Z" ? "Z-READING" : "X-READING", { align: "center", bold: true, double: true });
  line(
    data.kind === "Z" ? "End of shift - counters sealed" : "Mid-shift summary - not a reset",
    { align: "center" },
  );
  rule();

  leftRight("Shift", data.shiftLabel, true);
  if (data.kind === "Z" && data.zNumber != null) leftRight("Z number", String(data.zNumber), true);
  leftRight("Cashier", data.cashier);
  leftRight("Opened", data.openedAt.toLocaleString("en-PH"));
  leftRight("Closed", data.closedAt ? data.closedAt.toLocaleString("en-PH") : "Still open");
  leftRight("Printed", data.printedAt.toLocaleString("en-PH"));
  rule();

  line("SALES", { bold: true });
  leftRight("Orders", String(data.orderCount));
  leftRight("Gross sales", peso(data.grossSales));
  leftRight("Discounts", "-" + peso(data.discountTotal));
  leftRight("NET SALES", peso(data.netSales), true);
  if (data.showVat !== false) {
    if (data.vatExemptSale > 0) leftRight("VAT-exempt sale", peso(data.vatExemptSale));
    leftRight("VATable sale", peso(data.vatableSale));
    leftRight(`VAT (${Math.round((data.vatRate ?? 0.12) * 100)}%)`, peso(data.vatAmount));
  }
  rule();

  line("TENDER", { bold: true });
  leftRight("Cash", peso(data.cashSales));
  leftRight("GCash", peso(data.gcashSales));
  leftRight("Maya", peso(data.mayaSales));
  leftRight("Card", peso(data.cardSales));
  rule();

  line("REVERSALS", { bold: true });
  leftRight(`Voids (${data.voidCount})`, peso(data.voidTotal));
  leftRight(`Refunds (${data.refundCount})`, peso(data.refundTotal));
  rule();

  line("CASH DRAWER", { bold: true });
  leftRight("Opening float", peso(data.openingCash));
  leftRight("Cash sales", peso(data.cashSales));
  leftRight("Cash refunds", "-" + peso(data.cashRefunds));
  leftRight("EXPECTED CASH", peso(data.expectedCash), true);
  if (data.declaredCash != null) {
    leftRight("Counted cash", peso(data.declaredCash));
    const variance = data.cashVariance ?? 0;
    const label = variance === 0 ? "Balanced" : variance < 0 ? "SHORT" : "OVER";
    leftRight(`Variance (${label})`, peso(Math.abs(variance)), true);
  } else {
    line("Cash not counted yet", { align: "center" });
  }
  rule();

  if (data.kind === "Z" && data.grandTotalAfter != null) {
    leftRight("GRAND TOTAL", peso(data.grandTotalAfter), true);
    line("Accumulated net sales for this branch", { align: "center" });
    rule();
  }

  if (data.note) {
    line("Note:", { bold: true });
    line("  " + data.note);
    rule();
  }

  line("THIS IS NOT AN OFFICIAL RECEIPT", { align: "center", bold: true });
  blank();
  out.push(ESC, 0x64, 3); // feed 3
  out.push(GS, 0x56, 0x66); // partial cut

  return Uint8Array.from(out);
}
