import { createAdminClient } from "@/lib/employee-auth";
import { readCurrentComplimentaryAccess } from "@/lib/platform-access-server";
import { isSubscriptionAccessCurrent } from "@/lib/trial";
import { transitionExpiredTrial } from "@/lib/trial-server";

export type StoreAccessRecord = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  staff_login_key: string;
  staff_login_slug: string;
};

const STAFF_LOGIN_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_LOGIN_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeStoreAccessKey(value: string) {
  return value.trim().toLowerCase();
}

export function isStoreAccessKey(value: string) {
  return STAFF_LOGIN_KEY_PATTERN.test(value);
}

export function normalizeStaffLoginSlug(value: string) {
  return value.trim().toLowerCase();
}

export function isStaffLoginSlug(value: string) {
  return STAFF_LOGIN_SLUG_PATTERN.test(value);
}

export function normalizeStaffAccessValue(value: string) {
  return value.trim().toLowerCase();
}

export function isStaffAccessValue(value: string) {
  return isStoreAccessKey(value) || isStaffLoginSlug(value);
}

export function staffLoginPath(slug: string) {
  return `/staff/${encodeURIComponent(normalizeStaffLoginSlug(slug))}`;
}

export function legacyStaffLoginPath(key: string) {
  return `/store/${encodeURIComponent(normalizeStoreAccessKey(key))}/login`;
}

/**
 * Reads only the public store identity needed to render a staff sign-in page.
 * This intentionally uses the server-only service role because the page is
 * unauthenticated; the UUID key or human-readable slug grants no access
 * without employee credentials.
 */
export async function getStoreByStaffKey(value: string): Promise<StoreAccessRecord | null> {
  const accessValue = normalizeStaffAccessValue(value);
  if (!isStaffAccessValue(accessValue)) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const isLegacyKey = isStoreAccessKey(accessValue);
  const lookupColumn = isLegacyKey ? "staff_login_key" : "staff_login_slug";
  const lookup = isLegacyKey
    ? await admin.from("stores").select("id, org_id, name, is_active, staff_login_key").eq(lookupColumn, accessValue).eq("is_active", true).maybeSingle()
    : await admin.from("stores").select("id, org_id, name, is_active, staff_login_key, staff_login_slug").eq(lookupColumn, accessValue).eq("is_active", true).maybeSingle();
  const data = lookup.data as { org_id?: unknown; staff_login_key?: unknown; staff_login_slug?: unknown } | null;

  if (lookup.error || !data || typeof data.staff_login_key !== "string") return null;
  if (!isLegacyKey && typeof data.staff_login_slug !== "string") return null;
  if (typeof data.org_id !== "string") return null;

  // Staff links use the service role because the login page is public, so the
  // organization entitlement must be checked explicitly before a cashier can
  // establish a session that would otherwise reach the POS route.
  const lifecycle = await admin
    .from("organizations")
    .select("subscription_status, subscription_trial_started_at, subscription_trial_ends_at, subscription_current_period_end, subscription_billing_mode")
    .eq("id", data.org_id)
    .maybeSingle();
  if (!lifecycle.error && lifecycle.data) {
    const lifecycleInput = {
      status: lifecycle.data.subscription_status,
      trialStartedAt: lifecycle.data.subscription_trial_started_at,
      trialEndsAt: lifecycle.data.subscription_trial_ends_at,
      currentPeriodEnd: lifecycle.data.subscription_current_period_end,
      billingMode: lifecycle.data.subscription_billing_mode,
    };
    const transition = await transitionExpiredTrial(data.org_id, lifecycleInput);
    const complimentaryAccess = await readCurrentComplimentaryAccess(admin, data.org_id);
    const access = isSubscriptionAccessCurrent({
      ...lifecycleInput,
      status: transition.status,
      complimentaryAccessUntil: complimentaryAccess?.until,
    });
    if (access === false) return null;
  }

  return { ...data, staff_login_slug: typeof data.staff_login_slug === "string" ? data.staff_login_slug : "" } as StoreAccessRecord;
}
