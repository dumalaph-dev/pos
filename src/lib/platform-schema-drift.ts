// Repository-versus-database migration drift.
//
// Every organization shares one Postgres database, so there is a single
// migration ledger and a single applied position for the whole fleet. The
// per-organization question the console can usefully answer is not "which
// ledger position is this tenant on" — they are all on the same one — but
// "did the data each migration introduced actually reach this tenant".
// Both readings live here.

export type PlatformSchemaDriftStatus = "in_sync" | "pending" | "unknown_remote" | "diverged" | "no_data";

export type PlatformSchemaMigration = {
  version: string;
  name: string;
};

export type PlatformSchemaMigrationRow = PlatformSchemaMigration & {
  state: "applied" | "pending" | "unknown_remote";
};

export type PlatformSchemaDriftSummary = {
  status: PlatformSchemaDriftStatus;
  expectedCount: number;
  appliedCount: number;
  pending: PlatformSchemaMigration[];
  unknownRemote: PlatformSchemaMigration[];
  latestExpected: PlatformSchemaMigration | null;
  latestApplied: PlatformSchemaMigration | null;
  renamed: Array<{ version: string; expectedName: string; appliedName: string }>;
  rows: PlatformSchemaMigrationRow[];
};

export type PlatformSchemaBackfillCheck = {
  key: string;
  label: string;
  detail: string;
  introducedIn: string;
  total: number;
  ready: number;
};

export type PlatformSchemaBackfillRow = PlatformSchemaBackfillCheck & {
  outstanding: number;
  readyPct: number;
  complete: boolean;
};

function normalizeVersion(value: string) {
  return value.trim();
}

function byVersion(left: PlatformSchemaMigration, right: PlatformSchemaMigration) {
  return left.version.localeCompare(right.version);
}

/**
 * Compare the migrations this deployment ships against the versions the
 * database reports as applied.
 *
 * `pending` is a migration in the repository that the database has never
 * applied — the deployment is ahead of the database, which is what a forgotten
 * `db push` looks like. `unknown_remote` is the reverse and the more dangerous
 * one: a version the database applied that this deployment no longer carries,
 * which means either an out-of-band apply or a migration file deleted after it
 * shipped. A version present on both sides under a different name is reported
 * separately as `renamed` rather than being silently treated as equal, because
 * renaming an applied migration file breaks the next `db push` comparison.
 */
export function summarizePlatformSchemaDrift(
  expected: readonly PlatformSchemaMigration[],
  applied: readonly PlatformSchemaMigration[] | null,
): PlatformSchemaDriftSummary {
  const expectedList = [...expected].map((entry) => ({ ...entry, version: normalizeVersion(entry.version) })).sort(byVersion);
  const expectedByVersion = new Map(expectedList.map((entry) => [entry.version, entry]));

  if (applied === null) {
    return {
      status: "no_data",
      expectedCount: expectedList.length,
      appliedCount: 0,
      pending: [],
      unknownRemote: [],
      latestExpected: expectedList.at(-1) ?? null,
      latestApplied: null,
      renamed: [],
      rows: expectedList.map((entry) => ({ ...entry, state: "pending" as const })),
    };
  }

  const appliedList = [...applied].map((entry) => ({ ...entry, version: normalizeVersion(entry.version) })).sort(byVersion);
  const appliedByVersion = new Map(appliedList.map((entry) => [entry.version, entry]));

  const pending = expectedList.filter((entry) => !appliedByVersion.has(entry.version));
  const unknownRemote = appliedList.filter((entry) => !expectedByVersion.has(entry.version));
  const renamed = expectedList.flatMap((entry) => {
    const match = appliedByVersion.get(entry.version);
    return match && match.name !== entry.name
      ? [{ version: entry.version, expectedName: entry.name, appliedName: match.name }]
      : [];
  });

  const rows: PlatformSchemaMigrationRow[] = [
    ...expectedList.map((entry) => ({
      ...entry,
      state: appliedByVersion.has(entry.version) ? ("applied" as const) : ("pending" as const),
    })),
    ...unknownRemote.map((entry) => ({ ...entry, state: "unknown_remote" as const })),
  ].sort(byVersion);

  const status: PlatformSchemaDriftStatus = pending.length > 0 && unknownRemote.length > 0
    ? "diverged"
    : unknownRemote.length > 0
      ? "unknown_remote"
      : pending.length > 0
        ? "pending"
        : "in_sync";

  return {
    status,
    expectedCount: expectedList.length,
    appliedCount: appliedList.length,
    pending,
    unknownRemote,
    latestExpected: expectedList.at(-1) ?? null,
    latestApplied: appliedList.at(-1) ?? null,
    renamed,
    rows,
  };
}

/**
 * Per-organization readiness for the data a migration introduced. A schema
 * object can exist fleet-wide while the rows it depends on are still missing
 * for some tenants, which is the only sense in which one organization can sit
 * "behind" another on a shared database.
 */
export function summarizePlatformSchemaBackfill(checks: readonly PlatformSchemaBackfillCheck[]): PlatformSchemaBackfillRow[] {
  return checks.map((check) => {
    const total = Math.max(0, check.total);
    const ready = Math.min(Math.max(0, check.ready), total);
    return {
      ...check,
      total,
      ready,
      outstanding: total - ready,
      readyPct: total === 0 ? 100 : Math.round((ready / total) * 1000) / 10,
      complete: total === 0 || ready === total,
    };
  });
}

export function schemaDriftStatusLabel(status: PlatformSchemaDriftStatus) {
  switch (status) {
    case "in_sync": return "In sync";
    case "pending": return "Pending migrations";
    case "unknown_remote": return "Unknown remote versions";
    case "diverged": return "Diverged";
    default: return "No ledger read";
  }
}

export function schemaDriftStatusDetail(summary: PlatformSchemaDriftSummary) {
  switch (summary.status) {
    case "in_sync":
      return `All ${summary.expectedCount} migrations in this deployment are applied.`;
    case "pending":
      return `${summary.pending.length} migration${summary.pending.length === 1 ? "" : "s"} ship in this deployment but are not applied.`;
    case "unknown_remote":
      return `${summary.unknownRemote.length} applied version${summary.unknownRemote.length === 1 ? " is" : "s are"} not in this deployment.`;
    case "diverged":
      return `${summary.pending.length} pending and ${summary.unknownRemote.length} unknown applied version${summary.unknownRemote.length === 1 ? "" : "s"}.`;
    default:
      return "The migration ledger could not be read from this deployment.";
  }
}
