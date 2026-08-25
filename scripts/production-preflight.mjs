import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_EXPECTED_SUPABASE_PROJECT_REF = "uzavkjftwcuixidxyopr";
export const BRANCH_ENTITLEMENT_SCHEMA_FILE = "scripts/branch-entitlement-schema-check.sql";
export const SUPABASE_CLI_VERSION = "2.114.0";
const LINKED_PROJECT_REF_FILES = ["supabase/.temp/project-ref", ".supabase/project-ref"];
const READ_ONLY_SCHEMA_QUERY = `npx --yes supabase@${SUPABASE_CLI_VERSION} db query --linked --agent yes --file ${BRANCH_ENTITLEMENT_SCHEMA_FILE} --output json`;

export async function runProductionPreflight({
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = { ...readEnvFile(path.resolve(cwd, ".env.local")), ...process.env },
  fetchImpl = globalThis.fetch,
  linkedSchemaQuery = runLinkedSchemaQuery,
  linkedProjectRefReader = readLinkedProjectRef,
  schemaFile = path.resolve(cwd, BRANCH_ENTITLEMENT_SCHEMA_FILE),
  log = () => {},
} = {}) {
  const argumentsList = [...args];
  const remote = argumentsList.includes("--remote");
  const environment = env ?? {};
  const issues = [];
  const warnings = [];
  const messages = [];
  const emit = (message) => {
    messages.push(message);
    log(message);
  };
  const value = (key) => {
    const candidate = environment[key];
    return typeof candidate === "string" ? candidate.trim() : "";
  };

  const menuSlug = readOption(argumentsList, "--menu-slug") || value("ONLINE_ORDERING_PREFLIGHT_SLUG");
  const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
  const siteUrl = value("NEXT_PUBLIC_SITE_URL") || "https://dumala.store";
  const expectedProjectRef = value("EXPECTED_SUPABASE_PROJECT_REF") || DEFAULT_EXPECTED_SUPABASE_PROJECT_REF;

  emit("Dumala production preflight");
  emit("Safe mode: secret values are never printed; the linked branch-schema query is read-only.");

  checkHttpsOrigin("NEXT_PUBLIC_SITE_URL", siteUrl, issues, warnings, emit);
  const supabaseCheck = checkSupabaseUrl(supabaseUrl, expectedProjectRef, issues, emit);

  if (menuSlug && !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(menuSlug)) {
    issues.push("--menu-slug must contain only letters, numbers, and hyphens, and be 1-120 characters long.");
  }

  if (remote) {
    if (!supabaseCheck?.matchesExpected) {
      issues.push("Branch checkout is not ready: the linked schema check was skipped until NEXT_PUBLIC_SUPABASE_URL points to the expected production project.");
    } else {
      await checkLinkedBranchEntitlementSchema({
        cwd,
        env: environment,
        expectedProjectRef,
        schemaFile,
        linkedSchemaQuery,
        linkedProjectRefReader,
        issues,
        emit,
      });
    }
    await checkRemote({ siteUrl, menuSlug, fetchImpl, issues, warnings, emit });
  }

  return {
    passed: issues.length === 0,
    remote,
    issues,
    warnings,
    messages,
  };
}

export function printPreflightResult(result, log = console.log) {
  for (const warning of result.warnings) log("WARN " + warning);

  if (result.issues.length > 0) {
    log("");
    log("Remaining actions:");
    for (const issue of result.issues) log("- " + issue);
    return;
  }

  log("");
  if (result.remote) {
    log("Preflight passed: production identity, deployment endpoints, and branch checkout schema are ready.");
  } else {
    log("Preflight passed: production identity and deployment endpoints are ready.");
  }
}

export function parseLinkedSchemaResult(stdout) {
  const payload = parseJsonPayload(stdout);
  if (payload === null) return null;

  const row = findSchemaResultRow(payload);
  if (!row) return null;

  const ready = parseBoolean(row.schema_ready);
  if (ready === null) return null;

  return {
    ready,
    schemaReady: ready,
    missingObjects: formatMissingObjects(row.missing_objects),
    expectedObjectCount: parseNumber(row.expected_object_count),
    presentObjectCount: parseNumber(row.present_object_count),
  };
}

export function readLinkedProjectRef(cwd = process.cwd()) {
  for (const relativePath of LINKED_PROJECT_REF_FILES) {
    const filePath = path.resolve(cwd, relativePath);
    try {
      const projectRef = fs.readFileSync(filePath, "utf8").trim();
      if (projectRef) return projectRef;
    } catch {
      // Try the alternate Supabase CLI metadata location.
    }
  }
  return "";
}

