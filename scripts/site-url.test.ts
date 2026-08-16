import assert from "node:assert/strict";
import test from "node:test";
import { absoluteUrl, resolveSiteUrl } from "../src/lib/site-url.ts";

const PRODUCTION_ORIGIN = "https://dumala.store";

test("canonical origin never resolves to a Vercel deployment domain", () => {
  // The regression this guards: production had NEXT_PUBLIC_SITE_URL set to the
  // generated deployment host, so dumala.store served
  // <link rel="canonical" href="https://pos-mu-pearl.vercel.app"> — telling
  // search engines the brand domain was the duplicate. Both hosts answer 200,
  // so nothing else broke the tie.
  assert.equal(resolveSiteUrl("https://pos-mu-pearl.vercel.app"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("https://pos-git-main-someorg.vercel.app"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("https://vercel.app"), PRODUCTION_ORIGIN);
});

test("a real public host is still honoured", () => {
  assert.equal(resolveSiteUrl("https://dumala.store"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("https://staging.dumala.store"), "https://staging.dumala.store");
  // Not every host containing "vercel" is a deployment domain.
  assert.equal(resolveSiteUrl("https://vercelstore.ph"), "https://vercelstore.ph");
});

test("origins are normalized to scheme and host only", () => {
  assert.equal(resolveSiteUrl("https://dumala.store/"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("https://dumala.store/some/path?a=1#b"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("  https://dumala.store  "), PRODUCTION_ORIGIN);
});

test("unusable values fall back instead of emitting a bad canonical", () => {
  assert.equal(resolveSiteUrl(undefined), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl(""), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("   "), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("not a url"), PRODUCTION_ORIGIN);
  assert.equal(resolveSiteUrl("ftp://dumala.store"), PRODUCTION_ORIGIN);
});

test("absoluteUrl joins paths against the resolved origin", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    // siteUrl() reads the environment at call time, so this needs no re-import.
    process.env.NEXT_PUBLIC_SITE_URL = "https://pos-mu-pearl.vercel.app";
    assert.equal(absoluteUrl("/sitemap.xml"), `${PRODUCTION_ORIGIN}/sitemap.xml`);
    assert.equal(absoluteUrl("sitemap.xml"), `${PRODUCTION_ORIGIN}/sitemap.xml`);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original;
  }
});
