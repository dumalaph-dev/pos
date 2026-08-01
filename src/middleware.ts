import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Keep the session guard on the edge-compatible middleware convention so the
// same auth behavior works with the OpenNext Cloudflare adapter.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, image optimization, favicon,
     * and the PWA/service-worker files (added in P2).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
