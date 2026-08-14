"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProduct } from "@/app/admin/catalog/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { ProductFields, type ProductFieldsRecord } from "@/components/admin/ProductFields";

type BranchRecord = { id: string; name: string; is_active: boolean };
type CategoryRecord = { id: string; store_id: string; name: string };
type SupplierRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = ProductFieldsRecord & { is_active: boolean; track_stock: boolean };

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";

function clearEditUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("edit");
  url.hash = "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

function ProductUpdateButton({ canWrite }: { canWrite: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!canWrite || pending} className="products-primary-button products-edit-dialog__save"><AdminIcon name="check" size={14} />{pending ? "Saving..." : "Save changes"}</button>;
}

export function ProductEditDialog({ product, branches, categories, suppliers, canWrite, initialOpen, onClose }: {
  product: ProductRecord;
  branches: BranchRecord[];
  categories: CategoryRecord[];
  suppliers: SupplierRecord[];
  canWrite: boolean;
  initialOpen: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    if (onClose) onClose();
    else clearEditUrl();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement;
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
    };
  }, [closeDialog, open]);

  if (!open) return null;

  return <div className="products-dialog__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
    <div ref={dialogRef} id="product-edit" className="products-dialog product-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="product-edit-heading" aria-describedby="product-edit-description">
      <header className="products-dialog__header">
        <div className="products-dialog__title">
          <span className="products-dialog__mark" aria-hidden="true"><AdminIcon name="edit" size={16} /></span>
          <div>
            <p className="products-dialog__eyebrow">Product record · {product.sku || "SKU not set"}</p>
            <h2 id="product-edit-heading">Edit {product.name}</h2>
            <p id="product-edit-description">Update the product details used by POS and inventory.</p>
          </div>
        </div>
        <button type="button" onClick={closeDialog} className="products-icon-button products-dialog__close" aria-label="Close product editor">×</button>
      </header>

      <div className="products-edit-dialog__hint"><span>Keep the essentials accurate for pricing, stock, and POS visibility.</span><span><i aria-hidden="true" /> Required fields</span></div>

      <form action={updateProduct} className="products-dialog__form products-form-grid">
        <input type="hidden" name="product_id" value={product.id} />
        <ProductFields product={product} branches={branches} categories={categories} suppliers={suppliers} defaultBranch={product.store_id} canWrite={canWrite} prefix={`edit-product-${product.id}`} />
        <footer className="products-dialog__footer products-edit-dialog__footer">
          <div className="products-edit-dialog__flags">
            <label className="products-checkbox-label"><input type="checkbox" name="track_stock" defaultChecked={product.track_stock} disabled={!canWrite} /> Track stock</label>
            <label className="products-checkbox-label"><input type="checkbox" name="is_active" defaultChecked={product.is_active} disabled={!canWrite} /> Visible in POS</label>
          </div>
          <div className="products-dialog__actions">
            <button type="button" onClick={closeDialog} className="products-secondary-button products-dialog__cancel">Cancel</button>
            <ProductUpdateButton canWrite={canWrite} />
          </div>
        </footer>
      </form>
    </div>
  </div>;
}
