import type { NextConfig } from "next";

const securityHeaders = [
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

const publicMenuRootDomain = (process.env.NEXT_PUBLIC_PUBLIC_MENU_ROOT_DOMAIN || "dumala.store").trim().toLowerCase().replace(/\.$/, "");
const escapedPublicMenuRootDomain = publicMenuRootDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const publicMenuHostPattern = `^(?<publicMenuSubdomain>[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\\.${escapedPublicMenuRootDomain}$`;

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
  async rewrites() {
    // The host rewrite keeps the customer-facing URL at
    // `https://branch.dumala.store/` while routing the request to a normal
    // App Router page. The page resolves the subdomain against the active
    // branch record; the rewrite itself never queries the database.
    //
    // The bundled catalog art in `public/food` moved from PNG to WebP
    // (`scripts/optimize-food-images.mjs`). Returning this as an afterFiles
    // rewrite keeps the real `/food/*.webp` files winning while catching
    // retired names from older service-worker caches or stored image URLs.
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: publicMenuHostPattern }],
          destination: "/public-menu/:publicMenuSubdomain",
        },
      ],
      afterFiles: [
        { source: "/food/:name.png", destination: "/food/:name.webp" },
      ],
    };
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
