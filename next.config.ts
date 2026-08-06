import type { NextConfig } from "next";

const configuredSupabaseImagePattern = (() => {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: "/storage/v1/object/public/product-images/**",
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/product-images/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/product-images/**" },
      { protocol: "http", hostname: "localhost", port: "54321", pathname: "/storage/v1/object/public/product-images/**" },
      ...(configuredSupabaseImagePattern ? [configuredSupabaseImagePattern] : []),
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
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
};

export default nextConfig;
