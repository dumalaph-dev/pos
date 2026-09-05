import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizePlatformSchemaBackfill,
  summarizePlatformSchemaDrift,
  schemaDriftStatusLabel,
} from "../src/lib/platform-schema-drift.ts";
import { PLATFORM_SCHEMA_MANIFEST } from "../src/lib/platform-schema-manifest.ts";
import { readMigrationManifest } from "./generate-schema-manifest.mjs";

test("the generated manifest matches supabase/migrations on disk", async () => {
  const onDisk = await readMigrationManifest();
  assert.deepEqual(
    PLATFORM_SCHEMA_MANIFEST.map((entry) => `${entry.version}_${entry.name}`),
    onDisk.map((entry) => `${entry.version}_${entry.name}`),
    "src/lib/platform-schema-manifest.ts is stale. Run: npm run schema:manifest",
  );
  assert.ok(onDisk.length > 0, "expected at least one migration on disk");
});

test("an applied ledger matching the manifest reports in sync", () => {
  const expected = [
    { version: "0001", name: "schema" },
    { version: "0002", name: "rls" },
  ];
  const summary = summarizePlatformSchemaDrift(expected, expected);
  assert.equal(summary.status, "in_sync");
  assert.equal(summary.pending.length, 0);
  assert.equal(summary.unknownRemote.length, 0);
  assert.equal(summary.appliedCount, 2);
  assert.equal(summary.expectedCount, 2);
  assert.equal(summary.latestApplied?.version, "0002");
  assert.ok(summary.rows.every((row) => row.state === "applied"));
  assert.equal(schemaDriftStatusLabel(summary.status), "In sync");
});

test("a migration shipped but never applied is pending, not silently equal", () => {
  const summary = summarizePlatformSchemaDrift(
    [{ version: "0001", name: "schema" }, { version: "0002", name: "rls" }],
    [{ version: "0001", name: "schema" }],
  );
  assert.equal(summary.status, "pending");
  assert.deepEqual(summary.pending.map((entry) => entry.version), ["0002"]);
  assert.equal(summary.unknownRemote.length, 0);
  assert.equal(summary.rows.find((row) => row.version === "0002")?.state, "pending");
});

test("a version applied out of band is reported as unknown remote", () => {
  const summary = summarizePlatformSchemaDrift(
    [{ version: "0001", name: "schema" }],
    [{ version: "0001", name: "schema" }, { version: "0099", name: "hotfix" }],
  );
  assert.equal(summary.status, "unknown_remote");
  assert.deepEqual(summary.unknownRemote.map((entry) => entry.version), ["0099"]);
  assert.equal(summary.rows.find((row) => row.version === "0099")?.state, "unknown_remote");
  assert.equal(summary.appliedCount, 2);
});

test("pending and unknown at once is diverged, not just one of them", () => {
  const summary = summarizePlatformSchemaDrift(
    [{ version: "0001", name: "schema" }, { version: "0002", name: "rls" }],
    [{ version: "0001", name: "schema" }, { version: "0099", name: "hotfix" }],
  );
  assert.equal(summary.status, "diverged");
  assert.deepEqual(summary.pending.map((entry) => entry.version), ["0002"]);
  assert.deepEqual(summary.unknownRemote.map((entry) => entry.version), ["0099"]);
});

test("a renamed applied migration is surfaced rather than treated as equal", () => {
  const summary = summarizePlatformSchemaDrift(
    [{ version: "0001", name: "schema_v2" }],
    [{ version: "0001", name: "schema" }],
  );
  assert.equal(summary.status, "in_sync", "the version is applied, so sync status is unaffected");
  assert.deepEqual(summary.renamed, [{ version: "0001", expectedName: "schema_v2", appliedName: "schema" }]);
});

test("an unreadable ledger reports no_data instead of claiming an unverified sync", () => {
  const summary = summarizePlatformSchemaDrift([{ version: "0001", name: "schema" }], null);
  assert.equal(summary.status, "no_data");
  assert.equal(summary.appliedCount, 0);
  assert.equal(summary.latestApplied, null);
  assert.ok(summary.rows.every((row) => row.state === "pending"));
  assert.equal(summary.pending.length, 0, "pending lists real drift, which an unread ledger cannot establish");
});

test("ordering does not depend on the input order", () => {
  const summary = summarizePlatformSchemaDrift(
    [{ version: "0010", name: "b" }, { version: "0002", name: "a" }],
    [{ version: "0010", name: "b" }, { version: "0002", name: "a" }],
  );
  assert.deepEqual(summary.rows.map((row) => row.version), ["0002", "0010"]);
  assert.equal(summary.latestExpected?.version, "0010");
});

test("backfill readiness clamps and reports the outstanding remainder", () => {
  const rows = summarizePlatformSchemaBackfill([
    { key: "a", label: "A", detail: "", introducedIn: "0033", total: 4, ready: 3 },
    { key: "b", label: "B", detail: "", introducedIn: "0049", total: 0, ready: 0 },
    { key: "c", label: "C", detail: "", introducedIn: "0080", total: 2, ready: 5 },
  ]);
  assert.equal(rows[0].outstanding, 1);
  assert.equal(rows[0].readyPct, 75);
  assert.equal(rows[0].complete, false);
  assert.equal(rows[1].complete, true, "nothing to backfill is complete, not zero percent");
  assert.equal(rows[1].readyPct, 100);
  assert.equal(rows[2].ready, 2, "ready is clamped to total so a stale count cannot exceed 100%");
  assert.equal(rows[2].complete, true);
});
