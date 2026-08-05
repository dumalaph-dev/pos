"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { AdminIcon } from "./AdminIcon";
import { AdminMenu } from "./AdminMenu";
import { selectAdminBranch } from "@/app/admin/branch-context-actions";
import type { AdminBranchOption } from "@/lib/admin/branch-context";

export function AdminBranchSwitcher({
  branchName,
  branches,
  selectedBranchId,
  canSwitch,
}: {
  branchName: string;
  branches: AdminBranchOption[];
  selectedBranchId: string | null;
  canSwitch: boolean;
}) {
  const pathname = usePathname() || "/admin";
  const searchParams = useSearchParams();
  // The top-bar selection owns branch context. Preserve the other filters and
  // pagination, but drop a page-local `branch` filter so choosing All branches
  // cannot leave the page silently pinned to the previous branch.
  const contextualParams = new URLSearchParams(searchParams.toString());
  contextualParams.delete("branch");
  const query = contextualParams.toString();
  const returnPath = query ? `${pathname}?${query}` : pathname;

  if (!canSwitch) {
    return (
      <div className="admin-branch-switcher is-static" aria-label={`Current branch: ${branchName}`}>
        <span className="admin-branch-switcher__label">Current branch</span>
        <strong>{branchName}</strong>
      </div>
    );
  }

  return (
    <AdminMenu
      triggerLabel="Change active branch"
      triggerClassName="admin-branch-switcher"
      panelTitle="Switch branch"
      panelClassName="admin-branch-menu__panel"
      trigger={
        <>
          <span className="admin-branch-switcher__label">Workspace</span>
          <strong>{branchName}</strong>
          <AdminIcon name="chevron" size={16} />
        </>
      }
    >
      <p className="admin-branch-menu__hint">Choose the branch context for backoffice work.</p>
      <form action={selectAdminBranch}>
        <input type="hidden" name="store_id" value="" />
        <input type="hidden" name="return_to" value={returnPath} />
        <button type="submit" className={`admin-menu__item admin-branch-menu__item ${selectedBranchId === null ? "is-selected" : ""}`}>
          <AdminIcon name="dashboard" size={16} />
          <span>All branches</span>
          {selectedBranchId === null && <AdminIcon name="check" size={15} />}
        </button>
      </form>
      {branches.filter((branch) => branch.is_active).map((branch) => (
        <form action={selectAdminBranch} key={branch.id}>
          <input type="hidden" name="store_id" value={branch.id} />
          <input type="hidden" name="return_to" value={returnPath} />
          <button type="submit" className={`admin-menu__item admin-branch-menu__item ${selectedBranchId === branch.id ? "is-selected" : ""}`}>
            <AdminIcon name="branches" size={16} />
            <span>{branch.name}</span>
            {selectedBranchId === branch.id && <AdminIcon name="check" size={15} />}
          </button>
        </form>
      ))}
    </AdminMenu>
  );
}
