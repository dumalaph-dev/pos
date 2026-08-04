import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { createCustomer, updateCustomer } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type CustomerStatus = "all" | "active" | "inactive";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = { id: string; name: string; is_active: boolean };

type CustomerRecord = {
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

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const statusOptions: Array<{ value: CustomerStatus; label: string }> = [
  { value: "all", label: "All customers" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isCustomerStatus(value: string): value is CustomerStatus {
  return value === "all" || value === "active" || value === "inactive";
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function customerHref({ q, status, edit }: { q: string; status: CustomerStatus; edit?: string }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/customers?${query}` : "/admin/customers";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; q?: string | string[]; status?: string | string[]; edit?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <CustomersProfileMissing />;

  const [branchesResult, customersResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name"),
    supabase
      .from("customers")
      .select("id, store_id, name, phone, email, address, notes, is_active, created_at, updated_at")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const customers = (customersResult.data ?? []) as CustomerRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const requestedStatus = readParam(params.status);
  const status: CustomerStatus = isCustomerStatus(requestedStatus) ? requestedStatus : "all";
  const searchQuery = readParam(params.q);
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredCustomers = customers.filter((customer) => {
    if (status === "active" && !customer.is_active) return false;
    if (status === "inactive" && customer.is_active) return false;
    if (!normalizedQuery) return true;
    return [customer.name, customer.phone, customer.email, customer.address]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const selectedId = readParam(params.edit);
  const selectedCustomer = selectedId ? filteredCustomers.find((customer) => customer.id === selectedId) ?? null : null;
  const activeCustomers = customers.filter((customer) => customer.is_active).length;
  const contactableCustomers = customers.filter((customer) => customer.phone || customer.email).length;
  const assignedCustomers = customers.filter((customer) => customer.store_id).length;
  const queryWarning = Boolean(branchesResult.error || customersResult.error);
  const canWrite = profile.role === "admin";
  const branchByDefault = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const defaultBranch = profile.store_id ?? branches.find((branch) => branch.is_active)?.id ?? branches[0]?.id ?? "";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const saved = readParam(params.saved);
  const savedMessage = saved === "created" ? "Customer added to the directory." : saved === "updated" ? "Customer details updated." : "";
  const hasFilters = Boolean(searchQuery || status !== "all");

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="customers" size={20} /></Link>
              <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Customers</h1></div>
            </div>
            <div className="ml-auto flex items-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link><Link href="/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Customer directory · {branchByDefault}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Know who comes back for more.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Keep customer contact details useful and current across {branchByDefault}, {firstName}.</p></div>
            <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span>
          </div>

          {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
          {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some customer data could not refresh. Check that the business-record migration is applied in Supabase.</div>}
          {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This directory is read-only for your role. Ask an organization admin to add or edit customers.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CustomerMetric label="Customers" value={String(customers.length)} detail="In this organization" tone="bg-primary text-primary-fg" icon="customers" />
            <CustomerMetric label="Active" value={String(activeCustomers)} detail="Available for service" tone="bg-success text-white" icon="dashboard" />
            <CustomerMetric label="Contactable" value={String(contactableCustomers)} detail="Phone or email saved" tone="bg-secondary text-primary" icon="customers" />
            <CustomerMetric label="Branch linked" value={String(assignedCustomers)} detail="Home branch assigned" tone="bg-primary-soft text-primary" icon="inventory" />
          </div>

          <section aria-labelledby="customer-filters-heading" className="admin-panel mt-6 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Find a customer</p><h2 id="customer-filters-heading" className="admin-panel__title">Filter directory</h2></div>{hasFilters && <Link href="/admin/customers" className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></Link>}</div>
            <form action="/admin/customers" method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(170px,0.8fr)_auto] lg:items-end">
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" defaultValue={searchQuery} placeholder="Name, phone, email, address" className="inventory-input pl-10" /></span></label>
              <FilterField label="Status" htmlFor="customer-status"><select id="customer-status" name="status" defaultValue={status} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField>
              <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
            </form>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.68fr)_minmax(0,1.32fr)]">
            {selectedCustomer ? <CustomerEditor customer={selectedCustomer} branches={branches} canWrite={canWrite} cancelHref={customerHref({ q: searchQuery, status })} /> : <CustomerCreateForm branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} />}

            <section aria-labelledby="customer-directory-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Relationship directory</p><h2 id="customer-directory-heading" className="admin-panel__title">Customers</h2><p className="admin-panel__subtitle">{filteredCustomers.length} matching customer{filteredCustomers.length === 1 ? "" : "s"}. Keep records concise so the team can act quickly.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Up to 1,000 rows</span></div>
              {filteredCustomers.length === 0 ? <EmptyDirectory label="No customers match these filters" detail="Try a wider search or add the first customer to begin the directory." icon="customers" /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[720px]"><thead><tr><th>Customer</th><th>Contact</th><th>Home branch</th><th>Updated</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredCustomers.map((customer) => <tr key={customer.id}><td><strong className="font-extrabold">{customer.name}</strong>{customer.address && <small className="mt-1 block max-w-[180px] truncate text-[10px] text-ink-muted">{customer.address}</small>}</td><td><span className="block whitespace-nowrap">{customer.phone || "—"}</span><small className="mt-1 block max-w-[170px] truncate text-[10px] text-ink-muted">{customer.email || "No email"}</small></td><td className="whitespace-nowrap">{customer.store_id ? branchById.get(customer.store_id)?.name ?? "Unknown branch" : "All branches"}</td><td className="whitespace-nowrap text-ink-muted">{formatDate(customer.updated_at)}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${customer.is_active ? "bg-success/10 text-success" : "bg-secondary text-ink-muted"}`}>{customer.is_active ? "Active" : "Inactive"}</span></td><td>{canWrite ? <Link href={customerHref({ q: searchQuery, status, edit: customer.id })} className="font-extrabold text-primary hover:underline">Edit</Link> : <span className="text-ink-muted">View</span>}</td></tr>)}</tbody></table></div>}
            </section>
          </div>
      </div>
    </main>
  );
}

function CustomerCreateForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section aria-labelledby="new-customer-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id="new-customer-heading" className="admin-panel__title">Add customer</h2><p className="admin-panel__subtitle">Save only the details your team will actually use.</p></div><form action={createCustomer} className="mt-5 space-y-3"><CustomerFields branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><button type="submit" disabled={!canWrite} className="mt-2 w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Add customer</button></form></section>;
}

function CustomerEditor({ customer, branches, canWrite, cancelHref }: { customer: CustomerRecord; branches: BranchRecord[]; canWrite: boolean; cancelHref: string }) {
  return <section aria-labelledby="edit-customer-heading" className="admin-panel self-start p-5"><div className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Directory action</p><h2 id="edit-customer-heading" className="admin-panel__title">Edit customer</h2><p className="admin-panel__subtitle">Update the record or mark it inactive without deleting its history.</p></div><Link href={cancelHref} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close customer editor">&times;</Link></div><form action={updateCustomer} className="mt-5 space-y-3"><input type="hidden" name="customer_id" value={customer.id} /><CustomerFields customer={customer} branches={branches} defaultBranch={customer.store_id ?? ""} canWrite={canWrite} /><label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={customer.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" />{customer.is_active ? "Active customer" : "Inactive customer"}</label><div className="flex gap-2"><Link href={cancelHref} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</Link><button type="submit" disabled={!canWrite} className="flex-1 rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save changes</button></div></form></section>;
}

function CustomerFields({ customer, branches, defaultBranch, canWrite }: { customer?: CustomerRecord; branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <>
    <Field label="Home branch" htmlFor="customer-store"><select id="customer-store" name="store_id" defaultValue={defaultBranch} disabled={!canWrite} className="inventory-input"><option value="">All branches / no home branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></Field>
    <Field label="Full name" htmlFor="customer-name"><input id="customer-name" name="name" defaultValue={customer?.name ?? ""} placeholder="e.g. Maria Santos" required disabled={!canWrite} className="inventory-input" /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone" htmlFor="customer-phone"><input id="customer-phone" name="phone" defaultValue={customer?.phone ?? ""} placeholder="09xx xxx xxxx" disabled={!canWrite} className="inventory-input" /></Field><Field label="Email" htmlFor="customer-email"><input id="customer-email" name="email" type="email" defaultValue={customer?.email ?? ""} placeholder="Optional email" disabled={!canWrite} className="inventory-input" /></Field></div>
    <Field label="Address" htmlFor="customer-address"><textarea id="customer-address" name="address" defaultValue={customer?.address ?? ""} rows={2} placeholder="Optional delivery or billing address" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
    <Field label="Notes" htmlFor="customer-notes"><textarea id="customer-notes" name="notes" defaultValue={customer?.notes ?? ""} rows={2} placeholder="Preferences or useful context" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
  </>;
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

function EmptyDirectory({ label, detail, icon }: { label: string; detail: string; icon: "customers" | "suppliers" }) {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name={icon} size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">{label}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function CustomersProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
