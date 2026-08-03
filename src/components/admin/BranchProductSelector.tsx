"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type BranchRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = { id: string; name: string; store_id: string; unit: string };

export function BranchProductSelector({ branches, products, defaultBranch, defaultProductId, canWrite }: {
  branches: BranchRecord[];
  products: ProductRecord[];
  defaultBranch: string;
  defaultProductId: string;
  canWrite: boolean;
}) {
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranch);
  const initialProducts = products.filter((product) => product.store_id === defaultBranch);
  const initialProductId = initialProducts.some((product) => product.id === defaultProductId)
    ? defaultProductId
    : initialProducts[0]?.id ?? "";
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const availableProducts = products.filter((product) => product.store_id === selectedBranchId);

  function handleBranchChange(branchId: string) {
    const nextProducts = products.filter((product) => product.store_id === branchId);
    setSelectedBranchId(branchId);
    setSelectedProductId(nextProducts[0]?.id ?? "");
  }

  return <>
    <InventoryField label="Branch" htmlFor="inventory-store">
      <select id="inventory-store" name="store_id" value={selectedBranchId} onChange={(event) => handleBranchChange(event.target.value)} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}
      </select>
    </InventoryField>
    <InventoryField label="Item" htmlFor="inventory-product">
      <select id="inventory-product" name="product_id" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">
        {availableProducts.length === 0 ? <option value="">No tracked products in this branch</option> : availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
      </select>
      {availableProducts.length === 0 && <small className="mt-1 block text-[10px] text-ink-muted">Choose another branch or enable stock tracking on a product.</small>}
    </InventoryField>
  </>;
}

function InventoryField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}
