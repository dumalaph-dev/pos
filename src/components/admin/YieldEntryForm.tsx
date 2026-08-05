"use client";

import { useMemo, useState } from "react";
import { recordYieldEntry } from "@/app/admin/inventory/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";

type BranchRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = { id: string; name: string; store_id: string; unit: string };

export function YieldEntryForm({ branches, products, defaultBranch, defaultSourceProductId, defaultOutputProductId, canWrite, open }: {
  branches: BranchRecord[];
  products: ProductRecord[];
  defaultBranch: string;
  defaultSourceProductId: string;
  defaultOutputProductId: string;
  canWrite: boolean;
  open: boolean;
}) {
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranch);
  const [sourceProductId, setSourceProductId] = useState(defaultSourceProductId);
  const [outputProductId, setOutputProductId] = useState(defaultOutputProductId);
  const [sourceQty, setSourceQty] = useState("1");
  const [totalYieldQty, setTotalYieldQty] = useState("");
  const [wasteQty, setWasteQty] = useState("0");

  const branchProducts = useMemo(
    () => products.filter((product) => product.store_id === selectedBranchId),
    [products, selectedBranchId],
  );
  const effectiveSourceProductId = branchProducts.some((product) => product.id === sourceProductId)
    ? sourceProductId
    : branchProducts[0]?.id ?? "";
  const effectiveOutputProductId = branchProducts.some((product) => product.id === outputProductId && product.id !== effectiveSourceProductId)
    ? outputProductId
    : branchProducts.find((product) => product.id !== effectiveSourceProductId)?.id ?? "";
  const sourceProduct = branchProducts.find((product) => product.id === effectiveSourceProductId);
  const outputProduct = branchProducts.find((product) => product.id === effectiveOutputProductId);
  const total = Number(totalYieldQty);
  const waste = Number(wasteQty || 0);
  const usableYield = Number.isFinite(total) && total > 0 && Number.isFinite(waste)
    ? Math.max(0, total - waste)
    : 0;
  const canSubmit = canWrite && branchProducts.length >= 2 && Boolean(effectiveSourceProductId && effectiveOutputProductId);

  function handleBranchChange(branchId: string) {
    const nextProducts = products.filter((product) => product.store_id === branchId);
    setSelectedBranchId(branchId);
    setSourceProductId(nextProducts[0]?.id ?? "");
    setOutputProductId(nextProducts.find((product) => product.id !== nextProducts[0]?.id)?.id ?? "");
  }

  return (
    <details id="yield-entry" open={open} className="admin-panel inventory-yield-panel mt-4 p-4">
      <summary className="inventory-section-summary">
        <span>
          <span className="admin-panel__eyebrow">Production workflow</span>
          <strong className="mt-1 block text-lg font-extrabold text-ink">Guided whole-lechon yield</strong>
          <small className="mt-1 block text-xs text-ink-muted">Convert a whole lechon into saleable output and record waste in one step.</small>
        </span>
        <span className="rounded-pill bg-success/10 px-2.5 py-1 text-[10px] font-extrabold text-success">{canWrite ? "Admin only" : "Read only"}</span>
      </summary>

      {products.length === 0 ? (
        <div className="mt-4 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center">
          <p className="text-sm font-extrabold text-ink">Add tracked products first</p>
          <p className="mt-1 text-xs text-ink-muted">You need a source product and an output product before a yield can be recorded.</p>
        </div>
      ) : (
        <form action={recordYieldEntry} className="inventory-yield-form mt-4">
          <div className="inventory-yield-step">
            <div className="inventory-yield-step__heading"><span className="inventory-yield-step__number">1</span><div><strong>What went into preparation?</strong><small>Choose the branch and the source item you are processing.</small></div></div>
            <div className="inventory-yield-step__fields">
              <label className="block"><span className="inventory-field-label">Branch</span><select name="store_id" value={selectedBranchId} onChange={(event) => handleBranchChange(event.target.value)} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label className="block"><span className="inventory-field-label">Source product</span><select name="source_product_id" value={effectiveSourceProductId} onChange={(event) => setSourceProductId(event.target.value)} required disabled={!canWrite || branchProducts.length === 0} className="inventory-input inventory-input--compact text-xs">{branchProducts.length === 0 ? <option value="">No tracked products in this branch</option> : branchProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}</select></label>
              <label className="block"><span className="inventory-field-label">Source quantity <em>({sourceProduct?.unit ?? "unit"})</em></span><input name="source_qty" type="number" min="0.001" step="0.001" inputMode="decimal" value={sourceQty} onChange={(event) => setSourceQty(event.target.value)} required disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" placeholder="e.g. 1" /></label>
            </div>
          </div>

          <div className="inventory-yield-step">
            <div className="inventory-yield-step__heading"><span className="inventory-yield-step__number">2</span><div><strong>What came out?</strong><small>Record the full yield first, then separate any waste.</small></div></div>
            <div className="inventory-yield-step__fields">
              <label className="block"><span className="inventory-field-label">Output product</span><select name="output_product_id" value={effectiveOutputProductId} onChange={(event) => setOutputProductId(event.target.value)} required disabled={!canWrite || branchProducts.length < 2} className="inventory-input inventory-input--compact text-xs">{branchProducts.length < 2 ? <option value="">Add a second tracked product</option> : branchProducts.filter((product) => product.id !== effectiveSourceProductId).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}</select></label>
              <label className="block"><span className="inventory-field-label">Total yield <em>({outputProduct?.unit ?? "unit"})</em></span><input name="total_yield_qty" type="number" min="0.001" step="0.001" inputMode="decimal" value={totalYieldQty} onChange={(event) => setTotalYieldQty(event.target.value)} required disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" placeholder="e.g. 35" /></label>
              <label className="block"><span className="inventory-field-label">Waste <em>({outputProduct?.unit ?? "unit"})</em></span><input name="waste_qty" type="number" min="0" step="0.001" inputMode="decimal" value={wasteQty} onChange={(event) => setWasteQty(event.target.value)} disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" placeholder="0" /></label>
            </div>
          </div>

          <div className="inventory-yield-summary" aria-live="polite">
            <div><span className="inventory-field-label">Usable output</span><strong>{usableYield > 0 ? usableYield.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : "—"} {outputProduct?.unit ?? ""}</strong><small>Total yield less waste</small></div>
            <div className="inventory-yield-summary__ledger"><AdminIcon name="check" size={16} /><span>One save records source stock out, output stock in, and waste as linked ledger movements.</span></div>
          </div>

          <div className="inventory-yield-form__footer">
            <label className="block flex-1"><span className="inventory-field-label">Note <em>(optional)</em></span><input name="reason" maxLength={180} disabled={!canWrite} className="inventory-input inventory-input--compact text-xs" placeholder="e.g. Prep batch for Saturday orders" /></label>
            <button type="submit" disabled={!canSubmit} className="inventory-button self-end rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="check" size={14} />Save yield entry</button>
          </div>
          {branchProducts.length < 2 && <p className="text-xs font-semibold text-warning">Add at least two active tracked products in this branch: one source and one output.</p>}
        </form>
      )}
    </details>
  );
}
