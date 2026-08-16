import assert from "node:assert/strict";
import test from "node:test";
import { SHARE_IMAGE, socialMetadata } from "../src/lib/page-metadata.ts";

/**
 * The regression these guard: Next resolves `openGraph` and `twitter` by
 * replacement, not by merging field by field. /pricing defined its own blocks,
 * silently lost the inherited image, and shipped announcing
 * `twitter:card: summary_large_image` with nothing behind it — which renders
 * worse than declaring no card at all. Every page goes through socialMetadata
 * so the complete set is always present.
 */
test("socialMetadata always carries a share image", () => {
  const meta = socialMetadata({ title: "T", description: "D", path: "/pricing" });
  assert.deepEqual(meta.openGraph?.images, [SHARE_IMAGE]);
  assert.deepEqual(meta.twitter?.images, [SHARE_IMAGE.url]);
});

test("socialMetadata always carries the keys a replacement would drop", () => {
  const meta = socialMetadata({ title: "T", description: "D", path: "/pricing" });
  const og = meta.openGraph as Record<string, unknown>;
  for (const key of ["type", "siteName", "locale", "title", "description", "url", "images"]) {
    assert.ok(og[key] !== undefined, `openGraph.${key} must be set`);
  }
  assert.equal((meta.twitter as Record<string, unknown>).card, "summary_large_image");
});

test("the share image is a real 1.91:1 card at a stable public path", () => {
  // Not an `opengraph-image` file convention: that URL carries a build hash and
  // only attaches to its own segment.
  assert.equal(SHARE_IMAGE.url, "/share-card.png");
  assert.equal(SHARE_IMAGE.width, 1200);
  assert.equal(SHARE_IMAGE.height, 630);
  assert.ok(SHARE_IMAGE.alt.length > 40, "share image needs real alt text");
});

test("paths stay root-relative so metadataBase resolves them", () => {
  for (const path of ["/", "/pricing", "/signup"]) {
    const meta = socialMetadata({ title: "T", description: "D", path });
    assert.equal((meta.openGraph as Record<string, unknown>).url, path);
  }
});
