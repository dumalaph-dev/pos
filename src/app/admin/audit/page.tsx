import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";

type ProfileRecord = {
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

type ActorRecord = {
  id: string;
  full_name: string | null;
  role: AdminRole | null;
  store_id: string | null;
};

type AuditLogRecord = {
  id: string;
  org_id: string;
  store_id: string | null;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  device_id: string | null;
  created_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;
const ACTION_LOOKUP_LIMIT = 2000;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readPage(value: string | string[] | undefined) {
  const parsed = Number(readParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function singaporeDateInput(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDateInput(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return singaporeDateInput(new Date(date.getTime() + days * DAY_MS));
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function dateStartIso(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toISOString();
}

function dateEndExclusiveIso(value: string) {
  return new Date(new Date(`${value}T00:00:00+08:00`).getTime() + DAY_MS).toISOString();
}

function formatDateInput(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatDateRange(start: string | null, end: string | null) {
  if (start && end) return `${formatDateInput(start)} – ${formatDateInput(end)}`;
  if (start) return `From ${formatDateInput(start)}`;
  if (end) return `Through ${formatDateInput(end)}`;
  return "All recorded dates";
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function labelize(value: string) {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function actionTone(action: string) {
  if (action.includes("created")) return "bg-success/10 text-success";
  if (action.includes("reprint")) return "bg-secondary text-primary";
  return "bg-primary-soft text-primary";
}

function snapshotText(value: unknown) {
  if (value === null || value === undefined) return "No snapshot recorded";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function auditHref({
  branch,
  actor,
  action,
  dateFrom,
  dateTo,
  page,
}: {
  branch: string;
  actor: string;
  action: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (branch) params.set("branch", branch);
  if (actor) params.set("actor", actor);
  if (action) params.set("action", action);
  if (dateFrom !== undefined) params.set("from", dateFrom ?? "");
  if (dateTo !== undefined) params.set("to", dateTo ?? "");
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
    actor?: string | string[];
    action?: string | string[];
    from?: string | string[];
    to?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const branchFilter = readParam(params.branch);
  const actorFilter = readParam(params.actor);
  const actionFilter = readParam(params.action);
  const requestedPage = readPage(params.page);
  const today = singaporeDateInput();
  const defaultFrom = shiftDateInput(today, -29);
  const hasExplicitDateRange = params.from !== undefined || params.to !== undefined;
  let dateFrom = hasExplicitDateRange ? parseDateInput(readParam(params.from)) : defaultFrom;
  let dateTo = hasExplicitDateRange ? parseDateInput(readParam(params.to)) : today;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }

  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as ProfileRecord | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <AuditProfileMissing />;

  let auditQuery = supabase
    .from("audit_logs")
    .select("id, org_id, store_id, actor_id, action, entity, entity_id, before, after, device_id, created_at", { count: "exact" })
    .eq("org_id", profile.org_id);
  let actionQuery = supabase
    .from("audit_logs")
    .select("action")
    .eq("org_id", profile.org_id);

  if (branchFilter) {
    auditQuery = auditQuery.eq("store_id", branchFilter);
    actionQuery = actionQuery.eq("store_id", branchFilter);
  }
  if (actorFilter) {
    auditQuery = auditQuery.eq("actor_id", actorFilter);
    actionQuery = actionQuery.eq("actor_id", actorFilter);
  }
  if (actionFilter) auditQuery = auditQuery.eq("action", actionFilter);
  if (dateFrom) {
    const start = dateStartIso(dateFrom);
    auditQuery = auditQuery.gte("created_at", start);
    actionQuery = actionQuery.gte("created_at", start);
  }
  if (dateTo) {
    const end = dateEndExclusiveIso(dateTo);
    auditQuery = auditQuery.lt("created_at", end);
    actionQuery = actionQuery.lt("created_at", end);
  }

  const offset = (requestedPage - 1) * PAGE_SIZE;
  const [branchesResult, actorsResult, auditResult, actionResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name"),
    supabase.from("profiles").select("id, full_name, role, store_id").eq("org_id", profile.org_id).order("full_name").limit(200),
    auditQuery.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
    actionQuery.order("action").limit(ACTION_LOOKUP_LIMIT),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const actors = (actorsResult.data ?? []) as ActorRecord[];
  const auditLogs = (auditResult.data ?? []) as AuditLogRecord[];
  const totalCount = auditResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!auditResult.error && requestedPage > totalPages) {
    redirect(auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom, dateTo, page: totalPages }));
  }

  const actionOptions = Array.from(new Set(
    ((actionResult.data ?? []) as Array<{ action: string | null }>)
      .map((row) => row.action)
      .filter((value): value is string => Boolean(value)),
  )).sort();
  if (actionFilter && !actionOptions.includes(actionFilter)) actionOptions.unshift(actionFilter);

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? "Current branch" : "All branches";
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "Admin";
  const queryWarning = Boolean(branchesResult.error || actorsResult.error || auditResult.error || actionResult.error);
  const allTime = hasExplicitDateRange && !dateFrom && !dateTo;
  const hasFilters = Boolean(branchFilter || actorFilter || actionFilter || hasExplicitDateRange);
  const allTimeHref = auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom: null, dateTo: null });
  const firstRow = totalCount === 0 ? 0 : offset + 1;
  const lastRow = Math.min(offset + auditLogs.length, totalCount);
  const pageNumbers = getPageNumbers(totalPages, requestedPage);

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="audit" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="history" size={20} /></Link>
              <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Audit log</h1></div>
            </div>
            <div className="ml-auto flex items-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link><Link href="/admin/settings" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Settings</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Traceable operations · {currentBranchName}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">See what changed, and who changed it.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Review the append-only activity trail for orders, inventory, and other sensitive workflows, {firstName}.</p></div>
            <span className="rounded-pill bg-success/10 px-3 py-2 text-xs font-extrabold text-success">Append-only records</span>
          </div>

          {queryWarning && <div role="alert" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some audit data could not refresh. The viewer shows only the records returned by the current database query.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AuditMetric label="Matching events" value={totalCount.toLocaleString("en-PH")} detail={allTime ? "All recorded dates" : formatDateRange(dateFrom, dateTo)} tone="bg-primary text-primary-fg" icon="history" />
            <AuditMetric label="Actions in scope" value={String(actionOptions.length)} detail="Distinct actions available" tone="bg-secondary text-primary" icon="chart" />
            <AuditMetric label="Accessible branches" value={String(branches.length)} detail="RLS-scoped branch directory" tone="bg-success text-white" icon="inventory" />
            <AuditMetric label="Rows on this page" value={String(auditLogs.length)} detail={`Page ${requestedPage} of ${totalPages}`} tone="bg-warning/15 text-warning" icon="eye" />
          </div>

          <section aria-labelledby="audit-filters-heading" className="admin-panel mt-6 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Activity review</p><h2 id="audit-filters-heading" className="admin-panel__title">Filter the audit trail</h2><p className="admin-panel__subtitle">Branch, actor, action, and date filters are applied in the database before pagination.</p></div>{hasFilters && <Link href="/admin/audit" className="admin-kpi-card__link mt-0">Reset filters <AdminIcon name="arrow" size={14} /></Link>}</div>
            <form action="/admin/audit" method="get" className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(155px,1fr)_minmax(155px,1fr)_minmax(170px,1fr)_145px_145px_auto] xl:items-end">
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Branch</span><select name="branch" defaultValue={branchFilter} className="inventory-input"><option value="">All accessible branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Actor</span><select name="actor" defaultValue={actorFilter} className="inventory-input"><option value="">All visible actors</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.full_name || "Unnamed staff"}{actor.role ? ` · ${labelize(actor.role)}` : ""}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Action</span><select name="action" defaultValue={actionFilter} className="inventory-input"><option value="">All actions</option>{actionOptions.map((action) => <option key={action} value={action}>{labelize(action)}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">From</span><input name="from" type="date" defaultValue={dateFrom ?? ""} className="inventory-input" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">To</span><input name="to" type="date" defaultValue={dateTo ?? ""} className="inventory-input" /></label>
              <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
            </form>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted"><span>Showing {formatDateRange(dateFrom, dateTo)} · newest events first</span>{allTime ? <Link href={auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom: defaultFrom, dateTo: today })} className="font-extrabold text-primary hover:underline">Use last 30 days</Link> : <Link href={allTimeHref} className="font-extrabold text-primary hover:underline">Show all history</Link>}</div>
          </section>

          <section aria-labelledby="audit-table-heading" className="admin-panel mt-4 min-w-0 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Immutable activity ledger</p><h2 id="audit-table-heading" className="admin-panel__title">Audit events</h2><p className="admin-panel__subtitle">Showing {firstRow}–{lastRow} of {totalCount.toLocaleString("en-PH")} matching event{totalCount === 1 ? "" : "s"}. Payloads are read-only snapshots.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{PAGE_SIZE} rows per page</span></div>
            {auditLogs.length === 0 ? <AuditEmptyState allTime={allTime} /> : <>
              <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[1080px]"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Branch</th><th>Payload</th></tr></thead><tbody>{auditLogs.map((entry) => <AuditRow key={entry.id} entry={entry} actor={entry.actor_id ? actorById.get(entry.actor_id) : undefined} branchName={entry.store_id ? branchById.get(entry.store_id)?.name : undefined} />)}</tbody></table></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><span className="text-[10px] font-semibold text-ink-muted">Page {requestedPage} of {totalPages} · {totalCount.toLocaleString("en-PH")} total matching events</span><div className="flex items-center gap-1">{requestedPage > 1 ? <Link href={auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom, dateTo, page: requestedPage - 1 })} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line text-sm font-extrabold text-primary hover:bg-primary-soft" aria-label="Previous audit page">‹</Link> : <span className="grid h-8 min-w-8 place-items-center rounded-btn border border-line text-sm font-extrabold text-ink-subtle" aria-hidden="true">‹</span>}{pageNumbers.map((pageNumber) => <Link key={pageNumber} href={auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom, dateTo, page: pageNumber })} className={`grid h-8 min-w-8 place-items-center rounded-btn px-2 text-[10px] font-extrabold ${pageNumber === requestedPage ? "bg-primary text-primary-fg" : "border border-line bg-surface text-primary hover:bg-primary-soft"}`}>{pageNumber}</Link>)}{requestedPage < totalPages ? <Link href={auditHref({ branch: branchFilter, actor: actorFilter, action: actionFilter, dateFrom, dateTo, page: requestedPage + 1 })} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line text-sm font-extrabold text-primary hover:bg-primary-soft" aria-label="Next audit page">›</Link> : <span className="grid h-8 min-w-8 place-items-center rounded-btn border border-line text-sm font-extrabold text-ink-subtle" aria-hidden="true">›</span>}</div></div>
            </>}
          </section>
        </div>
      </div>
    </main>
  );
}

function AuditRow({ entry, actor, branchName }: { entry: AuditLogRecord; actor?: ActorRecord; branchName?: string }) {
  return <tr><td className="whitespace-nowrap text-ink-muted"><time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time><small className="mt-1 block text-[10px] text-ink-subtle">Asia/Singapore</small></td><td><strong className="block text-[11px] font-extrabold text-ink">{actor?.full_name || "Unknown actor"}</strong><small className="mt-1 block text-[10px] text-ink-muted">{actor?.role ? labelize(actor.role) : entry.actor_id ? `Actor ${shortId(entry.actor_id)}` : "System event"}</small></td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${actionTone(entry.action)}`}>{labelize(entry.action)}</span><small className="mt-1 block text-[10px] text-ink-muted">{entry.action}</small></td><td><strong className="block text-[11px] font-extrabold text-ink">{entry.entity ? labelize(entry.entity) : "General event"}</strong><small className="mt-1 block max-w-44 break-all text-[10px] text-ink-muted">{entry.entity_id ? entry.entity_id : "No entity ID"}</small></td><td className="whitespace-nowrap">{branchName || (entry.store_id ? `Branch ${shortId(entry.store_id)}` : "All branches")}</td><td><details className="max-w-[300px]"><summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-extrabold text-primary hover:underline [&::-webkit-details-marker]:hidden"><AdminIcon name="eye" size={14} /> View snapshot</summary><div className="mt-2 grid gap-2 rounded-btn border border-line bg-surface-raised p-3"><SnapshotBlock label="Before" value={entry.before} /><SnapshotBlock label="After" value={entry.after} />{entry.device_id && <p className="text-[10px] text-ink-muted">Device <span className="font-semibold text-ink">{shortId(entry.device_id)}</span></p>}</div></details></td></tr>;
}

function SnapshotBlock({ label, value }: { label: string; value: unknown }) {
  return <div><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</p><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-btn bg-bg px-2 py-1.5 text-[10px] leading-4 text-ink">{snapshotText(value)}</pre></div>;
}

function AuditMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "history" | "chart" | "inventory" | "eye" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function AuditEmptyState({ allTime }: { allTime: boolean }) {
  return <div className="grid place-items-center px-4 py-14 text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="history" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No audit events match these filters</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-muted">{allTime ? "New order, inventory, and other audited activity will appear here after it is recorded." : "Try all history or a wider date range. The page never invents placeholder events."}</p></div>;
}

function getPageNumbers(totalPages: number, currentPage: number) {
  const visiblePages = Math.min(totalPages, 5);
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - visiblePages + 1));
  return Array.from({ length: visiblePages }, (_, index) => start + index);
}

function AuditProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div></div></main>;
}
