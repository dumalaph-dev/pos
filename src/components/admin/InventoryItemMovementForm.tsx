import { recordInventoryItemMovement } from "@/app/admin/inventory/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { type InventoryItemOption } from "@/lib/inventory-recipes";
import type { StockMovementType } from "@/lib/inventory";

type BranchRecord = { id: string; name: string; is_active: boolean };

const movementOptions: Array<{ value: Exclude<StockMovementType, "sale">; label: string; detail: string }> = [
  { value: "receive", label: "Stock in", detail: "Purchased or opening stock" },
  { value: "yield_out", label: "Prep usage", detail: "Manual preparation consumption" },
  { value: "yield_in", label: "Yield in", detail: "Usable stock from preparation" },
  { value: "waste", label: "Waste / spoilage", detail: "Damaged or spoiled stock" },
  { value: "adjust", label: "Adjustment", detail: "Signed correction after a count" },
];

export function InventoryItemMovementForm({ items, branches, defaultBranch, defaultItemId, defaultMovement, canWrite, open }: {
  items: InventoryItemOption[];
  branches: BranchRecord[];
  defaultBranch: string;
  defaultItemId: string;
  defaultMovement: Exclude<StockMovementType, "sale">;
  canWrite: boolean;
  open: boolean;
}) {
  const selectedItem = items.find((item) => item.id === defaultItemId) ?? items[0];
  return <details id="inventory-item-movement" open={open} className="admin-panel mt-4 p-4">
    <summary className="inventory-section-summary"><span><span className="admin-panel__eyebrow">Inventory ledger</span><strong className="mt-1 block text-lg font-extrabold text-ink">Record an inventory movement</strong><small className="mt-1 block text-xs text-ink-muted">POS sales deduct recipe ingredients automatically. Use this form for receiving, waste, prep usage, or adjustments.</small></span><span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">{canWrite ? "Admin only" : "Read only"}</span></summary>
    {items.length === 0 ? <div className="mt-4 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center"><p className="text-sm font-extrabold text-ink">No inventory items yet</p><p className="mt-1 text-xs text-ink-muted">Add ingredients or finished goods before recording stock.</p></div> : <form action={recordInventoryItemMovement} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Branch</span><select name="store_id" defaultValue={defaultBranch || selectedItem?.store_id} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Inventory item</span><select name="inventory_item_id" defaultValue={defaultItemId || selectedItem?.id} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Movement</span><select name="type" defaultValue={defaultMovement} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{movementOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.detail}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Quantity</span><input name="qty" type="number" inputMode="decimal" step="0.001" placeholder="e.g. 10 or -2" required disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Unit cost · ₱</span><input name="unit_cost" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Optional" disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Reason / reference</span><input name="reason" maxLength={180} placeholder="Required for waste and adjustments" disabled={!canWrite} className="inventory-input inventory-input--compact text-xs" /></label>
      <button type="submit" disabled={!canWrite} className="inventory-button self-end rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="check" size={14} />Record movement</button>
    </form>}
  </details>;
}
