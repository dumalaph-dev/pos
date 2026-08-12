export const POS_RADIUS_MIN = 0;
export const POS_RADIUS_MAX = 32;
const POS_RADIUS_STORAGE_MAX = 999;

export function readPosRadius(value: unknown): number | null {
  if (value === null) return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= POS_RADIUS_MIN && numberValue <= POS_RADIUS_STORAGE_MAX
    ? Math.round(numberValue)
    : null;
}

export function readPosRadiusWithFallback(value: unknown, fallback: unknown): number | null {
  if (value === null) return null;
  return readPosRadius(value) ?? readPosRadius(fallback);
}

export function parseThemeRadius(value: string | undefined, fallback: number) {
  const numberValue = Number.parseFloat(value ?? "");
  return Number.isFinite(numberValue) && numberValue >= POS_RADIUS_MIN
    ? Math.min(POS_RADIUS_STORAGE_MAX, Math.round(numberValue))
    : fallback;
}

export function resolvePosRadius(value: number | null | undefined, themeValue: string | undefined, fallback: number) {
  const resolved = value == null ? parseThemeRadius(themeValue, fallback) : value;
  const safeValue = Number.isFinite(resolved)
    ? Math.min(POS_RADIUS_STORAGE_MAX, Math.max(POS_RADIUS_MIN, Math.round(resolved)))
    : fallback;
  return `${safeValue}px`;
}
