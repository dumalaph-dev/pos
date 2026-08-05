import type { ReactNode } from "react";
import { AdminSidebar, type AdminSidebarConnection } from "./AdminSidebar";
import { AdminNavigationProgress } from "./AdminNavigationProgress";
import { AdminBranchSwitcher } from "./AdminBranchSwitcher";
import type { AdminBranchOption } from "@/lib/admin/branch-context";

export function AdminShell({
  branchName,
  connection,
  branches,
  selectedBranchId,
  canSwitchBranches,
  canManageBranches,
  children,
}: {
  branchName: string;
  connection?: AdminSidebarConnection;
  branches?: AdminBranchOption[];
  selectedBranchId?: string | null;
  canSwitchBranches?: boolean;
  canManageBranches?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell mx-auto grid min-h-screen w-full max-w-[1700px] lg:grid-cols-[minmax(0,198px)_minmax(0,1fr)]">
      <AdminNavigationProgress />
      <AdminSidebar branchName={branchName} connection={connection} branches={branches} selectedBranchId={selectedBranchId} canSwitchBranches={canSwitchBranches} canManageBranches={canManageBranches} />
      <div className="admin-shell__content min-w-0">
        <div className="admin-mobile-context">
          <AdminBranchSwitcher branchName={branchName} branches={branches ?? []} selectedBranchId={selectedBranchId ?? null} canSwitch={Boolean(canSwitchBranches)} />
        </div>
        {children}
      </div>
    </div>
  );
}
