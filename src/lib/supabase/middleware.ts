import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VERIFIED_USER_EMAIL_HEADER, VERIFIED_USER_ID_HEADER } from "@/lib/auth/identity-headers";
import { createTtlCache } from "@/lib/ttl-cache";

type VerifiedUser = { id: string; email: string | null };

/**
 * Verifying an access token costs a Supabase Auth round trip (~250ms) while the
 * project signs JWTs with the legacy HS256 secret — `getClaims()` cannot verify
 * a symmetric signature locally and falls back to `getUser()`. Access tokens are
 * valid for an hour, so remembering a successful verification for a few seconds
 * removes that round trip from back-to-back navigations without meaningfully
 * widening the window in which a revoked token still passes the route guard.
 *
 * This only ever gates the coarse redirect. Every query still carries the token
 * to Postgres, which validates the signature and applies RLS on its own.
 *
 * Migrating the project to asymmetric JWT signing keys (Supabase dashboard →
 * Authentication → JWT keys) makes `getClaims()` verify locally against the
 * cached JWKS, at which point this cache stops mattering entirely.
 */
const VERIFIED_TOKEN_TTL_MS = 30_000;
const verifiedTokens = createTtlCache<VerifiedUser | null>(VERIFIED_TOKEN_TTL_MS);

/** Tokens are opaque; the signature segment identifies one without retaining it. */
function tokenKey(accessToken: string) {
  const segments = accessToken.split(".");
  return segments.length === 3 ? segments[2] : accessToken;
}

/**
 * Builds the forwarded request headers. Incoming copies are always dropped
 * first so a client cannot present itself as an already-verified user; the
 * headers are rebuilt from `request.headers` at the end of the pass so any
 * cookie refresh performed above is reflected downstream.
 */
function forwardHeaders(request: NextRequest, user: VerifiedUser | null) {
  const headers = new Headers(request.headers);
  headers.delete(VERIFIED_USER_ID_HEADER);
  headers.delete(VERIFIED_USER_EMAIL_HEADER);

  if (user) {
    headers.set(VERIFIED_USER_ID_HEADER, user.id);
    if (user.email) headers.set(VERIFIED_USER_EMAIL_HEADER, user.email);
  }

  return headers;
}

/**
 * Refreshes the Supabase session cookie, enforces coarse route guards, and
 * forwards the verified identity to the render so pages do not repeat the auth
 * round trip. Fine-grained role/branch checks (cashier → /pos) also happen here
 * once a profile exists. No-ops when Supabase env is absent so the app runs
 * pre-setup. See docs/ARCHITECTURE.md §2 and docs/POS_PRD.md §6.1.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured yet — still strip the identity headers so they can never be
  // client-supplied.
  if (!url || !anon) {
    return NextResponse.next({ request: { headers: forwardHeaders(request, null) } });
  }

  // Collected rather than applied inline so the final response (whether a pass
  // through or a redirect) carries a refreshed session cookie.
  type CookieToSet = Parameters<NonNullable<CookieMethodsServer["setAll"]>>[0][number];
  const refreshedCookies: CookieToSet[] = [];

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // `request.cookies.set` rewrites the request's `cookie` header, so the
        // headers snapshot taken below sees the refreshed session.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshedCookies.push(...cookiesToSet);
      },
    },
  });

  let user: VerifiedUser | null = null;
  let checked = false;
  try {
    // Local read of the cookie store; only performs a network call when the
    // access token has expired and needs refreshing.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError) {
      // Refresh failed — treat as "could not check" (see below).
      checked = false;
    } else if (!accessToken) {
      user = null;
      checked = true;
    } else {
      // A throw here (network failure, or a token the Auth API rejects) lands
      // in the catch below and leaves `checked` false, matching the previous
      // offline-tolerant behaviour. It also keeps the failure out of the cache.
      user = await verifiedTokens.fetch(tokenKey(accessToken), async () => {
        const { data, error } = await supabase.auth.getClaims(accessToken);
        if (error) throw error;
        const claims = data?.claims;
        if (!claims || typeof claims.sub !== "string") return null;
        return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
      });

      checked = true;
    }
  } catch {
    // A thrown/resolved error means the auth service was unreachable (offline):
    // let the request through — client-side session checks decide. Never lock
    // staff out of the POS because the network dropped.
    checked = false;
  }

  const path = request.nextUrl.pathname;
  const isPlatformLogin = path === "/platform/login" || path.startsWith("/platform/login/");
  const isProtected = path.startsWith("/pos") || path.startsWith("/admin") || (path.startsWith("/platform") && !isPlatformLogin);
  const isPasswordSetup = path.startsWith("/account/password");
  const isServerAction = request.headers.has("next-action");
  const isRscNavigation = request.headers.get("RSC") === "1" && !isServerAction;

  const withRefreshedCookies = <T extends NextResponse>(response: T) => {
    refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };

  // Unauthenticated → login (only when we could actually check).
  if (checked && !user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = path.startsWith("/platform") ? "/platform/login" : "/login";
    return withRefreshedCookies(NextResponse.redirect(redirect));
  }

  // A provisioned employee must finish the password change before entering
  // the POS or backoffice. RSC navigations enforce this in the destination
  // page's cached profile lookup so middleware does not add a second profile
  // round trip to every client-side transition. Full document loads and
  // server actions keep the middleware check as the coarse security boundary.
  //
  // Deliberately not cached: this flag flips the moment the user sets their
  // password, and a stale `true` here would bounce them straight back.
  if (checked && user && isProtected && !isPasswordSetup && !isRscNavigation) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("password_change_required")
      .eq("id", user.id)
      .maybeSingle();
    if (!profileError && profile?.password_change_required) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/account/password";
      redirect.search = "?required=1";
      return withRefreshedCookies(NextResponse.redirect(redirect));
    }
  }

  // Role checks stay in the Admin server pages and server actions. Avoid a
  // second role query here on every tab transition; middleware only enforces
  // the first-login password gate and the page-level check still redirects
  // cashiers.

  return withRefreshedCookies(
    NextResponse.next({ request: { headers: forwardHeaders(request, checked ? user : null) } }),
  );
}
