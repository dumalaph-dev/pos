"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  replaceAdminCacheRecords,
  upsertAdminCacheRecords,
  type AdminCacheEntity,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";

export type AdminReadModelBatch = {
  entity: AdminCacheEntity;
  records: Array<{ id: string; data: unknown }>;
  replace?: boolean;
};

function subscribeOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerOnlineStatus() {
  return true;
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

export function AdminReadModelHydrator({
  children,
  scope,
  batches,
}: {
  children: ReactNode;
  scope: AdminCacheScope;
  batches: AdminReadModelBatch[];
}) {
  const router = useRouter();
  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getOnlineStatus, getServerOnlineStatus);
  const [state, setState] = useState<{ phase: "idle" | "ready" | "error"; syncedAt: string | null }>({
    phase: "idle",
    syncedAt: null,
  });
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    let active = true;
    const cacheableBatches = batches.filter((batch) => batch.records.length > 0);
    if (cacheableBatches.length === 0) {
      return () => { active = false; };
    }

    const fetchedAt = new Date().toISOString();
    void Promise.all(cacheableBatches.map((batch) => (
      batch.replace
        ? replaceAdminCacheRecords(scope, batch.entity, batch.records, fetchedAt)
        : upsertAdminCacheRecords(scope, batch.entity, batch.records, fetchedAt)
    )))
      .then(() => {
        if (active) setState({ phase: "ready", syncedAt: fetchedAt });
      })
      .catch(() => {
        if (active) setState({ phase: "error", syncedAt: null });
      });

    return () => {
      active = false;
    };
  }, [batches, isOnline, scope]);

  useEffect(() => {
    if (!isOnline || !wasOffline.current) return;
    wasOffline.current = false;
    router.refresh();
  }, [isOnline, router]);

  const status = !isOnline
    ? "Offline · read-only cached data"
    : state.phase === "ready" && state.syncedAt
      ? `Local cache ready · ${formatSyncTime(state.syncedAt)}`
      : state.phase === "error"
        ? "Online · local cache unavailable in this browser"
        : "Online · cached read model unchanged";

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        data-admin-read-model-status
        className={`mt-4 rounded-card border px-3 py-2 text-xs font-semibold ${isOnline ? "border-line bg-surface-raised text-ink-muted" : "border-warning/30 bg-warning/10 text-ink"}`}
      >
        {status}
        {!isOnline && <span className="ml-1 font-normal">Mutations remain disabled until the connection returns.</span>}
      </div>
      {children}
    </>
  );
}
