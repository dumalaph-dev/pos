import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AdminProfile = {
  full_name: string | null;
  role: string | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { name?: string } | null;
  stores: { name?: string } | null;
};

/**
 * Profile data is shared by the admin layout and the active page during one
 * render. React's request-scoped cache prevents the shell and page from
 * issuing the same profile query twice while keeping the result user-scoped.
 */
export const getAdminProfile = cache(async (userId: string): Promise<AdminProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id, password_change_required, organizations!profiles_org_id_fkey(name), stores(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as AdminProfile;
});
