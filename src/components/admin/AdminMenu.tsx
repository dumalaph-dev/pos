"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel: string;
  panelTitle?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div className="admin-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        onClick={() => setOpen((previous) => !previous)}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={panelId}
          aria-label={triggerLabel}
          className={`admin-menu__panel ${panelClassName}`}
          // Close once the user commits to something, but leave plain clicks
          // inside the panel (selecting text, scrolling) alone.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) setOpen(false);
          }}
        >
          {panelTitle && <p className="admin-menu__title">{panelTitle}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
