import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co http://127.0.0.1:54321 http://localhost:54321",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paymongo.com http://127.0.0.1:54321 ws://127.0.0.1:* http://localhost:54321 ws://localhost:*",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src-attr 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const configuredSupabaseImagePatterns = (() => {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return [];
  try {
    const url = new URL(configuredUrl);
    const base = {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
    return [
      { ...base, pathname: "/storage/v1/object/public/product-images/**" },
      { ...base, pathname: "/storage/v1/object/public/display-gallery/**" },
    ];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/product-images/**" },
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/display-gallery/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/product-images/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/display-gallery/**" },
      { protocol: "http", hostname: "localhost", port: "54321", pathname: "/storage/v1/object/public/product-images/**" },
      { protocol: "http", hostname: "localhost", port: "54321", pathname: "/storage/v1/object/public/display-gallery/**" },
      ...configuredSupabaseImagePatterns,
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Let soft navigations, prefetches, and Server Actions remain pending
    // across a connectivity drop. The service worker below handles full
    // document reloads; this flag covers the in-app path.
    useOffline: true,
    /**
     * Admin pages are all dynamic and all sit behind a `loading.tsx`, so
     * Next only prefetches the loading boundary and — with the default
     * `dynamic: 0` — never reuses a page segment it already fetched. Every
     * click, including going back to a tab opened seconds ago, re-ran the full
     * server render and flashed the "Loading workspace" skeleton.
     *
     * Holding page segments in the client cache makes returning to a recent
     * tab instant with no skeleton at all. Mutations still refresh
     * immediately: the server actions call `revalidatePath`, which drops the
     * matching client cache entries. Shared layouts are unaffected.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
