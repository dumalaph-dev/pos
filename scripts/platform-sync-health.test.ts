import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PLATFORM_SYNC_HEALTH_STALE_AFTER_MS,
  PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS,
  summarizePlatformSyncHealth,
  type PlatformSyncHealthOrganization,
  type PlatformSyncHealthSample,
  type PlatformSyncHealthStore,
} from "../src/lib/platform-sync-health.ts";

const AS_OF = "2026-09-01T12:00:00.000Z";
const ORGANIZATIONS: PlatformSyncHealthOrganization[] = [
  { id: "org-a", name: "Morning Ritual" },
  { id: "org-b", name: "Juan Kitchenette" },
  { id: "org-c", name: "No Telemetry Cafe" },
  { id: "org-d", name: "Stale Reporter Cafe" },
];
const STORES: PlatformSyncHealthStore[] = [
  { id: "store-a1", organizationId: "org-a", name: "Makati", isActive: true },
  { id: "store-a2", organizationId: "org-a", name: "BGC", isActive: true },
  { id: "store-b1", organizationId: "org-b", name: "Cebu", isActive: true },
  { id: "store-c1", organizationId: "org-c", name: "Davao", isActive: true },
  { id: "store-d1", organizationId: "org-d", name: "Iloilo", isActive: true },
  { id: "store-inactive", organizationId: "org-a", name: "Closed", isActive: false },
];

function sample(overrides: Partial<PlatformSyncHealthSample> = {}): PlatformSyncHealthSample {
  return {
    organizationId: "org-a",
    storeId: "store-a1",
    deviceKey: "device-a-001",
    queue: "orders",
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    stuckCount: 0,
    oldestPendingAt: null,
    lastSuccessfulSyncAt: null,
    online: true,
    recordedAt: "2026-09-01T11:59:00.000Z",
    ...overrides,
  };
}

test("sync health aggregates the latest queue snapshot by organization and branch", () => {
  const summary = summarizePlatformSyncHealth([
    sample({ pendingCount: 99, failedCount: 1, oldestPendingAt: "2026-09-01T10:00:00.000Z", recordedAt: "2026-09-01T10:00:00.000Z" }),
    sample({ pendingCount: 2, failedCount: 1, stuckCount: 1, oldestPendingAt: "2026-09-01T11:40:00.000Z", lastSuccessfulSyncAt: "2026-09-01T11:58:00.000Z" }),
    sample({ queue: "audit", deviceKey: "device-a-001", lastSuccessfulSyncAt: "2026-09-01T11:57:00.000Z" }),
    sample({ queue: "admin_mutations", deviceKey: "device-a-002", pendingCount: 4, stuckCount: 2, conflictCount: 2, online: false, oldestPendingAt: "2026-09-01T11:55:00.000Z", recordedAt: "2026-09-01T11:58:00.000Z" }),
    sample({ storeId: "store-a2", deviceKey: "device-a2-001", queue: "audit" }),
    sample({ organizationId: "org-b", storeId: "store-b1", deviceKey: "device-b-001", pendingCount: 1, oldestPendingAt: "2026-09-01T11:00:00.000Z", recordedAt: "2026-09-01T11:20:00.000Z" }),
    sample({ organizationId: "org-d", storeId: "store-d1", deviceKey: "device-d-001", recordedAt: "2026-09-01T11:29:59.000Z" }),
    sample({ storeId: "store-inactive", deviceKey: "device-closed" }),
    sample({ storeId: "store-a1", deviceKey: "device-future", recordedAt: "2026-09-01T12:01:00.000Z" }),
  ], ORGANIZATIONS, STORES, AS_OF);

  const makati = summary.branchRows.find((row) => row.storeId === "store-a1");
  const bgc = summary.branchRows.find((row) => row.storeId === "store-a2");
  const cebu = summary.branchRows.find((row) => row.storeId === "store-b1");
  const davao = summary.branchRows.find((row) => row.storeId === "store-c1");
  const iloilo = summary.branchRows.find((row) => row.storeId === "store-d1");

  assert.equal(makati?.pendingCount, 6);
  assert.equal(makati?.failedCount, 1);
  assert.equal(makati?.conflictCount, 2);
  assert.equal(makati?.stuckCount, 3);
  assert.equal(makati?.lastSuccessfulSyncAt, "2026-09-01T11:58:00.000Z");
  assert.equal(makati?.status, "needs_attention");
  assert.equal(makati?.freshness, "fresh");
  assert.equal(bgc?.status, "healthy");
  assert.equal(cebu?.status, "needs_attention");
  assert.equal(davao?.status, "no_data");
  assert.equal(iloilo?.status, "stale");
  assert.equal(summary.branchRows.some((row) => row.storeId === "store-inactive"), false);
  assert.equal(summary.healthyBranchCount, 1);
  assert.equal(summary.attentionBranchCount, 2);
  assert.equal(summary.staleBranchCount, 1);
  assert.equal(summary.noDataBranchCount, 1);
  assert.equal(summary.organizationRows.find((row) => row.organizationId === "org-a")?.status, "needs_attention");
  assert.equal(summary.organizationRows.find((row) => row.organizationId === "org-c")?.status, "no_data");
  assert.equal(summary.overall.pendingCount, 7);
  assert.equal(summary.overall.stuckCount, 3);
  assert.equal(summary.overall.lastSuccessfulSyncAt, "2026-09-01T11:58:00.000Z");
});

