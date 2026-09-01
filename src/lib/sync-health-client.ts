"use client";

import { getDeviceId } from "@/lib/offline";
import type { PlatformSyncHealthQueueSnapshot } from "@/lib/platform-sync-health";

export function reportSyncHealthSnapshot({
  storeId,
  online,
  queues,
}: {
  storeId: string;
  online: boolean;
  queues: PlatformSyncHealthQueueSnapshot[];
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
      oldest_pending_at: queue.oldestPendingAt,
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
