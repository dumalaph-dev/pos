import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAdminProfile } from "@/lib/admin/profile";
import { isLechonHouseBusiness } from "@/lib/admin/business";
import { readAdminInventorySettings } from "@/lib/admin/inventory-settings";
import { formatPeso } from "@/lib/money";
import {
  formatQuantityTotals,
  inventoryReportQuery,
  loadInventoryReport,
  readInventoryReportFilters,
  type InventoryReportData,
  type InventoryReportInventoryRow,
  type InventoryReportMovementRow,
  type InventoryReportVarianceRow,
} from "@/lib/admin/inventory-reports";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type ProfileRecord = {
  full_name: string | null;
  role: "admin" | "manager" | "cashier" | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { settings?: unknown } | null;
};

const TIME_ZONE = "Asia/Singapore";

function displayPeso(value: number) {
  return formatPeso(Math.round(value)).replace(/\.00$/, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: TIME_ZONE }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE }).format(new Date(value));
}

function statusLabel(status: InventoryReportInventoryRow["status"]) {
  if (status === "out") return "Out of stock";
  if (status === "low") return "Low stock";
  return "Healthy";
}

function statusClass(status: InventoryReportInventoryRow["status"]) {
  if (status === "out") return "bg-danger-soft text-danger";
  if (status === "low") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

function varianceLabel(status: InventoryReportVarianceRow["status"]) {
  if (status === "short") return "Short";
  if (status === "over") return "Over";
  return "Balanced";
}

function varianceClass(status: InventoryReportVarianceRow["status"]) {
  if (status === "short") return "bg-danger-soft text-danger";
  if (status === "over") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

function movementClass(type: InventoryReportMovementRow["type"]) {
  if (type === "waste") return "text-danger";
  if (type === "sale" || type === "yield_out") return "text-warning";
  if (type === "adjust") return "text-primary";
  return "text-success";
}

function reportFilterCount(data: InventoryReportData) {
  return [data.filters.branchId, data.filters.categoryId, data.filters.productId, data.filters.supplierId].filter(Boolean).length;
}

export default async function InventoryReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    branch?: string | string[];
    category?: string | string[];
    product?: string | string[];
    supplier?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) return <ReportsProfileMissing />;

  const inventorySettings = readAdminInventorySettings(profile.organizations?.settings);
  const requestedFilters = readInventoryReportFilters(params);
  const report = await loadInventoryReport(
    supabase,
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    requestedFilters,
    inventorySettings.defaultLowStockThreshold,
  );
  const branchName = report.filters.branchId
    ? report.branches.find((branch) => branch.id === report.filters.branchId)?.name ?? "Selected branch"
    : "All branches";
  const reportQuery = inventoryReportQuery(report.filters);
  const inventoryExport = `/admin/reports/inventory/export?${inventoryReportQuery(report.filters, "inventory")}`;
  const movementExport = `/admin/reports/inventory/export?${inventoryReportQuery(report.filters, "movements")}`;
  const varianceExport = `/admin/reports/inventory/export?${inventoryReportQuery(report.filters, "variance")}`;
  const attentionRows = report.inventoryRows.filter((row) => row.status !== "ok");
  const activeProducts = report.products.filter((product) => product.is_active);
  const activeSuppliers = report.suppliers.filter((supplier) => supplier.is_active);
  const isLechonHouseBusinessSelected = isLechonHouseBusiness(profile.organizations?.settings);

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin/reports" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to sales reports"><AdminIcon name="reports" size={20} /></Link>
            <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Inventory reports</h1></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2"><Link href={`/admin/reports?${reportQuery}`} className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Sales reports</Link><Link href={inventoryExport} className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Export inventory CSV</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
        </header>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Inventory intelligence &middot; {formatDate(report.filters.from)} to {formatDate(report.filters.to)} &middot; {branchName}</p><h2 className="mt-2 max-w-4xl text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">See what moved, what remains, and what needs attention.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Review stock movement, current on-hand quantities, yield and waste, low-stock alerts, and end-of-day counts from one filtered view.</p></div>
          <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${profile.role === "admin" ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{profile.role === "admin" ? "Admin report access" : "Manager read-only"}</span>
        </div>

        {report.queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"><strong className="font-extrabold">Some report data could not be loaded.</strong> The available panels are still shown. Check that the inventory workflow migrations are applied before relying on a partial result.</div>}
        {report.stockWarning && <div role="status" className="mt-4 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Current on-hand totals used a ledger fallback because the aggregate stock function was unavailable. The movement and variance rows remain available.</div>}
        {profile.role === "manager" && <div role="status" className="mt-4 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This report is read-only for your role. You can review and export data for your assigned branch, but only an organization admin can change inventory or counts.</div>}

        <form action="/admin/reports/inventory" method="get" className="admin-panel mt-6 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="admin-panel__eyebrow">Report filters</p><h3 className="admin-panel__title">Choose the period and scope</h3><p className="admin-panel__subtitle">All report panels and CSV exports use these filters.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{reportFilterCount(report)} active filter{reportFilterCount(report) === 1 ? "" : "s"}</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">From</span><input type="date" name="from" defaultValue={report.filters.from} className="inventory-input" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">To</span><input type="date" name="to" defaultValue={report.filters.to} className="inventory-input" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Branch</span><select name="branch" defaultValue={report.filters.branchId} disabled={report.branchFilterLocked} className="inventory-input"><option value="">All branches</option>{report.branches.filter((branch) => branch.is_active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{report.branchFilterLocked && <input type="hidden" name="branch" value={report.filters.branchId} />}</label>
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Category</span><select name="category" defaultValue={report.filters.categoryId} className="inventory-input"><option value="">All categories</option><option value="uncategorized">Uncategorized</option>{report.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Product</span><select name="product" defaultValue={report.filters.productId} className="inventory-input"><option value="">All products</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Supplier</span><select name="supplier" defaultValue={report.filters.supplierId} className="inventory-input"><option value="">All suppliers</option><option value="unassigned">Unassigned</option>{activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2"><Link href="/admin/reports/inventory" className="rounded-btn border border-line px-4 py-2.5 text-xs font-extrabold text-primary transition hover:bg-primary-soft">Clear filters</Link><button type="submit" className="rounded-btn bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply filters</button></div>
        </form>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric label="Tracked items" value={String(report.summary.trackedProducts)} detail={`${branchName} current snapshot`} tone="bg-primary text-primary-fg" icon="inventory" />
          <ReportMetric label="Low stock" value={String(report.summary.lowStock)} detail="At or below the configured floor" tone="bg-warning text-white" icon="alert" />
          <ReportMetric label="Out of stock" value={String(report.summary.outOfStock)} detail="Zero or negative on-hand" tone="bg-danger text-white" icon="alert" />
          <ReportMetric label="Estimated value" value={displayPeso(report.summary.inventoryValue)} detail="Based on product cost or price" tone="bg-success text-white" icon="wallet" />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <section className="admin-panel overflow-hidden p-4 sm:p-5" aria-labelledby="inventory-snapshot-heading">
            <ReportSectionHeader eyebrow="Current inventory" title="What is on hand now" subtitle="On-hand totals include ingredients, packaging, and finished goods." href={inventoryExport} action="Export CSV" />
            {attentionRows.length > 0 && <div className="mt-4 rounded-btn border border-warning/25 bg-warning/10 px-3 py-2.5 text-xs text-ink"><strong className="font-extrabold">{attentionRows.length} item{attentionRows.length === 1 ? "" : "s"} need attention.</strong> Out-of-stock items appear first, followed by low-stock items.</div>}
            {report.inventoryRows.length === 0 ? <ReportEmpty title="No inventory items match these filters" detail="Create inventory items or clear a filter to see the current snapshot." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[760px]"><thead><tr><th>Inventory item</th><th>Branch</th><th>On hand</th><th>Minimum</th><th>Status</th><th>Value</th></tr></thead><tbody>{report.inventoryRows.slice(0, 25).map((row) => <tr key={`${row.branchId}:${row.inventoryItemId}`}><td><strong>{row.productName}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.itemType.replaceAll("_", " ")} &middot; {row.categoryName} &middot; {row.supplierName}</small></td><td>{row.branchName}</td><td className="tnums whitespace-nowrap font-extrabold">{formatQuantityTotals([{ unit: row.unit, value: row.onHand }])}</td><td className="tnums whitespace-nowrap">{formatQuantityTotals([{ unit: row.unit, value: row.minimum }])}</td><td><span className={`inline-flex whitespace-nowrap rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td><td className="tnums whitespace-nowrap">{displayPeso(row.inventoryValue)}</td></tr>)}</tbody></table></div>}
            {report.inventoryRows.length > 25 && <p className="pt-3 text-[10px] text-ink-muted">Showing the first 25 rows. Use category, product, supplier, or branch filters to narrow the report.</p>}
          </section>

          <section className="admin-panel p-4 sm:p-5" aria-labelledby="movement-summary-heading">
            <ReportSectionHeader eyebrow="Stock movement" title="What changed in the period" subtitle={`${report.summary.movementCount} recorded movement${report.summary.movementCount === 1 ? "" : "s"}.`} href={movementExport} action="Export CSV" />
            <div className="mt-4 divide-y divide-line/70">{report.movementSummary.map((summary) => <div key={summary.type} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><strong className={`block text-xs font-extrabold ${movementClass(summary.type)}`}>{summary.label}</strong><small className="mt-1 block text-[10px] text-ink-muted">{summary.events} event{summary.events === 1 ? "" : "s"} &middot; {formatQuantityTotals(summary.quantity)}</small></div><strong className="tnums whitespace-nowrap text-xs font-extrabold text-ink">{formatQuantityTotals(summary.netChange, true)}</strong></div>)}</div>
          </section>
        </div>

        {isLechonHouseBusinessSelected && <section className="admin-panel mt-4 p-5" aria-labelledby="yield-report-heading">
          <ReportSectionHeader eyebrow="Preparation report" title="Whole-lechon yield and waste" subtitle="Total output is shown before waste is removed; usable output is the remaining quantity." href={movementExport} action="Export movements" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ReportMiniMetric label="Yield entries" value={String(report.yieldSummary.entryCount)} detail="Recorded output events" /><ReportMiniMetric label="Source used" value={formatQuantityTotals(report.yieldSummary.sourceUsage)} detail="Whole-lechon stock out" /><ReportMiniMetric label="Total yield" value={formatQuantityTotals(report.yieldSummary.totalYield)} detail="Before waste" /><ReportMiniMetric label="Usable output" value={formatQuantityTotals(report.yieldSummary.usableYield)} detail={`Waste: ${formatQuantityTotals(report.yieldSummary.waste)}`} /></div>
          <div className="mt-4 rounded-btn border border-primary/15 bg-primary-soft px-4 py-3 text-xs leading-5 text-ink-muted"><strong className="font-extrabold text-primary">How to read this:</strong> yield output is recorded when preparation produces saleable stock. Waste is recorded separately, so the inventory ledger can explain the difference between total yield and usable output.</div>
        </section>}

        <section className="admin-panel mt-4 overflow-hidden p-4 sm:p-5" aria-labelledby="movement-history-heading">
          <ReportSectionHeader eyebrow="Movement detail" title="Inventory movement history" subtitle={`Showing the latest ${Math.min(25, report.movementRows.length)} of ${report.movementRows.length} filtered movements.`} href={movementExport} action="Export all CSV" />
          {report.movementRows.length === 0 ? <ReportEmpty title="No stock movements in this period" detail="Receiving, sales, yields, waste, and adjustments will appear here when recorded." /> : <div className="admin-report-table-scroll mt-4" role="region" aria-label="Inventory movement history" tabIndex={0}><table className="admin-list-table min-w-[900px]"><thead><tr><th>Date</th><th>Product</th><th>Branch</th><th>Movement</th><th>Quantity</th><th>Net change</th><th>Reason</th></tr></thead><tbody>{report.movementRows.slice(0, 25).map((row) => <tr key={row.id}><td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td><td><strong>{row.productName}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.categoryName} &middot; {row.supplierName}</small></td><td>{row.branchName}</td><td><span className={`font-extrabold ${movementClass(row.type)}`}>{row.typeLabel}</span></td><td className="tnums whitespace-nowrap">{formatQuantityTotals([{ unit: row.unit, value: row.quantity }])}</td><td className={`tnums whitespace-nowrap font-extrabold ${row.netChange < 0 ? "text-danger" : "text-success"}`}>{formatQuantityTotals([{ unit: row.unit, value: row.netChange }], true)}</td><td className="max-w-[240px] truncate">{row.reason}</td></tr>)}</tbody></table></div>}
        </section>

        <section className="admin-panel mt-4 overflow-hidden p-4 sm:p-5" aria-labelledby="variance-report-heading">
          <ReportSectionHeader eyebrow="Closing report" title="Expected versus counted" subtitle="Saved end-of-day counts and signed adjustments for the selected period." href={varianceExport} action="Export variance CSV" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ReportMiniMetric label="Counted lines" value={String(report.summary.varianceLines)} detail="Physical count rows" /><ReportMiniMetric label="Short lines" value={String(report.summary.shortLines)} detail="Counted below expected" /><ReportMiniMetric label="Over lines" value={String(report.summary.overLines)} detail="Counted above expected" /><ReportMiniMetric label="Balanced lines" value={String(report.summary.balancedLines)} detail="Expected equals counted" /></div>
          {report.varianceRows.length === 0 ? <ReportEmpty title="No saved counts in this period" detail="End-of-day counts will appear here after an admin saves a physical count." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[900px]"><thead><tr><th>Business date</th><th>Inventory item</th><th>Branch</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Status</th></tr></thead><tbody>{report.varianceRows.slice(0, 25).map((row) => <tr key={row.id}><td className="whitespace-nowrap">{formatDate(row.countDate)}</td><td><strong>{row.productName}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.categoryName} &middot; {row.supplierName}</small></td><td>{row.branchName}</td><td className="tnums whitespace-nowrap">{formatQuantityTotals([{ unit: row.unit, value: row.expected }])}</td><td className="tnums whitespace-nowrap">{formatQuantityTotals([{ unit: row.unit, value: row.counted }])}</td><td className={`tnums whitespace-nowrap font-extrabold ${row.variance < 0 ? "text-danger" : row.variance > 0 ? "text-warning" : "text-success"}`}>{formatQuantityTotals([{ unit: row.unit, value: row.variance }], true)}</td><td><span className={`inline-flex whitespace-nowrap rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${varianceClass(row.status)}`}>{varianceLabel(row.status)}</span></td></tr>)}</tbody></table></div>}
          {report.varianceRows.length > 25 && <p className="px-4 py-3 text-[10px] text-ink-muted sm:px-5">Showing the first 25 rows. Export the filtered CSV for the complete variance report.</p>}
        </section>
      </div>
    </main>
  );
}

function ReportSectionHeader({ eyebrow, title, subtitle, href, action }: { eyebrow: string; title: string; subtitle: string; href: string; action: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">{eyebrow}</p><h3 className="admin-panel__title">{title}</h3><p className="admin-panel__subtitle">{subtitle}</p></div><Link href={href} className="admin-kpi-card__link mt-0 whitespace-nowrap">{action} <AdminIcon name="download" size={14} /></Link></div>;
}

function ReportMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "inventory" | "alert" | "wallet" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function ReportMiniMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-btn border border-line bg-surface-raised px-3 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span><strong className="tnums mt-1 block truncate text-lg font-extrabold text-ink">{value}</strong><small className="mt-1 block truncate text-[10px] text-ink-muted">{detail}</small></div>;
}

function ReportEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="grid place-items-center py-12 text-center"><span className="grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="reports" size={21} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-muted">{detail}</p></div>;
}

function ReportsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
