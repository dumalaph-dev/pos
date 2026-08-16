import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

/**
 * Crawl rules for the public site.
 *
 * Everything behind auth is disallowed rather than merely `noindex`ed. Those
 * routes answer 307 to an anonymous request (`/admin`, `/pos`, `/products`,
 * `/account`, `/setup` redirect to `/login` or `/`), so every crawl of one is
 * budget spent to be told to go somewhere else. A `Disallow` stops the request
 * from being made at all.
 *
 * `noindex` still ships on the pages that return 200 to anonymous visitors —
 * see the `robots` metadata on /login, /display, /trial-preview, and the staff
 * and platform login routes. The two mechanisms do different jobs: `Disallow`
 * prevents crawling, `noindex` prevents indexing. A page that is only
 * disallowed can still be indexed from an external link, because the crawler
 * never fetches the page and so never sees the `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/pos",
        "/products",
        "/account/",
        "/setup",
        "/platform/",
        "/display",
        "/trial-preview",
        "/staff/",
        "/store/",
        "/api/",
        "/auth/",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl(),
  };
}
