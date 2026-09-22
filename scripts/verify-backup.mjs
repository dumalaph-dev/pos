import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(process.argv[2] || "");
if (!directory) {
  console.error("Usage: node scripts/verify-backup.mjs <backup-directory>");
  process.exit(2);
}

const manifestPath = path.join(directory, "manifest.json");
if (!fs.existsSync(manifestPath)) fail("manifest.json is missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.complete !== true) fail("manifest is marked incomplete");

let totalRows = 0;
let totalBytes = 0;
for (const table of manifest.tables || []) {
  if (table.status !== "ok") continue;
  const file = path.join(directory, `${table.table}.ndjson`);
  if (!fs.existsSync(file)) fail(`${table.table}: NDJSON file is missing`);
  const contents = fs.readFileSync(file);
  const digest = crypto.createHash("sha256").update(contents).digest("hex");
  if (digest !== table.sha256) fail(`${table.table}: SHA-256 mismatch`);
  const rows = contents.length === 0 ? 0 : contents.toString("utf8").trimEnd().split(/\r?\n/).length;
  if (rows !== table.rows) fail(`${table.table}: manifest says ${table.rows} rows, file has ${rows}`);
  if (contents.length !== table.bytes) fail(`${table.table}: manifest says ${table.bytes} bytes, file has ${contents.length}`);
  totalRows += rows;
  totalBytes += contents.length;
}

if (manifest.totals?.rows !== totalRows || manifest.totals?.bytes !== totalBytes) {
  fail(`manifest totals do not match files (${manifest.totals?.rows}/${manifest.totals?.bytes} vs ${totalRows}/${totalBytes})`);
}

console.log(`Backup verified: ${manifest.tables.filter((table) => table.status === "ok").length} tables, ${totalRows} rows, ${totalBytes} bytes`);

function fail(message) {
  console.error(`Backup verification failed: ${message}`);
  process.exit(1);
}
