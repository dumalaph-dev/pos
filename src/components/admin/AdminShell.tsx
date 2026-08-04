import type { ReactNode } from "react";
import { AdminSidebar, type AdminSidebarConnection } from "./AdminSidebar";

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
    <div className="admin-shell mx-auto grid min-h-screen max-w-[1700px] lg:grid-cols-[238px_minmax(0,1fr)]">
      <AdminSidebar branchName={branchName} connection={connection} />
      <div className="admin-shell__content min-w-0">{children}</div>
    </div>
  );
}
