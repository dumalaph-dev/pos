import type { ReactNode } from "react";
import { AdminSidebar, type AdminSidebarConnection } from "./AdminSidebar";
import { AdminNavigationProgress } from "./AdminNavigationProgress";

export function AdminShell({
  branchName,
  connection,
  children,
}: {
  branchName: string;
  connection?: AdminSidebarConnection;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell mx-auto grid min-h-screen w-full max-w-[1700px] lg:grid-cols-[minmax(0,238px)_minmax(0,1fr)]">
      <AdminNavigationProgress />
      <AdminSidebar branchName={branchName} connection={connection} />
      <div className="admin-shell__content min-w-0">{children}</div>
    </div>
  );
}