export async function runLinkedSchemaQuery({
  cwd = process.cwd(),
  env = process.env,
  schemaFile = path.resolve(cwd, BRANCH_ENTITLEMENT_SCHEMA_FILE),
  execute = execFileAsync,
} = {}) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const relativeSchemaFile = path.relative(cwd, schemaFile) || BRANCH_ENTITLEMENT_SCHEMA_FILE;
  const cliArgs = [
    "--yes",
    `supabase@${SUPABASE_CLI_VERSION}`,
    "db",
    "query",
    "--linked",
    "--agent",
    "yes",
    "--file",
    relativeSchemaFile.split(path.sep).join("/"),
    "--output",
    "json",
  ];

  try {
    const result = await execute(executable, cliArgs, {
      cwd,
      env,
      windowsHide: true,
      shell: process.platform === "win32",
      timeout: 20_000,
      maxBuffer: 1_000_000,
    });
    return {
      ok: true,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout ?? ""),
      stderr: String(error?.stderr ?? error?.message ?? error),
    };
  }
}

function readEnvFile(filename) {
  const filePath = path.resolve(filename);
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice(7) : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) continue;

    const key = assignment.slice(0, separator).trim();
    let candidate = assignment.slice(separator + 1).trim();
    if ((candidate.startsWith('"') && candidate.endsWith('"')) || (candidate.startsWith("'") && candidate.endsWith("'"))) {
      candidate = candidate.slice(1, -1);
    }
    values[key] = candidate;
  }
  return values;
}

function checkHttpsOrigin(label, candidate, issues, warnings, emit) {
  if (!candidate) {
    issues.push(`Set ${label} to the public HTTPS origin.`);
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      issues.push(`${label} must be an HTTPS origin without a path, query, or hash.`);
      return null;
    }
    emit(`PASS ${label}: ${parsed.host}`);
    if (parsed.host !== "dumala.store" && parsed.host !== "www.dumala.store") {
      warnings.push(`${label} is not dumala.store; confirm this is intentional for the target environment.`);
    }
    return parsed;
  } catch {
    issues.push(`${label} is not a valid URL.`);
    return null;
  }
}

function checkSupabaseUrl(supabaseUrl, expectedProjectRef, issues, emit) {
  if (!supabaseUrl) {
    issues.push("Set NEXT_PUBLIC_SUPABASE_URL to the production Supabase project URL.");
    return null;
  }

  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    issues.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    return null;
  }

  const projectRef = parsed.hostname.endsWith(".supabase.co")
    ? parsed.hostname.slice(0, -".supabase.co".length)
    : "";
  if (parsed.protocol !== "https:" || !projectRef) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS hosted Supabase project URL.");
    return null;
  }

  emit(`PASS Supabase project: ${projectRef}`);
  const matchesExpected = !expectedProjectRef || projectRef === expectedProjectRef;
  if (!matchesExpected) {
    issues.push(`NEXT_PUBLIC_SUPABASE_URL points to ${projectRef}; expected production project ${expectedProjectRef}.`);
  }
  return { projectRef, matchesExpected };
}

async function checkLinkedBranchEntitlementSchema({
  cwd,
  env,
  expectedProjectRef,
  schemaFile,
  linkedSchemaQuery,
  linkedProjectRefReader,
  issues,
  emit,
}) {
  if (!fs.existsSync(schemaFile)) {
    issues.push(`Branch checkout is not ready: the read-only schema check file is missing at ${BRANCH_ENTITLEMENT_SCHEMA_FILE}.`);
    return false;
  }

  const linkedProjectRef = linkedProjectRefReader(cwd);
  if (!linkedProjectRef) {
    issues.push(`Branch checkout is not ready: no Supabase project is linked for this checkout. Link ${expectedProjectRef} with \`npx supabase link --project-ref ${expectedProjectRef}\`, then rerun the preflight.`);
    return false;
  }
  if (linkedProjectRef !== expectedProjectRef) {
    issues.push(`Branch checkout is not ready: Supabase CLI is linked to ${linkedProjectRef}, not expected production project ${expectedProjectRef}. Refusing to query the linked database; link the expected project and rerun the preflight.`);
    return false;
  }

  emit(`PASS linked Supabase project: ${linkedProjectRef}`);
  const result = await linkedSchemaQuery({ cwd, env, schemaFile });
  if (!result?.ok) {
    const detail = compactError(result?.stderr);
    const suffix = detail ? ` Supabase CLI: ${detail}.` : "";
    issues.push(`Branch checkout is not ready: the read-only migration 0070 schema check could not run.${suffix} Confirm Supabase CLI authentication and the linked project, then rerun: ${READ_ONLY_SCHEMA_QUERY}.`);
    return false;
  }

  const parsed = parseLinkedSchemaResult(result.stdout);
  if (!parsed) {
    issues.push(`Branch checkout is not ready: the linked database schema check returned no recognizable JSON result. Rerun: ${READ_ONLY_SCHEMA_QUERY}.`);
    return false;
  }

  if (!parsed.ready) {
    const missing = parsed.missingObjects.length > 0 ? ` Missing: ${parsed.missingObjects}.` : "";
    issues.push(`Branch checkout is not ready: migration 0070 paid branch-entitlement schema is incomplete.${missing} Apply the approved migration to the expected production project, then rerun: npm run production:preflight.`);
    return false;
  }

  emit("PASS branch-entitlement schema: migration 0070 objects are present (read-only linked check).");
  return true;
}

