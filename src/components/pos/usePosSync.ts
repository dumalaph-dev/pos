"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { reportError } from "@/lib/monitoring";
import {
  flushAuditOutbox,
  flushOutbox,
  getOfflineQueueHealth,
  getPendingQueueStatus,
  type SyncedOrderCallback,
  watchPendingStatus,
  type OfflineProfileSnapshot,
  type OfflineSyncScope,
} from "@/lib/offline";
import { PLATFORM_SYNC_HEALTH_REPORT_INTERVAL_MS } from "@/lib/platform-sync-health";
import { reportSyncHealthSnapshot } from "@/lib/sync-health-client";
import { syncReducer, type SyncState } from "@/lib/pos/state-machines";
import type { BrowserSupabaseClient } from "@/lib/supabase/client";

const INITIAL_SYNC_STATE: SyncState = {
  status: "idle",
  pending: 0,
  oldestQueuedSaleAt: null,
  error: null,
};

export function usePosSync({
  supabase,
  offlineProfile,
  requiresOfflineUnlock,
  scope,
  refreshCatalog,
  onRecovered,
  onOffline,
  onOrderSynced,
}: {
  supabase: BrowserSupabaseClient;
  offlineProfile?: OfflineProfileSnapshot | null;
  requiresOfflineUnlock: boolean;
  scope: OfflineSyncScope | null;
  refreshCatalog: () => Promise<void>;
  onRecovered?: () => void;
  onOffline?: () => void;
  onOrderSynced?: SyncedOrderCallback;
}) {
  const [state, dispatch] = useReducer(syncReducer, INITIAL_SYNC_STATE);
  const retryMs = useRef(2000);
  const pendingRef = useRef(0);
  const healthReportInFlight = useRef(false);

  const reportHealth = useCallback(async () => {
    if (!scope?.storeId || healthReportInFlight.current) return;
    healthReportInFlight.current = true;
    try {
      const queues = await getOfflineQueueHealth(scope);
      reportSyncHealthSnapshot({
        storeId: scope.storeId,
        online: typeof navigator !== "undefined" && navigator.onLine,
        queues,
      });
    } catch {
      // Health reporting must not turn a local storage problem into a POS error.
    } finally {
      healthReportInFlight.current = false;
    }
  }, [scope]);

  useEffect(() => {
    if (!scope) {
      pendingRef.current = 0;
      dispatch({ type: "queue_changed", pending: 0, oldestQueuedSaleAt: null });
      return;
    }
    return watchPendingStatus((status) => {
      pendingRef.current = status.pending;
      dispatch({ type: "queue_changed", pending: status.pending, oldestQueuedSaleAt: status.oldestQueuedSaleAt });
    }, scope);
  }, [scope]);

  const flush = useCallback(async () => {
    if (requiresOfflineUnlock || !navigator.onLine || !scope) {
      if (!navigator.onLine) dispatch({ type: "offline" });
      return;
    }

    if (offlineProfile) {
      let sessionUserId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        sessionUserId = session?.user.id ?? null;
      } catch {
        return;
      }
      // Offline PIN unlock is device-local. Server replay still requires the
      // matching authenticated user and therefore remains RLS-authorized.
      if (sessionUserId !== scope.userId) return;
    }

    dispatch({ type: "started" });
    try {
      const [orderResult, auditResult] = await Promise.all([
        flushOutbox(supabase, scope, onOrderSynced),
        flushAuditOutbox(supabase, scope),
      ]);
      const failed = orderResult.failed + auditResult.failed;
      const synced = orderResult.synced + auditResult.synced;
      if (failed > 0) {
        const pending = pendingRef.current;
        dispatch({ type: "failed", error: `Sync issue — ${pending} item${pending === 1 ? "" : "s"} waiting. Retrying automatically.` });
        retryMs.current = Math.min(60000, retryMs.current * 2);
        void reportHealth();
        return;
      }

      if (synced === 0 && pendingRef.current > 0) {
        retryMs.current = Math.min(60000, retryMs.current * 2);
      } else {
        retryMs.current = 2000;
      }
      dispatch({ type: "succeeded" });
      if (synced > 0 && !offlineProfile) {
        onRecovered?.();
        void refreshCatalog();
      }
      void reportHealth();
    } catch (error) {
      reportError(error, { area: "offline-sync", queue: "flush" });
      dispatch({ type: "failed", error: "Sync could not run — queued work is safe and will retry automatically." });
      retryMs.current = Math.min(60000, retryMs.current * 2);
      void reportHealth();
    }
  }, [offlineProfile, onOrderSynced, onRecovered, refreshCatalog, reportHealth, requiresOfflineUnlock, scope, supabase]);

  useEffect(() => {
    if (!scope?.storeId) return;
    void reportHealth();
    const interval = window.setInterval(() => { void reportHealth(); }, PLATFORM_SYNC_HEALTH_REPORT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [reportHealth, scope?.storeId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      void flush().finally(() => {
        timer = setTimeout(tick, retryMs.current);
      });
    };
    tick();

    const handleOnline = () => {
      retryMs.current = 2000;
      dispatch({ type: "online" });
      if (!offlineProfile) {
        onRecovered?.();
        void refreshCatalog();
      }
      void flush();
    };
    const handleOffline = () => {
      dispatch({ type: "offline" });
      onOffline?.();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush, offlineProfile, onOffline, onRecovered, refreshCatalog]);

  return {
    state,
    pending: state.pending,
    oldestQueuedSaleAt: state.oldestQueuedSaleAt,
    syncFailure: state.error,
    flush,
    refreshQueue: scope ? () => getPendingQueueStatus(scope) : async () => ({ pending: 0, oldestQueuedSaleAt: null }),
  };
}
