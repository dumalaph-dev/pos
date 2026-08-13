"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function getFocusableElements(dialog: HTMLDivElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

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
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeDialog = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (closeHref) {
      router.replace(closeHref, { scroll: false });
    }
  }, [closeHref, onClose, router]);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(bodyClassName);

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const autofocusElement = dialog.querySelector<HTMLElement>(
        "[data-dialog-autofocus], [data-shift-dialog-autofocus], [data-order-dialog-autofocus]",
      );
      (autofocusElement ?? getFocusableElements(dialog)[0] ?? dialog).focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const focusIsOutsideDialog = !dialogRef.current.contains(document.activeElement);

      if (focusIsOutsideDialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove(bodyClassName);
      if (previousActiveElement?.isConnected) previousActiveElement.focus({ preventScroll: true });
    };
  }, [bodyClassName, closeDialog]);

  return (
    <div
      className={backdropClassName}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
