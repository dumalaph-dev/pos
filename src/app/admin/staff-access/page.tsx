import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import StaffLinkCopy from "@/components/admin/StaffLinkCopy";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { staffLoginPath } from "@/lib/store-access";

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
  staff_login_key?: string | null;
};

export const dynamic = "force-dynamic";

export default async function StaffAccessPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id);
  if (!profile) return <AccessMessage title="Your admin profile is not ready." detail="Ask an organization admin to finish your profile before managing staff access links." />;
  if (profile.role !== "admin") return <AccessMessage title="Owner access required" detail="Only the business owner can manage store staff links." />;

  const supabase = await createClient();
  const accessResult = await supabase
    .from("stores")
    .select("id, name, is_active, staff_login_key")
    .eq("org_id", profile.org_id)
    .order("name");

  let branches: BranchRecord[] = [];
  let migrationMissing = false;
  if (accessResult.error) {
    migrationMissing = true;
    const fallback = await supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name");
    branches = (fallback.data ?? []) as BranchRecord[];
  } else {
    branches = (accessResult.data ?? []) as BranchRecord[];
  }

  return (
    <main className="admin-page min-h-screen bg-bg px-4 pb-12 pt-6 text-ink sm:px-6 lg:px-8">
      <header className="mx-auto max-w-5xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Staff access</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-[-0.04em]">Store login links</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Give each branch its own entry link. Employees still need their individual Employee ID and password, so the link identifies the store but never replaces authentication.</p>
          </div>
          <Link href="/admin/employees" className="inline-flex items-center gap-2 rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondary-hover"><AdminIcon name="employees" size={16} /> Manage staff</Link>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-5xl gap-4">
        {migrationMissing && <div role="status" className="rounded-card border border-warning/35 bg-warning/10 px-5 py-4 text-sm font-semibold text-ink">Store links are not available until migration 0023 is applied. Your existing branches are still shown below.</div>}
        {branches.length === 0 && <section className="rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)]"><h2 className="text-lg font-extrabold">Create a branch first</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Each active branch receives its own staff login link.</p></section>}
        {branches.map((branch) => (
          <section key={branch.id} className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{branch.is_active ? "Active branch" : "Inactive branch"}</p>
                <h2 className="mt-1 text-xl font-extrabold">{branch.name}</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${branch.is_active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{branch.is_active ? "Ready to share" : "Disabled"}</span>
            </div>
            {branch.staff_login_key ? <StaffLinkCopy path={staffLoginPath(branch.staff_login_key)} disabled={!branch.is_active} /> : <p className="mt-4 rounded-btn border border-line bg-raised px-4 py-3 text-xs font-semibold text-ink-muted">This branch needs migration 0023 before a staff link can be generated.</p>}
          </section>
        ))}
      </div>
    </main>
  );
}

function AccessMessage({ title, detail }: { title: string; detail: string }) {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p><Link href="/admin" className="mt-6 inline-flex rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg">Back to dashboard</Link></div></main>;
}
