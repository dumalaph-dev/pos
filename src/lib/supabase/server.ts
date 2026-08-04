import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { VERIFIED_USER_EMAIL_HEADER, VERIFIED_USER_ID_HEADER } from "@/lib/auth/identity-headers";

export type AuthenticatedUser = { id: string; email: string | null };

/**
 * Server Supabase client (Server Components, Route Handlers, Server Actions).
 *
 * Request-scoped: the layout and the page share one client per render instead
 * of each building its own GoTrue instance and re-parsing the cookie jar.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  );
});

/**
 * Identity of the caller, resolved without touching the network.
 *
 * Middleware performs the authoritative token verification once per request
 * and forwards the result on `x-verified-user-*` (stripping any client-supplied
 * copy first), so every layout, page and action reuses that single check. This
 * is what keeps admin navigation off the ~250ms Supabase Auth round trip that
 * `getClaims()` costs while the project signs JWTs with the legacy HS256
 * secret — it cannot verify a symmetric signature locally and falls back to
 * `getUser()`.
 *
 * The fallback below covers requests middleware did not process (and any
 * future runtime where the headers are absent), so this is never the only
 * check standing between a caller and their data — Postgres re-validates the
 * token and applies RLS on every query regardless.
 */
const resolveAuthenticatedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const headerList = await headers();
  const verifiedId = headerList.get(VERIFIED_USER_ID_HEADER);
  if (verifiedId) {
    return { id: verifiedId, email: headerList.get(VERIFIED_USER_EMAIL_HEADER) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

export function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  return resolveAuthenticatedUser();
}
