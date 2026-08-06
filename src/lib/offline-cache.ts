/**
 * Cache Storage is origin-scoped and outlives the Supabase session, so signing
 * out has to remove session-scoped entries explicitly — otherwise anything the
 * app-shell worker stored stays readable to the next person on a shared POS
 * terminal (offline, where the worker serves from cache). `public/sw.js`
 * allowlists only public entries, so this cleanup preserves the shell and
 * immutable bundles needed for the next offline launch.
 *
 * Deliberately does NOT touch IndexedDB: Dexie holds the offline order queue
 * (PRD §6.3) and unsynced sales must survive a shift change.
 */
const CACHE_PREFIX = "pos-shell-";

/**
 * Removes non-public entries from app-shell caches, then asks the active worker
 * to re-precache the public shell. Immutable bundles are deliberately kept:
 * deleting them would make the next offline launch fail after sign-out.
 */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map(async (key) => {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => !isPublicCacheEntry(request))
          .map((request) => cache.delete(request)),
      );
    }));
  } catch {
    // Storage denied or unavailable — never block sign-out on it.
  }

  // Best effort, and only after the delete resolved so the worker cannot race
  // the wipe by refilling first.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PRECACHE_SHELL" });
  } catch {
    /* no controller (dev, unsupported, first load) — nothing to refill */
  }
}

function isPublicCacheEntry(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === "/" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/food/")) return true;
    if (["/manifest.webmanifest", "/icon.svg", "/icon-192x192.png", "/icon-512x512.png"].includes(url.pathname)) return true;
    return url.pathname === "/_next/image" && (url.searchParams.get("url") || "").startsWith("/food/");
  } catch {
    return false;
  }
}
