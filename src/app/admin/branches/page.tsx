import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { BranchesLocalWorkspace, type AdminBranchRecord } from "@/components/admin/BranchesLocalWorkspace";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type CurrentProfile = { full_name: string | null; role: AdminRole | null; org_id: string; store_id: string | null; password_change_required: boolean };
type QueryValue = string | string[] | undefined;

function readParam(value: QueryValue) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: QueryValue; saved?: QueryValue; edit?: QueryValue; clone?: QueryValue; billing?: QueryValue }>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as CurrentProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <BranchesProfileMissing />;

  const supabase = await createClient();
  const [branchesResult, devicesResult, staffResult] = await Promise.all([
    supabase.from("stores").select("id, name, address, tin, vat_registered, vat_rate, currency, is_active, created_at").eq("org_id", profile.org_id).order("is_active", { ascending: false }).order("name"),
    supabase.from("devices").select("store_id, is_active").eq("org_id", profile.org_id),
    supabase.from("profiles").select("store_id, is_active").eq("org_id", profile.org_id),
  ]);

  const branches = (branchesResult.data ?? []) as AdminBranchRecord[];
  const devices = (devicesResult.data ?? []) as Array<{ store_id: string; is_active: boolean }>;
  const staff = (staffResult.data ?? []) as Array<{ store_id: string | null; is_active: boolean }>;
  const canWrite = profile.role === "admin";
  const saved = readParam(params.saved);
  const error = readParam(params.error);
  const cloneFailed = readParam(params.clone) === "failed";
  const billingStatus = readParam(params.billing);
  const billingAction = billingStatus === "required"
    ? { href: "/admin/billing?reason=additional_branch", label: "Open Billing & Plan" }
    : undefined;
  const billingMessage = billingStatus === "scheduled"
    ? " The next billing cycle will use the updated active-branch price."
    : billingStatus === "deferred"
      ? " Your next prepaid renewal will include the updated active-branch price."
      : "";
  const notice = error
    ? { kind: "error" as const, message: error, action: billingAction }
    : branchesResult.error || devicesResult.error || staffResult.error
      ? { kind: "warning" as const, message: "Some branch details could not be refreshed. The available records are still shown." }
      : saved === "created"
        ? { kind: "success" as const, message: cloneFailed ? `Branch created, but its menu could not be cloned. Apply the latest Supabase migration, then add the menu from Products.${billingMessage}` : `Branch created successfully.${billingMessage}` }
        : saved === "updated"
          ? { kind: "success" as const, message: `Branch details saved.${billingMessage}` }
          : undefined;

  return (
    <div className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Branches">
          <a href="#branch-editor" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover"><AdminIcon name="plus" size={14} /> Add branch</a>
          <Link href="/admin/branches/performance" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover"><AdminIcon name="chart" size={14} /> View performance</Link>
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Multi-branch foundation</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Give every location a clear home.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Create and maintain the branches that own your catalog, inventory, orders, receipts, and POS terminals.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span></div>
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">Branch management is read-only for your role. Ask an organization admin to add or change a location.</div>}

        <BranchesLocalWorkspace branches={branches} devices={devices} staff={staff} initialEditId={readParam(params.edit) || null} canWrite={canWrite} notice={notice} />
      </div>
    </div>
  );
}

function BranchesProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="px-4 py-3">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
