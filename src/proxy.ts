import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Keep the session guard on Next.js's request proxy so the same auth behavior
// applies before protected pages and server actions are rendered.
export async function proxy(request: NextRequest) {
  return updateSession(request);
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
