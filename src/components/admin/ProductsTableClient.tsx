"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { toggleProductVisibility } from "@/app/admin/catalog/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { useAdminUrlQuery } from "@/components/admin/AdminUrlQuery";
import { categoryIconName } from "@/lib/category-icons";
import { formatStockQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import { isProductImageUrl } from "@/lib/product-images";

type PricingMode = "fixed" | "per_kg";
type ProductStatusFilter = "all" | "active" | "inactive" | "in_stock" | "low" | "out";
type ProductColumn = "category" | "sku" | "price" | "status" | "pos" | "stock";
type ProductStockStatus = "untracked" | "in_stock" | "low" | "out";
type SupplierRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  pricing_mode: PricingMode;
  price: number;
  cost_price: number | null;
  min_stock: number;
  unit: string;
  supplier_id: string | null;
  track_stock: boolean;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};
type ProductRow = { product: ProductRecord; categoryName: string; onHand: number | null; stockStatus: ProductStockStatus };
type CategoryTab = { id: string; name: string; icon: string | null; count: number };

const statusOptions: Array<{ value: ProductStatusFilter; label: string }> = [
  { value: "all", label: "All status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "in_stock", label: "In stock" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" },
];
const columnOptions: Array<{ value: ProductColumn; label: string }> = [
  { value: "category", label: "Category" }, { value: "sku", label: "SKU / barcode" }, { value: "price", label: "Price" }, { value: "status", label: "Status" }, { value: "pos", label: "POS visibility" }, { value: "stock", label: "Stock" },
];
const defaultColumns: ProductColumn[] = ["category", "sku", "price", "status", "pos", "stock"];
const localImages: Record<string, string> = { "whole lechon (small)": "/food/whole-lechon-small.png", "whole lechon (medium)": "/food/whole-lechon-medium.png", "whole lechon (large)": "/food/whole-lechon-medium.png", "lechon belly (1/2kg)": "/food/lechon-belly-half.png", "lechon belly (1kg)": "/food/lechon-belly-one.png", "lechon paksiw (1/2kg)": "/food/lechon-paksiw.png", "lechon kawali (1/2kg)": "/food/lechon-kawali.png", "java rice": "/food/java-rice.png", "mang tomas (small)": "/food/mang-tomas.png" };

function displayPeso(value: number) { return formatPeso(Number(value)).replace(/\.00$/, ""); }
function productImage(product: Pick<ProductRecord, "name" | "image_url">) { const image = product.image_url?.trim(); return image && isProductImageUrl(image) ? image : localImages[product.name.trim().toLowerCase()] ?? "/food/lechon-belly-one.png"; }
function stockStatusLabel(status: ProductStockStatus) { return status === "untracked" ? "Not tracked" : status === "in_stock" ? "In stock" : status === "low" ? "Low stock" : "Out of stock"; }
function stockStatusClass(status: ProductStockStatus) { return status === "out" ? "is-out" : status === "low" ? "is-low" : status === "in_stock" ? "is-in" : "is-untracked"; }
function parseColumns(value: string) { const values = value.split(",").filter((item): item is ProductColumn => defaultColumns.includes(item as ProductColumn)); return values.length ? values : defaultColumns; }
function productHref(query: Record<string, string>, id: string) { const params = new URLSearchParams(); Object.entries({ ...query, edit: id }).forEach(([key, value]) => { if (value) params.set(key, value); }); return `/products?${params.toString()}#product-edit`; }

