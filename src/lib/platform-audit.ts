export const PLATFORM_AUDIT_SOURCE_FILTERS = ["all", "organization", "operator"] as const;
export type PlatformAuditSourceFilter = (typeof PLATFORM_AUDIT_SOURCE_FILTERS)[number];

export const PLATFORM_AUDIT_DATE_FILTERS = ["all", "24h", "7d", "30d"] as const;
export type PlatformAuditDateFilter = (typeof PLATFORM_AUDIT_DATE_FILTERS)[number];

export type PlatformAuditEvent = {
  id: string;
  source: "organization" | "operator";
  organizationId: string | null;
  organizationName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type PlatformAuditFilters = {
  search?: string;
  source?: PlatformAuditSourceFilter;
  action?: string;
  organizationId?: string;
  dateRange?: PlatformAuditDateFilter;
  asOf?: string | number;
};

const ACTION_LABELS: Record<string, string> = {
  "platform.access_grant.adjusted": "Access grant adjusted",
  "platform.access_grant.created": "Access grant created",
  "platform.access_grant.revoked": "Access grant revoked",
  "platform.organization.restored": "Organization restored",
  "platform.organization.suspended": "Organization suspended",
  "platform.operator.invited": "Operator invited",
  "platform.operator.reactivated": "Operator reactivated",
  "platform.operator.revoked": "Operator revoked",
  "platform.operator.role_changed": "Operator role changed",
  "platform.support_case.opened": "Support case opened",
  "platform.trial.extended": "Trial extended",
  "platform.trial_feedback.updated": "Trial feedback updated",
};

export function filterPlatformAuditEvents(events: PlatformAuditEvent[], filters: PlatformAuditFilters = {}) {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const source = filters.source ?? "all";
  const action = filters.action ?? "all";
  const organizationId = filters.organizationId ?? "all";
  const dateRange = filters.dateRange ?? "all";
  const asOfMs = toTimestamp(filters.asOf) ?? Date.now();
  const minimumTimestamp = dateRange === "24h"
    ? asOfMs - 24 * 60 * 60 * 1000
    : dateRange === "7d"
      ? asOfMs - 7 * 24 * 60 * 60 * 1000
      : dateRange === "30d"
        ? asOfMs - 30 * 24 * 60 * 60 * 1000
        : null;

  return events.filter((event) => {
    if (source !== "all" && event.source !== source) return false;
    if (action !== "all" && event.action !== action) return false;
    if (organizationId !== "all" && event.organizationId !== organizationId) return false;
    if (minimumTimestamp !== null) {
      const createdAt = toTimestamp(event.createdAt);
      if (createdAt === null || createdAt < minimumTimestamp || createdAt > asOfMs) return false;
    }
    if (!search) return true;

    const haystack = [
      event.action,
      platformAuditActionLabel(event.action),
      event.entity,
      event.entityId,
      event.organizationName,
      event.organizationId,
      event.actorEmail,
      event.actorId,
      event.source,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

export function platformAuditActionLabel(action: string) {
  const known = ACTION_LABELS[action];
  if (known) return known;

  const parts = action.split(".").filter(Boolean);
  const words = parts.slice(parts[0] === "platform" ? 1 : 0).join(" ").replace(/[_-]+/g, " ");
  return words.replace(/\b\w/g, (character) => character.toUpperCase()) || "Platform action";
}

export function platformAuditSourceLabel(source: PlatformAuditEvent["source"]) {
  return source === "operator" ? "Operator membership" : "Organization action";
}

export function platformAuditDateFilterLabel(filter: PlatformAuditDateFilter) {
  return filter === "24h"
    ? "Last 24 hours"
    : filter === "7d"
      ? "Last 7 days"
      : filter === "30d"
        ? "Last 30 days"
        : "All time";
}

export function platformAuditSourceFilterLabel(filter: PlatformAuditSourceFilter) {
  return filter === "organization"
    ? "Organization actions"
    : filter === "operator"
      ? "Operator membership"
      : "All platform events";
}

function toTimestamp(value: string | number | undefined) {
  if (value === undefined) return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
