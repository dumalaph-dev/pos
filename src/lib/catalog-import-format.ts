export const PRODUCT_IMPORT_HEADERS = [
  "name",
  "price",
  "unit",
  "sku",
  "barcode",
  "category",
  "supplier",
  "cost_price",
  "min_stock",
  "pricing_mode",
  "inventory_mode",
  "track_stock",
  "is_active",
  "sort_order",
  "store_id",
  "image_url",
] as const;

// Keep the submitted text below Next's configured 2 MB Server Action limit and
// leave room for multipart/form-data overhead.
export const MAX_IMPORT_TEXT_BYTES = 1_800_000;

export type ImportDelimiter = "," | "\t" | ";" | "|";

const REQUIRED_IMPORT_HEADERS = new Set(["name", "price", "unit"]);
const IMPORT_HEADER_ALIASES: Record<string, string> = {
  branch: "store_id",
  branch_id: "store_id",
  branch_name: "store_id",
  cost: "cost_price",
  costprice: "cost_price",
  item_name: "name",
  minimum_stock: "min_stock",
  minimumstock: "min_stock",
  product: "name",
  product_name: "name",
  supplier_name: "supplier",
  unit_of_measure: "unit",
  unit_price: "price",
};

/** Normalize headers shared by pasted text, files, and the server action. */
export function normalizeImportHeader(header: string) {
  const normalized = header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return IMPORT_HEADER_ALIASES[normalized] ?? normalized;
}

function parseDelimitedRows(input: string, delimiter: ImportDelimiter) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      pushField();
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      pushRow();
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Pick a common delimiter, preferring the one that produces required headers. */
export function detectImportDelimiter(input: string): ImportDelimiter {
  const firstLine = input.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  const candidates: ImportDelimiter[] = [",", "\t", ";", "|"];
  let bestDelimiter: ImportDelimiter = ",";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const delimiter of candidates) {
    const headerRow = parseDelimitedRows(firstLine, delimiter)[0] ?? [];
    const normalizedHeaders = headerRow.map(normalizeImportHeader);
    const requiredMatches = normalizedHeaders.filter((header) => REQUIRED_IMPORT_HEADERS.has(header)).length;
    const nonEmptyColumns = normalizedHeaders.filter(Boolean).length;
    const delimiterMatches = firstLine.split(delimiter).length - 1;
    const score = requiredMatches * 1000 + (nonEmptyColumns > 1 ? 10 : 0) + delimiterMatches;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/** Parse CSV, TSV, semicolon, or pipe-delimited product data. */
export function parseDelimitedText(input: string, delimiter: ImportDelimiter = detectImportDelimiter(input)) {
  return parseDelimitedRows(input.replace(/^\uFEFF/, ""), delimiter);
}

export function isNonEmptyImportRow(row: readonly string[]) {
  return row.some((value) => value.trim().length > 0);
}

export function encodeCsvRow(values: readonly unknown[]) {
  return values
    .map((value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

/** Convert pasted or uploaded delimited text into the canonical CSV sent to the server. */
export function normalizeImportText(input: string) {
  return parseDelimitedText(input)
    .filter(isNonEmptyImportRow)
    .map(encodeCsvRow)
    .join("\n");
}
