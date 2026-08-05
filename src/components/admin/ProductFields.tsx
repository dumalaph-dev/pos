"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { createCategoryInline } from "@/app/admin/catalog/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";

type BranchRecord = { id: string; name: string; is_active: boolean };
type CategoryRecord = { id: string; store_id: string; name: string };
type SupplierRecord = { id: string; name: string; is_active: boolean };

export type ProductFieldsRecord = {
  id?: string;
  store_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  pricing_mode: "fixed" | "per_kg";
  price: number;
  cost_price: number | null;
  min_stock: number;
  unit: string;
  supplier_id: string | null;
  sort_order: number;
  image_url: string | null;
};

export function ProductFields({ product, branches, categories, suppliers, defaultBranch, canWrite, prefix }: {
  product?: ProductFieldsRecord;
  branches: BranchRecord[];
  categories: CategoryRecord[];
  suppliers: SupplierRecord[];
  defaultBranch: string;
  canWrite: boolean;
  prefix: string;
}) {
  const initialCategory = product?.category_id && categories.some((category) => category.id === product.category_id && category.store_id === defaultBranch)
    ? product.category_id
    : "";
  const [selectedStoreId, setSelectedStoreId] = useState(defaultBranch);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategory);
  const [categoryRecords, setCategoryRecords] = useState(categories);
  const [showInlineCategory, setShowInlineCategory] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState("");
  const [inlineCategoryMessage, setInlineCategoryMessage] = useState<string | null>(null);
  const [isCreatingCategory, startCreatingCategory] = useTransition();
  const categoryOptions = categoryRecords.filter((category) => category.store_id === selectedStoreId);

  function handleStoreChange(storeId: string) {
    const nextCategories = categoryRecords.filter((category) => category.store_id === storeId);
    setSelectedStoreId(storeId);
    if (!nextCategories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId("");
    }
    setShowInlineCategory(false);
    setInlineCategoryName("");
    setInlineCategoryMessage(null);
  }

  function handleCreateCategory() {
    const name = inlineCategoryName.trim();
    if (!selectedStoreId) {
      setInlineCategoryMessage("Choose a branch first.");
      return;
    }
    if (name.length < 2 || name.length > 80) {
      setInlineCategoryMessage("Category names must be between 2 and 80 characters.");
      return;
    }

    const formData = new FormData();
    formData.set("store_id", selectedStoreId);
    formData.set("name", name);
    setInlineCategoryMessage(null);
    startCreatingCategory(async () => {
      const result = await createCategoryInline(formData);
      if (!result.ok) {
        setInlineCategoryMessage(result.message);
        return;
      }
      setCategoryRecords((current) => [...current, result.category]);
      setSelectedCategoryId(result.category.id);
      setInlineCategoryName("");
      setShowInlineCategory(false);
      setInlineCategoryMessage(`Category “${result.category.name}” created and selected.`);
    });
  }

  return <>
    <CatalogField label="Branch" htmlFor={`${prefix}-store`}>
      <select id={`${prefix}-store`} name="store_id" value={selectedStoreId} onChange={(event) => handleStoreChange(event.target.value)} required disabled={!canWrite} className="inventory-input">
        <option value="">Choose branch</option>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}
      </select>
    </CatalogField>
    <CatalogField label="Category" htmlFor={`${prefix}-category`}>
      <div className="products-category-picker">
        <div className="products-category-picker__row">
          <select id={`${prefix}-category`} name="category_id" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={!canWrite} className="inventory-input">
            <option value="">Uncategorized</option>
            {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <button type="button" onClick={() => { setShowInlineCategory((current) => !current); setInlineCategoryMessage(null); }} disabled={!canWrite || !selectedStoreId} className="products-inline-action">
            <AdminIcon name="plus" size={12} /> New category
          </button>
        </div>
        {showInlineCategory && <div className="products-inline-category" role="group" aria-label="Create a category">
          <input value={inlineCategoryName} onChange={(event) => setInlineCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleCreateCategory(); } }} placeholder="New category name" maxLength={80} disabled={isCreatingCategory} className="inventory-input inventory-input--compact" autoFocus />
          <button type="button" onClick={handleCreateCategory} disabled={isCreatingCategory || !canWrite} className="products-small-primary">{isCreatingCategory ? "Creating…" : "Create"}</button>
        </div>}
        {inlineCategoryMessage && <small className="products-inline-category__message" aria-live="polite">{inlineCategoryMessage}</small>}
        {!canWrite && <small className="products-inline-category__message">Only organization admins can create categories or edit products.</small>}
      </div>
    </CatalogField>
    <CatalogField label="Product name" htmlFor={`${prefix}-name`} className="sm:col-span-2"><input id={`${prefix}-name`} name="name" defaultValue={product?.name ?? ""} placeholder="e.g. Whole Lechon (Medium)" required disabled={!canWrite} className="inventory-input" /></CatalogField>
    <CatalogField label="SKU" htmlFor={`${prefix}-sku`}><input id={`${prefix}-sku`} name="sku" defaultValue={product?.sku ?? ""} placeholder="e.g. LECHON-MED-001" disabled={!canWrite} className="inventory-input" /></CatalogField>
    <CatalogField label="Barcode" htmlFor={`${prefix}-barcode`}><input id={`${prefix}-barcode`} name="barcode" defaultValue={product?.barcode ?? ""} placeholder="Optional barcode" disabled={!canWrite} className="inventory-input" /></CatalogField>
    <CatalogField label="Pricing" htmlFor={`${prefix}-pricing`}><select id={`${prefix}-pricing`} name="pricing_mode" defaultValue={product?.pricing_mode ?? "fixed"} required disabled={!canWrite} className="inventory-input"><option value="fixed">Fixed price</option><option value="per_kg">Price per kilogram</option></select></CatalogField>
    <CatalogField label="Price · ₱" htmlFor={`${prefix}-price`}><input id={`${prefix}-price`} name="price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product ? (Number(product.price) / 100).toFixed(2) : ""} placeholder="6500.00" required disabled={!canWrite} className="inventory-input tnums" /></CatalogField>
    <CatalogField label="Cost price · ₱" htmlFor={`${prefix}-cost`}><input id={`${prefix}-cost`} name="cost_price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product?.cost_price == null ? "" : (Number(product.cost_price) / 100).toFixed(2)} placeholder="Optional" disabled={!canWrite} className="inventory-input tnums" /></CatalogField>
    <CatalogField label="Unit" htmlFor={`${prefix}-unit`}><input id={`${prefix}-unit`} name="unit" defaultValue={product?.unit ?? "pcs"} placeholder="pcs, pack, bottle, kg" required disabled={!canWrite} className="inventory-input" /></CatalogField>
    <CatalogField label="Minimum stock" htmlFor={`${prefix}-min-stock`}><input id={`${prefix}-min-stock`} name="min_stock" type="number" inputMode="decimal" min="0" step="0.001" defaultValue={product ? Number(product.min_stock ?? 2) : 2} disabled={!canWrite} className="inventory-input tnums" /></CatalogField>
    <CatalogField label="Supplier" htmlFor={`${prefix}-supplier`}><select id={`${prefix}-supplier`} name="supplier_id" defaultValue={product?.supplier_id ?? ""} disabled={!canWrite} className="inventory-input"><option value="">Unassigned</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></CatalogField>
    <CatalogField label="Sort order" htmlFor={`${prefix}-sort`}><input id={`${prefix}-sort`} name="sort_order" type="number" min="0" step="1" defaultValue={product?.sort_order ?? 0} disabled={!canWrite} className="inventory-input tnums" /></CatalogField>
    <ProductImageUpload existingImageUrl={product?.image_url} canWrite={canWrite} prefix={prefix} />
  </>;
}

function CatalogField({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={`products-form-field ${className}`}><span>{label}</span>{children}</label>;
}
