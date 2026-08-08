import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { formatStockQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import { getAdminProfile } from "@/lib/admin/profile";
import {
  loadSalesReport,
  readSalesReportFilters,
  salesReportQuery,
  weekdayLabel,
  SALES_PAYMENT_METHODS,
  type SalesGrouping,
  type SalesPaymentMethod,
  type SalesReportData,
  type SalesReportFilters,
} from "@/lib/admin/sales-reports";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

const groupingOptions: Array<{ value: SalesGrouping; label: string }> = [
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
];

const quickRanges: Array<{ label: string; days: number }> = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function compactPeso(value: number) {
  const peso = value / 100;
  if (Math.abs(peso) >= 1_000_000) return `₱${(peso / 1_000_000).toFixed(1)}M`;
  if (Math.abs(peso) >= 1_000) return `₱${(peso / 1_000).toFixed(1)}k`;
  return displayPeso(value);
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function paymentLabel(method: SalesPaymentMethod) {
  return method === "cash" ? "Cash" : method === "gcash" ? "GCash" : method === "maya" ? "Maya" : "Card";
}

function singaporeDate(value = new Date()) {
  return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function formatRangeDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function reportsHref(filters: SalesReportFilters, overrides: Partial<SalesReportFilters> = {}) {
  return `/admin/reports?${salesReportQuery({ ...filters, ...overrides })}`;
}

function exportHref(filters: SalesReportFilters, kind: string) {
  return `/admin/reports/export?${salesReportQuery(filters, kind)}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = (await getAdminProfile(user.id)) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) return <ReportsProfileMissing />;

  const report = await loadSalesReport(
    await createClient(),
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    readSalesReportFilters(params),
  );

  const { filters, totals } = report;
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const today = singaporeDate();
  const reversalTotal = totals.voidTotal + totals.refundTotal;

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Reports">
          <Link href="/admin/reports/inventory" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Inventory reports</Link>
          <Link href="/admin/shifts" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Shifts</Link>
          <Link href="/admin/orders" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">View orders</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Business intelligence · {report.branchName}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Know what is moving the business.</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">{formatRangeDate(filters.from)} to {formatRangeDate(filters.to)}. Voided and refunded sales are excluded from every figure below, {firstName}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {quickRanges.map((range) => {
              const from = shiftDate(today, -(range.days - 1));
              const isActive = filters.from === from && filters.to === today;
              return (
                <Link
                  key={range.label}
                  href={reportsHref(filters, { from, to: today })}
                  className={`rounded-btn border px-3 py-2 text-xs font-extrabold transition ${isActive ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-primary hover:bg-primary-soft"}`}
                >
                  {range.label}
                </Link>
              );
            })}
          </div>
        </div>

        {report.truncated && (
          <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            This range exceeds the row limit, so the figures below are incomplete. Narrow the date range before relying on or exporting them.
          </div>
        )}
        {report.queryWarning && !report.truncated && (
          <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some report data could not refresh. The panels are showing the data that was available.</div>
        )}

        <section aria-labelledby="report-filters-heading" className="admin-panel mt-6 p-5">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">Refine</p>
              <h2 id="report-filters-heading" className="admin-panel__title">Filter sales</h2>
              <p className="admin-panel__subtitle">Dates follow the branch business day (Asia/Singapore).</p>
            </div>
            <Link href={reportsHref(filters, { from: shiftDate(today, -6), to: today, cashierId: "", paymentMethod: "", grouping: "day" })} className="admin-kpi-card__link mt-0">Reset <AdminIcon name="arrow" size={14} /></Link>
          </div>
          <form action="/admin/reports" method="get" className="mt-4 grid gap-3 lg:grid-cols-[repeat(5,minmax(130px,1fr))_auto] lg:items-end">
            <FilterField label="From" htmlFor="report-from"><input id="report-from" type="date" name="from" defaultValue={filters.from} className="inventory-input" /></FilterField>
            <FilterField label="To" htmlFor="report-to"><input id="report-to" type="date" name="to" defaultValue={filters.to} className="inventory-input" /></FilterField>
            <FilterField label="Group by" htmlFor="report-grouping">
              <select id="report-grouping" name="grouping" defaultValue={filters.grouping} className="inventory-input">
                {groupingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FilterField>
            <FilterField label="Cashier" htmlFor="report-cashier">
              <select id="report-cashier" name="cashier" defaultValue={filters.cashierId} className="inventory-input">
                <option value="">All cashiers</option>
                {report.cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Payment" htmlFor="report-payment">
              <select id="report-payment" name="payment" defaultValue={filters.paymentMethod} className="inventory-input">
                <option value="">All methods</option>
                {SALES_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{paymentLabel(method)}</option>)}
              </select>
            </FilterField>
            <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <span className="self-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Export CSV</span>
            {[
              { kind: "summary", label: "Summary" },
              { kind: "periods", label: groupingOptions.find((option) => option.value === filters.grouping)?.label ?? "Periods" },
              { kind: "items", label: "Items" },
              { kind: "categories", label: "Categories" },
              { kind: "cashiers", label: "Cashiers" },
              { kind: "branches", label: "Branches" },
              { kind: "discounts", label: "Discounts" },
              { kind: "hourly", label: "Hourly" },
            ].map((option) => (
              <a key={option.kind} href={exportHref(filters, option.kind)} className="rounded-btn bg-secondary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">{option.label}</a>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric label="Net sales" value={displayPeso(totals.netSales)} detail={`${totals.orderCount} order${totals.orderCount === 1 ? "" : "s"}, reversals excluded`} tone="bg-primary text-primary-fg" icon="wallet" />
          <ReportMetric label="Average order" value={displayPeso(totals.averageOrder)} detail="Per completed order" tone="bg-success text-white" icon="chart" />
          <ReportMetric label="Discounts given" value={displayPeso(totals.discountTotal)} detail={`${totals.discountedOrderCount} discounted order${totals.discountedOrderCount === 1 ? "" : "s"}`} tone="bg-secondary text-primary" icon="promotions" />
          <ReportMetric label="VAT collected" value={displayPeso(totals.vatAmount)} detail={`${displayPeso(totals.vatExemptSale)} VAT-exempt`} tone="bg-warning/15 text-warning" icon="reports" />
        </div>

        <section aria-labelledby="ledger-check-heading" className="admin-panel mt-5 p-5">
          <div className="admin-panel__header">
            <div><p className="admin-panel__eyebrow">P8 control check</p><h2 id="ledger-check-heading" className="admin-panel__title">Raw order ledger reconciliation</h2><p className="admin-panel__subtitle">The report summary is checked against the raw order rows in this date and branch scope before it is shown as balanced.</p></div>
            <span className={`rounded-pill px-3 py-1.5 text-xs font-extrabold ${report.reconciliation.balanced ? "bg-success/10 text-success" : "bg-danger-soft text-danger"}`}>{report.reconciliation.balanced ? "Balanced" : "Review required"}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LedgerCheck label="Raw sale rows" value={String(report.reconciliation.rawSaleCandidateCount)} detail={`${report.reconciliation.netOrderCount} net orders`} />
            <LedgerCheck label="Raw reversals" value={String(report.reconciliation.rawReversalCount)} detail="Voids and refunds" />
            <LedgerCheck label="Raw net sales" value={displayPeso(report.reconciliation.rawNetSales)} detail="Order ledger total" />
            <LedgerCheck label="Summary net sales" value={displayPeso(report.reconciliation.summaryNetSales)} detail="Report aggregation" />
          </div>
          {!report.reconciliation.balanced && <p role="alert" className="mt-4 rounded-btn border border-danger/25 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">This range is not safe to sign off. Check the query warning or narrow the range if the row limit was reached.</p>}
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <section aria-labelledby="trend-heading" className="admin-panel p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Sales trend</p>
                <h2 id="trend-heading" className="admin-panel__title">Net sales {filters.grouping === "day" ? "by day" : filters.grouping === "week" ? "by week" : "by month"}</h2>
                <p className="admin-panel__subtitle">{report.periodRows.length} period{report.periodRows.length === 1 ? "" : "s"} in range</p>
              </div>
              <div className="flex gap-1.5">
                {groupingOptions.map((option) => (
                  <Link key={option.value} href={reportsHref(filters, { grouping: option.value })} className={`rounded-btn border px-2.5 py-1.5 text-[11px] font-extrabold transition ${filters.grouping === option.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-primary hover:bg-primary-soft"}`}>{option.label.replace("By ", "")}</Link>
                ))}
              </div>
            </div>
            {report.periodRows.length === 0 ? <ReportEmpty title="No sales in this range" detail="Completed sales appear here once orders are rung up." /> : <ReportTrend series={report.periodRows.map((row) => ({ label: row.label, value: row.netSales }))} />}
          </section>

          <section aria-labelledby="payment-heading" className="admin-panel p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Tender mix</p><h2 id="payment-heading" className="admin-panel__title">Payment totals</h2><p className="admin-panel__subtitle">Net sales by method</p></div></div>
            <div className="mt-4 divide-y divide-line/70">
              {report.paymentRows.map((payment) => (
                <div key={payment.method} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-extrabold text-ink">
                    <i className={`h-2.5 w-2.5 rounded-full ${payment.method === "cash" ? "bg-primary" : payment.method === "gcash" ? "bg-success" : payment.method === "maya" ? "bg-warning" : "bg-[#8064a7]"}`} />
                    {paymentLabel(payment.method)}
                  </span>
                  <span className="text-right">
                    <strong className="tnums block text-xs font-extrabold text-ink">{displayPeso(payment.netSales)}</strong>
                    <small className="tnums mt-1 block text-[10px] text-ink-muted">{payment.orders} order{payment.orders === 1 ? "" : "s"} · {payment.share}%</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Reversals recorded</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-muted">{totals.voidCount} void{totals.voidCount === 1 ? "" : "s"} · {totals.refundCount} refund{totals.refundCount === 1 ? "" : "s"}</span>
                <strong className={`tnums text-xs font-extrabold ${reversalTotal > 0 ? "text-danger" : "text-ink-muted"}`}>{displayPeso(reversalTotal)}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ReportListPanel
            title="Best sellers"
            subtitle="Top items by revenue"
            emptyTitle="No completed sales yet"
            emptyDetail="Items appear after the first completed order."
            items={report.itemRows.slice(0, 8).map((item) => ({ label: item.name, detail: `${formatStockQuantity(item.qty)} ${item.unit} · ${item.orders} order${item.orders === 1 ? "" : "s"}`, value: displayPeso(item.netSales) }))}
          />
          <ReportListPanel
            title="Sales by category"
            subtitle="Menu families driving item sales"
            emptyTitle="No category sales yet"
            emptyDetail="Category performance appears after completed orders."
            items={report.categoryRows.slice(0, 8).map((item) => ({ label: item.name, detail: `${formatStockQuantity(item.qty)} ${item.unit} · ${item.share}%`, value: displayPeso(item.netSales) }))}
          />
        </div>

        <section aria-labelledby="hourly-heading" className="admin-panel mt-4 p-5">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">Demand shape</p>
              <h2 id="hourly-heading" className="admin-panel__title">Hourly heatmap</h2>
              <p className="admin-panel__subtitle">Net sales by weekday and hour, across the whole range</p>
            </div>
            {report.peakHour && <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Peak {weekdayLabel(report.peakHour.weekday)} {String(report.peakHour.hour).padStart(2, "0")}:00 · {compactPeso(report.peakHour.netSales)}</span>}
          </div>
          {report.hourCells.length === 0 ? <ReportEmpty title="No sales to map yet" detail="The heatmap fills in as orders are completed through the day." /> : <ReportHeatmap report={report} />}
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section aria-labelledby="cashier-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Team</p>
                <h2 id="cashier-heading" className="admin-panel__title">Sales by cashier</h2>
                <p className="admin-panel__subtitle">Voids and refunds count the reversals they recorded</p>
              </div>
              <Link href="/admin/employees" className="admin-kpi-card__link mt-0">Staff <AdminIcon name="arrow" size={14} /></Link>
            </div>
            {report.cashierRows.length === 0 ? <ReportEmpty title="No cashier activity" detail="Cashier performance appears once sales are rung up in this range." /> : (
              <div className="mt-4 overflow-x-auto">
                <table className="admin-list-table min-w-[620px]">
                  <thead><tr><th>Cashier</th><th>Orders</th><th>Net sales</th><th>Average</th><th>Reversals</th><th>Share</th></tr></thead>
                  <tbody>
                    {report.cashierRows.map((row) => (
                      <tr key={row.cashierId}>
                        <td><strong>{row.name}</strong></td>
                        <td className="tnums">{row.orders}</td>
                        <td className="tnums font-extrabold">{displayPeso(row.netSales)}</td>
                        <td className="tnums">{displayPeso(row.averageOrder)}</td>
                        <td className={`tnums ${row.voidCount + row.refundCount > 0 ? "text-danger" : "text-ink-muted"}`}>{row.voidCount + row.refundCount}</td>
                        <td className="tnums">{row.share}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="discount-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Concessions</p>
                <h2 id="discount-heading" className="admin-panel__title">Discount report</h2>
                <p className="admin-panel__subtitle">Senior and PWD discounts are legally mandated and VAT-exempt</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="admin-list-table min-w-[520px]">
                <thead><tr><th>Type</th><th>Orders</th><th>Discount given</th><th>Net sales</th></tr></thead>
                <tbody>
                  {report.discountRows.map((row) => (
                    <tr key={row.type}>
                      <td><strong>{row.label}</strong></td>
                      <td className="tnums">{row.orders}</td>
                      <td className="tnums font-extrabold">{row.discountTotal > 0 ? displayPeso(row.discountTotal) : "—"}</td>
                      <td className="tnums">{displayPeso(row.netSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section aria-labelledby="branch-report-heading" className="admin-panel mt-4 p-5">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">{report.canCompareBranches ? "Branch comparison" : "Selected branch"}</p>
              <h2 id="branch-report-heading" className="admin-panel__title">{report.canCompareBranches ? "Where sales are happening" : `${report.branchName} performance`}</h2>
              <p className="admin-panel__subtitle">{report.canCompareBranches ? "Switch to a single branch from the top bar to drill in" : "Switch to All branches from the top bar to compare"}</p>
            </div>
          </div>
          {report.branchRows.length === 0 ? <ReportEmpty title="No branches found" detail="Create a branch to compare performance." /> : (
            <div className="mt-4 overflow-x-auto">
              <table className="admin-list-table min-w-[680px]">
                <thead><tr><th>Branch</th><th>Orders</th><th>Net sales</th><th>Discounts</th><th>Average order</th><th>Share</th></tr></thead>
                <tbody>
                  {report.branchRows.map((row) => (
                    <tr key={row.branchId}>
                      <td><strong>{row.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">{row.isActive ? "Active" : "Inactive"}</small></td>
                      <td className="tnums">{row.orders}</td>
                      <td className="tnums font-extrabold">{displayPeso(row.netSales)}</td>
                      <td className="tnums">{displayPeso(row.discountTotal)}</td>
                      <td className="tnums font-extrabold">{displayPeso(row.averageOrder)}</td>
                      <td className="tnums">{row.share}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportHeatmap({ report }: { report: SalesReportData }) {
  const byKey = new Map(report.hourCells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const max = report.hourCells.reduce((peak, cell) => Math.max(peak, cell.netSales), 0);
  // Business days start mid-morning and run late, so the grid is trimmed to the
  // hours a lechon counter actually trades rather than a flat 24-column wall.
  const activeHours = report.hourCells.map((cell) => cell.hour);
  const firstHour = Math.min(...activeHours, 8);
  const lastHour = Math.max(...activeHours, 20);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const weekdays = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-10" />
            {hours.map((hour) => <th key={hour} className="text-[9px] font-extrabold text-ink-muted">{String(hour).padStart(2, "0")}</th>)}
          </tr>
        </thead>
        <tbody>
          {weekdays.map((weekday) => (
            <tr key={weekday}>
              <th scope="row" className="pr-1 text-right text-[10px] font-extrabold text-ink-muted">{weekdayLabel(weekday)}</th>
              {hours.map((hour) => {
                const cell = byKey.get(`${weekday}-${hour}`);
                const value = cell?.netSales ?? 0;
                const intensity = max > 0 && value > 0 ? Math.max(0.12, value / max) : 0;
                return (
                  <td key={hour} className="p-0">
                    <span
                      className="block h-7 rounded-sm border border-line/60"
                      style={{ backgroundColor: intensity > 0 ? `color-mix(in srgb, var(--color-primary) ${Math.round(intensity * 100)}%, transparent)` : undefined }}
                      title={`${weekdayLabel(weekday)} ${String(hour).padStart(2, "0")}:00 — ${displayPeso(value)}${cell ? ` · ${cell.orders} order${cell.orders === 1 ? "" : "s"}` : ""}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "wallet" | "chart" | "promotions" | "reports" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function LedgerCheck({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-btn border border-line bg-surface-raised px-3 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted">{label}</p><strong className="mt-1 block tnums text-base font-extrabold text-ink">{value}</strong><small className="mt-1 block text-[10px] text-ink-muted">{detail}</small></div>;
}

function ReportTrend({ series }: { series: Array<{ label: string; value: number }> }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const labelEvery = series.length > 14 ? Math.ceil(series.length / 8) : 1;
  return (
    <div className="mt-5">
      <div className="flex h-[220px] items-end gap-1 border-b border-line px-1">
        {series.map((point, index) => (
          <div key={`${point.label}-${index}`} className="group flex h-full min-w-0 flex-1 items-end justify-center" title={`${point.label}: ${displayPeso(point.value)}`}>
            <span className="w-full max-w-7 rounded-t-sm bg-primary transition-all duration-200 group-hover:bg-accent" style={{ height: `${Math.max(point.value ? 5 : 1, Math.round((point.value / max) * 100))}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 px-1 text-[9px] font-semibold text-ink-muted">
        {series.map((point, index) => <span key={`${point.label}-label-${index}`} className="min-w-0 flex-1 truncate text-center">{index % labelEvery === 0 || index === series.length - 1 ? point.label : ""}</span>)}
      </div>
    </div>
  );
}

function ReportListPanel({ title, subtitle, items, emptyTitle, emptyDetail }: { title: string; subtitle: string; items: Array<{ label: string; detail: string; value: string }>; emptyTitle: string; emptyDetail: string }) {
  return <section className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Performance list</p><h2 className="admin-panel__title">{title}</h2><p className="admin-panel__subtitle">{subtitle}</p></div></div>{items.length === 0 ? <ReportEmpty title={emptyTitle} detail={emptyDetail} /> : <div className="admin-ranking">{items.map((item, index) => <div key={item.label} className="admin-ranking__item"><span className="admin-ranking__rank">{index + 1}</span><span className="admin-ranking__copy"><strong>{item.label}</strong><small>{item.detail}</small></span><strong className="admin-ranking__total tnums">{item.value}</strong></div>)}</div>}</section>;
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function ReportEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="py-8 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="reports" size={21} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function ReportsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
