import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  FLEET_HEALTH_ERROR_THRESHOLD_PCT,
  fleetHealthSurfaceLabel,
  summarizePlatformFleetHealth,
  type PlatformFleetHealthOrganization,
  type PlatformFleetHealthSample,
} from "../src/lib/platform-fleet-health.ts";

const AS_OF = "2026-09-01T12:00:00.000Z";
const ORGANIZATIONS: PlatformFleetHealthOrganization[] = [
  { id: "org-a", name: "Morning Ritual" },
  { id: "org-b", name: "Juan Kitchenette" },
  { id: "org-c", name: "No Telemetry Cafe" },
];

function sample(overrides: Partial<PlatformFleetHealthSample> = {}): PlatformFleetHealthSample {
  return {
    organizationId: "org-a",
    organizationName: "Morning Ritual",
    surface: "dashboard",
    interaction: "navigation",
    mode: "online",
    sampleType: "initial_document",
    durationMs: 100,
    error: false,
    recordedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

test("fleet health aggregates percentiles, error rate, freshness, and attribution", () => {
  const summary = summarizePlatformFleetHealth([
    sample({ durationMs: 100 }),
    sample({ durationMs: 300, recordedAt: "2026-09-01T09:00:00.000Z" }),
    sample({ organizationId: "org-b", organizationName: "Juan Kitchenette", durationMs: 500, recordedAt: "2026-08-30T06:00:00.000Z" }),
    sample({ organizationId: null, organizationName: null, surface: "orders", durationMs: 200, recordedAt: "2026-09-01T08:00:00.000Z" }),
  ], ORGANIZATIONS, "24h", AS_OF);

  const morningRitual = summary.organizationRows.find((row) => row.organizationId === "org-a");
  const juanKitchenette = summary.organizationRows.find((row) => row.organizationId === "org-b");
  const noTelemetry = summary.organizationRows.find((row) => row.organizationId === "org-c");
  const unattributed = summary.organizationRows.find((row) => row.organizationId === null);

  assert.equal(summary.overall.sampleCount, 3);
  assert.equal(summary.attributedSampleCount, 2);
  assert.equal(summary.unattributedSampleCount, 1);
  assert.equal(morningRitual?.p50DurationMs, 200);
  assert.equal(morningRitual?.p95DurationMs, 290);
  assert.equal(morningRitual?.status, "healthy");
  assert.equal(juanKitchenette?.status, "no_data");
  assert.equal(noTelemetry?.status, "no_data");
  assert.equal(unattributed?.organizationName, "Unattributed history");
  assert.equal(fleetHealthSurfaceLabel("soft_navigation"), "Soft Navigation");
});

test("fleet health flags error-heavy and stale organizations without inventing data", () => {
  const summary = summarizePlatformFleetHealth([
    sample({ error: true, durationMs: 100 }),
    sample({ error: false, durationMs: 200, recordedAt: "2026-09-01T11:00:00.000Z" }),
    sample({ organizationId: "org-b", organizationName: "Juan Kitchenette", durationMs: 300, recordedAt: "2026-08-31T11:00:00.000Z" }),
  ], ORGANIZATIONS, "7d", AS_OF);
  const morningRitual = summary.organizationRows.find((row) => row.organizationId === "org-a");
  const juanKitchenette = summary.organizationRows.find((row) => row.organizationId === "org-b");

  assert.equal(morningRitual?.errorRatePct, 50);
  assert.equal(morningRitual?.status, "needs_attention");
  assert.equal(morningRitual?.errorRatePct >= FLEET_HEALTH_ERROR_THRESHOLD_PCT, true);
  assert.equal(juanKitchenette?.status, "stale");
  assert.equal(summary.overall.sampleCount, 3);
});

test("fleet health reader and migration keep telemetry scoped and legacy-safe", () => {
  const reader = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "_lib", "platform-data.ts"), "utf8");
  const route = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "api", "admin", "performance", "route.ts"), "utf8");
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0079_scope_admin_performance_to_organizations.sql"), "utf8");
  assert.match(reader, /from\("admin_performance_samples"\)[\s\S]*select\("id, org_id, recorded_at, surface, interaction, mode, sample_type, duration_ms, error"/i);
  assert.match(reader, /from\("organizations"\)\.select\("id, name"\)/i);
  assert.match(reader, /summarizePlatformFleetHealth\(samples, organizations, window, asOf\)/i);
  assert.match(route, /\.from\("profiles"\)[\s\S]*\.select\("org_id"\)[\s\S]*\.eq\("id", user\.id\)/i);
  assert.match(route, /org_id: organizationId/);
  assert.doesNotMatch(route, /parsed\.org_id|parsed\.organization_id/);
  assert.match(migration, /add column if not exists org_id uuid references public\.organizations\(id\) on delete set null/i);
  assert.match(migration, /org_id is null or org_id = auth_org_id\(\)/i);
});
