import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Logical data backup for the linked production Supabase project.
 *
 * Why this exists: the project runs on the Free plan, where Supabase takes no
 * automated backups at all (`supabase backups list` returns `walg_enabled=true,
 * pitr_enabled=false, backups: []`). PITR is a paid add-on and is not offered
 * on Free, so until the owner upgrades there is no recovery path whatsoever for
 * a pilot handling real money. This stays useful after an upgrade too: PITR
 * lives inside the same Supabase project, so it does not protect against losing
 * the project itself.
 *
 * Why this reads through the API instead of pg_dump: `supabase db dump` runs
 * pg_dump inside Docker, and neither Docker nor a native pg_dump is installed
 * on the operator workstation — Docker availability has been intermittent
 * throughout this project's history (see docs/tasks.md). A backup that only
 * runs when Docker cooperates is not a backup. This script needs nothing beyond
 * the dependencies already in package.json.
 *
 * What it captures: every row of every application table, as NDJSON.
 *
 * What it deliberately does not capture, and why that is safe:
 *   - Schema, functions, RLS policies. `supabase/migrations` in Git is the
 *     source of truth for those and is already versioned; a restore replays
 *     migrations into a fresh project and then reloads these rows.
 *   - Storage objects (product images, display gallery). Re-uploadable, and the
 *     bundled /food art ships in the repo.
 *   - `auth.users`. Not reachable through PostgREST. Employee logins are
 *     re-provisioned through the Employees UI after a restore; `profiles` and
 *     `employee_records` below preserve who those accounts belong to.
 *
 * Usage:
 *   npm run backup:production
 *   node scripts/backup-production.mjs --out D:/dumala-backups
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local. The key
 * is never printed and never written into the backup directory.
 */

const args = process.argv.slice(2);
const env = { ...readEnvFile(".env.local"), ...process.env };

const supabaseUrl = value("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = value("SUPABASE_SERVICE_ROLE_KEY");
const outRoot = path.resolve(process.cwd(), readFlag("--out") || value("BACKUP_DIR") || "backups");
const pageSize = 1000;

/**
 * Ordered parents-first so replaying the files in this order satisfies foreign
 * keys on restore. Tables absent from the project are reported and skipped
 * rather than failing the run, so this list can stay ahead of a migration.
 */
const TABLES = [
  "organizations",
  "stores",
  "profiles",
  "devices",
  "categories",
  "suppliers",
  "products",
  "customers",
  "employee_roles",
  "employee_records",
  "shifts",
  "orders",
  "order_items",
  "stock_movements",
  "discount_approvals",
  "order_action_approvals",
  "z_readings",
  "inventory_counts",
  "expenses",
  "attendance_logs",
  "payroll_records",
  "leave_requests",
  "display_promotions",
  "display_gallery_items",
  "audit_logs",
  "admin_mutation_receipts",
  "admin_performance_samples",
  "billing_provider_events",
  "platform_billing_settings",
  "platform_billing_variants",
  "platform_policies",
  "platform_promotions",
  "platform_promotion_redemptions",
  "support_cases",
  "trial_feedback",
];

/**
 * Losing any of these means losing money, stock truth, or the audit trail. An
 * export that silently skipped one of them would still look successful, so a
 * failure here fails the whole run.
 */
const CRITICAL = new Set(["organizations", "stores", "products", "orders", "order_items", "stock_movements", "audit_logs", "shifts", "z_readings"]);

console.log("Dumala production data backup");
console.log("Safe mode: the service role key is never printed.");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("");
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Both live in .env.local. The service role key is in the Supabase Dashboard");
  console.error("under Project Settings -> API. It bypasses RLS, so keep it out of the browser.");
  process.exit(1);
}

console.log(`Project: ${new URL(supabaseUrl).hostname}`);
console.log("");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
const outDir = path.join(outRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });

const results = [];
let failed = false;

