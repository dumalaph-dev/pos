import { cookies } from "next/headers";
export { ADMIN_ALL_BRANCHES, ADMIN_BRANCH_COOKIE } from "@/lib/admin/branch-context-constants";
import { ADMIN_ALL_BRANCHES, ADMIN_BRANCH_COOKIE } from "@/lib/admin/branch-context-constants";

export type AdminBranchOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function getSelectedAdminBranchId(branches: AdminBranchOption[], fallbackStoreId: string | null) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_BRANCH_COOKIE)?.value ?? "";
  const activeBranchIds = new Set(branches.filter((branch) => branch.is_active).map((branch) => branch.id));

  if (cookieValue === ADMIN_ALL_BRANCHES) return null;
  if (activeBranchIds.has(cookieValue)) return cookieValue;
  // Organization admins start in the organization-wide view. A manager's
  // branch is resolved by its role-specific caller instead of this helper.
  void fallbackStoreId;
  return null;
}

export async function clearSelectedAdminBranch(branchId: string) {
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_BRANCH_COOKIE)?.value === branchId) {
    cookieStore.delete(ADMIN_BRANCH_COOKIE);
  }
}
