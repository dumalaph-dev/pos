#!/usr/bin/env node
// Generate src/lib/platform-schema-manifest.ts from supabase/migrations.
//
// The console needs the list of migrations this deployment ships in order to
// compare it against the database ledger. Reading the directory at runtime is
// not an option on a serverless deployment, where the SQL files are not part
// of the traced bundle, so the list is generated into a module at author time
// and pinned by scripts/platform-schema-drift.test.ts.

import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const target = path.join(root, "src", "lib", "platform-schema-manifest.ts");

export function parseMigrationFilename(filename) {
  const match = /^(\d{4,})_(.+)\.sql$/.exec(filename);
  return match ? { version: match[1], name: match[2] } : null;
}

export async function readMigrationManifest() {
  const files = await readdir(migrationsDir);
  return files
    .filter((file) => file.endsWith(".sql"))
    .map(parseMigrationFilename)
    .filter((entry) => entry !== null)
    .sort((left, right) => left.version.localeCompare(right.version));
}

export function renderManifest(entries) {
  const rows = entries.map((entry) => `  { version: ${JSON.stringify(entry.version)}, name: ${JSON.stringify(entry.name)} },`).join("\n");
  return `// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run schema:manifest
//
// The migrations this deployment ships, compared against the database ledger
// by the platform schema-drift surface. scripts/platform-schema-drift.test.ts
// fails if this drifts from supabase/migrations.

import type { PlatformSchemaMigration } from "@/lib/platform-schema-drift";

export const PLATFORM_SCHEMA_MANIFEST: readonly PlatformSchemaMigration[] = [
${rows}
];
`;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const entries = await readMigrationManifest();
  await writeFile(target, renderManifest(entries), "utf8");
  console.log(`Wrote ${entries.length} migrations to src/lib/platform-schema-manifest.ts (latest ${entries.at(-1)?.version ?? "none"}).`);
}
