import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlatformSearchQuery } from "../src/lib/platform-search.ts";

test("platform search trims and collapses whitespace", () => {
  assert.equal(normalizePlatformSearchQuery("  Dumala   POS  "), "Dumala POS");
});

test("platform search treats missing values as an empty query", () => {
  assert.equal(normalizePlatformSearchQuery(undefined), "");
  assert.equal(normalizePlatformSearchQuery(null), "");
});

test("platform search bounds the query length", () => {
  assert.equal(normalizePlatformSearchQuery("x".repeat(100)).length, 80);
});
