import { cookies } from "next/headers";

export const ADMIN_BRANCH_COOKIE = "pos_admin_branch";
export const ADMIN_ALL_BRANCHES = "__all__";

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
  if (fallbackStoreId && activeBranchIds.has(fallbackStoreId)) return fallbackStoreId;
  return null;
}

export async function clearSelectedAdminBranch(branchId: string) {
  const cookieStore = await cookies();
  if (cookieStore.get(ADMIN_BRANCH_COOKIE)?.value === branchId) {
    cookieStore.set(ADMIN_BRANCH_COOKIE, ADMIN_ALL_BRANCHES, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}
