import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Source-level guards for the public, indexable surface. They read the route
 * files rather than importing them because the routes use the `@/` alias and
 * server-only modules that `node --experimental-strip-types` cannot load.
 *
 * See docs/SEO_AEO_GROWTH_PLAN.md (items 0.9 and 1.5).
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sitemapSource = read("src/app/sitemap.ts");
const legalHrefs = [...read("src/lib/legal-config.ts").matchAll(/href: "(\/legal\/[a-z-]+)"/g)].map((match) => match[1]);
const staticSitemapPaths = [...sitemapSource.matchAll(/absoluteUrl\("(\/[a-z/-]*)"\)/g)].map((match) => match[1]);
const sitemapPaths = [...staticSitemapPaths, ...legalHrefs];

function pageFileFor(path: string) {
  return path === "/" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
}

test("the sitemap covers the known public pages", () => {
  assert.ok(legalHrefs.length >= 6, "legal document links were not found in legal-config.ts");
  for (const path of ["/", "/pricing", "/signup", "/legal"]) {
    assert.ok(staticSitemapPaths.includes(path), `sitemap.ts no longer lists ${path}`);
  }
});

/**
 * A page listed in the sitemap without a self-referencing canonical lets query
 * strings (?utm_source=…, ?ref=…) split its ranking signal across duplicates.
 */
test("every sitemap page declares a canonical equal to its own path", () => {
  for (const path of sitemapPaths) {
    const source = read(pageFileFor(path));
    assert.ok(
      source.includes(`canonical: "${path}"`),
      `${pageFileFor(path)} must set alternates.canonical to "${path}"`,
    );
  }
});

/**
 * llms.txt is quoted by AI answer engines, so a stale price there is repeated
 * as fact. The price must come from the billing catalog, never the source.
 */
test("llms.txt takes prices from the billing catalog, not literals", () => {
  const source = read("src/app/llms.txt/route.ts");
  assert.ok(source.includes("readCachedPlatformBillingCatalog"), "llms.txt must read the billing catalog");
  assert.doesNotMatch(source, /₱\s*\d|PHP\s*\d|\b\d{3,}(?:\.\d{2})?\s*(?:per month|\/mo)/i, "llms.txt must not hard-code a price");
});

test("llms.txt links every public page in the sitemap", () => {
  const source = read("src/app/llms.txt/route.ts");
  for (const path of ["/", "/pricing", "/signup"]) {
    assert.ok(source.includes(`absoluteUrl("${path}")`), `llms.txt must link ${path}`);
  }
  assert.ok(source.includes("legalDocumentLinks"), "llms.txt must list the legal documents from legal-config");
});
