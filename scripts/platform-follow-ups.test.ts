import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  platformFollowUpIsOpen,
  platformFollowUpSourceLabel,
  platformFollowUpStatusLabel,
} from "../src/lib/platform-follow-ups.ts";

test("follow-up status and source labels remain deterministic", () => {
  assert.equal(platformFollowUpStatusLabel("open"), "Open");
  assert.equal(platformFollowUpStatusLabel("in_progress"), "In progress");
  assert.equal(platformFollowUpStatusLabel("completed"), "Completed");
  assert.equal(platformFollowUpSourceLabel("trial_feedback"), "Trial feedback");
  assert.equal(platformFollowUpIsOpen("open"), true);
  assert.equal(platformFollowUpIsOpen("in_progress"), true);
  assert.equal(platformFollowUpIsOpen("completed"), false);
  assert.equal(platformFollowUpIsOpen("cancelled"), false);
});

test("follow-up migration keeps task data private, auditable, and idempotent", () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0093_platform_follow_up_tasks.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.platform_follow_up_tasks/i);
  assert.match(migration, /create table if not exists public\.platform_follow_up_task_audit_logs/i);
  assert.match(migration, /enable row level security/i);
  const normalized = migration.replaceAll("\r", " ").replaceAll("\n", " ").replace(/ +/g, " ");
  assert.match(normalized, /revoke all on table public\.platform_follow_up_tasks, public\.platform_follow_up_task_audit_logs from anon, authenticated, public/i);
  assert.match(normalized, /grant all on table public\.platform_follow_up_tasks, public\.platform_follow_up_task_audit_logs to service_role/i);
  assert.match(migration, /platform_mutation_requests/i);
  assert.match(migration, /platform_follow_up_task_version_conflict/i);
  assert.match(migration, /role in \('owner', 'support'\)/i);
  assert.match(migration, /notify pgrst,\s*'reload schema'/i);
});

test("the organization workspace uses the dedicated account-success permission", () => {
  const page = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "(console)", "organizations", "[orgId]", "page.tsx"), "utf8");
  const actions = fs.readFileSync(path.resolve(process.cwd(), "src", "app", "platform", "follow-up-actions.ts"), "utf8");
  assert.match(page, /account_success_manage/);
  assert.match(page, /PlatformFollowUpOperations/);
  assert.match(actions, /requirePlatformOperator\("account_success_manage"\)/g);
  assert.match(actions, /\+08:00/);
});
