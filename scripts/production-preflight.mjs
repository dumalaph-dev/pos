import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const remote = args.has("--remote");
const env = { ...readEnvFile(".env.local"), ...process.env };
const issues = [];
const warnings = [];
const menuSlug = readOption("--menu-slug") || value("ONLINE_ORDERING_PREFLIGHT_SLUG");

const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
const siteUrl = value("NEXT_PUBLIC_SITE_URL") || "https://dumala.store";
const expectedProjectRef = value("EXPECTED_SUPABASE_PROJECT_REF") || "uzavkjftwcuixidxyopr";

console.log("Dumala production preflight");
console.log("Safe mode: secret values are never printed.");

checkHttpsOrigin("NEXT_PUBLIC_SITE_URL", siteUrl);
checkSupabaseUrl();

if (menuSlug && !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(menuSlug)) {
  issues.push("--menu-slug must contain only letters, numbers, and hyphens, and be 1-120 characters long.");
}

if (remote) await checkRemote();

for (const warning of warnings) console.log("WARN " + warning);

if (issues.length > 0) {
  console.log("");
  console.log("Remaining actions:");
  for (const issue of issues) console.log("- " + issue);
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Preflight passed: production identity and deployment endpoints are ready.");
}

function value(key) {
  const candidate = env[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function readEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
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

function checkHttpsOrigin(label, candidate) {
  if (!candidate) {
    issues.push(`Set ${label} to the public HTTPS origin.`);
    return;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      issues.push(`${label} must be an HTTPS origin without a path, query, or hash.`);
      return;
    }
    console.log(`PASS ${label}: ${parsed.host}`);
    if (parsed.host !== "dumala.store" && parsed.host !== "www.dumala.store") {
      warnings.push(`${label} is not dumala.store; confirm this is intentional for the target environment.`);
    }
  } catch {
    issues.push(`${label} is not a valid URL.`);
  }
}

function checkSupabaseUrl() {
  if (!supabaseUrl) {
    issues.push("Set NEXT_PUBLIC_SUPABASE_URL to the production Supabase project URL.");
    return;
  }

  let parsed;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    issues.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    return;
  }

  const projectRef = parsed.hostname.endsWith(".supabase.co")
    ? parsed.hostname.slice(0, -".supabase.co".length)
    : "";
  if (parsed.protocol !== "https:" || !projectRef) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL must be an HTTPS hosted Supabase project URL.");
    return;
  }

  console.log(`PASS Supabase project: ${projectRef}`);
  if (expectedProjectRef && projectRef !== expectedProjectRef) {
    issues.push(`NEXT_PUBLIC_SUPABASE_URL points to ${projectRef}; expected production project ${expectedProjectRef}.`);
  }
}

async function checkRemote() {
  let origin;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return;
  }

  const paths = ["/", "/manifest.webmanifest", "/sw.js"];
  if (menuSlug) paths.push(`/menu/${encodeURIComponent(menuSlug)}`);

  for (const pathName of paths) {
    const response = await fetchWithTimeout(origin + pathName);
    if (response.error) {
      issues.push(`Remote check failed for ${pathName}: ${response.error}.`);
      continue;
    }
    console.log(`REMOTE ${pathName}: HTTP ${response.status}`);
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

function readOption(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const candidate = process.argv[index + 1];
  return typeof candidate === "string" ? candidate.trim() : "";
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
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
