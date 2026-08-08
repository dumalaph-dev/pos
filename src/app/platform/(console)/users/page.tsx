import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { createAdminClient } from "@/lib/employee-auth";
import { PlatformMetric, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";
import { humanizeRole, readPlatformDirectory } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const directory = await readPlatformDirectory(admin);
  const { organizations, profiles, employees, authEmailById } = directory;
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const activeUsers = profiles.filter((profile) => profile.is_active).length;
  const ownerUsers = profiles.filter((profile) => profile.role.toLowerCase() === "owner").length;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Access workspace"
          title="Users"
          description="Review the people connected to every business workspace, their roles, and whether their access is currently active."
          actions={<>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Account operations</Link>
            <Link href="/admin/employees" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Owner team view</Link>
          </>}
        />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="User summary">
          <PlatformMetric label="User profiles" value={profiles.length} detail="Accounts linked to workspaces" icon="customers" />
          <PlatformMetric label="Active users" value={activeUsers} detail={`${profiles.length - activeUsers} inactive records`} icon="employees" />
          <PlatformMetric label="Owner accounts" value={ownerUsers} detail="Primary workspace access" icon="dashboard" />
          <PlatformMetric label="Businesses" value={organizations.length} detail={`${employees.length} employee records`} icon="wallet" />
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="user-directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Directory" title="Workspace users" description="Profiles are read from the platform directory and matched with their authentication email when available." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{profiles.length} records</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[840px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">User</th><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Role</th><th className="px-6 py-3 font-extrabold">Access</th><th className="px-6 py-3 font-extrabold">Profile ID</th></tr></thead>
              <tbody className="divide-y divide-line">
                {profiles.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-ink-muted">No user profiles found.</td></tr> : profiles.map((profile) => {
                  const organization = organizationById.get(profile.org_id);
                  const email = authEmailById.get(profile.id);
                  return <tr key={profile.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><strong className="block font-extrabold">{profile.full_name || "Unnamed user"}</strong><span className="mt-1 block text-xs text-ink-muted">{email || "Email unavailable"}</span></td><td className="px-6 py-4"><strong className="block">{organization?.name ?? "Workspace unavailable"}</strong><span className="mt-1 block text-xs text-ink-muted">{profile.org_id.slice(0, 8)}</span></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{humanizeRole(profile.role)}</span></td><td className="px-6 py-4"><AccessBadge active={profile.is_active} /></td><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{profile.id.slice(0, 12)}…</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-raised/60 px-5 py-4 text-xs leading-5 text-ink-muted sm:px-6">User profiles describe login access. Employee records describe the staff model used inside a business; use the owner team view for workspace-level employee management.</div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Access review" title="Need to change an account?" description="User visibility and account lifecycle are intentionally separate so a directory review does not trigger a destructive action." />
            <Link href="/platform/operations" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Open business controls <AdminIcon name="arrow" size={14} /></Link>
          </article>
          <article className="rounded-[22px] border border-line bg-primary-soft/55 p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Data boundary</p>
            <h2 className="mt-1 text-lg font-extrabold">Access stays traceable</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Suspending a business or opening a support case happens in Operations, where the action is policy-gated and written to the audit trail.</p>
          </article>
        </section>
      </div>
    </main>
  );
}

function AccessBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{active ? "Active" : "Inactive"}</span>;
}
