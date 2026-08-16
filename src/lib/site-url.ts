/**
 * The canonical public origin, used by every absolute URL the site emits:
 * `metadataBase`, canonical tags, Open Graph URLs, robots.txt, and sitemap.xml.
 *
 * `NEXT_PUBLIC_SITE_URL` is already required on deployed environments for
 * Supabase email-confirmation redirects, so this reuses that value rather than
 * introducing a second host variable that could drift out of sync with it.
 *
 * The fallback matters: a search engine that reads a canonical or sitemap URL
 * pointing at `localhost` will drop the page, so a missing or unparseable value
 * resolves to the production origin instead of to whatever the request came in
 * on. Getting this wrong is silent — the build succeeds and the pages
 * quietly de-index — so the value is validated here rather than at each call.
 */
const PRODUCTION_ORIGIN = "https://dumala.store";

function normalize(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    // `new URL().origin` drops any trailing slash, path, query, and hash, so a
    // configured "https://dumala.store/" and "https://dumala.store" agree.
    const { origin, protocol } = new URL(value.trim());
    return protocol === "https:" || protocol === "http:" ? origin : null;
  } catch {
    return null;
  }
}

export function siteUrl(): string {
  return normalize(process.env.NEXT_PUBLIC_SITE_URL) ?? PRODUCTION_ORIGIN;
}

/** `siteUrl()` with a path appended, for sitemap entries and absolute links. */
export function absoluteUrl(pathname: string): string {
  return `${siteUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