async function checkRemote({ siteUrl, menuSlug, fetchImpl, issues, warnings, emit }) {
  let origin;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return;
  }

  const paths = ["/", "/manifest.webmanifest", "/sw.js"];
  if (menuSlug) paths.push(`/menu/${encodeURIComponent(menuSlug)}`);

  for (const pathName of paths) {
    const response = await fetchWithTimeout(origin + pathName, fetchImpl);
    if (response.error) {
      issues.push(`Remote check failed for ${pathName}: ${response.error}.`);
      continue;
    }
    emit(`REMOTE ${pathName}: HTTP ${response.status}`);
    if (!response.ok) {
      issues.push(`Remote check returned HTTP ${response.status} for ${pathName}.`);
      continue;
    }

    if (pathName === "/manifest.webmanifest") {
      let manifest;
      try {
        manifest = JSON.parse(response.body);
      } catch {
        issues.push("Production manifest.webmanifest is not valid JSON.");
        continue;
      }
      if (manifest.display !== "standalone") issues.push("Production manifest is not configured for standalone PWA display.");
      if (manifest.name !== "Dumala POS") warnings.push("Production manifest name differs from Dumala POS; verify the deployed build.");
    }

    if (menuSlug && pathName === `/menu/${encodeURIComponent(menuSlug)}`) {
      if (!response.body.includes("public-menu")) issues.push(`Production public menu ${pathName} did not render the public menu shell.`);
      if (response.body.includes("Install Dumala PWA")) issues.push(`Production public menu ${pathName} still contains the POS install prompt.`);
    }
  }
}

function readOption(argumentsList, name) {
  const inline = argumentsList.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argumentsList.indexOf(name);
  if (index < 0) return "";
  const candidate = argumentsList[index + 1];
  return typeof candidate === "string" ? candidate.trim() : "";
}

async function fetchWithTimeout(url, fetchImpl) {
  if (typeof fetchImpl !== "function") return { error: "fetch is unavailable" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "text/html,application/json,application/javascript" },
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonPayload(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    for (const line of text.split(/\r?\n/).reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // Supabase CLI diagnostics are ignored; the result row is what matters.
      }
    }
  }
  return null;
}

function findSchemaResultRow(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const row = findSchemaResultRow(item, depth + 1);
      if (row) return row;
    }
    return null;
  }

  if (typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "schema_ready")) return value;

  if (Array.isArray(value.rows) && Array.isArray(value.columns) && Array.isArray(value.rows[0])) {
    const columns = value.columns.map((column) => typeof column === "string" ? column : column?.name);
    if (columns.every(Boolean)) {
      return Object.fromEntries(columns.map((column, index) => [column, value.rows[0][index]]));
    }
  }

  for (const child of Object.values(value)) {
    const row = findSchemaResultRow(child, depth + 1);
    if (row) return row;
  }
  return null;
}

function parseBoolean(value) {
  if (value === true || value === 1 || value === "1" || value === "t" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "f" || value === "false") return false;
  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMissingObjects(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function compactError(value) {
  return String(value ?? "")
    .replace(/\bsbp_[A-Za-z0-9_-]+\b/g, "sbp_[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runProductionPreflight({ log: console.log });
  printPreflightResult(result);
  if (!result.passed) process.exitCode = 1;
}
