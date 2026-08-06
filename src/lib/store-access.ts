import { createAdminClient } from "@/lib/employee-auth";

export type StoreAccessRecord = {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  staff_login_key: string;
};

const STAFF_LOGIN_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeStoreAccessKey(value: string) {
  return value.trim().toLowerCase();
}

export function isStoreAccessKey(value: string) {
  return STAFF_LOGIN_KEY_PATTERN.test(value);
}

export function staffLoginPath(key: string) {
  return `/store/${encodeURIComponent(normalizeStoreAccessKey(key))}/login`;
}

/**
 * Reads only the public store identity needed to render a staff sign-in page.
 * This intentionally uses the server-only service role because the page is
 * unauthenticated; the key still grants no access without employee credentials.
 */
export async function getStoreByStaffKey(value: string): Promise<StoreAccessRecord | null> {
  const key = normalizeStoreAccessKey(value);
  if (!isStoreAccessKey(key)) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("stores")
    .select("id, org_id, name, is_active, staff_login_key")
    .eq("staff_login_key", key)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data || typeof data.staff_login_key !== "string") return null;
  return data as StoreAccessRecord;
}
