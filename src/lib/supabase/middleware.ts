import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and enforces coarse route guards.
 * Fine-grained role/branch checks (cashier → /pos) also happen here once a
 * profile exists. No-ops when Supabase env is absent so the app runs pre-setup.
 * See docs/ARCHITECTURE.md §2 and docs/POS_PRD.md §6.1.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response; // not configured yet

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let user: { id: string } | null = null;
  let checked = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    // A resolved error means the auth service was unreachable (offline):
    // let the request through — client-side session checks decide. Never
    // lock staff out of the POS because the network dropped.
    checked = !error;
  } catch {
    // same as above
  }

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/pos") || path.startsWith("/admin");

  // Unauthenticated → login (only when we could actually check).
  if (checked && !user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  // Role checks stay in the Admin server pages and server actions. Avoid a
  // second profiles query here on every tab transition; middleware already
  // verified the session and the page-level check still redirects cashiers.

  return response;
}
