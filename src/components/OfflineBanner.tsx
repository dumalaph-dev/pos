"use client";

import { useOffline } from "next/offline";
import { useEffect, useState } from "react";

/**
 * Surfaces both browser connectivity events and Next's request-level offline
 * signal. The latter also covers a Wi-Fi connection with no usable upstream.
 */
export default function OfflineBanner() {
  const frameworkOffline = useOffline();
  const [browserOffline, setBrowserOffline] = useState(false);

  useEffect(() => {
    const update = () => setBrowserOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (typeof window !== "undefined" && window.location.pathname === "/display") return null;
  if (!frameworkOffline && !browserOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[55] max-w-[min(22rem,calc(100vw-2rem))] rounded-card border border-warning/35 bg-surface px-4 py-3 text-xs font-semibold text-ink shadow-[var(--shadow-pop)]"
    >
      Offline mode · sales save on this device and sync when the connection returns.
    </div>
  );
}
