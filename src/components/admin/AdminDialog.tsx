"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { OverlayDialog } from "@/components/ui/OverlayLayer";

export function AdminDialog({
  children,
  closeHref,
  onClose,
  titleId,
  descriptionId,
  bodyClassName,
  backdropClassName,
  dialogClassName,
}: {
  children: ReactNode;
  closeHref?: string;
  onClose?: () => void;
  titleId: string;
  descriptionId?: string;
  bodyClassName: string;
  backdropClassName: string;
  dialogClassName: string;
}) {
  const router = useRouter();
  const closeDialog = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (closeHref) {
      router.replace(closeHref, { scroll: false });
    }
  }, [closeHref, onClose, router]);

  return <OverlayDialog onClose={closeDialog} titleId={titleId} descriptionId={descriptionId} bodyClassName={bodyClassName} backdropClassName={backdropClassName} dialogClassName={dialogClassName}>{children}</OverlayDialog>;
}
