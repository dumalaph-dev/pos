/* Dumala POS — app-shell service worker (P2).
 * Network-first for navigations (dev/prod safe), cache-first for hashed
 * static assets, precached public shell for the offline launch.
 * Bump VERSION to release a new worker; skipWaiting applies it immediately.
 *
 * SECURITY — nothing behind auth is ever written to Cache Storage.
 * Cache Storage is origin-scoped and survives sign-out, so a cached /admin or
 * /pos document would let the next person on a shared terminal read the
 * previous cashier's customers, sales and employees simply by pulling the
 * network. Only the public login shell (which renders no user data) and
 * immutable hashed assets are stored; every other navigation is network-only
 * and falls back to the login shell when the network is down. This is an
 * allowlist: a new route is uncacheable until deliberately added below.
 */
const VERSION = "pos-shell-v5";

/* The login page at "/login" is the only document safe to serve to anyone.
 * /pos and /admin are deliberately NOT precached: they 302 to "/login" when
 * unauthenticated (so `addAll` rejects on the redirected response and aborts
 * the whole install), and when authenticated they are exactly the private HTML
 * this worker must never retain. The offline launch is carried by this shell
 * plus the hashed bundles below — per ARCHITECTURE.md §3 the sell screen
 * renders from Dexie, not from server-rendered HTML. */
const PUBLIC_SHELL = "/login";
const SHELL = [PUBLIC_SHELL];
const PUBLIC_ASSETS = [
  "/manifest.webmanifest",
  "/logo.png",
  "/badge.png",
  "/icon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

/** Only the public login document may enter the cache; query string ignored. */
function isPublicShell(url) {
  return url.pathname === PUBLIC_SHELL;
}

/** A redirect to another page is not the login shell. */
function isCacheableShellResponse(res) {
  return res.ok && !res.redirected && res.type === "basic";
}

function isPublicAsset(url) {
  if (url.pathname.startsWith("/food/")) return true;
  if (["/manifest.webmanifest", "/logo.png", "/badge.png", "/icon.svg", "/icon-192x192.png", "/icon-512x512.png"].includes(url.pathname)) return true;
  // Next Image proxies the local demo/catalog images through this route. Only
  // allow the public /food source path; remote product images stay uncached.
  return url.pathname === "/_next/image" && (url.searchParams.get("url") || "").startsWith("/food/");
}

function cacheFirst(req) {
  return caches.open(VERSION).then((cache) =>
    cache.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    ),
  );
}

function cacheCurrentAssets(urls) {
  if (!Array.isArray(urls)) return Promise.resolve();
  return caches.open(VERSION).then((cache) =>
    Promise.all(
      urls.slice(0, 250).map((rawUrl) => {
        try {
          const url = new URL(rawUrl, self.location.origin);
          if (url.origin !== self.location.origin) return null;
          if (!url.pathname.startsWith("/_next/static/") && !isPublicAsset(url)) return null;
          return fetch(url.href)
            .then((res) => {
              if (res.ok) return cache.put(url.href, res.clone());
              return null;
            })
            .catch(() => null);
        } catch {
          return null;
        }
      }),
    ),
  );
}

function precacheShell() {
  return caches.open(VERSION).then((cache) => cache.addAll([...SHELL, ...PUBLIC_ASSETS]));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("pos-shell-") && k !== VERSION)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  // Sent by the client after it wipes the cache on sign-out, so the terminal
  // can still boot offline for the next shift. See src/lib/offline-cache.ts.
  if (type === "PRECACHE_SHELL") {
    event.waitUntil(precacheShell().catch(() => {}));
    return;
  }
  if (type === "CACHE_ASSETS") {
    event.waitUntil(cacheCurrentAssets(event.data.urls).catch(() => {}));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first. Only the login shell is ever stored; anything
  // else (/admin/**, /pos, /products, /account/**) falls back to that shell
  // offline instead of to a previous session's rendered page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isPublicShell(url) && isCacheableShellResponse(res)) {
            // Keyed on the bare path so "/?signed-out=1" and friends do not
            // fragment the single shell entry.
            caches.open(VERSION).then((c) => c.put(PUBLIC_SHELL, res.clone()));
          }
          return res;
        })
        .catch(() =>
          // Scoped to this VERSION: a bare caches.match() would still hit an
          // older cache that activate has not deleted yet.
          caches
            .open(VERSION)
            .then((c) => c.match(PUBLIC_SHELL))
            .then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  // Hashed static assets are immutable and contain no session data. Local
  // food/icon assets are public too, so the cached POS can render its tiles.
  if (url.pathname.startsWith("/_next/static/") || isPublicAsset(url)) {
    event.respondWith(cacheFirst(req));
  }
});
