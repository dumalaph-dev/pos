import {
  summarizePlatformSyncHealth,
  type PlatformSyncHealthOrganization,
  type PlatformSyncHealthSample,
  type PlatformSyncHealthStore,
  type PlatformSyncHealthMetrics,
  type PlatformSyncHealthQueueRow,
  type PlatformSyncHealthStatus,
  type PlatformSyncHealthFreshness,
} from "./platform-sync-health.ts";

export type PlatformRegisteredDevice = {
  id: string;
  organizationId: string;
  storeId: string;
  name: string;
  devicePrefix: string;
  isActive: boolean;
  lastSeenAt: string | null;
};

export type PlatformDeviceRow = PlatformSyncHealthMetrics & {
  key: string;
  organizationId: string;
  organizationName: string;
  storeId: string;
  storeName: string;
  branchActive: boolean;
  device: PlatformRegisteredDevice | null;
  deviceKey: string | null;
  status: PlatformSyncHealthStatus;
  freshness: PlatformSyncHealthFreshness;
  queues: PlatformSyncHealthQueueRow[];
};

export type PlatformDevicesSummary = {
  asOf: string;
  rows: PlatformDeviceRow[];
  branches: Array<PlatformSyncHealthStore & { organizationName: string; entryCount: number }>;
};

const statusRank: Record<PlatformSyncHealthStatus, number> = { needs_attention: 0, stale: 1, no_data: 2, healthy: 3 };
const scopeKey = (organizationId: string, storeId: string, identifier: string) => JSON.stringify([organizationId, storeId, identifier]);

/** Browser IDs and named registrations are distinct identities. Only an exact,
 * branch/organization-scoped prefix match can associate existing telemetry.
 * In particular, never infer a match from last_seen_at or the only device in a branch.
 */
export function summarizePlatformDevices(
  samples: PlatformSyncHealthSample[],
  organizations: PlatformSyncHealthOrganization[],
  stores: PlatformSyncHealthStore[],
  devices: PlatformRegisteredDevice[],
  asOf: string,
): PlatformDevicesSummary {
  const names = new Map(organizations.map((org) => [org.id, org.name]));
  const branches = new Map(stores.map((store) => [scopeKey(store.organizationId, store.id, ""), store]));
  const grouped = new Map<string, PlatformSyncHealthSample[]>();
  for (const sample of samples) {
    if (!sample.deviceKey || !Number.isFinite(Date.parse(sample.recordedAt)) || Date.parse(sample.recordedAt) > Date.parse(asOf)) continue;
    const key = scopeKey(sample.organizationId, sample.storeId, sample.deviceKey);
    const group = grouped.get(key) ?? [];
    group.push(sample);
    grouped.set(key, group);
  }
  const rows: PlatformDeviceRow[] = [];
  function addRow(device: PlatformRegisteredDevice | null, reports: PlatformSyncHealthSample[]) {
    const organizationId = device?.organizationId ?? reports[0].organizationId;
    const storeId = device?.storeId ?? reports[0].storeId;
    const organizationName = names.get(organizationId) ?? "Unknown organization";
    const branch = branches.get(scopeKey(organizationId, storeId, ""));
    const storeName = branch?.name ?? "Unknown branch";
    const deviceKey = reports[0]?.deviceKey ?? null;
    const health = summarizePlatformSyncHealth(reports, [{ id: organizationId, name: organizationName }], [
      { id: storeId, organizationId, name: storeName, isActive: true },
    ], asOf);
    // Evaluate each reporting queue: a fresh admin queue must not hide stale POS work.
    const queues = health.queueRows.filter((queue) => queue.reporterCount > 0);
    const status = queues.length === 0 ? "no_data" : queues.reduce<PlatformSyncHealthStatus>(
      (worst, queue) => statusRank[queue.status] < statusRank[worst] ? queue.status : worst, "healthy",
    );
    rows.push({
      key: scopeKey(organizationId, storeId, device ? `registered:${device.id}` : `browser:${deviceKey}`),
      organizationId, organizationName, storeId, storeName, branchActive: branch?.isActive ?? true,
      device, deviceKey, ...health.overall, status,
      freshness: queues.length === 0 ? "no_data" : queues.some((queue) => queue.freshness === "stale") ? "stale" : "fresh",
      queues,
    });
  }
  for (const device of devices) {
    const key = scopeKey(device.organizationId, device.storeId, device.devicePrefix);
    addRow(device, grouped.get(key) ?? []);
    grouped.delete(key);
  }
  for (const reports of grouped.values()) addRow(null, reports);
  rows.sort((a, b) => statusRank[a.status] - statusRank[b.status]
    || a.organizationName.localeCompare(b.organizationName) || a.storeName.localeCompare(b.storeName)
    || (a.device?.name ?? a.deviceKey ?? "").localeCompare(b.device?.name ?? b.deviceKey ?? ""));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = scopeKey(row.organizationId, row.storeId, "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    asOf, rows,
    branches: stores.map((store) => ({ ...store,
      organizationName: names.get(store.organizationId) ?? "Unknown organization",
      entryCount: counts.get(scopeKey(store.organizationId, store.id, "")) ?? 0,
    })),
  };
}

export function filterPlatformDevices(rows: PlatformDeviceRow[], filters: { search: string; status: string; branch: string; includeInactive: boolean }) {
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.filter((row) => (filters.includeInactive || (row.branchActive && row.device?.isActive !== false))
    && (filters.status === "all" || row.status === filters.status)
    && (filters.branch === "all" || row.storeId === filters.branch)
    && (!search || [row.organizationName, row.storeName, row.device?.name, row.device?.id, row.device?.devicePrefix, row.deviceKey].join(" ").toLocaleLowerCase().includes(search)));
}
