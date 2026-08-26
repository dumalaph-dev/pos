"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

export const OVERLAY_Z_INDEX = {
  dropdown: 900,
  dialog: 1000,
  toast: 1100,
} as const;

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => element.getClientRects().length > 0);
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function OverlayDialog({
  open = true,
  onClose,
  titleId,
  descriptionId,
  children,
  backdropClassName,
  dialogClassName,
  dataAdminTheme,
  bodyClassName = "overlay-dialog-open",
  initialFocusSelector = "[data-dialog-autofocus], [data-shift-dialog-autofocus], [data-order-dialog-autofocus]",
  portal = true,
}: {
  open?: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  children: ReactNode;
  backdropClassName: string;
  dialogClassName: string;
  dataAdminTheme?: string;
  bodyClassName?: string;
  initialFocusSelector?: string;
  portal?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add(bodyClassName);
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const autofocusElement = dialog.querySelector<HTMLElement>(initialFocusSelector);
      (autofocusElement ?? focusableElements(dialog)[0] ?? dialog).focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = focusableElements(dialogRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
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
  }, [bodyClassName, close, initialFocusSelector, open]);

  if (!open) return null;
  const content = (
    <div
      className={backdropClassName}
      role="presentation"
      style={{ zIndex: OVERLAY_Z_INDEX.dialog }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClassName}
        data-admin-theme={dataAdminTheme}
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
  return portal ? <OverlayPortal>{content}</OverlayPortal> : content;
}
