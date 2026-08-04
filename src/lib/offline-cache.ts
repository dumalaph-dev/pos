/**
 * Cache Storage is origin-scoped and outlives the Supabase session, so signing
 * out has to wipe it explicitly — otherwise anything the app-shell worker
 * stored stays readable to the next person on a shared POS terminal (offline,
 * where the worker serves from cache). `public/sw.js` only ever caches the
 * public login shell, this is the second lock on the same door.
 *
 * Deliberately does NOT touch IndexedDB: Dexie holds the offline order queue
 * (PRD §6.3) and unsynced sales must survive a shift change.
 */
const CACHE_PREFIX = "pos-shell-";

/**
 * Deletes every app-shell cache, then asks the active worker to re-precache the
 * public shell so the terminal can still launch offline. Awaited before the
 * sign-out request so the cache is gone before the session is.
 */
export async function clearOfflineCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)),
    );
  } catch {
    // Storage denied or unavailable — never block sign-out on it.
    return;
  }

  // Best effort, and only after the delete resolved so the worker cannot race
  // the wipe by refilling first.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "PRECACHE_SHELL" });
  } catch {
    /* no controller (dev, unsupported, first load) — nothing to refill */
  }
}
