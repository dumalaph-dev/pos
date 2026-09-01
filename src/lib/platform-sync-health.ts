export const PLATFORM_SYNC_HEALTH_QUEUES = ["orders", "audit", "admin_mutations"] as const;
export type PlatformSyncHealthQueue = (typeof PLATFORM_SYNC_HEALTH_QUEUES)[number];

export const PLATFORM_SYNC_HEALTH_STALE_AFTER_MS = 30 * 60 * 1000;
export const PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS = 15 * 60 * 1000;
export const PLATFORM_SYNC_HEALTH_REPORT_INTERVAL_MS = 5 * 60 * 1000;
export const PLATFORM_SYNC_HEALTH_MAX_QUEUE_COUNT = 10_000;

export type PlatformSyncHealthStatus = "healthy" | "needs_attention" | "stale" | "no_data";

export type PlatformSyncHealthQueueSnapshot = {
  queue: PlatformSyncHealthQueue;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  oldestPendingAt: string | null;
};

export type PlatformSyncHealthSample = PlatformSyncHealthQueueSnapshot & {
  organizationId: string;
  storeId: string;
  deviceKey: string;
  online: boolean;
  recordedAt: string;
};

export type PlatformSyncHealthOrganization = {
  id: string;
  name: string;
};

export type PlatformSyncHealthStore = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
};

export type PlatformSyncHealthMetrics = {
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  oldestPendingAt: string | null;
  lastReportedAt: string | null;
  reporterCount: number;
  offlineReporterCount: number;
  queueCount: number;
};

export type PlatformSyncHealthQueueRow = PlatformSyncHealthMetrics & PlatformSyncHealthQueueSnapshot & {
  organizationId: string;
  organizationName: string;
  storeId: string;
  storeName: string;
  status: PlatformSyncHealthStatus;
};

export type PlatformSyncHealthBranchRow = PlatformSyncHealthMetrics & {
  organizationId: string;
  organizationName: string;
  storeId: string;
  storeName: string;
  isActive: boolean;
  status: PlatformSyncHealthStatus;
};

export type PlatformSyncHealthOrganizationRow = PlatformSyncHealthMetrics & {
  organizationId: string;
  organizationName: string;
  branchCount: number;
  activeBranchCount: number;
  status: PlatformSyncHealthStatus;
};

export type PlatformSyncHealthSummary = {
  asOf: string;
  overall: PlatformSyncHealthMetrics;
  organizationRows: PlatformSyncHealthOrganizationRow[];
  branchRows: PlatformSyncHealthBranchRow[];
  queueRows: PlatformSyncHealthQueueRow[];
  healthyBranchCount: number;
  attentionBranchCount: number;
  staleBranchCount: number;
  noDataBranchCount: number;
};

export function summarizePlatformSyncHealth(
  samples: PlatformSyncHealthSample[],
  organizations: PlatformSyncHealthOrganization[],
  stores: PlatformSyncHealthStore[],
  asOf: string | number,
): PlatformSyncHealthSummary {
  const asOfMs = toTimestamp(asOf) ?? Date.now();
  const latestSamples = latestSamplesByDeviceQueue(samples, asOfMs);
  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const storeMap = new Map(stores.map((store) => [store.id, store]));

  for (const sample of latestSamples) {
    if (!organizationNames.has(sample.organizationId)) organizationNames.set(sample.organizationId, "Unnamed organization");
    if (!storeMap.has(sample.storeId)) {
      storeMap.set(sample.storeId, {
        id: sample.storeId,
        organizationId: sample.organizationId,
        name: "Unknown branch",
        isActive: true,
      });
    }
  }

  const activeStores = [...storeMap.values()].filter((store) => store.isActive);
  const samplesByStore = groupSamples(latestSamples, (sample) => sample.storeId);
  const branchRows: PlatformSyncHealthBranchRow[] = activeStores.map((store) => {
    const storeSamples = samplesByStore.get(store.id) ?? [];
    const metrics = metricsForSamples(storeSamples);
    return {
      organizationId: store.organizationId,
      organizationName: organizationNames.get(store.organizationId) ?? "Unnamed organization",
      storeId: store.id,
      storeName: store.name || "Unnamed branch",
      isActive: store.isActive,
      ...metrics,
      status: syncHealthStatus(metrics, asOfMs),
    };
  });

  const queueRows: PlatformSyncHealthQueueRow[] = [];
  for (const branch of branchRows) {
    const branchSamples = samplesByStore.get(branch.storeId) ?? [];
    const samplesByQueue = groupSamples(branchSamples, (sample) => sample.queue);
    for (const queue of PLATFORM_SYNC_HEALTH_QUEUES) {
      const queueSamples = samplesByQueue.get(queue) ?? [];
      const metrics = metricsForSamples(queueSamples);
      queueRows.push({
        organizationId: branch.organizationId,
        organizationName: branch.organizationName,
        storeId: branch.storeId,
        storeName: branch.storeName,
        queue,
        ...metrics,
        status: syncHealthStatus(metrics, asOfMs),
      });
    }
  }

  const storesByOrganization = groupValues(branchRows, (branch) => branch.organizationId);
  const organizationRows: PlatformSyncHealthOrganizationRow[] = [...organizationNames.entries()].map(([organizationId, organizationName]) => {
    const organizationBranches = storesByOrganization.get(organizationId) ?? [];
    const organizationSamples = latestSamples.filter((sample) => sample.organizationId === organizationId);
    const metrics = metricsForSamples(organizationSamples);
    return {
      organizationId,
      organizationName,
      branchCount: organizationBranches.length,
      activeBranchCount: organizationBranches.filter((branch) => branch.isActive).length,
      ...metrics,
      status: organizationBranches.length > 0
        ? organizationBranches.reduce<PlatformSyncHealthStatus>((worst, branch) => worstStatus(worst, branch.status), "healthy")
        : "no_data",
    };
  });

  const overall = metricsForSamples(latestSamples);
  return {
    asOf: new Date(asOfMs).toISOString(),
    overall,
    organizationRows: organizationRows.sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.organizationName.localeCompare(right.organizationName)),
    branchRows: branchRows.sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.organizationName.localeCompare(right.organizationName) || left.storeName.localeCompare(right.storeName)),
    queueRows: queueRows.sort((left, right) => left.organizationName.localeCompare(right.organizationName) || left.storeName.localeCompare(right.storeName) || left.queue.localeCompare(right.queue)),
    healthyBranchCount: branchRows.filter((branch) => branch.status === "healthy").length,
    attentionBranchCount: branchRows.filter((branch) => branch.status === "needs_attention").length,
    staleBranchCount: branchRows.filter((branch) => branch.status === "stale").length,
    noDataBranchCount: branchRows.filter((branch) => branch.status === "no_data").length,
  };
}

