"use client";

import { getTelemetryDeviceId } from "@/lib/offline";
import type { PlatformSyncHealthQueue, PlatformSyncHealthQueueSnapshot } from "@/lib/platform-sync-health";

export async function reportSyncHealthSnapshot({
  storeId,
  online,
  queues,
  successfulQueues = [],
}: {
  storeId: string;
  online: boolean;
  queues: PlatformSyncHealthQueueSnapshot[];
  successfulQueues?: PlatformSyncHealthQueue[];
}): Promise<boolean> {
  if (typeof window === "undefined" || queues.length === 0) return false;

  const body = JSON.stringify({
    store_id: storeId,
    device_key: getTelemetryDeviceId(),
    online,
    queues: queues.map((queue) => ({
      queue: queue.queue,
      pending_count: queue.pendingCount,
      failed_count: queue.failedCount,
      conflict_count: queue.conflictCount,
      stuck_count: queue.stuckCount,
      oldest_pending_at: queue.oldestPendingAt,
      sync_succeeded: successfulQueues.includes(queue.queue),
    })),
  });

  try {
    // While the terminal is open, await the authenticated response so a
    // rejected first heartbeat is not mistaken for a successful report.
    // Beacon remains the unload-safe fallback for a hidden page.
    if (document.visibilityState === "hidden" && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(
        "/api/admin/sync-health",
        new Blob([body], { type: "application/json" }),
      );
      return accepted;
    }

    const response = await fetch("/api/admin/sync-health", {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    });
    return response.ok;
  } catch {
    // Health reporting must never block sales or offline recovery. If the
    // request failed before a response existed, a beacon can still carry a
    // best-effort report during a transient fetch/network failure.
    try {
      return typeof navigator.sendBeacon === "function" && navigator.sendBeacon(
        "/api/admin/sync-health",
        new Blob([body], { type: "application/json" }),
      );
    } catch {
      return false;
    }
  }
}
