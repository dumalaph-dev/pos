import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublicMenuHostname,
  isValidPublicMenuSubdomain,
  normalizePublicMenuSubdomain,
  publicMenuHostname,
  publicMenuSubdomainFromHostname,
  publicMenuUrl,
} from "../src/lib/public-menu-domain.ts";

test("normalizes and validates customer menu subdomains", () => {
  assert.equal(normalizePublicMenuSubdomain("  Morning-Ritual  "), "morning-ritual");
  assert.equal(isValidPublicMenuSubdomain("morning-ritual"), true);
  assert.equal(isValidPublicMenuSubdomain("a".repeat(63)), true);
  assert.equal(isValidPublicMenuSubdomain("-morning"), false);
  assert.equal(isValidPublicMenuSubdomain("morning-"), false);
  assert.equal(isValidPublicMenuSubdomain("morning_ritual"), false);
  assert.equal(isValidPublicMenuSubdomain("morning.ritual"), false);
  assert.equal(isValidPublicMenuSubdomain("admin"), false);
  assert.equal(isValidPublicMenuSubdomain("www"), false);
});

test("builds the canonical customer menu hostname and URL", () => {
  assert.equal(publicMenuHostname("Morning-Ritual"), "morning-ritual.dumala.store");
  assert.equal(publicMenuUrl("Morning-Ritual"), "https://morning-ritual.dumala.store");
  assert.equal(publicMenuHostname("admin"), null);
});

test("extracts only a valid one-label dumala.store subdomain", () => {
  assert.equal(publicMenuSubdomainFromHostname("morning-ritual.dumala.store"), "morning-ritual");
  assert.equal(publicMenuSubdomainFromHostname("MORNING-RITUAL.DUMALA.STORE:443"), "morning-ritual");
  assert.equal(publicMenuSubdomainFromHostname("morning-ritual.dumala.store."), "morning-ritual");
  assert.equal(publicMenuSubdomainFromHostname("dumala.store"), null);
  assert.equal(publicMenuSubdomainFromHostname("a.b.dumala.store"), null);
  assert.equal(publicMenuSubdomainFromHostname("admin.dumala.store"), null);
  assert.equal(isPublicMenuHostname("morning-ritual.dumala.store"), true);
  assert.equal(isPublicMenuHostname("dumala.store"), false);
});
