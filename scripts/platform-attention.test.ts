import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  platformAttentionStateLabel,
  platformAttentionStateTone,
} from "../src/lib/platform-attention.ts";

test("attention state labels preserve the owned-versus-resolved distinction", () => {
  assert.equal(platformAttentionStateLabel("open"), "Open");
  assert.equal(platformAttentionStateLabel("acknowledged"), "Acknowledged");
  assert.equal(platformAttentionStateLabel("snoozed"), "Snoozed");
  assert.equal(platformAttentionStateLabel("resolved"), "Resolved");
  assert.equal(platformAttentionStateTone("acknowledged"), "info");
  assert.equal(platformAttentionStateTone("resolved"), "success");
});

test("attention migration keeps recurrence, source scope, and service-role mutation boundaries", () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0089_platform_attention_occurrences.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.platform_attention_occurrences/i);
  assert.match(migration, /condition_fingerprint\s+text not null/i);
  assert.match(migration, /constraint platform_attention_state_check check \(state in \('open', 'acknowledged', 'snoozed', 'resolved'\)\)/i);
  assert.match(migration, /constraint platform_attention_source_check check \(source in \('billing', 'support', 'sync', 'access', 'readiness'\)\)/i);
  assert.match(migration, /create table if not exists public\.platform_attention_audit_logs/i);
  assert.match(migration, /no_mutate_platform_attention_audit/i);
  assert.match(migration, /create or replace function public\.platform_reconcile_attention/i);
  assert.match(migration, /create or replace function public\.platform_update_attention_occurrence/i);
  assert.match(migration, /platform_attention_version_conflict/i);
  assert.match(migration, /platform_request_id_conflict/i);
  assert.match(migration, /grant execute on function public\.platform_reconcile_attention[\s\S]*service_role/i);
  assert.match(migration, /grant execute on function public\.platform_update_attention_occurrence[\s\S]*service_role/i);
  assert.match(migration, /notify\s+pgrst,\s*'reload schema'/i);
});
