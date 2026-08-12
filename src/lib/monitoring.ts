export type MonitoringContext = Record<string, string | number | boolean | null | undefined>;

type SyncFailureContext = MonitoringContext & {
  queue: "orders" | "audit";
};

const recentSyncFailures = new Map<string, number>();
const SYNC_FAILURE_DEDUPE_MS = 5 * 60 * 1000;

function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);
  try {
    return new Error(JSON.stringify(reason));
  } catch {
    return new Error("Unknown application error");
  }
}

function errorKey(error: Error): string {
  return `${error.name}:${error.message}`.slice(0, 240);
}

/** Report a handled error through the local/server console without blocking POS work. */
export function reportError(reason: unknown, context: MonitoringContext = {}): void {
  const error = asError(reason);
  const payload = {
    event: "handled_application_error",
    name: error.name,
    message: error.message,
    context,
  };

  // Server-side stderr is captured by Vercel. Browser-side console output is
  // still useful during device support and never becomes a checkout dependency.
  if (typeof window === "undefined") console.error(JSON.stringify(payload));
  else console.error("[Dumala monitoring]", payload, error);
}

/**
 * Sync retries can produce the same network error many times. Keep the local
 * alert useful and avoid flooding the browser console while disconnected.
 */
export function reportSyncFailure(reason: unknown, context: SyncFailureContext): void {
  const error = asError(reason);
  const key = `${context.queue}:${errorKey(error)}`;
  const now = Date.now();
  const lastReportedAt = recentSyncFailures.get(key) ?? 0;
  if (now - lastReportedAt < SYNC_FAILURE_DEDUPE_MS) return;
  recentSyncFailures.set(key, now);
  reportError(error, { ...context, area: "offline-sync" });
}
