export type AdminPerformanceSurface = "dashboard" | "sales" | "orders" | "shifts" | "inventory" | "promotions" | "variance" | "audit" | "customers" | "suppliers" | "expenses" | "branches" | "employees" | "products" | "admin";
export type AdminPerformanceInteraction = "open" | "close" | "back" | "navigation";
export type AdminPerformanceMode = "online" | "offline";

export type AdminPerformanceDetail = {
  surface: AdminPerformanceSurface;
  interaction: AdminPerformanceInteraction;
  mode: AdminPerformanceMode;
  duration_ms: number;
  route_changed: boolean;
  request_started: boolean;
  record_cached: boolean;
  error: boolean;
  resource_count: number;
  resource_transfer_bytes: number;
  resource_encoded_body_bytes: number;
};

type AdminResourceSnapshot = {
  count: number;
  transferBytes: number;
  encodedBodyBytes: number;
};

type AdminInteractionToken = {
  id: string;
  surface: AdminPerformanceSurface;
  interaction: AdminPerformanceInteraction;
  startedAt: number;
  resourceSnapshot: AdminResourceSnapshot;
} | null;

let interactionSequence = 0;

function connectionMode(): AdminPerformanceMode {
  return typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline";
}

function resourceSnapshot(): AdminResourceSnapshot {
  if (typeof performance === "undefined") return { count: 0, transferBytes: 0, encodedBodyBytes: 0 };

  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return entries.reduce<AdminResourceSnapshot>((snapshot, entry) => ({
    count: snapshot.count + 1,
    transferBytes: snapshot.transferBytes + (Number.isFinite(entry.transferSize) ? entry.transferSize : 0),
    encodedBodyBytes: snapshot.encodedBodyBytes + (Number.isFinite(entry.encodedBodySize) ? entry.encodedBodySize : 0),
  }), { count: 0, transferBytes: 0, encodedBodyBytes: 0 });
}

/**
 * Start a non-sensitive browser timing for a local-first admin interaction.
 * The token is null during server rendering so callers can use it directly in
 * client components without adding hydration-specific branches.
 */
export function beginAdminInteraction(
  surface: AdminPerformanceSurface,
  interaction: AdminPerformanceInteraction,
): AdminInteractionToken {
  if (typeof window === "undefined" || typeof performance === "undefined") return null;

  interactionSequence += 1;
  const id = `dumala-admin-${surface}-${interaction}-${interactionSequence}`;
  const startedAt = performance.now();
  performance.mark(`${id}:start`);
  return { id, surface, interaction, startedAt, resourceSnapshot: resourceSnapshot() };
}

/**
 * Complete an interaction after React has committed the modal state. The
 * CustomEvent makes the metric inspectable in browser QA without sending
 * order, customer, staff, or authentication data anywhere.
 */
export function completeAdminInteraction(
  token: AdminInteractionToken,
  detail: Partial<Omit<AdminPerformanceDetail, "surface" | "interaction" | "duration_ms" | "mode">> = {},
): void {
  if (!token || typeof window === "undefined" || typeof performance === "undefined") return;

  performance.mark(`${token.id}:end`);
  performance.measure(token.id, `${token.id}:start`, `${token.id}:end`);

  const resourcesAtEnd = resourceSnapshot();

  const metric: AdminPerformanceDetail = {
    surface: token.surface,
    interaction: token.interaction,
    mode: connectionMode(),
    duration_ms: Math.round(performance.now() - token.startedAt),
    route_changed: detail.route_changed ?? false,
    request_started: detail.request_started ?? false,
    record_cached: detail.record_cached ?? true,
    error: detail.error ?? false,
    resource_count: Math.max(0, resourcesAtEnd.count - token.resourceSnapshot.count),
    resource_transfer_bytes: Math.max(0, Math.round(resourcesAtEnd.transferBytes - token.resourceSnapshot.transferBytes)),
    resource_encoded_body_bytes: Math.max(0, Math.round(resourcesAtEnd.encodedBodyBytes - token.resourceSnapshot.encodedBodyBytes)),
  };

  window.dispatchEvent(new CustomEvent<AdminPerformanceDetail>("dumala:admin-performance", { detail: metric }));

  if (process.env.NODE_ENV !== "production") {
    console.debug("[Dumala admin performance]", metric);
  }

  performance.clearMarks(`${token.id}:start`);
  performance.clearMarks(`${token.id}:end`);
  performance.clearMeasures(token.id);
}

/** Complete after the modal render has had one browser paint opportunity. */
export function completeAdminInteractionNextFrame(
  token: AdminInteractionToken,
  detail: Partial<Omit<AdminPerformanceDetail, "surface" | "interaction" | "duration_ms" | "mode">> = {},
): void {
  if (!token || typeof window === "undefined") return;
  window.requestAnimationFrame(() => completeAdminInteraction(token, detail));
}
