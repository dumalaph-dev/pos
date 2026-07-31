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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/pos") || path.startsWith("/admin");

  // Unauthenticated → login
  if (!user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    return NextResponse.redirect(redirect);
  }

  // Cashiers may not reach /admin (role lives in profiles).
  if (user && path.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile && profile.role === "cashier") {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/pos";
      return NextResponse.redirect(redirect);
      // NOTE: the denied attempt should also be written to audit_logs (P0.5).
    }
  }

  return response;
}
