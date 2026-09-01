export const PLATFORM_FLEET_HEALTH_WINDOWS = ["24h", "7d", "30d", "60d"] as const;
export type PlatformFleetHealthWindow = (typeof PLATFORM_FLEET_HEALTH_WINDOWS)[number];

export const FLEET_HEALTH_ERROR_THRESHOLD_PCT = 5;
export const FLEET_HEALTH_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type PlatformFleetHealthStatus = "healthy" | "needs_attention" | "stale" | "no_data";

export type PlatformFleetHealthOrganization = {
  id: string;
  name: string;
};

export type PlatformFleetHealthSample = {
  organizationId: string | null;
  organizationName: string | null;
  surface: string;
  interaction: string;
  mode: string;
  sampleType: string;
  durationMs: number;
  error: boolean;
  recordedAt: string;
};

export type PlatformFleetHealthMetrics = {
  sampleCount: number;
  errorCount: number;
  errorRatePct: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  firstSampleAt: string | null;
  lastSampleAt: string | null;
  surfaceCount: number;
  onlineSampleCount: number;
  offlineSampleCount: number;
};

export type PlatformFleetHealthOrganizationRow = PlatformFleetHealthMetrics & {
  organizationId: string | null;
  organizationName: string;
  status: PlatformFleetHealthStatus;
};

export type PlatformFleetHealthSurfaceRow = PlatformFleetHealthMetrics & {
  organizationId: string | null;
  organizationName: string;
  surface: string;
};

export type PlatformFleetHealthSummary = {
  window: PlatformFleetHealthWindow;
  windowStart: string;
  asOf: string;
  overall: PlatformFleetHealthMetrics;
  organizationRows: PlatformFleetHealthOrganizationRow[];
  surfaceRows: PlatformFleetHealthSurfaceRow[];
  attributedSampleCount: number;
  unattributedSampleCount: number;
};

export type PlatformFleetHealthSummaries = Record<PlatformFleetHealthWindow, PlatformFleetHealthSummary>;

const WINDOW_MS: Record<PlatformFleetHealthWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "60d": 60 * 24 * 60 * 60 * 1000,
};

export function summarizePlatformFleetHealth(
  samples: PlatformFleetHealthSample[],
  organizations: PlatformFleetHealthOrganization[],
  window: PlatformFleetHealthWindow,
  asOf: string | number,
): PlatformFleetHealthSummary {
  const asOfMs = toTimestamp(asOf) ?? Date.now();
  const windowStartMs = asOfMs - WINDOW_MS[window];
  const windowSamples = samples.filter((sample) => {
    const recordedAt = toTimestamp(sample.recordedAt);
    return recordedAt !== null && recordedAt >= windowStartMs && recordedAt <= asOfMs;
  });
  const organizationNames = new Map(organizations.map((organization) => [organization.id, organization.name]));
  for (const sample of windowSamples) {
    if (sample.organizationId && !organizationNames.has(sample.organizationId)) {
      organizationNames.set(sample.organizationId, sample.organizationName ?? "Unnamed organization");
    }
  }

  const organizationGroups = groupSamples(windowSamples, (sample) => sample.organizationId ?? "__unattributed__");
  const organizationRows: PlatformFleetHealthOrganizationRow[] = [...organizationNames.entries()].map(([organizationId, organizationName]) => {
    const metrics = metricsForSamples(organizationGroups.get(organizationId) ?? []);
    return {
      organizationId,
      organizationName: organizationName || "Unnamed organization",
      ...metrics,
      status: fleetHealthStatus(metrics, asOfMs),
    } satisfies PlatformFleetHealthOrganizationRow;
  });
  const unattributedSamples = organizationGroups.get("__unattributed__") ?? [];
  if (unattributedSamples.length > 0) {
    const metrics = metricsForSamples(unattributedSamples);
    organizationRows.push({
      organizationId: null,
      organizationName: "Unattributed history",
      ...metrics,
      status: fleetHealthStatus(metrics, asOfMs),
    });
  }

  const surfaceGroups = groupSamples(windowSamples, (sample) => `${sample.organizationId ?? "__unattributed__"}::${sample.surface}`);
  const surfaceRows = [...surfaceGroups.entries()].map(([key, groupedSamples]) => {
    const separator = key.indexOf("::");
    const organizationKey = separator >= 0 ? key.slice(0, separator) : "__unattributed__";
    const surface = separator >= 0 ? key.slice(separator + 2) : key;
    const organizationId = organizationKey === "__unattributed__" ? null : organizationKey;
    return {
      organizationId,
      organizationName: organizationId ? organizationNames.get(organizationId) ?? "Unnamed organization" : "Unattributed history",
      surface: surface || "admin",
      ...metricsForSamples(groupedSamples),
    } satisfies PlatformFleetHealthSurfaceRow;
  }).sort((left, right) => left.organizationName.localeCompare(right.organizationName) || left.surface.localeCompare(right.surface));

  return {
    window,
    windowStart: new Date(windowStartMs).toISOString(),
    asOf: new Date(asOfMs).toISOString(),
    overall: metricsForSamples(windowSamples),
    organizationRows: organizationRows.sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.organizationName.localeCompare(right.organizationName)),
    surfaceRows,
    attributedSampleCount: windowSamples.filter((sample) => sample.organizationId !== null).length,
    unattributedSampleCount: unattributedSamples.length,
  };
}