export function ProductsTableClient({ rows, suppliers, categoryTabs, initialQuery, initialCategory, initialStatus, initialPosOnly, initialPage, initialPageSize, initialColumns, currentBranchName, canWrite, showBulk, selectedProductId }: {
  rows: ProductRow[];
  suppliers: SupplierRecord[];
  categoryTabs: CategoryTab[];
  initialQuery: string;
  initialCategory: string;
  initialStatus: ProductStatusFilter;
  initialPosOnly: boolean;
  initialPage: number;
  initialPageSize: number;
  initialColumns: ProductColumn[];
  currentBranchName: string;
  canWrite: boolean;
  showBulk: boolean;
  selectedProductId: string;
}) {
  const [query, updateQuery] = useAdminUrlQuery({ q: initialQuery, category: initialCategory, status: initialStatus, pos: initialPosOnly ? "1" : "", page: String(initialPage), pageSize: String(initialPageSize), columns: initialColumns.join(",") });
  const searchQuery = query.q ?? "";
  const category = query.category || "all";
  const status: ProductStatusFilter = statusOptions.some((option) => option.value === query.status) ? query.status as ProductStatusFilter : "all";
  const posOnly = query.pos === "1";
  const pageSize = query.pageSize === "25" || query.pageSize === "50" ? Number(query.pageSize) : 10;
  const columns = useMemo(() => new Set(parseColumns(query.columns ?? initialColumns.join(","))), [initialColumns, query.columns]);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<ProductColumn[]>([...columns]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => rows.filter((row) => {
    const product = row.product;
    if (category === "uncategorized" && product.category_id !== null) return false;
    if (category !== "all" && category !== "uncategorized" && product.category_id !== category) return false;
    if (status === "active" && !product.is_active) return false;
    if (status === "inactive" && product.is_active) return false;
    if (status === "in_stock" && row.stockStatus !== "in_stock") return false;
    if (status === "low" && row.stockStatus !== "low") return false;
    if (status === "out" && row.stockStatus !== "out") return false;
    if (posOnly && !product.is_active) return false;
    return !normalizedQuery || [product.name, product.sku ?? "", product.barcode ?? "", row.categoryName].some((value) => value.toLowerCase().includes(normalizedQuery));
  }), [category, normalizedQuery, posOnly, rows, status]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const page = Math.min(Math.max(Number.parseInt(query.page || "1", 10) || 1, 1), totalPages);
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const baseQuery = { q: searchQuery, category, status, pos: posOnly ? "1" : "", pageSize: String(pageSize), columns: [...columns].join(",") };
  const updateFilter = (key: "q" | "category" | "status" | "pos", value: string) => updateQuery({ [key]: value, page: "1" });

  return <>
    <nav className="products-category-tabs" aria-label="Product categories">{categoryTabs.map((tab) => <button key={tab.id} type="button" onClick={() => updateFilter("category", tab.id)} className={`products-category-tab ${category === tab.id ? "is-active" : ""}`}><span className="products-category-tab__icon"><AdminIcon name={categoryIconName(tab.icon, tab.name)} size={14} /></span><strong>{tab.name}</strong><small>{tab.count}</small></button>)}</nav>
    <div id="product-filters" className="products-filter-bar"><label className="products-search-field"><AdminIcon name="search" size={16} /><span className="sr-only">Search products</span><input value={searchQuery} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Search by product name, SKU or barcode…" /></label><select value={category} onChange={(event) => updateFilter("category", event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categoryTabs.slice(1).map((tab) => <option key={tab.id} value={tab.id}>{tab.name} · {tab.count}</option>)}</select><select value={status} onChange={(event) => updateFilter("status", event.target.value)} aria-label="Filter by status">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><label className="products-pos-filter"><span>POS only</span><input type="checkbox" checked={posOnly} onChange={(event) => updateFilter("pos", event.target.checked ? "1" : "")} /><span className="products-switch products-switch--filter" aria-hidden="true"><span /></span></label><details className="products-columns-menu" open={columnsMenuOpen} onToggle={(event) => setColumnsMenuOpen((event.currentTarget as HTMLDetailsElement).open)}><summary className="products-secondary-button"><AdminIcon name="columns" size={15} /> Columns</summary><div className="products-popover products-columns-popover"><p className="products-popover__label">Visible columns</p>{columnOptions.map((column) => <label key={column.value} className="products-column-option"><input type="checkbox" checked={draftColumns.includes(column.value)} onChange={(event) => setDraftColumns((current) => event.target.checked ? [...new Set([...current, column.value])] : current.filter((value) => value !== column.value))} />{column.label}</label>)}<button type="button" onClick={() => { updateQuery({ columns: draftColumns.join(","), page: "1" }); setColumnsMenuOpen(false); }} className="products-small-primary">Apply columns</button></div></details><button type="button" onClick={() => updateQuery({ q: "", category: "all", status: "all", pos: "", page: "1" })} className="products-small-primary products-search-button"><AdminIcon name="search" size={14} /><span>Clear</span></button></div>
    <div className="products-table-heading"><div><p className="products-table-heading__eyebrow">Menu inventory</p><h2 id="products-table-heading">All products</h2><p>{filteredRows.length} matching product{filteredRows.length === 1 ? "" : "s"} for {currentBranchName}.</p></div><span className="products-table-heading__scope">{canWrite ? "Admin editing enabled" : "Read only"}</span></div>
    {pageRows.length === 0 ? <div className="products-empty-state"><span><AdminIcon name="box" size={22} /></span><strong>{rows.length > 0 ? "No products match these filters" : "Your product catalog is empty"}</strong><p>{rows.length > 0 ? "Try a wider search, another category, or clear the status filters." : "Add your first product to make it available for POS and inventory."}</p><Link href="/products?create=product" className="products-primary-button">Add product</Link></div> : <div className="products-table-scroll"><table className="products-table"><thead><tr>{showBulk && <th className="products-select-column"><span className="sr-only">Select</span></th>}<th>Product</th>{columns.has("category") && <th>Category</th>}{columns.has("sku") && <th>SKU / barcode</th>}{columns.has("price") && <th>Price</th>}{columns.has("status") && <th>Status</th>}{columns.has("pos") && <th>POS visibility</th>}{columns.has("stock") && <th>Stock</th>}<th>Actions</th></tr></thead><tbody>{pageRows.map((row) => { const product = row.product; const supplier = product.supplier_id ? supplierById.get(product.supplier_id)?.name : null; return <tr key={product.id} className={selectedProductId === product.id ? "is-selected" : undefined}>{showBulk && <td className="products-select-column"><input form="bulk-update-form" type="checkbox" name="product_ids" value={product.id} aria-label={`Select ${product.name}`} /></td>}<td><div className="products-table-product"><Image src={productImage(product)} alt="" width={38} height={38} className="products-table-product__image" /><div className="products-table-product__copy"><strong>{product.name}</strong><small>{product.pricing_mode === "per_kg" ? `Price per kg · ${product.unit}` : `${product.unit} · ${supplier ?? "No supplier assigned"}`}</small></div></div></td>{columns.has("category") && <td><span className="products-category-label">{row.categoryName}</span></td>}{columns.has("sku") && <td><strong className="products-table-code">{product.sku || "SKU not set"}</strong><small className="products-table-code__sub">{product.barcode || "Barcode not set"}</small></td>}{columns.has("price") && <td className="products-price">{displayPeso(Number(product.price))}<small>{product.pricing_mode === "per_kg" ? "/ kg" : `per ${product.unit}`}</small></td>}{columns.has("status") && <td><span className={`products-status-pill ${product.is_active ? "is-active" : "is-inactive"}`}>{product.is_active ? "Active" : "Inactive"}</span></td>}{columns.has("pos") && <td><form action={toggleProductVisibility}><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="is_active" value={String(!product.is_active)} /><button type="submit" role="switch" aria-checked={product.is_active} aria-label={`${product.is_active ? "Hide" : "Show"} ${product.name} in POS`} disabled={!canWrite} className={`products-switch ${product.is_active ? "is-on" : ""}`}><span /></button></form></td>}{columns.has("stock") && <td><div className="products-stock-cell">{row.onHand === null ? <strong>—</strong> : <strong className="tnums">{formatStockQuantity(row.onHand)} {product.unit}</strong>}<small className={stockStatusClass(row.stockStatus)}>{stockStatusLabel(row.stockStatus)}</small></div></td>}<td><div className="products-row-actions"><a data-product-trigger={product.id} href={productHref(baseQuery, product.id)} className="products-icon-button" aria-label={`Edit ${product.name}`}><AdminIcon name="edit" size={14} /></a><details className="products-row-menu"><summary className="products-icon-button" aria-label={`More actions for ${product.name}`}><AdminIcon name="more" size={15} /></summary><div className="products-popover products-row-popover"><a data-product-trigger={product.id} href={productHref(baseQuery, product.id)} className="products-menu-link">Edit product</a><Link href={`/admin/inventory?product=${product.id}&movement=receive#stock-movement`} className="products-menu-link">Record stock movement</Link><Link href="/admin/sales" className="products-menu-link">View sales report</Link></div></details></div></td></tr>; })}</tbody></table></div>}
    <div className="products-table-footer"><span>Showing {filteredRows.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length} products</span><div className="products-pagination">{page > 1 && <button type="button" onClick={() => updateQuery({ page: String(page - 1) }, "push")} aria-label="Previous page">‹</button>}{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} onClick={() => updateQuery({ page: String(pageNumber) }, "push")} className={pageNumber === page ? "is-active" : ""}>{pageNumber}</button>)}{page < totalPages && <button type="button" onClick={() => updateQuery({ page: String(page + 1) }, "push")} aria-label="Next page">›</button>}</div><label className="products-page-size"><span>Rows per page:</span><select value={String(pageSize)} onChange={(event) => updateQuery({ pageSize: event.target.value, page: "1" })} aria-label="Rows per page"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label></div>
  </>;
}
