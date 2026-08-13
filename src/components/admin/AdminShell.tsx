import type { ReactNode } from "react";
import { AdminSidebar, type AdminSidebarConnection } from "./AdminSidebar";
import { AdminNavigationProgress } from "./AdminNavigationProgress";
import { AdminBranchSwitcher } from "./AdminBranchSwitcher";
import { OfflineAdminSetup } from "./OfflineAdminSetup";
import { AdminMutationSync } from "./AdminMutationSync";
import { AdminPerformanceReporter } from "./AdminPerformanceReporter";
import type { AdminBranchOption } from "@/lib/admin/branch-context";
import type { AdminBranding } from "@/lib/admin/branding";
import type { OfflineProfileSnapshot } from "@/lib/offline";

export function AdminShell({
  branding,
  branchName,
  connection,
  branches,
  selectedBranchId,
  canSwitchBranches,
  canManageBranches,
  offlineProfile,
  children,
}: {
  branding: AdminBranding;
  branchName: string;
  connection?: AdminSidebarConnection;
  branches?: AdminBranchOption[];
  selectedBranchId?: string | null;
  canSwitchBranches?: boolean;
  canManageBranches?: boolean;
  offlineProfile?: OfflineProfileSnapshot;
  children: ReactNode;
}) {
  return (
    <div data-admin-theme={branding.theme} className="admin-shell mx-auto grid min-h-screen w-full max-w-[1700px] lg:grid-cols-[minmax(0,198px)_minmax(0,1fr)]">
      <AdminNavigationProgress />
      <AdminPerformanceReporter />
      <AdminSidebar branding={branding} branchName={branchName} connection={connection} branches={branches} selectedBranchId={selectedBranchId} canSwitchBranches={canSwitchBranches} canManageBranches={canManageBranches} />
      <div className="admin-shell__content min-w-0">
        {offlineProfile && <OfflineAdminSetup profile={offlineProfile} storeId={offlineProfile.store_id} branchName={branchName} />}
        {offlineProfile?.role === "admin" && <AdminMutationSync scope={{ userId: offlineProfile.id, orgId: offlineProfile.org_id, storeId: offlineProfile.store_id, role: offlineProfile.role }} />}
        <div className="admin-mobile-context">
          <AdminBranchSwitcher branchName={branchName} branches={branches ?? []} selectedBranchId={selectedBranchId ?? null} canSwitch={Boolean(canSwitchBranches)} canManageBranches={Boolean(canManageBranches)} />
        </div>
        {children}
      </div>
    </div>
  );
}
