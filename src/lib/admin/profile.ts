import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createTtlCache } from "@/lib/ttl-cache";

export type AdminProfile = {
  full_name: string | null;
  role: string | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { name?: string; settings?: unknown; account_status?: "active" | "suspended" | null; suspension_reason?: string | null; suspended_at?: string | null } | null;
  stores: { name?: string } | null;
};

/**
 * Every admin page needs the caller's org/branch/role before it can build a
 * single query, which put a ~250ms Supabase round trip on the critical path of
 * every navigation. The fields are near-static, so the lookup is held briefly
 * in the server instance's memory and dropped explicitly whenever a profile is
 * written (see `invalidateAdminProfile`).
 *
 * Keep this short. `password_change_required` is read from here by the admin
 * layout to gate first-login users, so a stale entry that outlives an
 * invalidation would bounce someone back to the password screen.
 */
const PROFILE_TTL_MS = 15_000;
const profiles = createTtlCache<AdminProfile | null>(PROFILE_TTL_MS);

/**
 * Profile data is shared by the admin layout and the active page during one
 * render. React's request-scoped cache prevents the shell and page from
 * issuing the same profile query twice while keeping the result user-scoped;
 * the TTL cache behind it extends that reuse across consecutive navigations.
 */
export const getAdminProfile = cache(async (userId: string): Promise<AdminProfile | null> => {
  try {
    return await profiles.fetch(userId, async () => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, role, org_id, store_id, password_change_required, organizations!profiles_org_id_fkey(name, settings, account_status, suspension_reason, suspended_at), stores(name)")
        .eq("id", userId)
        .maybeSingle();

      if (error && isMissingAccountLifecycleSchema(error.message)) {
        const legacy = await supabase
          .from("profiles")
          .select("full_name, role, org_id, store_id, password_change_required, organizations!profiles_org_id_fkey(name, settings), stores(name)")
          .eq("id", userId)
          .maybeSingle();
        if (legacy.error) throw legacy.error;
        return (legacy.data as AdminProfile) ?? null;
      }

      // Throw rather than return null so a transient failure is not cached as
      // "this user has no profile" for the rest of the TTL.
      if (error) throw error;
      return (data as AdminProfile) ?? null;
    });
  } catch {
    return null;
  }
});

function isMissingAccountLifecycleSchema(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return (normalized.includes("account_status") || normalized.includes("suspension_reason") || normalized.includes("suspended_at")) && (normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("does not exist"));
}

/**
 * Drops a cached profile. Call from any server action that writes to
 * `profiles` — role, branch, name or the password gate — so the next render
 * reads the new row instead of the cached one.
 */
export function invalidateAdminProfile(userId: string) {
  profiles.invalidate(userId);
}
