import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { filterPlatformDevices, summarizePlatformDevices, type PlatformRegisteredDevice } from "../src/lib/platform-devices.ts";
import { PLATFORM_SYNC_HEALTH_STALE_AFTER_MS, type PlatformSyncHealthSample } from "../src/lib/platform-sync-health.ts";

const AS_OF = "2026-09-14T12:00:00.000Z";
const organizations = [{ id: "org-a", name: "Morning Ritual" }, { id: "org-b", name: "Kitchenette" }];
const stores = [
  { id: "a1", organizationId: "org-a", name: "Main", isActive: true },
  { id: "a2", organizationId: "org-a", name: "Closed", isActive: false },
  { id: "b1", organizationId: "org-b", name: "Main", isActive: true },
  { id: "b2", organizationId: "org-b", name: "Empty", isActive: true },
];
const device = (overrides: Partial<PlatformRegisteredDevice> = {}): PlatformRegisteredDevice => ({
  id: "registered-1", organizationId: "org-a", storeId: "a1", name: "Front counter", devicePrefix: "T1", isActive: true, lastSeenAt: AS_OF, ...overrides,
});
const sample = (overrides: Partial<PlatformSyncHealthSample> = {}): PlatformSyncHealthSample => ({
  organizationId: "org-a", storeId: "a1", deviceKey: "D12345678", queue: "orders", pendingCount: 0, failedCount: 0,
  conflictCount: 0, stuckCount: 0, oldestPendingAt: null, lastSuccessfulSyncAt: null, online: true, recordedAt: AS_OF, ...overrides,
});

test("registered last-seen activity does not invent telemetry or associate a different browser ID", () => {
  const summary = summarizePlatformDevices([sample()], organizations, stores, [device()], AS_OF);
  assert.equal(summary.rows.length, 2);
  const registered = summary.rows.find((row) => row.device);
  assert.equal(registered?.status, "no_data");
  assert.equal(registered?.lastReportedAt, null);
  assert.equal(registered?.lastSuccessfulSyncAt, null);
  assert.equal(registered?.deviceKey, null);
  assert.equal(summary.rows.find((row) => !row.device)?.status, "healthy");
  assert.equal(summary.branches.find((branch) => branch.id === "b2")?.entryCount, 0);
});

test("exact prefix matches are scoped to both organization and branch", () => {
  const summary = summarizePlatformDevices([
    sample({ pendingCount: 2 }),
    sample({ organizationId: "org-b", storeId: "b1", pendingCount: 3 }),
    sample({ storeId: "a2", pendingCount: 4 }),
  ], organizations, stores, [device({ devicePrefix: "D12345678" })], AS_OF);
  assert.equal(summary.rows.length, 3);
  assert.equal(summary.rows.find((row) => row.device)?.pendingCount, 2);
  assert.equal(summary.rows.find((row) => row.organizationId === "org-b")?.pendingCount, 3);
  assert.equal(new Set(summary.rows.map((row) => row.key)).size, 3);
});

test("latest queue snapshots deduplicate without a fresh queue hiding a stale one", () => {
  const staleAt = new Date(Date.parse(AS_OF) - PLATFORM_SYNC_HEALTH_STALE_AFTER_MS - 1).toISOString();
  const summary = summarizePlatformDevices([
    sample({ recordedAt: "2026-09-14T10:00:00Z", pendingCount: 99 }),
    sample({ recordedAt: staleAt, pendingCount: 2, lastSuccessfulSyncAt: staleAt }),
    sample({ queue: "admin_mutations", lastSuccessfulSyncAt: AS_OF }),
    sample({ deviceKey: "future", recordedAt: "2026-09-14T12:01:00Z" }),
    sample({ deviceKey: "invalid", recordedAt: "invalid" }),
  ], organizations, stores, [], AS_OF);
  assert.equal(summary.rows.length, 1);
  const row = summary.rows[0];
  assert.equal(row.pendingCount, 2);
  assert.equal(row.status, "stale");
  assert.equal(row.freshness, "stale");
  assert.equal(row.lastReportedAt, AS_OF);
  assert.equal(row.lastSuccessfulSyncAt, AS_OF);
  assert.equal(row.queues.find((queue) => queue.queue === "orders")?.lastSuccessfulSyncAt, staleAt);
});

test("failed stale work keeps both attention and stale signals, while age alone detects stuck work", () => {
  const summary = summarizePlatformDevices([
    sample({ recordedAt: "2026-09-14T10:00:00Z", pendingCount: 2, failedCount: 1 }),
    sample({ deviceKey: "old-work", pendingCount: 1, oldestPendingAt: "2026-09-14T11:40:00Z" }),
    sample({ deviceKey: "offline-browser", online: false }),
  ], organizations, stores, [], AS_OF);
  assert.equal(summary.rows.every((row) => row.status === "needs_attention"), true);
  assert.equal(summary.rows.find((row) => row.deviceKey === "D12345678")?.freshness, "stale");
});

test("filters combine branch, case-insensitive identity search, health and inactive visibility", () => {
  const { rows } = summarizePlatformDevices([sample({ storeId: "a2" }), sample({ storeId: "b1", organizationId: "org-b" })], organizations, stores, [
    device(), device({ id: "inactive", devicePrefix: "T2", isActive: false }),
  ], AS_OF);
  const all = { search: "", status: "all", branch: "all", includeInactive: false };
  assert.equal(filterPlatformDevices(rows, all).length, 2);
  assert.equal(filterPlatformDevices(rows, { ...all, includeInactive: true }).length, 4);
  assert.equal(filterPlatformDevices(rows, { ...all, branch: "a1", search: " FRONT counter ", status: "no_data" }).length, 1);
  assert.equal(filterPlatformDevices(rows, { ...all, search: "d12345678", branch: "b1" }).length, 1);
  assert.equal(filterPlatformDevices(rows, { ...all, search: "missing" }).length, 0);
});

test("device route is operator-gated and inventory query excludes connection settings and payloads", () => {
  const page = fs.readFileSync("src/app/platform/(console)/devices/page.tsx", "utf8");
  assert.ok(page.indexOf('requirePlatformOperator("console_read")') < page.indexOf("readPlatformDevices(actor.admin)"));
  assert.match(page, /redirect\("\/platform\/login"\)/);
  const reader = fs.readFileSync("src/app/platform/_lib/platform-data.ts", "utf8").split("export async function readPlatformDevices")[1].split("export async function readPlatformSchemaDrift")[0];
  assert.match(reader, /select\("id, org_id, store_id, name, device_prefix, is_active, last_seen_at"/);
  assert.doesNotMatch(reader, /printer_config|paired_display_id|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});
