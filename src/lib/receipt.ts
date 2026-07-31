/**
 * ESC/POS receipt builder (P3). Pure byte assembly — no printer hardware
 * needed to test. Money is centavos; amounts are rendered as pesos.
 * Paper widths: 58mm = 32 columns, 80mm = 42 columns (font A).
 */

export type ReceiptItem = {
  name: string;
  qty: number;
  weightKg: number | null;
  lineTotal: number; // centavos
};

export type ReceiptData = {
  storeName: string;
  storeAddress?: string | null;
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
  total: number;
  paymentMethod: string;
  paymentRef?: string | null;
  amountTendered?: number | null;
  changeDue?: number | null;
  officialReceipt?: boolean; // false → "not an official receipt" line
  paperWidth?: 58 | 80;
};

const COLUMNS = { 58: 32, 80: 42 } as const;

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

function cmd(bytes: number[]): number[] {
  return bytes;
}

export function buildReceipt(data: ReceiptData): Uint8Array {
  const width = COLUMNS[data.paperWidth ?? 58];
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

  out.push(ESC, 0x40); // init
  blank();
  line(data.storeName, { align: "center", bold: true, double: true });
  if (data.storeAddress) line(data.storeAddress, { align: "center" });
  blank();
  rule();
  leftRight("Order #", data.orderNo, true);
  leftRight("Date", data.createdAt.toLocaleDateString("en-PH"));
  leftRight("Time", data.createdAt.toLocaleTimeString("en-PH"));
  leftRight("Cashier", data.cashier);
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
  if (data.vatExemptSale > 0) leftRight("VAT-exempt sale", peso(data.vatExemptSale));
  leftRight("VATable sale", peso(data.vatableSale));
  leftRight("VAT (12%)", peso(data.vatAmount));
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
  line("Salamat po!", { align: "center", bold: true });
  blank();
  out.push(ESC, 0x64, 3); // feed 3
  out.push(GS, 0x56, 0x66); // partial cut

  return Uint8Array.from(out);
}
