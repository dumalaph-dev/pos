import { cookies } from "next/headers";

export const ADMIN_BRANCH_COOKIE = "pos_admin_branch";

export type AdminBranchOption = {
  id: string;
  name: string;
  is_active: boolean;
};

export async function getSelectedAdminBranchId(branches: AdminBranchOption[], fallbackStoreId: string | null) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ADMIN_BRANCH_COOKIE)?.value ?? "";
  const activeBranchIds = new Set(branches.filter((branch) => branch.is_active).map((branch) => branch.id));

  if (activeBranchIds.has(cookieValue)) return cookieValue;
  if (fallbackStoreId && activeBranchIds.has(fallbackStoreId)) return fallbackStoreId;
  return branches.find((branch) => branch.is_active)?.id ?? null;
}

export async function clearSelectedAdminBranch(branchId: string) {
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_BRANCH_COOKIE)?.value === branchId) {
    cookieStore.delete(ADMIN_BRANCH_COOKIE);
  }
}
