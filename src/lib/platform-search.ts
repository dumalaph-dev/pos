export function normalizePlatformSearchQuery(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}
