/**
 * The canonical public origin, used by every absolute URL the site emits:
 * `metadataBase`, canonical tags, Open Graph URLs, robots.txt, and sitemap.xml.
 *
 * `NEXT_PUBLIC_SITE_URL` is already required on deployed environments for
 * Supabase email-confirmation redirects, so this reuses that value rather than
 * introducing a second host variable that could drift out of sync with it —
 * but only when it names a real public host. See `isDeploymentHost` below.
 *
 * The fallback matters: a search engine that reads a canonical or sitemap URL
 * pointing at `localhost` will drop the page, so a missing or unparseable value
 * resolves to the production origin instead of to whatever the request came in
 * on. Getting this wrong is silent — the build succeeds and the pages
 * quietly de-index — so the value is validated here rather than at each call.
 */
const PRODUCTION_ORIGIN = "https://dumala.store";

/**
 * Vercel's generated deployment domains are not a canonical identity.
 *
 * `NEXT_PUBLIC_SITE_URL` is overloaded — it also drives Supabase signup
 * redirects (app/signup/actions.ts) and the PayMongo webhook origin — and in
 * this project's Vercel environment it is set to the generated
 * `*.vercel.app` host. That is harmless for a redirect target and actively
 * dangerous as a canonical: dumala.store shipped
 * `<link rel="canonical" href="https://pos-mu-pearl.vercel.app">`, which tells
 * search engines the brand domain is the duplicate and the deployment domain is
 * the original. Both hosts answer 200, so there was nothing else to break the
 * tie.
 *
 * Rejecting the generated host here means the canonical stays correct no matter
 * what the deploy environment sets, rather than depending on a dashboard value
 * that nothing in the build validates.
 */
function isDeploymentHost(hostname: string): boolean {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
}

function normalize(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    // `new URL().origin` drops any trailing slash, path, query, and hash, so a
    // configured "https://dumala.store/" and "https://dumala.store" agree.
    const { origin, protocol, hostname } = new URL(value.trim());
    if (protocol !== "https:" && protocol !== "http:") return null;
    if (isDeploymentHost(hostname)) return null;
    return origin;
  } catch {
    return null;
  }
}

/**
 * The pure half of {@link siteUrl}, separated so the fallback rules can be
 * tested directly instead of through `process.env` and module-cache juggling.
 */
export function resolveSiteUrl(configured: string | undefined): string {
  return normalize(configured) ?? PRODUCTION_ORIGIN;
}

export function siteUrl(): string {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

/** `siteUrl()` with a path appended, for sitemap entries and absolute links. */
export function absoluteUrl(pathname: string): string {
  return `${siteUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
