"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createProduct } from "@/app/admin/catalog/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { ProductFields } from "@/components/admin/ProductFields";

type BranchRecord = { id: string; name: string; is_active: boolean };
type CategoryRecord = { id: string; store_id: string; name: string };
type SupplierRecord = { id: string; name: string; is_active: boolean };

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";

function clearCreateUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("create");
  url.searchParams.delete("inventory");
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function ProductSubmitButton({ fromInventory, canWrite, hasBranches }: { fromInventory: boolean; canWrite: boolean; hasBranches: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!canWrite || !hasBranches || pending} className="products-primary-button products-dialog__submit">
    <AdminIcon name="check" size={14} />
    {pending ? "Creating..." : fromInventory ? "Create inventory item" : "Create product"}
  </button>;
}

export function ProductCreateDialog({ branches, categories, suppliers, defaultBranch, canWrite, orgName, fromInventory, initialOpen }: {
  branches: BranchRecord[];
  categories: CategoryRecord[];
  suppliers: SupplierRecord[];
  defaultBranch: string;
  canWrite: boolean;
  orgName: string;
  fromInventory: boolean;
  initialOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    clearCreateUrl();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement;
    const triggerElement = triggerRef.current;
    document.body.classList.add("products-modal-open");
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
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
      document.body.classList.remove("products-modal-open");
      if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
      else triggerElement?.focus();
    };
  }, [closeDialog, open]);

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} disabled={!canWrite || branches.length === 0} className="products-primary-button products-create-trigger">
      <AdminIcon name="plus" size={15} /> Create product
    </button>

    {open && <div className="products-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <div ref={dialogRef} id="product-form" className="products-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-heading" aria-describedby="product-dialog-description">
        <header className="products-dialog__header">
          <div className="products-dialog__title">
            <span className="products-dialog__mark" aria-hidden="true"><AdminIcon name="plus" size={17} /></span>
            <div>
              <p className="products-dialog__eyebrow">{fromInventory ? "Inventory item setup" : `Catalog entry - ${orgName}`}</p>
              <h2 id="product-dialog-heading">Create product</h2>
              <p id="product-dialog-description">Add the details your team needs to sell, organize, and track this item.</p>
            </div>
          </div>
          <button type="button" onClick={closeDialog} className="products-icon-button products-dialog__close" aria-label="Close create product dialog">×</button>
        </header>

        <div className="products-dialog__guide">
          <div><strong>Complete the essentials first</strong><span>Name, branch, price, and unit are required. Everything else can be added later.</span></div>
          <span className="products-dialog__required"><i aria-hidden="true" /> Required fields</span>
        </div>

        <form action={createProduct} className="products-dialog__form products-form-grid">
          {fromInventory && <input type="hidden" name="return_to" value="inventory" />}
          <ProductFields branches={branches} categories={categories} suppliers={suppliers} defaultBranch={defaultBranch} canWrite={canWrite} prefix="new-product" />
          <footer className="products-dialog__footer">
            <label className="products-dialog__stock-option">
              <input type="checkbox" name="track_stock" defaultChecked={fromInventory} disabled={!canWrite} />
              <span><strong>Track stock in inventory</strong><small>{fromInventory ? "This item will appear in Inventory after it is created." : "Turn this on when you want stock movements and low-stock alerts."}</small></span>
            </label>
            <div className="products-dialog__actions">
              <button type="button" onClick={closeDialog} className="products-secondary-button products-dialog__cancel">Cancel</button>
              <ProductSubmitButton fromInventory={fromInventory} canWrite={canWrite} hasBranches={branches.length > 0} />
            </div>
          </footer>
        </form>
      </div>
    </div>}
  </>;
}
