import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { SuppliersLocalWorkspace, type AdminSupplierRecord } from "@/components/admin/SuppliersLocalWorkspace";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAdminBranchOptions } from "@/lib/admin/branches";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type SupplierStatus = "all" | "active" | "inactive";
type ProfileRecord = { full_name: string | null; role: AdminRole | null; org_id: string; store_id: string | null; password_change_required: boolean };
type QueryValue = string | string[] | undefined;

function readParam(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function isSupplierStatus(value: string): value is SupplierStatus {
  return value === "all" || value === "active" || value === "inactive";
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: QueryValue; saved?: QueryValue; q?: QueryValue; status?: QueryValue; edit?: QueryValue }>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <SuppliersProfileMissing />;

  const supabase = await createClient();
  const [branchesResult, suppliersResult] = await Promise.all([
    getAdminBranchOptions(profile.org_id),
    supabase
      .from("suppliers")
      .select("id, store_id, name, contact_name, phone, email, address, notes, is_active, created_at, updated_at")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
  ]);

  const branches = (branchesResult.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const suppliers = (suppliersResult.data ?? []) as AdminSupplierRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const requestedStatus = readParam(params.status);
  const status = isSupplierStatus(requestedStatus) ? requestedStatus : "all";
  const branchLabel = profile.store_id ? branchById.get(profile.store_id)?.name ?? "Your Store" : "All branches";
  const defaultBranch = profile.store_id ?? branches.find((branch) => branch.is_active)?.id ?? branches[0]?.id ?? "";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const saved = readParam(params.saved);
  const error = readParam(params.error);
  const notice = error
    ? { kind: "error" as const, message: error }
    : suppliersResult.error || branchesResult.error
      ? { kind: "warning" as const, message: "Some supplier data could not refresh. The available records are still shown." }
      : saved === "created"
        ? { kind: "success" as const, message: "Supplier added to the directory." }
        : saved === "updated"
          ? { kind: "success" as const, message: "Supplier details updated." }
          : saved === "deleted"
            ? { kind: "success" as const, message: "Supplier deleted. Products that used it are now unassigned." }
            : undefined;

  return (
    <div className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Suppliers">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <Link href="/admin/inventory" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Inventory</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Supplier directory · {branchLabel}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Keep the supply chain close.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Maintain the supplier contacts behind your lechon, sides, packaging, and daily operations, {firstName}.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${profile.role === "admin" ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{profile.role === "admin" ? "Admin editing enabled" : "Manager view only"}</span></div>
        {profile.role !== "admin" && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This directory is read-only for your role. Ask an organization admin to add or edit suppliers.</div>}

        <SuppliersLocalWorkspace suppliers={suppliers} branches={branches} initialQuery={readParam(params.q)} initialStatus={status} initialEditId={readParam(params.edit) || null} canWrite={profile.role === "admin"} defaultBranch={defaultBranch} notice={notice} />
      </div>
    </div>
  );
}

function SuppliersProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="px-4 py-3">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
