import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { updateEmployee } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type EmployeeRole = AdminRole;
type RoleFilter = "all" | EmployeeRole;
type StatusFilter = "all" | "active" | "inactive";

type ProfileRecord = {
  id: string;
  full_name: string;
  role: EmployeeRole;
  store_id: string | null;
  is_active: boolean;
  created_at: string;
};

type CurrentProfile = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
};

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const roleOptions: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
];
const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isRoleFilter(value: string): value is RoleFilter {
  return roleOptions.some((option) => option.value === value);
}

function isStatusFilter(value: string): value is StatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function roleLabel(role: EmployeeRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function roleDetail(role: EmployeeRole) {
  if (role === "admin") return "Full backoffice access";
  if (role === "manager") return "Backoffice read access";
  return "POS access and sales entry";
}

function roleClass(role: EmployeeRole) {
  if (role === "admin") return "bg-primary-soft text-primary";
  if (role === "manager") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

function formatJoined(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date(value));
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[]; status?: string | string[]; branch?: string | string[]; q?: string | string[]; error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as CurrentProfile | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <EmployeesProfileMissing />;

  const [branchesResult, employeesResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, role, store_id, is_active, created_at")
      .eq("org_id", profile.org_id)
      .order("is_active", { ascending: false })
      .order("full_name")
      .limit(500),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const employees = (employeesResult.data ?? []) as ProfileRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const requestedRole = readParam(params.role);
  const requestedStatus = readParam(params.status);
  const role: RoleFilter = isRoleFilter(requestedRole) ? requestedRole : "all";
  const status: StatusFilter = isStatusFilter(requestedStatus) ? requestedStatus : "all";
  const branchFilter = readParam(params.branch);
  const searchQuery = readParam(params.q).trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) => {
    if (role !== "all" && employee.role !== role) return false;
    if (status === "active" && !employee.is_active) return false;
    if (status === "inactive" && employee.is_active) return false;
    if (branchFilter === "unassigned" && employee.store_id) return false;
    if (branchFilter && branchFilter !== "unassigned" && employee.store_id !== branchFilter) return false;
    if (searchQuery && !employee.full_name.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
  const activeEmployees = employees.filter((employee) => employee.is_active).length;
  const cashierCount = employees.filter((employee) => employee.role === "cashier").length;
  const unassignedCount = employees.filter((employee) => !employee.store_id).length;
  const queryWarning = Boolean(branchesResult.error || employeesResult.error);
  const canWrite = profile.role === "admin";
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const hasFilters = role !== "all" || status !== "all" || branchFilter || searchQuery;

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="employees" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="employees" size={20} /></Link>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p>
                <h1 className="truncate text-lg font-extrabold text-primary">Employees</h1>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
              <Link href="/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Open POS</Link>
              <SignOutButton className="px-3 py-2 text-xs" />
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Team access &middot; {currentBranchName}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Keep the right people in the right place.</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-muted">Assign roles and home branches for {profile.full_name ?? firstName}. Cashiers use POS access; admins manage this backoffice.</p>
            </div>
            <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span>
          </div>

          {readParam(params.saved) === "1" && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">Staff access updated. Their next sign-in will use the new role and branch assignment.</div>}
          {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some staff data could not refresh. The page is showing the profiles that were available.</div>}
          {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This directory is read-only for your role. Ask an organization admin to change staff access.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <EmployeeMetric label="Team members" value={String(employees.length)} detail="In this organization" tone="bg-primary text-primary-fg" icon="employees" />
            <EmployeeMetric label="Active staff" value={String(activeEmployees)} detail="Can sign in" tone="bg-success text-white" icon="dashboard" />
            <EmployeeMetric label="Cashiers" value={String(cashierCount)} detail="POS role assigned" tone="bg-secondary text-primary" icon="pos" />
            <EmployeeMetric label="Unassigned" value={String(unassignedCount)} detail="No home branch" tone="bg-warning/15 text-warning" icon="inventory" />
          </div>

          <section aria-labelledby="employee-filters-heading" className="admin-panel mt-6 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Find a team member</p>
                <h2 id="employee-filters-heading" className="admin-panel__title">Filter staff</h2>
              </div>
              {hasFilters && <Link href="/admin/employees" className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></Link>}
            </div>
            <form action="/admin/employees" method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto] lg:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span>
                <span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" defaultValue={searchQuery} placeholder="Search by full name" className="inventory-input pl-10" /></span>
              </label>
              <EmployeeFilterField label="Role" htmlFor="employee-role-filter"><select id="employee-role-filter" name="role" defaultValue={role} className="inventory-input">{roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></EmployeeFilterField>
              <EmployeeFilterField label="Status" htmlFor="employee-status-filter"><select id="employee-status-filter" name="status" defaultValue={status} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></EmployeeFilterField>
              <EmployeeFilterField label="Branch" htmlFor="employee-branch-filter"><select id="employee-branch-filter" name="branch" defaultValue={branchFilter} className="inventory-input"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}<option value="unassigned">Unassigned</option></select></EmployeeFilterField>
              <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
            </form>
          </section>

          <section aria-labelledby="staff-directory-heading" className="admin-panel mt-4 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Access directory</p>
                <h2 id="staff-directory-heading" className="admin-panel__title">Staff and branch assignments</h2>
                <p className="admin-panel__subtitle">{filteredEmployees.length} matching member{filteredEmployees.length === 1 ? "" : "s"}. Save a row to apply its role, branch, and active status.</p>
              </div>
              <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Profiles are live</span>
            </div>

            {filteredEmployees.length === 0 ? (
              <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="employees" size={23} /></span>
                <p className="mt-4 text-sm font-extrabold text-ink">No staff match these filters</p>
                <p className="mt-1 text-xs text-ink-muted">Try a wider filter or clear the search to see the organization directory.</p>
              </div>
            ) : (
              <>
                <div className="mt-5 hidden grid-cols-[minmax(220px,1.2fr)_minmax(130px,0.8fr)_minmax(170px,0.9fr)_minmax(105px,0.55fr)_auto] gap-3 px-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted lg:grid">
                  <span>Staff member</span><span>Role</span><span>Home branch</span><span>Status</span><span className="text-right">Action</span>
                </div>
                <div className="mt-2 grid gap-2">
                  {filteredEmployees.map((employee) => <EmployeeRow key={employee.id} employee={employee} branches={branches} branchById={branchById} canWrite={canWrite} isCurrentUser={employee.id === user.id} />)}
                </div>
              </>
            )}
          </section>

          <section aria-labelledby="role-guide-heading" className="mt-4 grid gap-4 md:grid-cols-3">
            <RoleGuide id="role-guide-heading" role="Admin" detail="Full backoffice access, including staff assignments, catalog, and inventory controls." tone="bg-primary-soft text-primary" />
            <RoleGuide role="Manager" detail="Review dashboard, orders, catalog, and inventory without changing protected records." tone="bg-warning/15 text-warning" />
            <RoleGuide role="Cashier" detail="Sign in to the POS for sales. A home branch is required for reliable branch-level access." tone="bg-success/10 text-success" />
          </section>
        </div>
      </div>
    </main>
  );
}

function EmployeeRow({ employee, branches, branchById, canWrite, isCurrentUser }: { employee: ProfileRecord; branches: BranchRecord[]; branchById: Map<string, BranchRecord>; canWrite: boolean; isCurrentUser: boolean }) {
  const formId = `employee-form-${employee.id}`;
  return (
    <form id={formId} action={updateEmployee} className="grid gap-3 rounded-btn border border-line bg-surface-raised p-4 transition hover:border-line-strong lg:grid-cols-[minmax(220px,1.2fr)_minmax(130px,0.8fr)_minmax(170px,0.9fr)_minmax(105px,0.55fr)_auto] lg:items-center">
      <input type="hidden" name="employee_id" value={employee.id} />
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary">{employee.full_name.trim().charAt(0).toUpperCase()}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm font-extrabold text-ink">{employee.full_name}</strong><span className={`rounded-pill px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${roleClass(employee.role)}`}>{roleLabel(employee.role)}</span></div><span className="mt-1 block truncate text-[10px] text-ink-muted">Joined {formatJoined(employee.created_at)}{isCurrentUser ? " · You" : ""}</span></div></div>
      </div>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted lg:sr-only">Role</span><select name="role" defaultValue={employee.role} disabled={!canWrite} className="inventory-input min-h-10 text-xs">{roleOptions.filter((option) => option.value !== "all").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="mt-1 block text-[10px] text-ink-muted">{roleDetail(employee.role)}</small></label>
      <label className="block"><span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted lg:sr-only">Home branch</span><select name="store_id" defaultValue={employee.store_id ?? ""} disabled={!canWrite} className="inventory-input min-h-10 text-xs"><option value="">All branches / unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}</select><small className="mt-1 block truncate text-[10px] text-ink-muted">Current: {employee.store_id ? branchById.get(employee.store_id)?.name ?? "Unknown branch" : "No branch assigned"}</small></label>
      <label className="flex min-h-10 items-center gap-2 text-xs font-extrabold text-ink"><input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={!canWrite} className="h-4 w-4 accent-primary" /><span className={employee.is_active ? "text-success" : "text-danger"}>{employee.is_active ? "Active" : "Inactive"}</span></label>
      <button type="submit" disabled={!canWrite} className="min-h-10 rounded-btn bg-primary px-4 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save changes</button>
    </form>
  );
}

function EmployeeMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "employees" | "dashboard" | "pos" | "inventory" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function EmployeeFilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function RoleGuide({ id, role, detail, tone }: { id?: string; role: string; detail: string; tone: string }) {
  return <article id={id} className="admin-panel p-4"><span className={`grid h-9 w-9 place-items-center rounded-btn text-xs font-extrabold ${tone}`}>{role.charAt(0)}</span><h3 className="mt-3 text-sm font-extrabold text-ink">{role}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}

function EmployeesProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div>
      </div>
    </main>
  );
}
