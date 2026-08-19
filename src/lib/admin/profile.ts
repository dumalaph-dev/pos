import { cache } from "react";
import { createAdminClient } from "@/lib/employee-auth";
import { readCurrentComplimentaryAccess } from "@/lib/platform-access-server";
import { createClient } from "@/lib/supabase/server";
import { createTtlCache } from "@/lib/ttl-cache";
import { transitionExpiredTrial } from "@/lib/trial-server";

export type AdminProfile = {
  full_name: string | null;
  role: string | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: {
    name?: string;
    settings?: unknown;
    account_status?: "active" | "suspended" | null;
    suspension_reason?: string | null;
    suspended_at?: string | null;
    subscription_status?: string | null;
    subscription_trial_started_at?: string | null;
    subscription_trial_ends_at?: string | null;
    subscription_current_period_end?: string | null;
    subscription_billing_mode?: string | null;
    subscription_provider_subscription_id?: string | null;
    subscription_provider_payment_intent_id?: string | null;
    complimentary_access_grant_id?: string | null;
    complimentary_access_until?: string | null;
    complimentary_access_source?: string | null;
    complimentary_access_reason?: string | null;
  } | null;
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
        .select("full_name, role, org_id, store_id, password_change_required, organizations!profiles_org_id_fkey(name, settings, account_status, suspension_reason, suspended_at, subscription_status, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode, subscription_provider_subscription_id, subscription_provider_payment_intent_id), stores(name)")
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

      const profile = (data as AdminProfile) ?? null;
      if (!profile || profile.organizations?.account_status !== "active") return profile;

      const admin = createAdminClient();
      const complimentaryAccess = admin
        ? await readCurrentComplimentaryAccess(admin, profile.org_id)
        : null;
      if (complimentaryAccess && profile.organizations) {
        profile.organizations = {
          ...profile.organizations,
          complimentary_access_grant_id: complimentaryAccess.grantId,
          complimentary_access_until: complimentaryAccess.until,
          complimentary_access_source: complimentaryAccess.source,
          complimentary_access_reason: complimentaryAccess.reason,
        };
      }

      const transition = await transitionExpiredTrial(profile.org_id, {
        status: profile.organizations.subscription_status,
        trialStartedAt: profile.organizations.subscription_trial_started_at,
        trialEndsAt: profile.organizations.subscription_trial_ends_at,
        currentPeriodEnd: profile.organizations.subscription_current_period_end,
        complimentaryAccessUntil: profile.organizations.complimentary_access_until,
      });
      if (transition.transitioned && profile.organizations) {
        profile.organizations = {
          ...profile.organizations,
          subscription_status: transition.status,
        };
      } else if (transition.status !== profile.organizations.subscription_status && profile.organizations) {
        profile.organizations = {
          ...profile.organizations,
          subscription_status: transition.status,
        };
      }
      return profile;
    });
  } catch {
    return null;
  }
});

function isMissingAccountLifecycleSchema(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("account_status")
    || normalized.includes("suspension_reason")
    || normalized.includes("suspended_at")
    || normalized.includes("subscription_status")
    || normalized.includes("subscription_trial_started_at")
    || normalized.includes("subscription_trial_ends_at")
    || normalized.includes("subscription_current_period_end")
    || normalized.includes("subscription_billing_mode")
    || normalized.includes("subscription_provider_subscription_id")
    || normalized.includes("subscription_provider_payment_intent_id")
  ) && (normalized.includes("column") || normalized.includes("schema cache") || normalized.includes("does not exist"));
}

/**
 * Drops a cached profile. Call from any server action that writes to
 * `profiles` — role, branch, name or the password gate — so the next render
 * reads the new row instead of the cached one.
 */
export function invalidateAdminProfile(userId: string) {
  profiles.invalidate(userId);
}

/**
 * Provider webhooks do not have a browser user id, but a successful payment
 * must invalidate every cached tenant profile before the next POS navigation.
 */
export async function invalidateAdminProfilesForOrganization(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) return;

  const result = await admin.from("profiles").select("id").eq("org_id", organizationId);
  if (result.error) return;
  for (const profile of result.data ?? []) {
    if (typeof profile.id === "string") profiles.invalidate(profile.id);
  }
}
