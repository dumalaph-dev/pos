"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshAdminInventoryViews } from "@/app/admin/inventory/actions";
import { createClient } from "@/lib/supabase/client";
import {
  createAdminCacheScopeKey,
  adminMutationErrorMessage,
  flushAdminMutationOutbox,
  getAdminMutationStatus,
  getAdminMutationHealth,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";
import { PLATFORM_SYNC_HEALTH_REPORT_INTERVAL_MS, type PlatformSyncHealthQueue } from "@/lib/platform-sync-health";
import { reportSyncHealthSnapshot } from "@/lib/sync-health-client";

type SyncState = {
  phase: "idle" | "syncing" | "waiting" | "synced" | "error";
  pending: number;
  failed: number;
  conflicts: number;
  message: string | null;
};

export function AdminMutationSync({ scope }: { scope: AdminCacheScope }) {
  const router = useRouter();
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const scopeKey = createAdminCacheScopeKey(scope);
  const [state, setState] = useState<SyncState>({ phase: "idle", pending: 0, failed: 0, conflicts: 0, message: null });

  const reportHealth = useCallback(async (successful = false) => {
    if (!scope.storeId) return;
    try {
      const health = await getAdminMutationHealth(scope);
      reportSyncHealthSnapshot({
        storeId: scope.storeId,
        online: typeof navigator !== "undefined" && navigator.onLine,
        queues: [health],
        successfulQueues: successful && typeof navigator !== "undefined" && navigator.onLine ? ["admin_mutations" as PlatformSyncHealthQueue] : [],
      });
    } catch {
      // Health reporting must not block the admin workspace when IndexedDB is unavailable.
    }
  }, [scope]);

  const sync = useCallback(async () => {
    try {
      const status = await getAdminMutationStatus(scope);
      if (status.pending === 0) {
        setState((current) => current.phase === "synced" ? current : { phase: "idle", pending: 0, failed: 0, conflicts: 0, message: null });
        void reportHealth(typeof navigator !== "undefined" && navigator.onLine);
        return;
      }

      void reportHealth(false);

      if (!navigator.onLine) {
        setState({
          phase: "waiting",
          pending: status.pending,
          failed: status.failed,
          conflicts: status.conflicts,
          message: status.lastError,
        });
        return;
      }

      clientRef.current ??= createClient();
      setState({ phase: "syncing", pending: status.pending, failed: status.failed, conflicts: status.conflicts, message: null });
      const result = await flushAdminMutationOutbox(clientRef.current, scope);
      if (result.synced > 0) {
        try {
          await refreshAdminInventoryViews();
        } catch {
          // The mutation is already committed; the next report visit still
          // reads the ledger directly if route invalidation is unavailable.
        }
        router.refresh();
      }
      setState({
        phase: result.failed > 0 || result.conflicts > 0 ? "error" : result.pending > 0 ? "waiting" : "synced",
        pending: result.pending,
        failed: result.failed,
        conflicts: result.conflicts,
        message: result.lastError,
      });
      void reportHealth(result.failed === 0 && result.conflicts === 0 && result.pending === 0);
    } catch (error) {
      void reportHealth();
      setState((current) => ({
        phase: "error",
        pending: Math.max(1, current.pending),
        failed: Math.max(1, current.failed),
        conflicts: current.conflicts,
        message: adminMutationErrorMessage(error),
      }));
    }
  }, [reportHealth, router, scope]);

  useEffect(() => {
    void reportHealth();
    const interval = window.setInterval(() => { void reportHealth(); }, PLATFORM_SYNC_HEALTH_REPORT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [reportHealth]);

  useEffect(() => {
    const onOnline = () => { void sync(); };
    const onQueued = (event: Event) => {
      const detail = (event as CustomEvent<{ scopeKey?: string }>).detail;
      if (detail?.scopeKey === scopeKey) void sync();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("dumala:admin-mutation-queued", onQueued);
    const interval = window.setInterval(() => { void sync(); }, 30_000);
    void sync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("dumala:admin-mutation-queued", onQueued);
      window.clearInterval(interval);
    };
  }, [scopeKey, sync]);

  if (state.phase === "idle") return null;

  const tone = state.phase === "error" && state.conflicts > 0 ? "border-danger/25 bg-danger-soft text-danger"
    : state.phase === "synced" ? "border-success/25 bg-success/10 text-success"
      : "border-warning/30 bg-warning/10 text-ink";
  const label = state.phase === "syncing"
    ? "Syncing offline admin changes…"
    : state.phase === "synced"
      ? "Offline admin changes synced."
      : state.phase === "error"
        ? state.conflicts > 0
          ? `Offline admin changes need review (${state.conflicts}).`
          : `Offline admin changes waiting to retry (${state.pending}).`
        : `Offline admin changes queued (${state.pending}).`;

  return (
    <div role="status" aria-live="polite" data-admin-mutation-sync className={`mx-4 mt-3 rounded-card border px-3 py-2 text-xs font-semibold lg:mx-0 ${tone}`}>
      {label}
      {state.message && <span className="ml-1 font-normal">· {state.message}</span>}
    </div>
  );
}
