"use client";

import type { ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
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
  const initialCategoryRecord = categories.find((category) => category.id === initialCategory);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(defaultBranch);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategory);
  const [categoryText, setCategoryText] = useState(initialCategoryRecord?.name ?? "");
  const [categoryRecords, setCategoryRecords] = useState(categories);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [isCreatingCategory, startCreatingCategory] = useTransition();
  const categoryOptions = categoryRecords.filter((category) => category.store_id === selectedStoreId);

  function updateCategoryText(value: string) {
    const normalized = value.trim().toLowerCase();
    const matchedCategory = categoryOptions.find((category) => category.name.trim().toLowerCase() === normalized);
    const hasUncreatedCategory = value.trim().length > 0 && !matchedCategory;

    setCategoryText(value);
    setSelectedCategoryId(matchedCategory?.id ?? "");
    setCategoryMessage(hasUncreatedCategory ? "New category? Click New category to create it." : null);
    categoryInputRef.current?.setCustomValidity(hasUncreatedCategory ? "Create this category first, or choose an existing category." : "");
  }

  function handleStoreChange(storeId: string) {
    setSelectedStoreId(storeId);
    setSelectedCategoryId("");
    setCategoryText("");
    setCategoryMessage(null);
    categoryInputRef.current?.setCustomValidity("");
  }

  function handleCreateCategory() {
    const name = categoryText.trim();
    if (!selectedStoreId) {
      setCategoryMessage("Choose a branch first.");
      return;
    }
    if (name.length < 2 || name.length > 80) {
      setCategoryMessage("Category names must be between 2 and 80 characters.");
      categoryInputRef.current?.focus();
      return;
    }

    const existingCategory = categoryOptions.find((category) => category.name.trim().toLowerCase() === name.toLowerCase());
    if (existingCategory) {
      setSelectedCategoryId(existingCategory.id);
      setCategoryText(existingCategory.name);
      setCategoryMessage(`Category "${existingCategory.name}" selected.`);
      categoryInputRef.current?.setCustomValidity("");
      return;
    }

    const formData = new FormData();
    formData.set("store_id", selectedStoreId);
    formData.set("name", name);
    setCategoryMessage(null);
    startCreatingCategory(async () => {
      const result = await createCategoryInline(formData);
      if (!result.ok) {
        setCategoryMessage(result.message);
        return;
      }
      setCategoryRecords((current) => [...current, result.category]);
      setSelectedCategoryId(result.category.id);
      setCategoryText(result.category.name);
      setCategoryMessage(`Category "${result.category.name}" created and selected.`);
      categoryInputRef.current?.setCustomValidity("");
    });
  }

  return <>
    <ProductFormSection eyebrow="Start here" title="Product basics" description="Set the branch, category, and name customers will see.">
      <CatalogField label="Branch" htmlFor={`${prefix}-store`} className="products-form-field--wide">
        <select id={`${prefix}-store`} name="store_id" value={selectedStoreId} onChange={(event) => handleStoreChange(event.target.value)} required disabled={!canWrite} className="inventory-input">
          <option value="">Choose branch</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " - inactive"}</option>)}
        </select>
      </CatalogField>
      <CatalogField label="Category" htmlFor={`${prefix}-category`} className="products-form-field--wide">
        <div className="products-category-picker">
          <div className="products-category-picker__row">
            <input
              ref={categoryInputRef}
              id={`${prefix}-category`}
              type="text"
              value={categoryText}
              onChange={(event) => updateCategoryText(event.target.value)}
              onBlur={() => {
                const matchedCategory = categoryOptions.find((category) => category.name.trim().toLowerCase() === categoryText.trim().toLowerCase());
                if (matchedCategory) setCategoryText(matchedCategory.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && categoryText.trim() && !selectedCategoryId) {
                  event.preventDefault();
                  handleCreateCategory();
                }
              }}
              list={`${prefix}-category-options`}
              placeholder="Choose or type a category"
              autoComplete="off"
              disabled={!canWrite || isCreatingCategory}
              aria-describedby={`${prefix}-category-help`}
              className="inventory-input"
            />
            <button type="button" onClick={handleCreateCategory} disabled={!canWrite || !selectedStoreId || isCreatingCategory} className="products-new-category-button">
              <AdminIcon name="plus" size={13} /> {isCreatingCategory ? "Creating..." : "New category"}
            </button>
          </div>
          <datalist id={`${prefix}-category-options`}>
            {categoryOptions.map((category) => <option key={category.id} value={category.name} />)}
          </datalist>
          <input type="hidden" name="category_id" value={selectedCategoryId} />
          <small id={`${prefix}-category-help`} className="products-category-picker__message" aria-live="polite">
            {categoryMessage ?? (categoryOptions.length > 0 ? "Optional - choose an existing category or type a new one." : "Optional - create your first category from this field.")}
          </small>
          {!canWrite && <small className="products-category-picker__message">Only organization admins can create categories or edit products.</small>}
        </div>
      </CatalogField>
      <CatalogField label="Product name" htmlFor={`${prefix}-name`} className="products-form-field--full">
        <input id={`${prefix}-name`} name="name" defaultValue={product?.name ?? ""} placeholder="e.g. Whole Lechon (Medium)" required disabled={!canWrite} className="inventory-input" />
      </CatalogField>
    </ProductFormSection>

    <ProductFormSection eyebrow="Sell and cost" title="Pricing and cost details" description="Set the selling price and the cost reference used for inventory valuation.">
      <CatalogField label="Pricing" htmlFor={`${prefix}-pricing`}>
        <select id={`${prefix}-pricing`} name="pricing_mode" defaultValue={product?.pricing_mode ?? "fixed"} required disabled={!canWrite} className="inventory-input"><option value="fixed">Fixed price</option><option value="per_kg">Price per kilogram</option></select>
      </CatalogField>
      <CatalogField label="Price - PHP" htmlFor={`${prefix}-price`}>
        <input id={`${prefix}-price`} name="price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product ? (Number(product.price) / 100).toFixed(2) : ""} placeholder="6500.00" required disabled={!canWrite} className="inventory-input tnums" />
      </CatalogField>
      <CatalogField label="Cost price - PHP" htmlFor={`${prefix}-cost`}>
        <input id={`${prefix}-cost`} name="cost_price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={product?.cost_price == null ? "" : (Number(product.cost_price) / 100).toFixed(2)} placeholder="Optional" disabled={!canWrite} className="inventory-input tnums" />
      </CatalogField>
      <CatalogField label="Unit" htmlFor={`${prefix}-unit`}>
        <input id={`${prefix}-unit`} name="unit" defaultValue={product?.unit ?? "pcs"} placeholder="pcs, pack, bottle, kg" required disabled={!canWrite} className="inventory-input" />
      </CatalogField>
      <CatalogField label="Minimum stock" htmlFor={`${prefix}-min-stock`}>
        <input id={`${prefix}-min-stock`} name="min_stock" type="number" inputMode="decimal" min="0" step="0.001" defaultValue={product ? Number(product.min_stock ?? 2) : 2} disabled={!canWrite} className="inventory-input tnums" />
      </CatalogField>
      <CatalogField label="Supplier" htmlFor={`${prefix}-supplier`}>
        <select id={`${prefix}-supplier`} name="supplier_id" defaultValue={product?.supplier_id ?? ""} disabled={!canWrite} className="inventory-input"><option value="">Unassigned</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
      </CatalogField>
    </ProductFormSection>

    <ProductFormSection eyebrow="Optional details" title="Identifiers and photo" description="Add a scan-friendly identifier and a clear product image for POS.">
      <CatalogField label="SKU" htmlFor={`${prefix}-sku`}>
        <input id={`${prefix}-sku`} name="sku" defaultValue={product?.sku ?? ""} placeholder="e.g. LECHON-MED-001" disabled={!canWrite} className="inventory-input" />
      </CatalogField>
      <CatalogField label="Barcode" htmlFor={`${prefix}-barcode`}>
        <input id={`${prefix}-barcode`} name="barcode" defaultValue={product?.barcode ?? ""} placeholder="Optional barcode" disabled={!canWrite} className="inventory-input" />
      </CatalogField>
      <CatalogField label="Sort order" htmlFor={`${prefix}-sort`}>
        <input id={`${prefix}-sort`} name="sort_order" type="number" min="0" step="1" defaultValue={product?.sort_order ?? 0} disabled={!canWrite} className="inventory-input tnums" />
      </CatalogField>
      <ProductImageUpload existingImageUrl={product?.image_url} canWrite={canWrite} prefix={prefix} />
    </ProductFormSection>
  </>;
}

function ProductFormSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section className="products-form-section">
    <div className="products-form-section__header">
      <div><p>{eyebrow}</p><h3>{title}</h3></div>
      <small>{description}</small>
    </div>
    <div className="products-form-section__grid">{children}</div>
  </section>;
}

function CatalogField({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return <label htmlFor={htmlFor} className={`products-form-field ${className}`}><span>{label}</span>{children}</label>;
}
