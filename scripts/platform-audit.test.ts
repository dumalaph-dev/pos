import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  filterPlatformAuditEvents,
  platformAuditActionLabel,
  platformAuditDateFilterLabel,
  platformAuditSourceFilterLabel,
  type PlatformAuditEvent,
} from "../src/lib/platform-audit.ts";

const AS_OF = "2026-09-01T12:00:00.000Z";

function event(overrides: Partial<PlatformAuditEvent> = {}): PlatformAuditEvent {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    source: "organization",
    organizationId: "00000000-0000-4000-8000-000000000010",
    organizationName: "Morning Ritual",
    action: "platform.organization.suspended",
    entity: "organizations",
    entityId: "00000000-0000-4000-8000-000000000010",
    actorId: "00000000-0000-4000-8000-000000000100",
    actorEmail: "owner@example.com",
    before: { account_status: "active" },
    after: { account_status: "suspended" },
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

test("platform audit labels stay readable for known and unknown actions", () => {
  assert.equal(platformAuditActionLabel("platform.access_grant.adjusted"), "Access grant adjusted");
  assert.equal(platformAuditActionLabel("platform.custom_action.completed"), "Custom Action Completed");
  assert.equal(platformAuditDateFilterLabel("7d"), "Last 7 days");
  assert.equal(platformAuditSourceFilterLabel("operator"), "Operator membership");
});

test("platform audit filters combine source, action, organization, search, and time window", () => {
  const events = [
    event(),
    event({
      id: "00000000-0000-4000-8000-000000000002",
      source: "operator",
      organizationId: null,
      organizationName: "Platform-wide",
      action: "platform.operator.invited",
      entity: "platform_operators",
      entityId: "00000000-0000-4000-8000-000000000101",
      actorEmail: "owner@example.com",
      createdAt: "2026-08-20T10:00:00.000Z",
    }),
    event({
      id: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000011",
      organizationName: "Juan Kitchenette",
      action: "platform.access_grant.adjusted",
      createdAt: "2026-09-01T11:00:00.000Z",
    }),
  ];

  assert.equal(filterPlatformAuditEvents(events, { search: "juan", asOf: AS_OF }).length, 1);
  assert.equal(filterPlatformAuditEvents(events, { source: "operator", asOf: AS_OF }).length, 1);
  assert.equal(filterPlatformAuditEvents(events, { action: "platform.access_grant.adjusted", organizationId: "00000000-0000-4000-8000-000000000011", asOf: AS_OF }).length, 1);
  assert.equal(filterPlatformAuditEvents(events, { dateRange: "24h", asOf: AS_OF }).length, 2);
  assert.equal(filterPlatformAuditEvents(events, { dateRange: "7d", asOf: AS_OF }).length, 2);
});

test("platform audit reader is scoped to platform actions and avoids tenant activity", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "_lib", "platform-data.ts"), "utf8");
  assert.match(source, /from\("audit_logs"\)[\s\S]*like\("action", "platform\.%"\)/i);
  assert.match(source, /from\("platform_operator_audit_logs"\)/i);
  assert.match(source, /select\("id, org_id, actor_id, action, entity, entity_id, before, after, created_at"\)/i);
});
