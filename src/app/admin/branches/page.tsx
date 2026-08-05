import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { createBranch, updateBranch } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";

type CurrentProfile = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  vat_registered: boolean;
  vat_rate: number;
  currency: string;
  is_active: boolean;
  created_at: string;
};

type DeviceRecord = { store_id: string; is_active: boolean };
type StaffRecord = { store_id: string | null; is_active: boolean };

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(date);
}

function vatPercent(value: number) {
  const percent = Number(value) * 100;
  return Number.isFinite(percent) ? percent.toFixed(2).replace(/\.00$/, "") : "12";
}

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; edit?: string | string[]; clone?: string | string[] }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as CurrentProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <BranchesProfileMissing />;

  const params = await searchParams;
  const supabase = await createClient();
  const [branchesResult, devicesResult, staffResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, tin, vat_registered, vat_rate, currency, is_active, created_at")
      .eq("org_id", profile.org_id)
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("devices").select("store_id, is_active").eq("org_id", profile.org_id),
    supabase.from("profiles").select("store_id, is_active").eq("org_id", profile.org_id),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const devices = (devicesResult.data ?? []) as DeviceRecord[];
  const staff = (staffResult.data ?? []) as StaffRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const editId = readParam(params.edit);
  const selectedBranch = editId ? branchById.get(editId) ?? null : null;
  const canWrite = profile.role === "admin";
  const errorMessage = readParam(params.error);
  const saved = readParam(params.saved);
  const cloneFailed = readParam(params.clone) === "failed";
  const savedMessage = saved === "created" ? cloneFailed ? "Branch created, but its menu could not be cloned. Apply the latest Supabase migration, then add the menu from Products." : "Branch created successfully." : saved === "updated" ? "Branch details saved." : "";
  const activeBranches = branches.filter((branch) => branch.is_active);
  const activeDevices = devices.filter((device) => device.is_active).length;
  const assignedStaff = staff.filter((member) => member.store_id && branchById.has(member.store_id)).length;
  const queryWarning = Boolean(branchesResult.error || devicesResult.error || staffResult.error);

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="branches" size={20} /></Link>
            <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Organization operations</p><h1 className="truncate text-lg font-extrabold text-primary">Branches</h1></div>
          </div>
          <div className="ml-auto flex items-center gap-2"><Link href="#branch-editor" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover"><AdminIcon name="plus" size={14} /> Add branch</Link><Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
        </header>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Multi-branch foundation</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Give every location a clear home.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Create and maintain the branches that own your catalog, inventory, orders, receipts, and POS terminals.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span></div>

        {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
        {errorMessage && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{errorMessage}</div>}
        {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some branch details could not be refreshed. The available records are still shown.</div>}
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">Branch management is read-only for your role. Ask an organization admin to add or change a location.</div>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BranchMetric label="Total branches" value={String(branches.length)} detail="In this organization" tone="bg-primary text-primary-fg" />
          <BranchMetric label="Active locations" value={String(activeBranches.length)} detail="Available for daily work" tone="bg-success text-white" />
          <BranchMetric label="Live terminals" value={String(activeDevices)} detail="Active POS devices" tone="bg-secondary text-primary" />
          <BranchMetric label="Assigned staff" value={String(assignedStaff)} detail="Linked to a branch" tone="bg-primary-soft text-primary" />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(300px,0.68fr)_minmax(0,1.32fr)]">
          <BranchForm branch={selectedBranch} cloneBranches={activeBranches} canWrite={canWrite} />

          <section aria-labelledby="branches-list-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Organization directory</p><h2 id="branches-list-heading" className="admin-panel__title">Your branches</h2><p className="admin-panel__subtitle">{branches.length} location{branches.length === 1 ? "" : "s"}. Inactive branches stay in history and can be reactivated later.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">RLS protected</span></div>
            {branches.length === 0 ? <EmptyBranches canWrite={canWrite} /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[820px]"><thead><tr><th>Branch</th><th>Receipt identity</th><th>People</th><th>Terminals</th><th>Status</th><th>Action</th></tr></thead><tbody>{branches.map((branch) => {
              const branchDevices = devices.filter((device) => device.store_id === branch.id);
              const branchStaff = staff.filter((member) => member.store_id === branch.id);
              return <tr key={branch.id} className={!branch.is_active ? "opacity-65" : undefined}><td><strong className="font-extrabold">{branch.name}</strong><small className="mt-1 block max-w-[220px] truncate text-[10px] text-ink-muted">{branch.address || "No address saved"}</small><small className="mt-1 block text-[10px] text-ink-muted">Added {formatCreatedAt(branch.created_at)}</small></td><td><span className="block whitespace-nowrap">{branch.tin || "TIN not set"}</span><small className="mt-1 block text-[10px] text-ink-muted">{branch.vat_registered ? `VAT ${(Number(branch.vat_rate) * 100).toFixed(2).replace(/\.00$/, "")}% · ${branch.currency}` : `VAT exempt · ${branch.currency}`}</small></td><td className="whitespace-nowrap">{branchStaff.length} staff</td><td className="whitespace-nowrap">{branchDevices.filter((device) => device.is_active).length} active <span className="text-ink-muted">/ {branchDevices.length}</span></td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${branch.is_active ? "bg-success/10 text-success" : "bg-secondary text-ink-muted"}`}>{branch.is_active ? "Active" : "Inactive"}</span></td><td><Link href={`/admin/branches?edit=${encodeURIComponent(branch.id)}`} className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline">Edit <AdminIcon name="edit" size={13} /></Link></td></tr>;
            })}</tbody></table></div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function BranchForm({ branch, cloneBranches, canWrite }: { branch: BranchRecord | null; cloneBranches: BranchRecord[]; canWrite: boolean }) {
  const vatRate = branch ? vatPercent(Number(branch.vat_rate)) : "12";
  return <section id="branch-editor" aria-labelledby="branch-editor-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">{branch ? "Location editor" : "New location"}</p><h2 id="branch-editor-heading" className="admin-panel__title">{branch ? "Edit branch" : "Add a branch"}</h2><p className="admin-panel__subtitle">{branch ? "Update the identity used by receipts and branch-scoped work." : "Start with the location identity, then optionally copy an active branch menu."}</p></div><form action={branch ? updateBranch : createBranch} className="mt-5 space-y-3"><input type="hidden" name="branch_id" value={branch?.id ?? ""} /><Field label="Branch name" htmlFor="branch-name"><input id="branch-name" name="name" defaultValue={branch?.name ?? ""} placeholder="e.g. Main Branch" required maxLength={120} disabled={!canWrite} className="inventory-input" /></Field><Field label="Address" htmlFor="branch-address"><textarea id="branch-address" name="address" defaultValue={branch?.address ?? ""} placeholder="Street, barangay, city" maxLength={240} disabled={!canWrite} className="inventory-input min-h-20 resize-y" /></Field><Field label="TIN" htmlFor="branch-tin"><input id="branch-tin" name="tin" defaultValue={branch?.tin ?? ""} placeholder="Optional tax identification number" maxLength={80} disabled={!canWrite} className="inventory-input" /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="VAT rate (%)" htmlFor="branch-vat-rate"><input id="branch-vat-rate" name="vat_rate" type="number" min="0" max="100" step="0.01" defaultValue={vatRate} required disabled={!canWrite} className="inventory-input" /></Field><Field label="Currency" htmlFor="branch-currency"><select id="branch-currency" name="currency" defaultValue={branch?.currency ?? "PHP"} disabled={!canWrite} className="inventory-input"><option value="PHP">PHP · Philippine peso</option><option value="USD">USD · US dollar</option><option value="SGD">SGD · Singapore dollar</option></select></Field></div><label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="vat_registered" defaultChecked={branch?.vat_registered ?? true} disabled={!canWrite} className="h-4 w-4 accent-primary" />VAT registered</label>{!branch && <Field label="Clone menu from" htmlFor="clone-from"><select id="clone-from" name="clone_from_store_id" defaultValue="" disabled={!canWrite} className="inventory-input"><option value="">Start with an empty menu</option>{cloneBranches.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select><span className="mt-1 block text-[11px] leading-5 text-ink-muted">Categories, prices, stock settings, and supplier links are copied. Organization-wide SKU and barcode fields start blank.</span></Field>}{branch && <label className="flex min-h-11 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={branch.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" />Branch is active</label>}<div className="flex gap-2">{branch && <Link href="/admin/branches" className="flex-1 rounded-btn bg-secondary px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</Link>}<button type="submit" disabled={!canWrite} className="flex-1 rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{branch ? "Save branch" : "Create branch"}</button></div></form></section>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function BranchMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`rounded-card border border-line p-4 shadow-[var(--shadow-card)] ${tone}`}><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] opacity-80">{label}</p><strong className="mt-2 block text-2xl font-extrabold tracking-[-0.03em]">{value}</strong><span className="mt-1 block text-[10px] font-semibold opacity-75">{detail}</span></article>;
}

function EmptyBranches({ canWrite }: { canWrite: boolean }) {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="branches" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No branches found</p><p className="mt-1 text-xs text-ink-muted">{canWrite ? "Create the first branch to give your POS data a home." : "Ask an organization admin to create your first branch."}</p></div>;
}

function BranchesProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
