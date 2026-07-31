"use client";

/**
 * Registers the app-shell service worker in PRODUCTION builds only.
 * (In dev, Turbopack chunks have stable names, so a cache-first SW serves
 * stale bundles and poisons the session.) Shows an update prompt when a
 * new version is available (skipWaiting + reload, per P2 spec).
 */
import { useEffect, useState } from "react";

export default function SWRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      })
      .catch(() => {
        /* SW unsupported/blocked — app still works online */
      });
    return () => {
      registration?.removeEventListener?.("updatefound", () => {});
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-card border border-line bg-raised px-4 py-3 shadow-[var(--shadow-pop)]">
      <p className="text-sm font-semibold text-ink">A new version is available.</p>
      <button
        onClick={() => {
          navigator.serviceWorker?.getRegistration().then((reg) => {
            reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          });
        }}
        className="rounded-btn bg-primary px-3 py-1.5 text-sm font-bold text-primary-fg"
      >
        Reload
      </button>
    </div>
  );
}
