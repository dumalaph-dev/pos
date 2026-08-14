"use client";

import "./AdminMenu.css";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

type PortalPosition = {
  top: number;
  left: number;
  maxHeight: number;
  openAbove: boolean;
};

/**
 * Disclosure dropdown for the admin topbar (notifications, account menu).
 *
 * Deliberately the disclosure pattern — a button with `aria-expanded` plus a
 * plain panel of links — rather than `role="menu"`/`menuitem`. Menu roles come
 * with a keyboard contract (arrow-key roving, Home/End, typeahead) that this
 * does not implement; claiming the role without it reads worse to a screen
 * reader than the honest disclosure. Tab moves through the links in DOM order.
 *
 * The panel content is passed as `children` so server components can render it
 * (the topbar builds its rows from data it already has).
 */
export function AdminMenu({
  trigger,
  triggerClassName = "",
  triggerLabel,
  panelTitle,
  panelClassName = "",
  portal = false,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel: string;
  panelTitle?: string;
  panelClassName?: string;
  portal?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] = useState<PortalPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const updatePortalPosition = useCallback(() => {
    if (!portal || !triggerRef.current || typeof window === "undefined") return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const panelWidth = Math.min(300, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.left),
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding),
    );
    const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const spaceAbove = triggerRect.top - viewportPadding;
    const openAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

    setPortalPosition({
      top: openAbove ? triggerRect.top - 8 : triggerRect.bottom + 8,
      left,
      maxHeight: Math.max(160, (openAbove ? spaceAbove : spaceBelow) - 8),
      openAbove,
    });
  }, [portal]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape must not strand focus on a panel that no longer exists.
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !portal) return;

    updatePortalPosition();
    window.addEventListener("resize", updatePortalPosition);
    window.addEventListener("scroll", updatePortalPosition, true);
    return () => {
      window.removeEventListener("resize", updatePortalPosition);
      window.removeEventListener("scroll", updatePortalPosition, true);
    };
  }, [open, portal, updatePortalPosition]);

  function toggleMenu() {
    if (!open && portal) updatePortalPosition();
    setOpen((previous) => !previous);
  }

  const panelStyle: CSSProperties | undefined = portal && portalPosition
    ? {
        top: portalPosition.top,
        left: portalPosition.left,
        maxHeight: portalPosition.maxHeight,
        transform: portalPosition.openAbove ? "translateY(-100%)" : undefined,
      }
    : undefined;

  const panel = open && (!portal || portalPosition) ? (
    <div
      ref={panelRef}
      id={panelId}
      aria-label={triggerLabel}
      className={`admin-menu__panel ${panelClassName} ${portal ? "admin-menu__panel--portal" : ""}`}
      style={panelStyle}
      // Close once the user commits to something, but leave plain clicks
      // inside the panel (selecting text, scrolling) alone.
      onClick={(event) => {
        const interactive = (event.target as HTMLElement).closest<HTMLElement>("a, button");
        if (!interactive) return;

        // Keep submit forms mounted until the browser hands the submission to
        // React. Unmounting a menu form during the click can cancel the action,
        // which is especially visible on the shared-terminal sign-out button.
        if (interactive.tagName === "BUTTON" && (interactive as HTMLButtonElement).type === "submit") return;
        setOpen(false);
      }}
    >
      {panelTitle && <p className="admin-menu__title">{panelTitle}</p>}
      {children}
    </div>
  ) : null;

  return (
    <div className="admin-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        onClick={toggleMenu}
      >
        {trigger}
      </button>

      {portal && panel && typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
    </div>
  );
}
