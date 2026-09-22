import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { hasPlatformOperatorPermission } from "@/lib/platform-operators";
import { requirePlatformOperator } from "@/lib/platform-operators-server";
import { normalizePlatformSearchQuery } from "@/lib/platform-search";
import {
  readPlatformSearch,
  type PlatformSearchResult,
} from "../../_lib/platform-data";
import { PlatformAccessDenied, PlatformPageHeader, PlatformSectionHeading } from "../../PlatformUI";

export const dynamic = "force-dynamic";

type PlatformSearchParams = Promise<{ q?: string | string[] | undefined }>;

export default async function PlatformSearchPage({ searchParams }: { searchParams: PlatformSearchParams }) {
  const actor = await requirePlatformOperator("console_read");
  if (!actor.ok) {
    if (actor.code === "unauthenticated") redirect("/platform/login");
    return <PlatformAccessDenied detail={actor.message} />;
  }

  const rawQuery = (await searchParams).q;
  const queryValue = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const query = normalizePlatformSearchQuery(queryValue);
  const search = await readPlatformSearch(
    actor.admin,
    query,
    hasPlatformOperatorPermission(actor.role, "support_manage"),
  );
  const tooShort = query.length > 0 && query.length < 2;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1120px]">
        <PlatformPageHeader
          eyebrow="Platform workspace"
          title="Search the platform"
          description="Find an organization, user profile, or support case subject, then open the account workspace with the same context. Search results stay within your operator permissions."
          actions={<Link href="/platform" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="dashboard" size={14} /> Overview</Link>}
        />

        <section className="mt-6 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="platform-search-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Global search</p>
              <h2 id="platform-search-heading" className="mt-1 text-xl font-extrabold">Find the right workspace quickly</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Use at least two characters. Search uses organization names, user names, support subjects, and exact record IDs; it does not search raw order, customer, or provider payloads.</p>
            </div>
            <form method="get" className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl" role="search">
              <label htmlFor="platform-global-search" className="sr-only">Search the platform</label>
              <input id="platform-global-search" name="q" type="search" defaultValue={query} autoFocus={!query} placeholder="Organization, user, case subject, or ID" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-raised px-3.5 text-sm font-semibold text-ink outline-none transition placeholder:text-ink-subtle focus:border-primary focus:ring-2 focus:ring-primary/10" />
              <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="search" size={14} /> Search</button>
              {query && <Link href="/platform/search" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">Clear</Link>}
            </form>
          </div>
          {tooShort && <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm font-semibold text-ink" role="status">Enter at least two characters to search.</p>}
          {query.length >= 2 && <p className="mt-4 text-xs font-semibold text-ink-muted" role="status">{search.results.length === 0 ? `No matches for “${query}”.` : `Showing ${search.results.length}${search.hasMore ? "+" : ""} result${search.results.length === 1 ? "" : "s"} for “${query}”.`}</p>}
        </section>

        {query.length >= 2 && <section className="mt-6 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="platform-search-results-heading">
          <PlatformSectionHeading eyebrow="Results" title="Authorized matches" description="Open an account workspace to review the complete record and available actions." />
          <div className="mt-5">
            {search.results.length === 0 ? <SearchEmptyState query={query} /> : <ul className="divide-y divide-line" aria-label="Platform search results">{search.results.map((result) => <SearchResultRow key={`${result.kind}:${result.id}`} result={result} />)}</ul>}
          </div>
          {(!search.organizationsAvailable || !search.profilesAvailable || !search.supportCasesAvailable) && <div className="mt-5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm leading-5 text-ink" role="status">Some search sources are temporarily unavailable. The results above may be incomplete; review the Directory or Support workspace after the underlying schema or service is healthy.</div>}
        </section>}

        {!query && <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Search destinations">
          <SearchHint icon="customers" title="Organizations" detail="Search by workspace name or exact organization ID." href="/platform/users" />
          <SearchHint icon="employees" title="User profiles" detail="Search a person by their profile name or exact profile ID." href="/platform/users" />
          <SearchHint icon="history" title="Support cases" detail="Support operators can find active and resolved case subjects." href="/platform/operations" />
        </section>}
      </div>
    </main>
  );
}

function SearchResultRow({ result }: { result: PlatformSearchResult }) {
  const kind = result.kind === "organization" ? "Organization" : result.kind === "profile" ? "User profile" : "Support case";
  const icon = result.kind === "organization" ? "customers" : result.kind === "profile" ? "employees" : "history";
  return <li><Link href={result.href} className="flex min-h-20 items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate font-extrabold text-ink">{result.title}</span><span className="mt-1 block truncate text-xs font-semibold text-ink-muted">{result.detail} · {result.meta}</span></span><span className="hidden shrink-0 rounded-full bg-raised px-2.5 py-1 text-[11px] font-extrabold text-ink-muted sm:inline-flex">{kind}</span><AdminIcon name="arrow" size={16} /></Link></li>;
}

function SearchEmptyState({ query }: { query: string }) {
  return <div className="rounded-2xl border border-dashed border-line-strong bg-raised/45 px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><AdminIcon name="search" size={19} /></span><h3 className="mt-4 text-base font-extrabold">No authorized matches</h3><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-muted">Nothing matched “{query}”. Try a workspace name, user name, case subject, or an exact record ID.</p></div>;
}

function SearchHint({ icon, title, detail, href }: { icon: "customers" | "employees" | "history"; title: string; detail: string; href: string }) {
  return <Link href={href} className="rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name={icon} size={16} /></span><strong className="mt-3 block text-sm font-extrabold">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></Link>;
}
