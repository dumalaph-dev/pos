import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  BRANCH_ENTITLEMENT_SCHEMA_FILE,
  parseLinkedSchemaResult,
  printPreflightResult,
  runLinkedSchemaQuery,
  runProductionPreflight,
  SUPABASE_CLI_VERSION,
} from "./production-preflight.mjs";

const PROJECT_REF = "uzavkjftwcuixidxyopr";
const ROOT = process.cwd();
const BASE_ENV = {
  NODE_ENV: "test" as const,
  NEXT_PUBLIC_SITE_URL: "https://dumala.store",
  NEXT_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  EXPECTED_SUPABASE_PROJECT_REF: PROJECT_REF,
};

function healthyFetch() {
  return (async (url: string | URL | Request) => {
    const pathname = new URL(String(url)).pathname;
    const body = pathname === "/manifest.webmanifest"
      ? JSON.stringify({ display: "standalone", name: "Dumala POS" })
      : "<html>public-menu</html>";
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

function runWithSchemaResult(stdout: string) {
  return runProductionPreflight({
    args: ["--remote"],
    cwd: ROOT,
    env: BASE_ENV,
    fetchImpl: healthyFetch(),
    linkedSchemaQuery: async () => ({ ok: true, stdout, stderr: "" }),
    linkedProjectRefReader: () => PROJECT_REF,
    log: () => {},
  });
}

test("the linked schema command uses a read-only SQL file and the linked project", async () => {
  let invocation: { executable: string; args: string[]; options: Record<string, unknown> } | null = null;
  const result = await runLinkedSchemaQuery({
    cwd: ROOT,
    env: BASE_ENV,
    execute: (async (executable: string, args: string[], options: Record<string, unknown>) => {
      invocation = { executable, args, options };
      return { stdout: JSON.stringify({ rows: [{ schema_ready: true, missing_objects: "" }] }), stderr: "" };
    }) as never,
  });

  assert.equal(result.ok, true);
  if (!invocation) throw new Error("linked schema command was not invoked");
  const capturedInvocation = invocation as { executable: string; args: string[]; options: Record<string, unknown> };
  assert.deepEqual(capturedInvocation.args, [
    "--yes",
    `supabase@${SUPABASE_CLI_VERSION}`,
    "db",
    "query",
    "--linked",
    "--agent",
    "yes",
    "--file",
    BRANCH_ENTITLEMENT_SCHEMA_FILE,
    "--output",
    "json",
  ]);
  assert.equal(capturedInvocation.options.cwd, ROOT);
  assert.equal(capturedInvocation.options.windowsHide, true);
  assert.equal(capturedInvocation.options.shell, process.platform === "win32");
});

test("the migration 0070 schema check is catalog-only", () => {
  const sql = fs.readFileSync(path.resolve(ROOT, BRANCH_ENTITLEMENT_SCHEMA_FILE), "utf8");
  const executableSql = sql
    .replace(/--[^\r\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(sql, /migration 0070/i);
  assert.match(sql, /subscription_entitled_branch_count/);
  assert.match(sql, /subscription_pending_branch_count/);
  assert.match(sql, /enforce_active_branch_entitlement/);
  assert.match(sql, /information_schema\.columns/);
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|begin|commit|rollback)\b/i);
});

test("a complete linked schema makes branch checkout ready", async () => {
  const result = await runWithSchemaResult(JSON.stringify({
    rows: [{ schema_ready: true, missing_objects: "", expected_object_count: 6, present_object_count: 6 }],
  }));

  assert.equal(result.passed, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.messages.some((message) => message.includes("migration 0070 objects are present")));

  const output: string[] = [];
  printPreflightResult(result, (message) => output.push(message));
  assert.ok(output.some((message) => message.includes("branch checkout schema are ready")));
});

test("missing migration 0070 objects block checkout with an actionable list", async () => {
  const result = await runWithSchemaResult(JSON.stringify({
    rows: [{
      schema_ready: false,
      missing_objects: "public.organizations.subscription_entitled_branch_count, public.stores.enforce_active_branch_entitlement trigger",
    }],
  }));

  assert.equal(result.passed, false);
  assert.match(result.issues.join("\n"), /Branch checkout is not ready/);
  assert.match(result.issues.join("\n"), /subscription_entitled_branch_count/);
  assert.match(result.issues.join("\n"), /Apply the approved migration/);
  assert.match(result.issues.join("\n"), /npm run production:preflight/);
});

test("a linked database command failure blocks checkout without exposing query output", async () => {
  const result = await runProductionPreflight({
    args: ["--remote"],
    cwd: ROOT,
    env: BASE_ENV,
    fetchImpl: healthyFetch(),
    linkedSchemaQuery: async () => ({
      ok: false,
      stdout: "sensitive query output should not be printed",
      stderr: "authentication failed",
    }),
    linkedProjectRefReader: () => PROJECT_REF,
    log: () => {},
  });

  assert.equal(result.passed, false);
  const issues = result.issues.join("\n");
  assert.match(issues, /schema check could not run/);
  assert.match(issues, /authentication failed/);
  assert.doesNotMatch(issues, /sensitive query output/);
});

test("the preflight refuses to query a linked project that is not production", async () => {
  let queryCalled = false;
  const result = await runProductionPreflight({
    args: ["--remote"],
    cwd: ROOT,
    env: BASE_ENV,
    fetchImpl: healthyFetch(),
    linkedProjectRefReader: () => "wrong-project",
    linkedSchemaQuery: async () => {
      queryCalled = true;
      return { ok: true, stdout: "", stderr: "" };
    },
    log: () => {},
  });

  assert.equal(queryCalled, false);
  assert.equal(result.passed, false);
  assert.match(result.issues.join("\n"), /linked to .*not expected production project/);
  assert.match(result.issues.join("\n"), /Refusing to query the linked database/);
});

test("linked schema JSON parsing handles common CLI result envelopes", () => {
  assert.deepEqual(
    parseLinkedSchemaResult(JSON.stringify({ rows: [{ schema_ready: "t", missing_objects: "" }] })),
    {
      ready: true,
      schemaReady: true,
      missingObjects: [],
      expectedObjectCount: null,
      presentObjectCount: null,
    },
  );
  assert.equal(
    parseLinkedSchemaResult(JSON.stringify({ result: { rows: [{ schema_ready: false, missing_objects: "one, two" }] } }))?.ready,
    false,
  );
  assert.equal(parseLinkedSchemaResult("not json"), null);
});