test("sync health applies strict stuck and stale thresholds", () => {
  const stuckAt = new Date(Date.parse(AS_OF) - PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS - 1).toISOString();
  const staleAt = new Date(Date.parse(AS_OF) - PLATFORM_SYNC_HEALTH_STALE_AFTER_MS - 1).toISOString();
  const summary = summarizePlatformSyncHealth([
    sample({ storeId: "store-a1", deviceKey: "device-stuck", pendingCount: 1, oldestPendingAt: stuckAt }),
    sample({ storeId: "store-a2", deviceKey: "device-stale", queue: "audit", recordedAt: staleAt }),
  ], ORGANIZATIONS, STORES, AS_OF);

  assert.equal(summary.branchRows.find((row) => row.storeId === "store-a1")?.status, "needs_attention");
  assert.equal(summary.branchRows.find((row) => row.storeId === "store-a1")?.freshness, "fresh");
  assert.equal(summary.branchRows.find((row) => row.storeId === "store-a2")?.status, "stale");
  assert.equal(summary.branchRows.find((row) => row.storeId === "store-a2")?.freshness, "stale");
});

test("sync health reader, reporter, migration, and viewer preserve the telemetry boundary", () => {
  const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
  const reader = read("src/app/platform/_lib/platform-data.ts");
  const route = read("src/app/api/admin/sync-health/route.ts");
  const client = read("src/lib/sync-health-client.ts");
  const offline = read("src/lib/offline.ts");
  const adminOutbox = read("src/lib/admin/local-first-store.ts");
  const viewer = read("src/app/platform/PlatformSyncHealthViewer.tsx");
  const migration = read("supabase/migrations/0080_sync_health_snapshots.sql");
  const enhancedMigration = read("supabase/migrations/0081_sync_health_enhanced_metrics.sql");

  assert.match(reader, /from\("admin_sync_health_snapshots"\)[\s\S]*pending_count, failed_count, conflict_count, stuck_count[\s\S]*last_successful_sync_at/i);
  assert.match(reader, /summarizePlatformSyncHealth\(samples, organizations, stores, asOf\)/i);
  assert.match(route, /\.from\("profiles"\)[\s\S]*\.select\("org_id"\)[\s\S]*\.eq\("id", user\.id\)/i);
  assert.match(route, /\.from\("stores"\)[\s\S]*\.eq\("org_id", organizationId\)/i);
  assert.match(route, /\.upsert\(/i);
  assert.match(route, /stuck_count/i);
  assert.match(route, /sync_succeeded/i);
  assert.doesNotMatch(route, /parsed\.(org_id|organization_id)/i);
  assert.match(client, /getDeviceId\(\)/i);
  assert.match(client, /\/api\/admin\/sync-health/i);
  assert.match(offline, /getOfflineQueueHealth/i);
  assert.match(adminOutbox, /getAdminMutationHealth/i);
  assert.match(viewer, /Search organizations or branches/i);
  assert.match(viewer, /Freshness/i);
  assert.match(viewer, /Stuck outbox/i);
  assert.match(viewer, /Last successful sync/i);
  assert.match(viewer, /View queues/i);
  assert.doesNotMatch(viewer, /customer_(name|phone|email)|order_(items|payload|customer)/i);
  assert.match(migration, /create table if not exists admin_sync_health_snapshots/i);
  assert.match(migration, /unique \(org_id, store_id, device_key, queue\)/i);
  assert.match(migration, /alter table admin_sync_health_snapshots enable row level security/i);
  assert.match(migration, /revoke select, delete on admin_sync_health_snapshots from anon, authenticated/i);
  assert.match(migration, /org_id = auth_org_id\(\)/i);
  assert.match(migration, /stores\.id = auth_store_id\(\) or auth_is_admin\(\)/i);
  assert.match(enhancedMigration, /add column if not exists stuck_count integer not null default 0/i);
  assert.match(enhancedMigration, /add column if not exists last_successful_sync_at timestamptz/i);
  assert.match(enhancedMigration, /admin_sync_health_stuck_not_above_pending/i);
  assert.match(enhancedMigration, /preserve_admin_sync_health_success/i);
  assert.match(enhancedMigration, /new\.last_successful_sync_at is null/i);
});
