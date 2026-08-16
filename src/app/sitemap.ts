import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Only the two pages a visitor can reach without an account belong here. A
 * sitemap that lists routes which redirect or 404 for anonymous crawlers is
 * treated as a quality signal against the site, so the auth-gated surface is
 * excluded here as well as in robots.ts.
 *
 * `lastModified` is deliberately omitted. It is only useful when it is true,
 * and there is nothing in the app that knows when the marketing copy last
 * changed — deriving it from `new Date()` would claim every page changed on
 * every deploy, which trains crawlers to ignore the field. Add real values if
 * the content ever moves behind a CMS or a dated content collection.
 *
 * Extend this list as the content pages ship (/pricing, the use-case pages).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/pricing"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/signup"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
