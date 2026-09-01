import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  hasPlatformOperatorPermission,
  normalizePlatformOperatorRole,
  platformOperatorRoleLabel,
  PLATFORM_OPERATOR_ROLES,
  type PlatformOperatorPermission,
  type PlatformOperatorRole,
} from "../src/lib/platform-operators.ts";

const PERMISSIONS: PlatformOperatorPermission[] = [
  "console_read",
  "billing_manage",
  "policy_manage",
  "support_manage",
  "entitlement_manage",
  "operator_manage",
];

test("platform operator roles expose the documented permission matrix", () => {
  const expected: Record<PlatformOperatorRole, PlatformOperatorPermission[]> = {
    owner: PERMISSIONS,
    billing: ["console_read", "billing_manage", "entitlement_manage"],
    support: ["console_read", "support_manage"],
    read_only: ["console_read"],
  };

  for (const role of PLATFORM_OPERATOR_ROLES) {
    for (const permission of PERMISSIONS) {
      assert.equal(hasPlatformOperatorPermission(role, permission), expected[role].includes(permission), `${role} · ${permission}`);
    }
  }
});

test("platform operator role and email normalization is deterministic", () => {
  assert.equal(normalizePlatformOperatorRole(" Billing "), "billing");
  assert.equal(normalizePlatformOperatorRole("OWNER"), "owner");
  assert.equal(normalizePlatformOperatorRole("administrator"), null);
  assert.equal(platformOperatorRoleLabel("read_only"), "Read-only");
});

test("platform operator migration preserves a service-role-only, audited boundary", () => {
  const migration = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", "0077_platform_operators.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.platform_operators/i);
  assert.match(migration, /create table if not exists public\.platform_operator_audit_logs/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.platform_operators,\s*public\.platform_operator_audit_logs\s+from anon, authenticated, public/i);
  assert.match(migration, /grant all on table public\.platform_operators,\s*public\.platform_operator_audit_logs\s+to service_role/i);
  for (const functionName of ["create_platform_operator", "change_platform_operator_role", "revoke_platform_operator"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}.*service_role`, "is"));
  }
  assert.match(migration, /platform_operator_last_owner/i);
});
