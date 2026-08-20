const DEFAULT_PUBLIC_MENU_ROOT_DOMAIN = "dumala.store";

const RESERVED_PUBLIC_MENU_SUBDOMAINS = new Set([
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "demo",
  "dev",
  "display",
  "ftp",
  "login",
  "mail",
  "platform",
  "pos",
  "signup",
  "staff",
  "staging",
  "status",
  "support",
  "test",
  "www",
]);

const PUBLIC_MENU_SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function publicMenuRootDomain() {
  const configured = process.env.NEXT_PUBLIC_PUBLIC_MENU_ROOT_DOMAIN?.trim().toLowerCase().replace(/\.$/, "");
  return configured && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(configured)
    ? configured
    : DEFAULT_PUBLIC_MENU_ROOT_DOMAIN;
}

export function normalizePublicMenuSubdomain(value: string) {
  return value.trim().toLowerCase();
}

export function isValidPublicMenuSubdomain(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = normalizePublicMenuSubdomain(value);
  return PUBLIC_MENU_SUBDOMAIN_PATTERN.test(normalized) && !RESERVED_PUBLIC_MENU_SUBDOMAINS.has(normalized);
}

export function publicMenuHostname(subdomain: string) {
  const normalized = normalizePublicMenuSubdomain(subdomain);
  return isValidPublicMenuSubdomain(normalized) ? `${normalized}.${publicMenuRootDomain()}` : null;
}

export function publicMenuUrl(subdomain: string) {
  const hostname = publicMenuHostname(subdomain);
  return hostname ? `https://${hostname}` : null;
}

/**
 * Returns the one-label menu subdomain from a request hostname. The host may
 * include a development port when this helper is used with the raw Host
 * header instead of URL.hostname.
 */
export function publicMenuSubdomainFromHostname(hostname: string | null | undefined) {
  if (!hostname) return null;
  const normalizedHostname = hostname.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = `.${publicMenuRootDomain()}`;
  if (!normalizedHostname.endsWith(suffix)) return null;

  const candidate = normalizedHostname.slice(0, -suffix.length);
  return candidate && !candidate.includes(".") && isValidPublicMenuSubdomain(candidate) ? candidate : null;
}

export function isPublicMenuHostname(hostname: string | null | undefined) {
  return Boolean(publicMenuSubdomainFromHostname(hostname));
}
