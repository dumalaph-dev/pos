"use client";

import { getDeviceId } from "@/lib/offline";
import type { PlatformSyncHealthQueue, PlatformSyncHealthQueueSnapshot } from "@/lib/platform-sync-health";

export function reportSyncHealthSnapshot({
  storeId,
  online,
  queues,
  successfulQueues = [],
}: {
  storeId: string;
  online: boolean;
  queues: PlatformSyncHealthQueueSnapshot[];
  successfulQueues?: PlatformSyncHealthQueue[];
}): void {
  if (typeof window === "undefined" || queues.length === 0) return;

  const body = JSON.stringify({
    store_id: storeId,
    device_key: getDeviceId(),
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
    if (typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon(
        "/api/admin/sync-health",
        new Blob([body], { type: "application/json" }),
      );
      if (accepted) return;
    }

    void fetch("/api/admin/sync-health", {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Health reporting must never block sales or offline recovery.
  }
}
