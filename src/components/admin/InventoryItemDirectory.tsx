"use client";

import { useMemo, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { formatInventoryQuantity, inventoryItemTypeLabel, type InventoryItemOption } from "@/lib/inventory-recipes";

type BranchRecord = { id: string; name: string; is_active: boolean };
type UsageRecord = { names: string[]; count: number };
type Status = "all" | "in_stock" | "low" | "out";

function statusFor(quantity: number, minimum: number): Exclude<Status, "all"> {
  if (quantity <= 0) return "out";
  if (quantity <= minimum) return "low";
  return "in_stock";
}

function statusLabel(status: Exclude<Status, "all">) {
  return status === "out" ? "Out of stock" : status === "low" ? "Low stock" : "In stock";
}

function statusClass(status: Exclude<Status, "all">) {
  return status === "out" ? "bg-danger-soft text-danger" : status === "low" ? "bg-warning/15 text-warning" : "bg-success/10 text-success";
}

export function InventoryItemDirectory({ items, branches, stockByKey, usageByItem, canWrite, selectedBranchId }: {
  items: InventoryItemOption[];
  branches: BranchRecord[];
  stockByKey: Record<string, number>;
  usageByItem: Record<string, UsageRecord>;
  canWrite: boolean;
  selectedBranchId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [branch, setBranch] = useState(selectedBranchId ?? "all");
  const branchById = useMemo(() => new Map(branches.map((item) => [item.id, item])), [branches]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (branch !== "all" && item.store_id !== branch) return false;
      if (type !== "all" && item.item_type !== type) return false;
      const stock = Number(stockByKey[`${item.store_id}:${item.id}`] ?? 0);
      if (status !== "all" && statusFor(stock, Number(item.min_stock)) !== status) return false;
      if (!normalized) return true;
      const usage = usageByItem[item.id];
      return [item.name, item.unit, inventoryItemTypeLabel(item.item_type), ...(usage?.names ?? [])]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [branch, items, query, status, stockByKey, type, usageByItem]);

  return <section id="inventory-table" aria-labelledby="inventory-table-heading" className="admin-panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4">
      <div><p className="admin-panel__eyebrow">Inventory directory</p><h2 id="inventory-table-heading" className="admin-panel__title">Ingredients and stock items</h2><p className="admin-panel__subtitle">{filteredItems.length} matching item{filteredItems.length === 1 ? "" : "s"}. One ingredient can be shared by many products.</p></div>
      <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{canWrite ? "Admin editing enabled" : "Read only"}</span>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-line bg-surface-raised px-4 py-3">
      <label className="products-search-field min-w-[220px] flex-1"><AdminIcon name="search" size={15} /><span className="sr-only">Search inventory items</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ingredients, units, or products…" /></label>
      <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter inventory item type" className="inventory-input inventory-input--compact"><option value="all">All types</option><option value="ingredient">Ingredients</option><option value="packaging">Packaging</option><option value="finished_good">Finished goods</option></select>
      <select value={status} onChange={(event) => setStatus(event.target.value as Status)} aria-label="Filter inventory stock status" className="inventory-input inventory-input--compact"><option value="all">All stock status</option><option value="in_stock">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      {branches.length > 1 && <select value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filter inventory branch" className="inventory-input inventory-input--compact"><option value="all">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
    </div>
    {filteredItems.length === 0 ? <div className="grid place-items-center px-4 py-14 text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="box" size={22} /></span><p className="mt-4 text-sm font-extrabold text-ink">{items.length ? "No inventory items match these filters" : "Your inventory is empty"}</p><p className="mt-1 max-w-md text-xs leading-5 text-ink-muted">{items.length ? "Try a wider search or clear the filters." : "Create an ingredient such as dough, chicken, fries, coffee beans, or milk, then connect it to products from the Products page."}</p></div> : <div className="overflow-x-auto"><table className="admin-list-table min-w-[960px]"><thead><tr><th>Inventory item</th><th>Type</th><th>Stock on hand</th><th>Status</th><th>Used by products</th><th>Cost / unit</th><th>Actions</th></tr></thead><tbody>{filteredItems.map((item) => {
      const stock = Number(stockByKey[`${item.store_id}:${item.id}`] ?? 0);
      const itemStatus = statusFor(stock, Number(item.min_stock));
      const usage = usageByItem[item.id];
      const branchName = branchById.get(item.store_id)?.name ?? "Unknown branch";
      return <tr key={item.id}><td><div className="flex min-w-[230px] items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"><AdminIcon name={item.item_type === "packaging" ? "package" : item.item_type === "finished_good" ? "box" : "inventory"} size={17} /></span><span className="min-w-0"><strong className="block truncate text-[11px] font-extrabold">{item.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">{branchName} · measured in {item.unit}</small></span></div></td><td className="whitespace-nowrap text-[10px] font-semibold text-ink-muted">{inventoryItemTypeLabel(item.item_type)}</td><td className="whitespace-nowrap"><strong className="tnums text-[11px] font-extrabold">{formatInventoryQuantity(stock)} {item.unit}</strong><small className="mt-1 block text-[10px] text-ink-muted">min: {formatInventoryQuantity(item.min_stock)} {item.unit}</small></td><td><span className={`inline-flex whitespace-nowrap rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${statusClass(itemStatus)}`}>{statusLabel(itemStatus)}</span></td><td className="max-w-[240px] text-[10px] font-semibold">{usage?.count ? <><strong>{usage.count} product{usage.count === 1 ? "" : "s"}</strong><small className="mt-1 block truncate text-ink-muted" title={usage.names.join(", ")}>{usage.names.join(", ")}</small></> : <span className="text-ink-muted">Not connected yet</span>}</td><td className="tnums whitespace-nowrap text-[10px] font-semibold">{item.cost_per_unit == null ? "—" : `₱${(Number(item.cost_per_unit) / 100).toFixed(2)}`}</td><td><div className="flex items-center justify-end gap-1"><Link href={`/admin/inventory?item=${item.id}&movement=receive#inventory-item-movement`} className="inventory-icon-button border border-line bg-surface text-primary transition hover:bg-primary-soft" aria-label={`Record movement for ${item.name}`}><AdminIcon name="download" size={14} /></Link><Link href={`/admin/inventory?item=${item.id}&movement=adjust#inventory-item-movement`} className="inventory-icon-button border border-line bg-surface text-primary transition hover:bg-primary-soft" aria-label={`Adjust ${item.name}`}><AdminIcon name="edit" size={14} /></Link></div></td></tr>;
    })}</tbody></table></div>}
  </section>;
}
