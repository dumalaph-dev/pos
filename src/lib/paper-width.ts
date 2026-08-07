export const PAPER_WIDTH_OPTIONS = [
  { value: 52, label: "52mm", description: "Compact", columns: 30 },
  { value: 58, label: "58mm", description: "Standard", columns: 32 },
  { value: 80, label: "80mm", description: "Wide", columns: 42 },
] as const;

export type PaperWidth = (typeof PAPER_WIDTH_OPTIONS)[number]["value"];
export type PaperWidthValue = `${PaperWidth}`;

export const DEFAULT_PAPER_WIDTH: PaperWidth = 58;

export const PAPER_WIDTH_COLUMNS: Record<PaperWidth, number> = {
  52: 30,
  58: 32,
  80: 42,
};

export function parsePaperWidth(value: unknown): PaperWidth | null {
  const numericValue = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : NaN;

  if (!Number.isInteger(numericValue)) return null;
  return PAPER_WIDTH_OPTIONS.some((option) => option.value === numericValue)
    ? numericValue as PaperWidth
    : null;
}

export function normalizePaperWidth(value: unknown, fallback: PaperWidth = DEFAULT_PAPER_WIDTH): PaperWidth {
  return parsePaperWidth(value) ?? fallback;
}

export function toPaperWidthValue(value: PaperWidth): PaperWidthValue {
  return String(value) as PaperWidthValue;
}
