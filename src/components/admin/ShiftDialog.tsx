"use client";

import type { ReactNode } from "react";
import { AdminDialog } from "@/components/admin/AdminDialog";

export function ShiftDialog({
  children,
  closeHref,
  descriptionId,
  onClose,
  titleId,
}: {
  children: ReactNode;
  closeHref?: string;
  descriptionId?: string;
  onClose?: () => void;
  titleId: string;
}) {
  return (
    <AdminDialog
      closeHref={closeHref}
      onClose={onClose}
      titleId={titleId}
      descriptionId={descriptionId ?? "shift-detail-meta"}
      bodyClassName="shift-modal-open"
      backdropClassName="shift-dialog__backdrop"
      dialogClassName="shift-dialog"
    >
      {children}
    </AdminDialog>
  );
}
