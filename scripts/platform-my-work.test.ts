import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  platformMyWorkSeverityLabel,
  platformMyWorkSourceLabel,
  sortPlatformMyWorkItems,
  type PlatformMyWorkItem,
} from "../src/lib/platform-my-work.ts";

const item = (overrides: Partial<PlatformMyWorkItem>): PlatformMyWorkItem => ({
  id: "1",
  source: "follow_up",
  title: "Task",
  detail: "Detail",
  organizationId: null,
  organizationName: null,
  status: "open",
  severity: "medium",
  dueAt: null,
  updatedAt: "2026-09-23T00:00:00.000Z",
  href: "/platform/attention",
  ...overrides,
});

test("My work labels and ordering remain deterministic", () => {
  assert.equal(platformMyWorkSourceLabel("follow_up"), "Follow-up");
  assert.equal(platformMyWorkSourceLabel("support_case"), "Support case");
  assert.equal(platformMyWorkSeverityLabel("critical"), "Critical");
  const sorted = sortPlatformMyWorkItems([
    item({ id: "no-due", severity: "medium", dueAt: null }),
    item({ id: "urgent", source: "attention", severity: "critical", dueAt: "2026-09-23T02:00:00.000Z" }),
    item({ id: "soon", severity: "medium", dueAt: "2026-09-23T01:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((entry) => entry.id), ["urgent", "soon", "no-due"]);
});

test("My work reader and Home surface preserve source boundaries", () => {
  const reader = fs.readFileSync(path.resolve(process.cwd(), "src", "lib", "platform-my-work-server.ts"), "utf8");
  const page = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "(console)", "page.tsx"), "utf8");
  assert.match(reader, /eq\("assignee_id", operatorId\)/);
  assert.match(reader, /eq\("assigned_to", operatorId\)/);
  assert.match(reader, /limit\(51\)/);
  assert.match(reader, /sortPlatformMyWorkItems/);
  assert.match(page, /readPlatformMyWork/);
  assert.match(page, /<PlatformMyWork work=\{myWork\}/);
});
