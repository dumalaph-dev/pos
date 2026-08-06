"use client";

/**
 * Registers the app-shell service worker in PRODUCTION builds only.
 * (In dev, Turbopack chunks have stable names, so a cache-first SW serves
 * stale bundles and poisons the session.) Shows an update prompt when a
 * new version is available (skipWaiting + reload, per P2 spec).
 */
import { useEffect, useState } from "react";

function cacheLoadedAssets(registration: ServiceWorkerRegistration) {
  const urls = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(window.location.origin));
  registration.active?.postMessage({ type: "CACHE_ASSETS", urls });
}

export default function SWRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    let onUpdateFound: (() => void) | undefined;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting) setUpdateReady(true);
        void navigator.serviceWorker.ready.then(cacheLoadedAssets).catch(() => {});
        onUpdateFound = () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        };
        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {
        /* SW unsupported/blocked — app still works online */
      });
    return () => {
      if (registration && onUpdateFound) registration.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-card border border-line bg-raised px-4 py-3 shadow-[var(--shadow-pop)]">
      <p className="text-sm font-semibold text-ink">A new version is available.</p>
      <button
        onClick={() => {
          navigator.serviceWorker?.getRegistration().then((reg) => {
            if (!reg?.waiting) {
              window.location.reload();
              return;
            }
            const reload = () => {
              navigator.serviceWorker.removeEventListener("controllerchange", reload);
              window.location.reload();
            };
            navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          });
        }}
        className="rounded-btn bg-primary px-3 py-1.5 text-sm font-bold text-primary-fg"
      >
        Reload
      </button>
    </div>
  );
}
