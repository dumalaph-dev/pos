import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { createAdminClient } from "@/lib/employee-auth";
import { PlatformMetric, PlatformPageHeader, PlatformSectionHeading, PlatformUnavailable } from "../../PlatformUI";
import { countByOrg, humanizeRole, readPlatformDirectory } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

type PlatformUsersSearchParams = Promise<{ q?: string | string[] | undefined }>;

export default async function PlatformUsersPage({ searchParams }: { searchParams: PlatformUsersSearchParams }) {
  const admin = createAdminClient();
  if (!admin) return <PlatformUnavailable detail="Add SUPABASE_SERVICE_ROLE_KEY before opening the platform console." />;

  const directory = await readPlatformDirectory(admin);
  const { organizations, profiles, employees, stores, authEmailById } = directory;
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const profileCountByOrg = countByOrg(profiles);
  const employeeCountByOrg = countByOrg(employees);
  const storeCountByOrg = countByOrg(stores);
  const activeUsers = profiles.filter((profile) => profile.is_active).length;
  const ownerUsers = profiles.filter((profile) => profile.role.toLowerCase() === "owner" || profile.role.toLowerCase() === "admin").length;
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery ?? "").trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const matches = (...values: Array<string | null | undefined>) => !normalizedQuery || values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));

  const visibleOrganizations = organizations.filter((organization) => {
    const owner = organization.owner_profile_id ? profiles.find((profile) => profile.id === organization.owner_profile_id) : undefined;
    return matches(
      organization.name,
      organization.id,
      organization.subscription_status,
      organization.account_status,
      owner?.full_name,
      organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) : null,
    );
  });
  const visibleProfiles = profiles.filter((profile) => {
    const organization = organizationById.get(profile.org_id);
    return matches(profile.full_name, profile.id, profile.role, organization?.name, profile.org_id, authEmailById.get(profile.id));
  });

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Access workspace"
          title="Users & organizations"
          description="Search every workspace and login profile, then open an organization record for subscription, access, team, support, and entitlement history."
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

        <section className="mt-6 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="directory-search-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Directory search</p>
              <h2 id="directory-search-heading" className="mt-1 text-xl font-extrabold">Find a person or workspace</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Search by owner name, email, organization name, role, status, or ID. Results stay in the URL so a search can be shared or revisited.</p>
            </div>
            <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl" role="search">
              <label htmlFor="platform-directory-search" className="sr-only">Search users and organizations</label>
              <input id="platform-directory-search" name="q" type="search" defaultValue={query} placeholder="Search name, email, business, role, or ID" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" />
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="search" size={14} /> Search</button>
              {query && <Link href="/platform/users" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
            </form>
          </div>
          {query && <p className="mt-4 text-xs font-semibold text-ink-muted" role="status">Showing {visibleOrganizations.length} organization{visibleOrganizations.length === 1 ? "" : "s"} and {visibleProfiles.length} user profile{visibleProfiles.length === 1 ? "" : "s"} matching “{query}”.</p>}
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="organization-directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Organizations" title="Workspace directory" description="Open an organization record to review its effective access and manage platform-owned grants." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{visibleOrganizations.length} of {organizations.length}</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Organization</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Users</th><th className="px-6 py-3 font-extrabold">Branches</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Account</th></tr></thead>
              <tbody className="divide-y divide-line">
                {visibleOrganizations.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-muted">{query ? "No organizations match this search." : "No organizations found."}</td></tr> : visibleOrganizations.map((organization) => {
                  const owner = organization.owner_profile_id ? profiles.find((profile) => profile.id === organization.owner_profile_id) : undefined;
                  return <tr key={organization.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><Link href={`/platform/organizations/${organization.id}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.name}</Link><span className="mt-1 block text-xs text-ink-muted">{organization.id}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? "Owner profile pending"}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "-"}</span></td><td className="px-6 py-4"><strong>{profileCountByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">{employeeCountByOrg.get(organization.id) ?? 0} employee records</span></td><td className="px-6 py-4">{storeCountByOrg.get(organization.id) ?? 0}</td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{organization.subscription_status ?? "Not connected"}</span><span className="mt-2 block text-xs font-semibold text-ink-muted">{organization.subscription_plan ?? "Premium"}</span></td><td className="px-6 py-4"><AccessBadge active={organization.account_status !== "suspended"} /></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="user-directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Profiles" title="Workspace users" description="Profiles are matched with their authentication email when available. Select the organization name to open the complete account record." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{visibleProfiles.length} of {profiles.length}</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">User</th><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Role</th><th className="px-6 py-3 font-extrabold">Access</th><th className="px-6 py-3 font-extrabold">Profile ID</th></tr></thead>
              <tbody className="divide-y divide-line">
                {visibleProfiles.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-ink-muted">{query ? "No user profiles match this search." : "No user profiles found."}</td></tr> : visibleProfiles.map((profile) => {
                  const organization = organizationById.get(profile.org_id);
                  const email = authEmailById.get(profile.id);
                  return <tr key={profile.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><strong className="block font-extrabold">{profile.full_name || "Unnamed user"}</strong><span className="mt-1 block text-xs text-ink-muted">{email || "Email unavailable"}</span></td><td className="px-6 py-4">{organization ? <Link href={`/platform/organizations/${organization.id}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.name}</Link> : <strong className="block">Workspace unavailable</strong>}<span className="mt-1 block text-xs text-ink-muted">{profile.org_id}</span></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{humanizeRole(profile.role)}</span></td><td className="px-6 py-4"><AccessBadge active={profile.is_active} /></td><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{profile.id}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-raised/60 px-5 py-4 text-xs leading-5 text-ink-muted sm:px-6">User profiles describe login access. Employee records describe the staff model used inside a business; use the owner team view for workspace-level employee management.</div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
            <PlatformSectionHeading eyebrow="Access review" title="Need to change an account?" description="Open the organization record for complimentary access grants, support history, and the existing lifecycle controls." />
            <Link href="/platform/operations" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Open business controls <AdminIcon name="arrow" size={14} /></Link>
          </article>
          <article className="rounded-[22px] border border-line bg-primary-soft/55 p-5 sm:p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Data boundary</p>
            <h2 className="mt-1 text-lg font-extrabold">Access stays traceable</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Suspending a business or granting complimentary Premium is policy-gated and written to the organization audit trail. Paid subscription fields remain unchanged.</p>
          </article>
        </section>
      </div>
    </main>
  );
}

function AccessBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{active ? "Active" : "Inactive"}</span>;
}
