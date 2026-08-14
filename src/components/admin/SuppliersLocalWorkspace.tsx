"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import { createSupplier, updateSupplier } from "@/app/admin/suppliers/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { DeleteSupplierButton } from "@/components/admin/DeleteSupplierButton";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import { useAdminUrlQuery } from "@/components/admin/AdminUrlQuery";

type SupplierStatus = "all" | "active" | "inactive";
type BranchRecord = { id: string; name: string; is_active: boolean };

export type AdminSupplierRecord = {
  id: string;
  store_id: string | null;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const statusOptions: Array<{ value: SupplierStatus; label: string }> = [
  { value: "all", label: "All suppliers" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
];

function supplierHref(q: string, status: SupplierStatus, edit?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/suppliers?${query}` : "/admin/suppliers";
}

export function SuppliersLocalWorkspace({
  suppliers,
  branches,
  initialQuery,
  initialStatus,
  initialEditId,
  canWrite,
  defaultBranch,
  notice,
}: {
  suppliers: AdminSupplierRecord[];
  branches: BranchRecord[];
  initialQuery: string;
  initialStatus: SupplierStatus;
  initialEditId: string | null;
  canWrite: boolean;
  defaultBranch: string;
  notice?: { kind: "success" | "error" | "warning"; message: string };
}) {
  const [query, updateQuery] = useAdminUrlQuery({ q: initialQuery, status: initialStatus });
  const searchQuery = query.q ?? "";
  const status: SupplierStatus = query.status === "active" || query.status === "inactive" ? query.status : "all";
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => {
    if (status === "active" && !supplier.is_active) return false;
    if (status === "inactive" && supplier.is_active) return false;
    if (!normalizedQuery) return true;
    return [supplier.name, supplier.contact_name, supplier.phone, supplier.email, supplier.address]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  }), [normalizedQuery, status, suppliers]);
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active).length;
  const contactableSuppliers = suppliers.filter((supplier) => supplier.phone || supplier.email).length;
  const assignedSuppliers = suppliers.filter((supplier) => supplier.store_id).length;

  return (
    <UrlLocalDialogController
      className="supplier-dialog-controller"
      records={suppliers}
      initialId={initialEditId}
      queryKey="edit"
      triggerSelector="[data-supplier-trigger]"
      readTriggerId={(trigger) => trigger.dataset.supplierTrigger ?? null}
      getRecordId={(supplier) => supplier.id}
      performanceSurface="suppliers"
      renderDialog={(supplier, onClose) => (
        <AdminDialog
          key={supplier.id}
          onClose={onClose}
          titleId={`supplier-dialog-heading-${supplier.id}`}
          descriptionId={`supplier-dialog-description-${supplier.id}`}
          bodyClassName="admin-dialog-open"
          backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          dialogClassName="relative my-4 w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6"
        >
          <SupplierEditorDialog supplier={supplier} branches={branches} canWrite={canWrite} onClose={onClose} />
        </AdminDialog>
      )}
    >
      <div className="admin-directory-workspace">
        {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-5 rounded-card border px-4 py-3 text-sm font-semibold ${notice.kind === "success" ? "border-success/25 bg-success/10 text-success" : notice.kind === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/30 bg-warning/10 text-ink"}`}>{notice.message}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SupplierMetric label="Suppliers" value={String(suppliers.length)} detail="In this organization" tone="bg-primary text-primary-fg" icon="suppliers" />
          <SupplierMetric label="Active" value={String(activeSuppliers)} detail="Available for purchasing" tone="bg-success text-white" icon="dashboard" />
          <SupplierMetric label="Contactable" value={String(contactableSuppliers)} detail="Phone or email saved" tone="bg-secondary text-primary" icon="suppliers" />
          <SupplierMetric label="Branch linked" value={String(assignedSuppliers)} detail="Home branch assigned" tone="bg-primary-soft text-primary" icon="inventory" />
        </div>

        <section aria-labelledby="supplier-filters-heading" className="admin-panel mt-6 p-5">
          <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Find a supplier</p><h2 id="supplier-filters-heading" className="admin-panel__title">Filter directory</h2></div>{(searchQuery || status !== "all") && <button type="button" onClick={() => updateQuery({ q: "", status: "" })} className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></button>}</div>
          <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); updateQuery({ q: String(formData.get("q") ?? ""), status: String(formData.get("status") ?? "") }); }} className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(170px,0.8fr)_auto] lg:items-end">
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" value={searchQuery} onChange={(event) => updateQuery({ q: event.target.value })} placeholder="Supplier, contact, phone, email" className="inventory-input pl-10" /></span></label>
            <FilterField label="Status" htmlFor="supplier-status"><select id="supplier-status" name="status" value={status} onChange={(event) => updateQuery({ status: event.target.value })} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField>
            <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
          </form>
          <p className="mt-3 text-xs text-ink-muted">Filtering happens in this browser; the URL remains shareable and back/forward friendly.</p>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.68fr)_minmax(0,1.32fr)]">
          <SupplierCreateForm branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} />
          <section aria-labelledby="supplier-directory-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Purchasing directory</p><h2 id="supplier-directory-heading" className="admin-panel__title">Suppliers</h2><p className="admin-panel__subtitle">{filteredSuppliers.length} matching supplier{filteredSuppliers.length === 1 ? "" : "s"}. This directory is ready for future purchasing workflows.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Local filter</span></div>
            {filteredSuppliers.length === 0 ? <EmptyDirectory label="No suppliers match these filters" detail="Try a wider search or add the first supplier to build your purchasing directory." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[760px]"><thead><tr><th>Supplier</th><th>Contact person</th><th>Contact</th><th>Home branch</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredSuppliers.map((supplier) => <tr key={supplier.id}><td><strong className="font-extrabold">{supplier.name}</strong>{supplier.address && <small className="mt-1 block max-w-[170px] truncate text-[10px] text-ink-muted">{supplier.address}</small>}</td><td className="whitespace-nowrap">{supplier.contact_name || "—"}</td><td><span className="block whitespace-nowrap">{supplier.phone || "—"}</span><small className="mt-1 block max-w-[170px] truncate text-[10px] text-ink-muted">{supplier.email || "No email"}</small></td><td className="whitespace-nowrap">{supplier.store_id ? branchById.get(supplier.store_id)?.name ?? "Unknown branch" : "All branches"}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${supplier.is_active ? "bg-success/10 text-success" : "bg-secondary text-ink-muted"}`}>{supplier.is_active ? "Active" : "Inactive"}</span></td><td><a data-supplier-trigger={supplier.id} href={supplierHref(searchQuery, status, supplier.id)} className="font-extrabold text-primary hover:underline">{canWrite ? "Edit" : "View"}</a></td></tr>)}</tbody></table></div>}
          </section>
        </div>
      </div>
    </UrlLocalDialogController>
  );
}

function SupplierCreateForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section aria-labelledby="new-supplier-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id="new-supplier-heading" className="admin-panel__title">Add supplier</h2><p className="admin-panel__subtitle">Capture the contact details needed when stock runs low.</p></div><form action={createSupplier} className="mt-5 space-y-3"><SupplierFields branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><SubmitButton disabled={!canWrite}>Add supplier</SubmitButton></form></section>;
}

function SupplierEditorDialog({ supplier, branches, canWrite, onClose }: { supplier: AdminSupplierRecord; branches: BranchRecord[]; canWrite: boolean; onClose: () => void }) {
  return <section aria-labelledby={`supplier-dialog-heading-${supplier.id}`}><header className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id={`supplier-dialog-heading-${supplier.id}`} className="admin-panel__title">Edit supplier</h2><p id={`supplier-dialog-description-${supplier.id}`} className="admin-panel__subtitle">Update the record, mark it inactive, or permanently delete it.</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close supplier editor">&times;</button></header><form action={updateSupplier} className="mt-5 space-y-3"><input type="hidden" name="supplier_id" value={supplier.id} /><SupplierFields supplier={supplier} branches={branches} defaultBranch={supplier.store_id ?? ""} canWrite={canWrite} /><label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={supplier.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" />{supplier.is_active ? "Active supplier" : "Inactive supplier"}</label><div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</button><SubmitButton disabled={!canWrite}>Save changes</SubmitButton></div></form>{canWrite && <div className="mt-5 border-t border-danger/15 pt-5"><p className="text-xs font-extrabold uppercase tracking-[0.12em] text-danger">Danger zone</p><p className="mt-1 text-xs leading-5 text-ink-muted">Delete this supplier permanently. Products will stay in your catalog, but any supplier assignment will be cleared.</p><div className="mt-3"><DeleteSupplierButton supplierId={supplier.id} supplierName={supplier.name} /></div></div>}</section>;
}

function SupplierFields({ supplier, branches, defaultBranch, canWrite }: { supplier?: AdminSupplierRecord; branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <>
    <Field label="Home branch" htmlFor={`supplier-store-${supplier?.id ?? "new"}`}><select id={`supplier-store-${supplier?.id ?? "new"}`} name="store_id" defaultValue={defaultBranch} disabled={!canWrite} className="inventory-input"><option value="">All branches / no home branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></Field>
    <Field label="Supplier name" htmlFor={`supplier-name-${supplier?.id ?? "new"}`}><input id={`supplier-name-${supplier?.id ?? "new"}`} name="name" defaultValue={supplier?.name ?? ""} placeholder="e.g. Local Pork Farm" required disabled={!canWrite} className="inventory-input" /></Field>
    <Field label="Contact person" htmlFor={`supplier-contact-${supplier?.id ?? "new"}`}><input id={`supplier-contact-${supplier?.id ?? "new"}`} name="contact_name" defaultValue={supplier?.contact_name ?? ""} placeholder="Optional contact person" disabled={!canWrite} className="inventory-input" /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone" htmlFor={`supplier-phone-${supplier?.id ?? "new"}`}><input id={`supplier-phone-${supplier?.id ?? "new"}`} name="phone" defaultValue={supplier?.phone ?? ""} placeholder="09xx xxx xxxx" disabled={!canWrite} className="inventory-input" /></Field><Field label="Email" htmlFor={`supplier-email-${supplier?.id ?? "new"}`}><input id={`supplier-email-${supplier?.id ?? "new"}`} name="email" type="email" defaultValue={supplier?.email ?? ""} placeholder="Optional email" disabled={!canWrite} className="inventory-input" /></Field></div>
    <Field label="Address" htmlFor={`supplier-address-${supplier?.id ?? "new"}`}><textarea id={`supplier-address-${supplier?.id ?? "new"}`} name="address" defaultValue={supplier?.address ?? ""} rows={2} placeholder="Optional pickup or billing address" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
    <Field label="Notes" htmlFor={`supplier-notes-${supplier?.id ?? "new"}`}><textarea id={`supplier-notes-${supplier?.id ?? "new"}`} name="notes" defaultValue={supplier?.notes ?? ""} rows={2} placeholder="Delivery schedule, terms, or notes" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
  </>;
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="mt-2 flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving..." : children}</button>;
}

function SupplierMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "suppliers" | "dashboard" | "inventory" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function EmptyDirectory({ label, detail }: { label: string; detail: string }) {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="suppliers" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

