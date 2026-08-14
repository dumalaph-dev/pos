"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

/**
 * Refreshes server-rendered admin data after a tab returns to the foreground,
 * reconnects, or has been open long enough to become stale. Local dialogs and
 * browser URL state remain in place because this only refreshes the RSC data
 * behind the current route.
 */
export function AdminBackgroundRefresh({ intervalMs = DEFAULT_REFRESH_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);
  const refreshing = useRef(false);

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || refreshing.current) return;
      if (Date.now() - lastRefreshAt.current < intervalMs) return;
      refreshing.current = true;
      lastRefreshAt.current = Date.now();
      router.refresh();
      window.setTimeout(() => {
        refreshing.current = false;
      }, 1200);
    };

    const refreshOnReconnect = () => {
      if (navigator.onLine) {
        lastRefreshAt.current = 0;
        refreshIfStale();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };

    const interval = window.setInterval(refreshIfStale, Math.min(intervalMs, 30_000));
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("online", refreshOnReconnect);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("online", refreshOnReconnect);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs, router]);

  return null;
}
