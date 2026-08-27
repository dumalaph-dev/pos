import { redirect } from "next/navigation";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { BranchPerformanceReport } from "@/components/admin/BranchPerformanceReport";
import { SignOutButton } from "@/components/SignOutButton";
import { loadBranchPerformanceReport, readBranchPerformanceFilters } from "@/lib/admin/branch-performance";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type QueryValue = string | string[] | undefined;
type CurrentProfile = {
  full_name: string | null;
  role: "admin" | "manager" | "cashier" | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

export default async function BranchPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, QueryValue>>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as CurrentProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) return <PerformanceProfileMissing />;

  const params = await searchParams;
  const supabase = await createClient();
  const report = await loadBranchPerformanceReport(
    supabase,
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    readBranchPerformanceFilters(params),
  );

  return <BranchPerformanceReport report={report} canManageBranches={profile.role === "admin"} />;
}

function PerformanceProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="px-4 py-3">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div>
      </div>
    </main>
  );
}
