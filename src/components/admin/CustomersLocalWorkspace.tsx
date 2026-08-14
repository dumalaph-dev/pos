"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import { createCustomer, updateCustomer } from "@/app/admin/customers/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import { useAdminUrlQuery } from "@/components/admin/AdminUrlQuery";

type CustomerStatus = "all" | "active" | "inactive";
type BranchRecord = { id: string; name: string; is_active: boolean };

export type AdminCustomerRecord = {
  id: string;
  store_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const statusOptions: Array<{ value: CustomerStatus; label: string }> = [
  { value: "all", label: "All customers" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function customerHref(q: string, status: CustomerStatus, edit?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/customers?${query}` : "/admin/customers";
}

export function CustomersLocalWorkspace({
  customers,
  branches,
  initialQuery,
  initialStatus,
  initialEditId,
  canWrite,
  defaultBranch,
  notice,
}: {
  customers: AdminCustomerRecord[];
  branches: BranchRecord[];
  initialQuery: string;
  initialStatus: CustomerStatus;
  initialEditId: string | null;
  canWrite: boolean;
  defaultBranch: string;
  notice?: { kind: "success" | "error" | "warning"; message: string };
}) {
  const [query, updateQuery] = useAdminUrlQuery({ q: initialQuery, status: initialStatus });
  const searchQuery = query.q ?? "";
  const status: CustomerStatus = query.status === "active" || query.status === "inactive" ? query.status : "all";
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    if (status === "active" && !customer.is_active) return false;
    if (status === "inactive" && customer.is_active) return false;
    if (!normalizedQuery) return true;
    return [customer.name, customer.phone, customer.email, customer.address]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  }), [customers, normalizedQuery, status]);

  const activeCustomers = customers.filter((customer) => customer.is_active).length;
  const contactableCustomers = customers.filter((customer) => customer.phone || customer.email).length;
  const assignedCustomers = customers.filter((customer) => customer.store_id).length;
  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);

  return (
    <UrlLocalDialogController
      className="customer-dialog-controller"
      records={customers}
      initialId={initialEditId}
      queryKey="edit"
      triggerSelector="[data-customer-trigger]"
      readTriggerId={(trigger) => trigger.dataset.customerTrigger ?? null}
      getRecordId={(customer) => customer.id}
      performanceSurface="customers"
      renderDialog={(customer, onClose) => (
        <AdminDialog
          key={customer.id}
          onClose={onClose}
          titleId={`customer-dialog-heading-${customer.id}`}
          descriptionId={`customer-dialog-description-${customer.id}`}
          bodyClassName="admin-dialog-open"
          backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          dialogClassName="relative my-4 w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6"
        >
          <CustomerEditorDialog customer={customer} branches={branches} canWrite={canWrite} onClose={onClose} />
        </AdminDialog>
      )}
    >
      <div className="admin-directory-workspace">
          {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-5 rounded-card border px-4 py-3 text-sm font-semibold ${notice.kind === "success" ? "border-success/25 bg-success/10 text-success" : notice.kind === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/30 bg-warning/10 text-ink"}`}>{notice.message}</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CustomerMetric label="Customers" value={String(customers.length)} detail="In this organization" tone="bg-primary text-primary-fg" icon="customers" />
            <CustomerMetric label="Active" value={String(activeCustomers)} detail="Available for service" tone="bg-success text-white" icon="dashboard" />
            <CustomerMetric label="Contactable" value={String(contactableCustomers)} detail="Phone or email saved" tone="bg-secondary text-primary" icon="customers" />
            <CustomerMetric label="Branch linked" value={String(assignedCustomers)} detail="Home branch assigned" tone="bg-primary-soft text-primary" icon="inventory" />
          </div>

          <section aria-labelledby="customer-filters-heading" className="admin-panel mt-6 p-5">
            <div className="admin-panel__header">
              <div><p className="admin-panel__eyebrow">Find a customer</p><h2 id="customer-filters-heading" className="admin-panel__title">Filter directory</h2></div>
              {(searchQuery || status !== "all") && <button type="button" onClick={() => updateQuery({ q: "", status: "" })} className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></button>}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); updateQuery({ q: String(formData.get("q") ?? ""), status: String(formData.get("status") ?? "") }); }} className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(170px,0.8fr)_auto] lg:items-end">
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" value={searchQuery} onChange={(event) => updateQuery({ q: event.target.value })} placeholder="Name, phone, email, address" className="inventory-input pl-10" /></span></label>
              <FilterField label="Status" htmlFor="customer-status"><select id="customer-status" name="status" value={status} onChange={(event) => updateQuery({ status: event.target.value })} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField>
              <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
            </form>
            <p className="mt-3 text-xs text-ink-muted">Filtering happens in this browser; the URL remains shareable and back/forward friendly.</p>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.68fr)_minmax(0,1.32fr)]">
            <CustomerCreateForm branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} />

            <section aria-labelledby="customer-directory-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Relationship directory</p><h2 id="customer-directory-heading" className="admin-panel__title">Customers</h2><p className="admin-panel__subtitle">{filteredCustomers.length} matching customer{filteredCustomers.length === 1 ? "" : "s"}. Keep records concise so the team can act quickly.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Local filter</span></div>
              {filteredCustomers.length === 0 ? <EmptyDirectory label="No customers match these filters" detail="Try a wider search or add the first customer to begin the directory." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[720px]"><thead><tr><th>Customer</th><th>Contact</th><th>Home branch</th><th>Updated</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredCustomers.map((customer) => <tr key={customer.id}><td><strong className="font-extrabold">{customer.name}</strong>{customer.address && <small className="mt-1 block max-w-[180px] truncate text-[10px] text-ink-muted">{customer.address}</small>}</td><td><span className="block whitespace-nowrap">{customer.phone || "—"}</span><small className="mt-1 block max-w-[170px] truncate text-[10px] text-ink-muted">{customer.email || "No email"}</small></td><td className="whitespace-nowrap">{customer.store_id ? branchById.get(customer.store_id)?.name ?? "Unknown branch" : "All branches"}</td><td className="whitespace-nowrap text-ink-muted">{formatDate(customer.updated_at)}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${customer.is_active ? "bg-success/10 text-success" : "bg-secondary text-ink-muted"}`}>{customer.is_active ? "Active" : "Inactive"}</span></td><td><a data-customer-trigger={customer.id} href={customerHref(searchQuery, status, customer.id)} className="font-extrabold text-primary hover:underline">{canWrite ? "Edit" : "View"}</a></td></tr>)}</tbody></table></div>}
            </section>
          </div>
      </div>
    </UrlLocalDialogController>
  );
}

function CustomerCreateForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section aria-labelledby="new-customer-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id="new-customer-heading" className="admin-panel__title">Add customer</h2><p className="admin-panel__subtitle">Save only the details your team will actually use.</p></div><form action={createCustomer} className="mt-5 space-y-3"><CustomerFields branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><SubmitButton disabled={!canWrite}>Add customer</SubmitButton></form></section>;
}

function CustomerEditorDialog({ customer, branches, canWrite, onClose }: { customer: AdminCustomerRecord; branches: BranchRecord[]; canWrite: boolean; onClose: () => void }) {
  return <section aria-labelledby={`customer-dialog-heading-${customer.id}`}><header className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id={`customer-dialog-heading-${customer.id}`} className="admin-panel__title">Edit customer</h2><p id={`customer-dialog-description-${customer.id}`} className="admin-panel__subtitle">Update the record or mark it inactive without deleting its history.</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close customer editor">&times;</button></header><form action={updateCustomer} className="mt-5 space-y-3"><input type="hidden" name="customer_id" value={customer.id} /><CustomerFields customer={customer} branches={branches} defaultBranch={customer.store_id ?? ""} canWrite={canWrite} /><label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={customer.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" />{customer.is_active ? "Active customer" : "Inactive customer"}</label><div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</button><SubmitButton disabled={!canWrite}>Save changes</SubmitButton></div></form></section>;
}

function CustomerFields({ customer, branches, defaultBranch, canWrite }: { customer?: AdminCustomerRecord; branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <>
    <Field label="Home branch" htmlFor={`customer-store-${customer?.id ?? "new"}`}><select id={`customer-store-${customer?.id ?? "new"}`} name="store_id" defaultValue={defaultBranch} disabled={!canWrite} className="inventory-input"><option value="">All branches / no home branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></Field>
    <Field label="Full name" htmlFor={`customer-name-${customer?.id ?? "new"}`}><input id={`customer-name-${customer?.id ?? "new"}`} name="name" defaultValue={customer?.name ?? ""} placeholder="e.g. Maria Santos" required disabled={!canWrite} className="inventory-input" /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone" htmlFor={`customer-phone-${customer?.id ?? "new"}`}><input id={`customer-phone-${customer?.id ?? "new"}`} name="phone" defaultValue={customer?.phone ?? ""} placeholder="09xx xxx xxxx" disabled={!canWrite} className="inventory-input" /></Field><Field label="Email" htmlFor={`customer-email-${customer?.id ?? "new"}`}><input id={`customer-email-${customer?.id ?? "new"}`} name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="Optional email" disabled={!canWrite} className="inventory-input" /></Field></div>
    <Field label="Address" htmlFor={`customer-address-${customer?.id ?? "new"}`}><textarea id={`customer-address-${customer?.id ?? "new"}`} name="address" defaultValue={customer?.address ?? ""} rows={2} placeholder="Optional delivery or billing address" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
    <Field label="Notes" htmlFor={`customer-notes-${customer?.id ?? "new"}`}><textarea id={`customer-notes-${customer?.id ?? "new"}`} name="notes" defaultValue={customer?.notes ?? ""} rows={2} placeholder="Preferences or useful context" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
  </>;
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="mt-2 flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving..." : children}</button>;
}

function CustomerMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "customers" | "dashboard" | "inventory" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function EmptyDirectory({ label, detail }: { label: string; detail: string }) {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="customers" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}
