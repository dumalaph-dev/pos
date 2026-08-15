import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-account throttling for the public employee login.
 *
 * Mirrors the offline PIN policy in `src/lib/offline.ts` on purpose — same
 * attempt count, same lockout duration — so staff meet one rule rather than
 * two. See `supabase/migrations/0051_employee_login_throttle.sql` for why the
 * control exists and why unknown employee codes are not tracked.
 *
 * The overriding constraint is that this must never lock out a working cashier.
 * Five attempts is generous against a mistyped password and worthless to
 * someone guessing one, the lock is a minute rather than an escalating penalty,
 * and any successful sign-in clears the counter immediately.
 */
export const EMPLOYEE_LOGIN_MAX_ATTEMPTS = 5;
export const EMPLOYEE_LOGIN_LOCKOUT_MS = 60_000;

/** Attempts stop counting toward a lock once the account has been quiet. */
const ATTEMPT_WINDOW_MS = 15 * 60_000;

type ThrottleRow = {
  failed_attempts: number;
  locked_until: string | null;
  last_attempt_at: string;
};

export type ThrottleStatus =
  | { locked: false }
  | { locked: true; retryAfterSeconds: number };

function secondsUntil(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

/**
 * Checks whether this account is currently locked. Called before the password
 * is verified so a locked account costs no auth round trip.
 */
export async function checkEmployeeLoginLock(
  admin: SupabaseClient,
  storeId: string,
  employeeCode: string,
): Promise<ThrottleStatus> {
  const { data } = await admin
    .from("employee_login_attempts")
    .select("failed_attempts, locked_until, last_attempt_at")
    .eq("store_id", storeId)
    .eq("employee_code", employeeCode)
    .maybeSingle();

  const row = data as ThrottleRow | null;
  if (!row?.locked_until) return { locked: false };
  if (new Date(row.locked_until).getTime() <= Date.now()) return { locked: false };
  return { locked: true, retryAfterSeconds: secondsUntil(row.locked_until) };
}

/**
 * Records a failed password attempt and locks the account once the threshold is
 * reached. Failures older than the attempt window do not accumulate, so a
 * cashier who mistypes once a week never drifts into a lock.
 */
export async function recordFailedEmployeeLogin(
  admin: SupabaseClient,
  orgId: string,
  storeId: string,
  employeeCode: string,
): Promise<void> {
  const { data } = await admin
    .from("employee_login_attempts")
    .select("failed_attempts, locked_until, last_attempt_at")
    .eq("store_id", storeId)
    .eq("employee_code", employeeCode)
    .maybeSingle();

  const row = data as ThrottleRow | null;
  const stale = row ? Date.now() - new Date(row.last_attempt_at).getTime() > ATTEMPT_WINDOW_MS : true;
  const attempts = (stale ? 0 : row?.failed_attempts ?? 0) + 1;
  const locked = attempts >= EMPLOYEE_LOGIN_MAX_ATTEMPTS;

  await admin
    .from("employee_login_attempts")
    .upsert(
      {
        org_id: orgId,
        store_id: storeId,
        employee_code: employeeCode,
        // Restart the count after a lock so the next lock needs a fresh five,
        // rather than every subsequent attempt re-locking immediately.
        failed_attempts: locked ? 0 : attempts,
        locked_until: locked ? new Date(Date.now() + EMPLOYEE_LOGIN_LOCKOUT_MS).toISOString() : null,
        last_attempt_at: new Date().toISOString(),
      },
      { onConflict: "store_id,employee_code" },
    );
}

/** Clears the counter after a successful sign-in. */
export async function clearEmployeeLoginAttempts(
  admin: SupabaseClient,
  storeId: string,
  employeeCode: string,
): Promise<void> {
  await admin
    .from("employee_login_attempts")
    .delete()
    .eq("store_id", storeId)
    .eq("employee_code", employeeCode);
}
