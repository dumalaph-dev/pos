import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
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
