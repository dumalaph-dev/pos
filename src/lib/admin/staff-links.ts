import { cache } from "react";
import { legacyStaffLoginPath, staffLoginPath } from "@/lib/store-access";
import { createClient } from "@/lib/supabase/server";

export type StaffLoginLink = {
  id: string;
  name: string;
  isActive: boolean;
  /** Relative entry path a cashier opens on the counter tablet. */
  path: string;
};

export type StaffLoginLinksResult = {
  links: StaffLoginLink[];
  /** True when migration 0033 has not been applied, so only UUID links exist. */
  legacyOnly: boolean;
};

type StoreLinkRow = {
  id: string;
  name: string;
  is_active: boolean;
  staff_login_slug?: string | null;
  staff_login_key?: string | null;
};

/**
 * The per-branch staff entry links, in the shape the onboarding and Help &
 * Guide surfaces render them.
 *
 * Migration 0033 added the readable `/staff/{slug}` form; a workspace that has
 * not run it yet still has the UUID `/store/{key}/login` links, and those keep
 * working. Selecting the readable column separately means a missing column
 * degrades to the legacy links instead of failing the whole page — the same
 * fallback the employees workspace already uses.
 *
 * Request-scoped so a page and its layout share one read; branch changes and
 * RLS stay authoritative on the next request.
 */
export const getStaffLoginLinks = cache(async (orgId: string): Promise<StaffLoginLinksResult> => {
  const supabase = await createClient();
  const readable = await supabase
    .from("stores")
    .select("id, name, is_active, staff_login_slug")
    .eq("org_id", orgId)
    .order("name");

  if (!readable.error) {
    return { links: toLinks((readable.data ?? []) as StoreLinkRow[]), legacyOnly: false };
  }

  const legacy = await supabase
    .from("stores")
    .select("id, name, is_active, staff_login_key")
    .eq("org_id", orgId)
    .order("name");

  return { links: toLinks((legacy.data ?? []) as StoreLinkRow[]), legacyOnly: true };
});

function toLinks(rows: StoreLinkRow[]): StaffLoginLink[] {
  return rows.flatMap((row) => {
    const slug = row.staff_login_slug?.trim();
    const key = row.staff_login_key?.trim();
    const path = slug ? staffLoginPath(slug) : key ? legacyStaffLoginPath(key) : null;
    if (!path) return [];
    return [{ id: row.id, name: row.name, isActive: row.is_active, path }];
  });
}
