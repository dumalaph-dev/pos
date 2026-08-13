"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createAdminCacheScopeKey,
  adminMutationErrorMessage,
  flushAdminMutationOutbox,
  getAdminMutationStatus,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";

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

  const sync = useCallback(async () => {
    try {
      const status = await getAdminMutationStatus(scope);
      if (status.pending === 0) {
        setState((current) => current.phase === "synced" ? current : { phase: "idle", pending: 0, failed: 0, conflicts: 0, message: null });
        return;
      }

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
      if (result.synced > 0) router.refresh();
      setState({
        phase: result.failed > 0 || result.conflicts > 0 ? "error" : result.pending > 0 ? "waiting" : "synced",
        pending: result.pending,
        failed: result.failed,
        conflicts: result.conflicts,
        message: result.lastError,
      });
    } catch (error) {
      setState((current) => ({
        phase: "error",
        pending: Math.max(1, current.pending),
        failed: Math.max(1, current.failed),
        conflicts: current.conflicts,
        message: adminMutationErrorMessage(error),
      }));
    }
  }, [router, scope]);

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
