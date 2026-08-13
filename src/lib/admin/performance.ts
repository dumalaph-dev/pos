export type AdminPerformanceSurface = "dashboard" | "sales" | "orders" | "shifts" | "admin";
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
};

type AdminInteractionToken = {
  id: string;
  surface: AdminPerformanceSurface;
  interaction: AdminPerformanceInteraction;
  startedAt: number;
} | null;

let interactionSequence = 0;

function connectionMode(): AdminPerformanceMode {
  return typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline";
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
  return { id, surface, interaction, startedAt };
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

  const metric: AdminPerformanceDetail = {
    surface: token.surface,
    interaction: token.interaction,
    mode: connectionMode(),
    duration_ms: Math.round(performance.now() - token.startedAt),
    route_changed: detail.route_changed ?? false,
    request_started: detail.request_started ?? false,
    record_cached: detail.record_cached ?? true,
    error: detail.error ?? false,
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