export function fleetHealthStatusLabel(status: PlatformFleetHealthStatus) {
  return status === "needs_attention"
    ? "Needs attention"
    : status === "stale"
      ? "Stale telemetry"
      : status === "no_data"
        ? "No telemetry"
        : "Healthy";
}

export function fleetHealthWindowLabel(window: PlatformFleetHealthWindow) {
  return window === "24h"
    ? "Last 24 hours"
    : window === "7d"
      ? "Last 7 days"
      : window === "30d"
        ? "Last 30 days"
        : "Last 60 days";
}

export function fleetHealthSurfaceLabel(surface: string) {
  const words = surface.replace(/[_-]+/g, " ").trim();
  return words.replace(/\b\w/g, (character) => character.toUpperCase()) || "Admin";
}

function metricsForSamples(samples: PlatformFleetHealthSample[]): PlatformFleetHealthMetrics {
  const durations = samples
    .map((sample) => sample.durationMs)
    .filter((duration): duration is number => Number.isFinite(duration) && duration >= 0)
    .sort((left, right) => left - right);
  const timestamps = samples
    .map((sample) => toTimestamp(sample.recordedAt))
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right);
  const errorCount = samples.filter((sample) => sample.error).length;
  return {
    sampleCount: samples.length,
    errorCount,
    errorRatePct: samples.length > 0 ? round((errorCount / samples.length) * 100, 1) : 0,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    firstSampleAt: timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null,
    lastSampleAt: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    surfaceCount: new Set(samples.map((sample) => sample.surface).filter(Boolean)).size,
    onlineSampleCount: samples.filter((sample) => sample.mode === "online").length,
    offlineSampleCount: samples.filter((sample) => sample.mode === "offline").length,
  };
}

function fleetHealthStatus(metrics: PlatformFleetHealthMetrics, asOfMs: number): PlatformFleetHealthStatus {
  if (metrics.sampleCount === 0) return "no_data";
  if (metrics.errorRatePct >= FLEET_HEALTH_ERROR_THRESHOLD_PCT) return "needs_attention";
  const lastSample = metrics.lastSampleAt ? toTimestamp(metrics.lastSampleAt) : null;
  return lastSample === null || asOfMs - lastSample > FLEET_HEALTH_STALE_AFTER_MS ? "stale" : "healthy";
}

function groupSamples(samples: PlatformFleetHealthSample[], keyOf: (sample: PlatformFleetHealthSample) => string) {
  const groups = new Map<string, PlatformFleetHealthSample[]>();
  for (const sample of samples) {
    const key = keyOf(sample);
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }
  return groups;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  if (values.length === 1) return Math.round(values[0]);
  const position = (values.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const interpolated = values[lower] + (values[upper] - values[lower]) * (position - lower);
  return Math.round(interpolated);
}

function round(value: number, decimals: number) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function statusRank(status: PlatformFleetHealthStatus) {
  return status === "needs_attention" ? 0 : status === "stale" ? 1 : status === "no_data" ? 2 : 3;
}

function toTimestamp(value: string | number | undefined) {
  if (value === undefined) return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
