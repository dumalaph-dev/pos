/**
 * Money is stored and computed as integer centavos — never floats.
 * ₱850.00 -> 85000. See docs/INTERFACES.md §1 and docs/SCHEMA.md.
 */
export type Centavos = number;
export type Kg = number;

/** Peso amount (e.g. 850.5) -> centavos (85050). */
export function toCentavos(peso: number): Centavos {
  return Math.round(peso * 100);
}

/** Centavos -> peso number (e.g. 85050 -> 850.5). For display use `formatPeso`. */
export function toPeso(centavos: Centavos): number {
  return centavos / 100;
}

const PHP = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 85050 -> "₱850.50". */
export function formatPeso(centavos: Centavos): string {
  return PHP.format(centavos / 100);
}

/** Fixed-price line: unit price (centavos) × whole quantity. */
export function fixedLineTotal(unitPrice: Centavos, qty: number): Centavos {
  return unitPrice * Math.trunc(qty);
}

/**
 * Weight-priced line: price-per-kg (centavos) × kilos, rounded to the centavo.
 * ₱850/kg × 1.35kg -> 114750 centavos (₱1,147.50).
 */
export function weightLineTotal(pricePerKg: Centavos, kg: Kg): Centavos {
  return Math.round(pricePerKg * kg);
}