for (const table of TABLES) {
  process.stdout.write(`${table.padEnd(32)}`);
  const outcome = await exportTable(table);
  results.push({ table, ...outcome });

  if (outcome.status === "ok") {
    console.log(`${String(outcome.rows).padStart(7)} rows  ${size(outcome.bytes)}`);
  } else if (outcome.status === "missing") {
    console.log("      - not in this project");
  } else {
    console.log(`      FAILED  ${outcome.error}`);
    if (CRITICAL.has(table)) failed = true;
  }
}

const totalRows = results.reduce((sum, r) => sum + (r.rows || 0), 0);
const totalBytes = results.reduce((sum, r) => sum + (r.bytes || 0), 0);
const exported = results.filter((r) => r.status === "ok").length;

writeManifest();

console.log("");
console.log(`Exported ${exported}/${TABLES.length} tables, ${totalRows.toLocaleString()} rows, ${size(totalBytes)}`);
console.log(`Location: ${outDir}`);
console.log("");

if (failed) {
  console.log("Backup INCOMPLETE - a critical table failed. Do not treat this as a recovery point.");
  process.exitCode = 1;
} else {
  console.log("Backup complete. Two things this does not do for you:");
  console.log("  1. Copy it off this machine. A backup on the same disk as the work it protects");
  console.log("     is still a single point of failure - move it to external storage.");
  console.log("  2. Prove it restores. Rehearse into a scratch Supabase project before the");
  console.log("     pilot; see docs/PRODUCTION_BACKUP_AND_RESTORE.md.");
}

async function exportTable(table) {
  const file = path.join(outDir, `${table}.ndjson`);
  let stream;
  let rows = 0;

  try {
    for (let from = 0; ; from += pageSize) {
      // Ordered by primary key so pages cannot overlap or skip rows if a write
      // lands mid-export. Tables without `id` fall back to an unordered read,
      // which is still correct for the append-only and settings tables that
      // shape applies to.
      let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
      let { data, error } = await query.order("id", { ascending: true });
      if (error && /column .*id.* does not exist|could not find/i.test(error.message)) {
        ({ data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1));
      }

      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          stream?.close();
          fs.rmSync(file, { force: true });
          return { status: "missing", rows: 0, bytes: 0 };
        }
        throw new Error(error.message);
      }

      if (from === 0) stream = fs.createWriteStream(file, { encoding: "utf8" });
      for (const row of data ?? []) stream.write(`${JSON.stringify(row)}\n`);
      rows += data?.length ?? 0;

      if (!data || data.length < pageSize) break;
    }

    await closeStream(stream);
    return { status: "ok", rows, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0 };
  } catch (error) {
    await closeStream(stream);
    return { status: "failed", rows: 0, bytes: 0, error: String(error.message || error).slice(0, 90) };
  }
}

function closeStream(stream) {
  if (!stream) return Promise.resolve();
  return new Promise((resolve) => stream.end(resolve));
}

function writeManifest() {
  const manifest = {
    project: new URL(supabaseUrl).hostname,
    startedAtUtc: startedAt.toISOString(),
    startedAtSingapore: startedAt.toLocaleString("en-CA", { timeZone: "Asia/Singapore", hour12: false }),
    complete: !failed,
    format: "One NDJSON file per table; one JSON object per line. Restore in the listed order.",
    schemaSource: "supabase/migrations (replay into a fresh project before reloading these rows)",
    totals: { tables: results.filter((r) => r.status === "ok").length, rows: totalRows, bytes: totalBytes },
    tables: results,
    excluded: [
      "Database schema, functions and RLS policies (versioned in supabase/migrations)",
      "auth.users (re-provision employee logins through the Employees UI)",
      "Storage objects (product images, display gallery)",
      "Project configuration, API keys, Auth settings, Realtime settings",
    ],
    restore: "docs/PRODUCTION_BACKUP_AND_RESTORE.md",
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] || "").trim() : "";
}

function value(key) {
  const candidate = env[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function size(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
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
