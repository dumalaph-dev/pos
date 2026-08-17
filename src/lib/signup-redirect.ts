import { resolveSiteUrl } from "./site-url.ts";

const CALLBACK_PATH = "/auth/callback";
const NEXT_PATH = "/admin?welcome=1";

/**
 * Resolve the configured origin used by Supabase signup confirmation links.
 *
 * An absent value stays null so local development can continue to use the
 * request host. A configured Vercel deployment host is passed through the
 * canonical-origin rules and therefore falls back to the production origin.
 */
export function resolveSignupOrigin(configured: string | undefined): string | null {
  return configured?.trim() ? resolveSiteUrl(configured) : null;
}

export function signupConfirmationRedirect(origin: string): string {
  const callback = new URL(CALLBACK_PATH, origin);
  callback.searchParams.set("next", NEXT_PATH);
  return callback.toString();
}
