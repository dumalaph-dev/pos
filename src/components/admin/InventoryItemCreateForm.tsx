import { createInventoryItem } from "@/app/admin/inventory/actions";

type BranchRecord = { id: string; name: string; is_active: boolean };
type SupplierRecord = { id: string; name: string; is_active: boolean };

export function InventoryItemCreateForm({ branches, suppliers, defaultBranch, canWrite }: {
  branches: BranchRecord[];
  suppliers: SupplierRecord[];
  defaultBranch: string;
  canWrite: boolean;
}) {
  return <details id="inventory-item-create" className="admin-panel p-4">
    <summary className="inventory-section-summary"><span><span className="admin-panel__eyebrow">New inventory record</span><strong className="mt-1 block text-base font-extrabold text-ink">Add an ingredient or stock item</strong><small className="mt-1 block text-xs text-ink-muted">Create shared items such as dough, chicken, fries, coffee beans, milk, cups, or packaging.</small></span><span className="rounded-pill bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold text-primary">{canWrite ? "Admin only" : "Read only"}</span></summary>
    <form action={createInventoryItem} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Branch</span><select name="store_id" defaultValue={defaultBranch} required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Item name</span><input name="name" required minLength={2} maxLength={120} placeholder="e.g. Coffee beans" disabled={!canWrite} className="inventory-input inventory-input--compact text-xs" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Item type</span><select name="item_type" defaultValue="ingredient" required disabled={!canWrite} className="inventory-input inventory-input--compact text-xs"><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option><option value="finished_good">Finished good</option></select></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Unit</span><input name="unit" defaultValue="pcs" required maxLength={24} placeholder="kg, L, pcs" disabled={!canWrite} className="inventory-input inventory-input--compact text-xs" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Cost / unit · ₱</span><input name="cost_per_unit" type="number" min="0" step="0.01" placeholder="Optional" disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Minimum stock</span><input name="min_stock" type="number" min="0" step="0.001" defaultValue="0" disabled={!canWrite} className="inventory-input inventory-input--compact tnums text-xs" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Supplier</span><select name="supplier_id" disabled={!canWrite} className="inventory-input inventory-input--compact text-xs"><option value="">Unassigned</option>{suppliers.filter((supplier) => supplier.is_active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <button type="submit" disabled={!canWrite} className="inventory-button self-end rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50">Create inventory item</button>
    </form>
  </details>;
}
