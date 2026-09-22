import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { PlatformAccessDenied, PlatformMetric, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";
import { countByOrg, humanizeRole, readPlatformDirectoryPage } from "../../_lib/platform-data";

export const dynamic = "force-dynamic";

type PlatformUsersSearchParams = Promise<{ q?: string | string[] | undefined; page?: string | string[] | undefined }>;

export default async function PlatformUsersPage({ searchParams }: { searchParams: PlatformUsersSearchParams }) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }
  const admin = actor.admin;

  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const directory = await readPlatformDirectoryPage(admin, rawQuery, rawPage);
  const { organizations, profiles, employees, stores, authEmailById, organizationsResult, relatedRecordsAvailable, relatedRecordsComplete } = directory;
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const profileCountByOrg = countByOrg(profiles);
  const employeeCountByOrg = countByOrg(employees);
  const storeCountByOrg = countByOrg(stores);
  const activeUsers = profiles.filter((profile) => profile.is_active).length;
  const ownerUsers = profiles.filter((profile) => profile.role.toLowerCase() === "owner" || profile.role.toLowerCase() === "admin").length;
  const query = organizationsResult.query;
  const pageStart = organizations.length === 0 ? 0 : (organizationsResult.page - 1) * organizationsResult.pageSize + 1;
  const pageEnd = organizations.length === 0 ? 0 : pageStart + organizations.length - 1;
  const businessCount = organizationsResult.total ?? organizations.length;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px]">
        <PlatformPageHeader
          eyebrow="Access workspace"
          title="Users & organizations"
          description="Search workspaces from the database, then open an organization record for subscription, access, team, support, and entitlement history."
          actions={<>
            <Link href="/platform/operations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="refresh" size={14} /> Account operations</Link>
            <Link href="/admin/employees" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Owner team view</Link>
          </>}
        />

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="User summary">
          <PlatformMetric label="User profiles" value={profiles.length} detail="Visible workspace page" icon="customers" />
          <PlatformMetric label="Active users" value={activeUsers} detail={`${profiles.length - activeUsers} inactive on this page`} icon="employees" />
          <PlatformMetric label="Owner accounts" value={ownerUsers} detail="Visible workspace page" icon="dashboard" />
          <PlatformMetric label="Businesses" value={businessCount} detail={organizationsResult.total === null ? "Total unavailable" : query ? "Matching workspaces" : "All platform workspaces"} icon="wallet" />
        </section>

        <section className="mt-6 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="directory-search-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Directory search</p>
              <h2 id="directory-search-heading" className="mt-1 text-xl font-extrabold">Find a workspace</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Search workspace names or exact organization IDs. Results stay in the URL so a search can be shared or revisited; use global Search for people and support cases.</p>
            </div>
            <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl" role="search">
              <label htmlFor="platform-directory-search" className="sr-only">Search workspaces</label>
              <input id="platform-directory-search" name="q" type="search" defaultValue={query} placeholder="Search workspace name or exact organization ID" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" />
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="search" size={14} /> Search</button>
              {query && <Link href="/platform/users" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
            </form>
          </div>
          {(query || organizationsResult.total !== null) && <p className="mt-4 text-xs font-semibold text-ink-muted" role="status">{query ? `Showing workspace results ${pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`} of ${organizationsResult.total ?? "an unknown total"} matching “${query}”.` : `Showing ${pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`} of ${organizationsResult.total ?? "an unknown total"} workspaces.`}</p>}
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="organization-directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Organizations" title="Workspace directory" description="Open an organization record to review its effective access and manage platform-owned grants." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{pageStart === 0 ? 0 : `${pageStart}–${pageEnd}`} {organizationsResult.total === null ? "visible" : `of ${organizationsResult.total}`}</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Organization</th><th className="px-6 py-3 font-extrabold">Owner</th><th className="px-6 py-3 font-extrabold">Users</th><th className="px-6 py-3 font-extrabold">Branches</th><th className="px-6 py-3 font-extrabold">Subscription</th><th className="px-6 py-3 font-extrabold">Account</th></tr></thead>
              <tbody className="divide-y divide-line">
                {organizations.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-ink-muted">{query ? "No organizations match the server-side search." : "No organizations found."}</td></tr> : organizations.map((organization) => {
                  const owner = organization.owner_profile_id ? profiles.find((profile) => profile.id === organization.owner_profile_id) : undefined;
                  return <tr key={organization.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><Link href={`/platform/organizations/${organization.id}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.name}</Link><span className="mt-1 block text-xs text-ink-muted">{organization.id}</span></td><td className="px-6 py-4"><strong className="block">{owner?.full_name ?? (organization.owner_profile_id ? "Owner profile not on this page" : "Owner not set")}</strong><span className="mt-1 block text-xs text-ink-muted">{organization.owner_profile_id ? authEmailById.get(organization.owner_profile_id) || "Email unavailable" : "-"}</span></td><td className="px-6 py-4"><strong>{profileCountByOrg.get(organization.id) ?? 0}</strong><span className="block text-xs text-ink-muted">{employeeCountByOrg.get(organization.id) ?? 0} employee records</span></td><td className="px-6 py-4">{storeCountByOrg.get(organization.id) ?? 0}</td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{organization.subscription_status ?? "Not connected"}</span><span className="mt-2 block text-xs font-semibold text-ink-muted">{organization.subscription_plan ?? "Premium"}</span></td><td className="px-6 py-4"><AccessBadge active={organization.account_status !== "suspended"} /></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <DirectoryPagination page={organizationsResult.page} pageSize={organizationsResult.pageSize} total={organizationsResult.total} hasMore={organizationsResult.hasMore} query={query} rowCount={organizations.length} />
        </section>

        {!relatedRecordsAvailable ? <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">One or more related profile, branch, or employee reads were unavailable. Counts and the user table may be incomplete for the visible workspaces; open an organization record for the complete view.</div> : !relatedRecordsComplete && <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink-muted" role="status">Related profile, branch, or employee rows reached the per-page safety limit. Counts and the user table are partial for the visible workspaces; open an organization record for the complete view.</div>}

        <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="user-directory-heading">
          <div className="px-5 py-5 sm:px-6">
            <PlatformSectionHeading eyebrow="Profiles" title="Users in visible workspaces" description="Profiles are loaded for the organizations on this page and matched with their authentication email when available. Use global Search for a specific person." action={<span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{profiles.length} visible</span>} />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-left text-sm">
              <thead className="bg-raised text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">User</th><th className="px-6 py-3 font-extrabold">Business</th><th className="px-6 py-3 font-extrabold">Role</th><th className="px-6 py-3 font-extrabold">Access</th><th className="px-6 py-3 font-extrabold">Profile ID</th></tr></thead>
              <tbody className="divide-y divide-line">
                {profiles.length === 0 ? <tr><td colSpan={5} className="px-6 py-12 text-center text-ink-muted">{query ? "No user profiles are attached to the matching workspaces." : "No user profiles found for the visible workspaces."}</td></tr> : profiles.map((profile) => {
                  const organization = organizationById.get(profile.org_id);
                  const email = authEmailById.get(profile.id);
                  return <tr key={profile.id} className="align-top transition hover:bg-raised/55"><td className="px-6 py-4"><strong className="block font-extrabold">{profile.full_name || "Unnamed user"}</strong><span className="mt-1 block text-xs text-ink-muted">{email || "Email unavailable"}</span></td><td className="px-6 py-4">{organization ? <Link href={`/platform/organizations/${organization.id}`} className="font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{organization.name}</Link> : <strong className="block">Workspace unavailable</strong>}<span className="mt-1 block text-xs text-ink-muted">{profile.org_id}</span></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-extrabold text-primary">{humanizeRole(profile.role)}</span></td><td className="px-6 py-4"><AccessBadge active={profile.is_active} /></td><td className="whitespace-nowrap px-6 py-4 text-xs font-semibold text-ink-muted">{profile.id}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line bg-raised/60 px-5 py-4 text-xs leading-5 text-ink-muted sm:px-6">User profiles describe login access. Employee records describe the staff model used inside a business; use the owner team view for workspace-level employee management. This table follows the organization page above.</div>
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

function DirectoryPagination({
  page,
  pageSize,
  total,
  hasMore,
  query,
  rowCount,
}: {
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  query: string;
  rowCount: number;
}) {
  const start = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = rowCount === 0 ? 0 : start + rowCount - 1;
  const label = total === null ? `${start === 0 ? 0 : `${start}–${end}`} visible` : `${start === 0 ? 0 : `${start}–${end}`} of ${total}`;
  return <nav className="flex flex-col gap-3 border-t border-line bg-raised/40 px-5 py-4 text-xs font-semibold text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-label="Workspace directory pages">
    <span>{label}</span>
    <div className="flex items-center gap-2">
      {page > 1 ? <Link href={directoryPageHref(page - 1, query)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Previous</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Previous</span>}
      {hasMore ? <Link href={directoryPageHref(page + 1, query)} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Next</Link> : <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-raised px-3 text-ink-subtle" aria-disabled="true">Next</span>}
    </div>
  </nav>;
}

function directoryPageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/platform/users?${search}` : "/platform/users";
}
