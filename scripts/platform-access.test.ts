import assert from "node:assert/strict";
import test from "node:test";
import {
  isComplimentaryAccessCurrent,
  readEffectiveComplimentaryAccess,
  type ComplimentaryAccessGrant,
} from "../src/lib/platform-access.ts";

const AS_OF = Date.parse("2026-08-19T00:00:00.000Z");

function grant(overrides: Partial<ComplimentaryAccessGrant> = {}): ComplimentaryAccessGrant {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    org_id: "00000000-0000-4000-8000-000000000010",
    source: "manual",
    status: "active",
    starts_at: "2026-08-18T00:00:00.000Z",
    ends_at: "2026-08-25T00:00:00.000Z",
    reason: "Support recovery",
    created_by: null,
    created_at: "2026-08-18T00:00:00.000Z",
    revoked_by: null,
    revoked_at: null,
    metadata: {},
    ...overrides,
  };
}

test("a current grant carries access even when the base subscription is paused", () => {
  assert.equal(isComplimentaryAccessCurrent("2026-08-25T00:00:00.000Z", AS_OF), true);
});

test("grant access expires strictly at the end boundary", () => {
  const end = Date.parse("2026-08-25T00:00:00.000Z");
  assert.equal(isComplimentaryAccessCurrent("2026-08-25T00:00:00.000Z", end - 1), true);
  assert.equal(isComplimentaryAccessCurrent("2026-08-25T00:00:00.000Z", end), false);
});

test("effective access ignores revoked and future grants and selects the furthest current end", () => {
  const current = grant({ id: "00000000-0000-4000-8000-000000000001", ends_at: "2026-08-25T00:00:00.000Z" });
  const longer = grant({ id: "00000000-0000-4000-8000-000000000002", ends_at: "2026-09-01T00:00:00.000Z" });
  const revoked = grant({ id: "00000000-0000-4000-8000-000000000003", status: "revoked", ends_at: "2026-12-01T00:00:00.000Z" });
  const future = grant({ id: "00000000-0000-4000-8000-000000000004", starts_at: "2026-08-20T00:00:00.000Z", ends_at: "2026-12-01T00:00:00.000Z" });

  const effective = readEffectiveComplimentaryAccess([current, longer, revoked, future], AS_OF);
  assert.equal(effective?.grantId, longer.id);
  assert.equal(effective?.until, longer.ends_at);
});
