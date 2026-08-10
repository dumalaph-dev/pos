/**
 * Request headers carrying the identity that middleware already verified.
 *
 * Middleware is the single place that validates the Supabase access token per
 * request. It forwards the result on these headers so layouts, pages, route
 * handlers and server actions can read the caller without paying for a second
 * Auth round trip.
 *
 * Middleware unconditionally strips these headers from the incoming request
 * before setting them, so a client cannot forge them. Keep this module free of
 * imports: it is loaded by both the edge middleware bundle and the Node server
 * bundle.
 */
export const VERIFIED_USER_ID_HEADER = "x-verified-user-id";
export const VERIFIED_USER_EMAIL_HEADER = "x-verified-user-email";
export const REQUEST_PATH_HEADER = "x-pos-request-path";
