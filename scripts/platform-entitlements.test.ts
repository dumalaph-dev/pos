import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  derivePlatformEntitlementSummary,
  filterPlatformEntitlementSummaries,
  platformEntitlementFilterLabel,
} from "../src/lib/platform-entitlements.ts";
import type { ComplimentaryAccessGrant } from "../src/lib/platform-access.ts";
import type { TrialExtensionRecord } from "../src/lib/platform-trial.ts";

const NOW = Date.parse("2026-09-01T00:00:00.000Z");

function organization(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    name: "Morning Ritual",
    created_at: "2026-08-01T00:00:00.000Z",
    subscription_status: "trialing",
    subscription_plan: "premium",
    subscription_trial_started_at: "2026-08-01T00:00:00.000Z",
    subscription_trial_ends_at: "2026-09-04T00:00:00.000Z",
    subscription_current_period_end: null,
    subscription_billing_mode: "recurring",
    subscription_provider_subscription_id: null,
    subscription_provider_payment_intent_id: null,
    subscription_entitled_branch_count: 1,
    subscription_pending_branch_count: null,
    subscription_updated_at: "2026-08-01T00:00:00.000Z",
    account_status: "active" as const,
    suspension_reason: null,
    suspended_at: null,
    ...overrides,
  };
}

function grant(overrides: Partial<ComplimentaryAccessGrant> = {}): ComplimentaryAccessGrant {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    org_id: "00000000-0000-4000-8000-000000000010",
    source: "support",
    status: "active",
    starts_at: "2026-08-31T00:00:00.000Z",
    ends_at: "2026-09-05T00:00:00.000Z",
    reason: "Support recovery",
    created_by: null,
    created_at: "2026-08-31T00:00:00.000Z",
    revoked_by: null,
    revoked_at: null,
    metadata: {},
    ...overrides,
  };
}

function extension(overrides: Partial<TrialExtensionRecord> = {}): TrialExtensionRecord {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    org_id: "00000000-0000-4000-8000-000000000010",
    days: 7,
    reason: "Onboarding support",
    previous_status: "trialing",
    new_status: "trialing",
    previous_trial_ends_at: "2026-08-28T00:00:00.000Z",
    new_trial_ends_at: "2026-09-04T00:00:00.000Z",
    revived: false,
    created_by: null,
    created_at: "2026-08-28T00:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

test("entitlement summary exposes a near-expiry trial and paid branch capacity", () => {
  const summary = derivePlatformEntitlementSummary({
    organization: organization(),
    activeBranchCount: 1,
    includedBranchCount: 1,
    trialExtensions: [extension()],
    now: NOW,
  });

  assert.equal(summary.accessState, "trial");
  assert.equal(summary.accessLabel, "Live trial");
  assert.ok(summary.filterKeys.includes("in_trial"));
  assert.ok(summary.filterKeys.includes("trial_expiring"));
  assert.equal(summary.paidBranch.entitledCount, 1);
  assert.equal(summary.paidBranch.paidAddOnCount, 0);
  assert.equal(summary.trialExtension.daysUsed, 7);
  assert.ok(summary.timeline.some((item) => item.kind === "trial"));
  assert.ok(summary.timeline.some((item) => item.kind === "trial_extension"));
});

test("a current grant is the effective access reason while the paused billing state remains filterable", () => {
  const summary = derivePlatformEntitlementSummary({
    organization: organization({
      subscription_status: "paused",
      subscription_trial_ends_at: "2026-08-20T00:00:00.000Z",
      subscription_current_period_end: "2026-08-20T00:00:00.000Z",
    }),
    grants: [grant()],
    activeBranchCount: 2,
    includedBranchCount: 1,
    now: NOW,
  });

  assert.equal(summary.accessState, "grant");
  assert.equal(summary.currentGrant?.endsAt, "2026-09-05T00:00:00.000Z");
  assert.ok(summary.filterKeys.includes("on_grant"));
  assert.ok(summary.filterKeys.includes("grant_expiring"));
  assert.ok(summary.filterKeys.includes("paused"));
  assert.equal(summary.paidBranch.entitledCount, 1);
  assert.ok(summary.timeline.some((item) => item.kind === "grant" && item.state === "current"));
});

test("entitlement search and state filters remain deterministic", () => {
  const summaries = [
    derivePlatformEntitlementSummary({ organization: organization(), activeBranchCount: 1, now: NOW }),
    derivePlatformEntitlementSummary({ organization: organization({ id: "00000000-0000-4000-8000-000000000011", name: "Juan Kitchenette", account_status: "suspended" }), activeBranchCount: 1, now: NOW }),
  ];

  assert.equal(filterPlatformEntitlementSummaries(summaries, "juan", "all").length, 1);
  assert.equal(filterPlatformEntitlementSummaries(summaries, "", "suspended").length, 1);
  assert.equal(filterPlatformEntitlementSummaries(summaries, "morning", "suspended").length, 0);
  assert.equal(platformEntitlementFilterLabel("grant_expiring"), "Grant expiring within 7 days");
});

test("adjustment migration keeps grant edits service-role-only and audited", () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0078_adjust_platform_access_grant.sql"), "utf8");
  assert.match(migration, /alter table public\.platform_access_grants[\s\S]*updated_at/i);
  assert.match(migration, /create or replace function public\.adjust_platform_access_grant/i);
  assert.match(migration, /platform\.access_grant\.adjusted/i);
  assert.match(migration, /before[\s\S]*after/i);
  assert.match(migration, /revoke all on function public\.adjust_platform_access_grant[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.adjust_platform_access_grant[\s\S]*to service_role/i);
});