export function syncHealthStatusLabel(status: PlatformSyncHealthStatus) {
  return status === "needs_attention"
    ? "Needs attention"
    : status === "stale"
      ? "Stale reporter"
      : status === "no_data"
        ? "No telemetry"
        : "Healthy";
}

export function syncHealthQueueLabel(queue: PlatformSyncHealthQueue) {
  return queue === "admin_mutations" ? "Admin changes" : queue === "orders" ? "POS orders" : "Audit events";
}

function latestSamplesByDeviceQueue(samples: PlatformSyncHealthSample[], asOfMs: number) {
  const latest = new Map<string, PlatformSyncHealthSample>();
  for (const sample of samples) {
    const recordedAt = toTimestamp(sample.recordedAt);
    if (recordedAt === null || recordedAt > asOfMs) continue;
    const key = `${sample.organizationId}::${sample.storeId}::${sample.deviceKey}::${sample.queue}`;
    const current = latest.get(key);
    if (!current || (toTimestamp(current.recordedAt) ?? 0) < recordedAt) latest.set(key, sample);
  }
  return [...latest.values()];
}

function metricsForSamples(samples: PlatformSyncHealthSample[]): PlatformSyncHealthMetrics {
  const reporters = new Set(samples.map((sample) => sample.deviceKey).filter(Boolean));
  const offlineReporters = new Set(samples.filter((sample) => !sample.online).map((sample) => sample.deviceKey).filter(Boolean));
  const timestamps = samples
    .map((sample) => toTimestamp(sample.recordedAt))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right);
  const pendingTimes = samples
    .filter((sample) => sample.pendingCount > 0)
    .map((sample) => toTimestamp(sample.oldestPendingAt))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right);
  return {
    pendingCount: sumCount(samples, "pendingCount"),
    failedCount: sumCount(samples, "failedCount"),
    conflictCount: sumCount(samples, "conflictCount"),
    oldestPendingAt: pendingTimes.length > 0 ? new Date(pendingTimes[0]).toISOString() : null,
    lastReportedAt: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    reporterCount: reporters.size,
    offlineReporterCount: offlineReporters.size,
    queueCount: new Set(samples.map((sample) => sample.queue)).size,
  };
}

function syncHealthStatus(metrics: PlatformSyncHealthMetrics, asOfMs: number): PlatformSyncHealthStatus {
  if (metrics.reporterCount === 0 || !metrics.lastReportedAt) return "no_data";
  if (metrics.failedCount > 0 || metrics.conflictCount > 0 || metrics.offlineReporterCount > 0 || isOlderThan(metrics.oldestPendingAt, asOfMs, PLATFORM_SYNC_HEALTH_STUCK_AFTER_MS)) return "needs_attention";
  if (isOlderThan(metrics.lastReportedAt, asOfMs, PLATFORM_SYNC_HEALTH_STALE_AFTER_MS)) return "stale";
  return "healthy";
}

function isOlderThan(value: string | null, asOfMs: number, thresholdMs: number) {
  const timestamp = toTimestamp(value);
  return timestamp !== null && asOfMs - timestamp > thresholdMs;
}

function sumCount(samples: PlatformSyncHealthSample[], key: "pendingCount" | "failedCount" | "conflictCount") {
  return samples.reduce((total, sample) => total + (Number.isFinite(sample[key]) ? Math.max(0, Math.round(sample[key])) : 0), 0);
}

function groupSamples(samples: PlatformSyncHealthSample[], keyOf: (sample: PlatformSyncHealthSample) => string) {
  return groupValues(samples, keyOf);
}

function groupValues<T>(values: T[], keyOf: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function worstStatus(left: PlatformSyncHealthStatus, right: PlatformSyncHealthStatus) {
  return statusRank(left) <= statusRank(right) ? left : right;
}

function statusRank(status: PlatformSyncHealthStatus) {
  return status === "needs_attention" ? 0 : status === "stale" ? 1 : status === "no_data" ? 2 : 3;
}

function toTimestamp(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
