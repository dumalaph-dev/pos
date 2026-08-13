import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AdminBranchRecord = {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  is_active: boolean;
};

export type AdminBranchesResult = {
  data: AdminBranchRecord[];
  error: unknown | null;
};

export type AdminBranchOptionRecord = Pick<AdminBranchRecord, "id" | "name" | "is_active">;

export type AdminBranchOptionsResult = {
  data: AdminBranchOptionRecord[];
  error: unknown | null;
};

/**
 * Share the branch context query between the admin layout and the active page
 * during one RSC render. This is request-scoped deduplication, not a durable
 * cache: branch changes and RLS remain authoritative on the next request.
 */
export const getAdminBranches = cache(async (orgId: string): Promise<AdminBranchesResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, address, tin, vat_registered, vat_rate, is_active")
    .eq("org_id", orgId)
    .order("name");

  return {
    data: (data ?? []) as AdminBranchRecord[],
    error,
  };
});

/**
 * Smaller branch projection for admin routes that do not render a receipt.
 * Keep this request-scoped so the layout and page still share one read while
 * avoiding tax/address fields in the server-rendered payload.
 */
export const getAdminBranchOptions = cache(async (orgId: string): Promise<AdminBranchOptionsResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", orgId)
    .order("name");

  return {
    data: (data ?? []) as AdminBranchOptionRecord[],
    error,
  };
});
