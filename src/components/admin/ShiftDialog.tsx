"use client";

import type { ReactNode } from "react";
import { AdminDialog } from "@/components/admin/AdminDialog";

export function ShiftDialog({
  children,
  closeHref,
  titleId,
}: {
  children: ReactNode;
  closeHref: string;
  titleId: string;
}) {
  return (
    <AdminDialog
      closeHref={closeHref}
      titleId={titleId}
      descriptionId="shift-detail-meta"
      bodyClassName="shift-modal-open"
      backdropClassName="shift-dialog__backdrop"
      dialogClassName="shift-dialog"
    >
      {children}
    </AdminDialog>
  );
}
