import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const isDevelopment = process.env.NODE_ENV === "development";

const WILDCARD_SUPABASE = { http: ["https://*.supabase.co"], socket: ["wss://*.supabase.co"] };

/**
 * Point the policy at the single Supabase host this deployment actually talks
 * to rather than every project on `*.supabase.co`. A non-TLS URL means a local
 * `supabase start`, which belongs in the dev-only sources below — never in a
 * production policy, so a misconfigured production build falls back to the
 * wildcard instead of smuggling an `http:` origin into the header.
 */
const supabaseSources = (() => {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return WILDCARD_SUPABASE;
  try {
    const { protocol, host } = new URL(configured);
    if (protocol !== "https:") return isDevelopment ? { http: [], socket: [] } : WILDCARD_SUPABASE;
    return { http: [`https://${host}`], socket: [`wss://${host}`] };
  } catch {
    return WILDCARD_SUPABASE;
  }
})();

// Local Supabase plus the dev server's HMR socket. These stay out of a
// production build: an `http:`/`ws:` source is exactly what the HTTP
// Observatory flags as "secure site allows resources to be loaded over HTTP".
const devHttp = isDevelopment ? ["http://127.0.0.1:54321", "http://localhost:54321"] : [];
const devSockets = isDevelopment ? ["ws://127.0.0.1:*", "ws://localhost:*"] : [];

function contentSecurityPolicy(nonce: string) {
  // Nonces cover <style> elements Next emits, but not the style *attributes*
  // React serializes during SSR (progress-bar widths, palette colors,
  // `--lp-delay`). An attribute cannot carry a nonce, so 'unsafe-inline' stays
  // scoped to style-src-attr, where it still blocks injected <style> elements
  // and stylesheet loads from other origins.
  const styleElem = isDevelopment ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;

  return [
    // 'none' rather than 'self': every fetch directive below is spelled out, so
    // anything not listed is denied instead of quietly inheriting a default.
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // style-src is the fallback for browsers predating the -elem/-attr split;
    // it deliberately omits 'unsafe-inline' so those browsers get the strict
    // reading and only lose SSR'd style attributes.
    `style-src ${styleElem}`,
    `style-src-elem ${styleElem}`,
    "style-src-attr 'unsafe-inline'",
    ["img-src 'self' data: blob:", ...supabaseSources.http, ...devHttp].join(" "),
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      ...supabaseSources.http,
      ...supabaseSources.socket,
      "https://api.paymongo.com",
      ...devHttp,
      ...devSockets,
    ].join(" "),
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    // Compatibility fallback for browsers that never shipped worker-src; with
    // default-src 'none' the service worker would otherwise be blocked there.
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

// Keep the session guard on Next.js's request proxy so the same auth behavior
// applies before protected pages and server actions are rendered.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers();
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, image optimization, favicon,
     * and the PWA/service-worker files.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
