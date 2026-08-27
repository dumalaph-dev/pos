import { Fragment, type ReactNode } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import {
  branchPerformanceQuery,
  type BranchPerformanceBranchRow,
  type BranchPerformanceData,
  type BranchPerformanceDirection,
  type BranchPerformanceFilters,
  type BranchPerformanceHealthRow,
  type BranchPerformanceMetric,
  type BranchPerformancePayment,
  type BranchPerformancePeriodRow,
  type BranchPerformanceSort,
} from "@/lib/admin/branch-performance";

const CHART_COLORS = ["var(--primary)", "var(--accent)", "var(--success)", "var(--warning)", "var(--danger)", "#7c7464"];
const PAYMENT_COLORS: Record<string, string> = {
  cash: "var(--success)",
  gcash: "var(--primary)",
  maya: "var(--accent)",
  card: "var(--warning)",
};

function money(value: number) {
  return formatPeso(Math.round(value)).replace(/\.00$/, "");
}

function moneyWhen(value: number, count: number) {
  return count > 0 ? money(value) : "—";
}

function integer(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function quantity(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value);
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function change(value: number | null, isNew = false) {
  if (isNew) return "New";
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function changeClass(value: number | null) {
  if (value === null || value === 0) return "text-ink-muted";
  return value > 0 ? "text-success" : "text-danger";
}

function calendarDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function metricLabel(metric: BranchPerformanceMetric) {
  return metric === "orders" ? "Orders" : metric === "average" ? "Average order" : "Net sales";
}

function metricValue(row: BranchPerformanceBranchRow, metric: BranchPerformanceMetric) {
  return metric === "orders" ? row.orders : metric === "average" ? row.averageOrder : row.netSales;
}

function paymentLabel(method: BranchPerformancePayment["method"]) {
  return method === "gcash" ? "GCash" : method === "maya" ? "Maya" : method === "card" ? "Card" : "Cash";
}

function scopeLabel(report: BranchPerformanceData) {
  return report.branchName === "All branches"
    ? `${report.totals.includedBranchCount} ${report.totals.includedBranchCount === 1 ? "branch" : "branches"}`
    : report.branchName;
}

function hrefFor(filters: BranchPerformanceFilters, overrides: Partial<BranchPerformanceFilters> = {}, kind?: string) {
  const next = { ...filters, ...overrides };
  return `/admin/branches/performance${kind ? "/export" : ""}?${branchPerformanceQuery(next, kind)}`;
}

function Panel({
  eyebrow,
  title,
  detail,
  children,
  action,
  id,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`admin-panel min-w-0 p-5 ${className}`}>
      <div className="admin-panel__header">
        <div className="min-w-0">
          {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>}
          <h2 className={`${eyebrow ? "mt-1" : ""} admin-panel__title`}>{title}</h2>
          {detail && <p className="admin-panel__subtitle">{detail}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyReportState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-8 text-center">
      <AdminIcon name="chart" size={22} />
      <p className="mt-3 text-sm font-extrabold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  tone: "brown" | "orange" | "green" | "purple" | "red";
  icon: "wallet" | "bag" | "chart" | "branches" | "tag" | "alert";
}) {
  const toneClass = {
    brown: "bg-primary text-primary-fg",
    orange: "bg-warning text-primary-fg",
    green: "bg-success text-primary-fg",
    purple: "bg-accent text-primary-fg",
    red: "bg-danger text-primary-fg",
  }[tone];
  return (
    <article className="admin-kpi-card">
      <div className="admin-kpi-card__inner">
        <div className="admin-kpi-card__top">
          <span className="admin-kpi-card__label">{label}</span>
          <span className={`admin-kpi-card__icon ${toneClass}`}><AdminIcon name={icon} size={18} /></span>
        </div>
        <p className="admin-kpi-card__value tnums">{value}</p>
        <p className="admin-kpi-card__trend">{detail}</p>
      </div>
    </article>
  );
}

function QuickRangeLinks({ report }: { report: BranchPerformanceData }) {
  const { filters } = report;
  const ranges = [
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
  ];
  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick date ranges">
      {ranges.map((range) => {
        const from = shiftDate(filters.to, -(range.days - 1));
        const active = filters.from === from;
        return (
          <Link
            key={range.days}
            href={hrefFor(filters, { from, query: "", sort: "sales", direction: "desc" })}
            className={`rounded-pill border px-3 py-2 text-xs font-extrabold transition ${active ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-primary hover:border-primary"}`}
            aria-current={active ? "page" : undefined}
          >
            {range.label}
          </Link>
        );
      })}
    </div>
  );
}

function ReportControls({ report }: { report: BranchPerformanceData }) {
  const { filters } = report;
  const fieldLabelClassName = "flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted";
  return (
    <Panel
      eyebrow="Report controls"
      title="Set the decision window"
      detail="Dates use the Singapore business day. The report excludes voided and refunded sales from net sales."
      action={
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="inline-flex items-center gap-2 rounded-pill bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary">
            <AdminIcon name="calendar" size={14} />
            <span className="tnums">{calendarDate(filters.from)} – {calendarDate(filters.to)}</span>
          </span>
          <span className="text-[10px] font-bold text-ink-muted">Singapore time</span>
        </div>
      }
      className="mt-5"
    >
      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)]">
        <fieldset className="rounded-card border border-line bg-surface p-3">
          <legend className="px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Quick range</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <QuickRangeLinks report={report} />
            <Link href="/admin/branches/performance" className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft">
              <AdminIcon name="refresh" size={13} />
              Reset
            </Link>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
            <AdminIcon name="clock" size={13} />
            <span>Presets keep the end date and move the start date.</span>
          </p>
          <div className="mt-5 border-t border-line pt-3">
            <div className="flex items-start gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-btn bg-primary-soft text-primary"><AdminIcon name="chart" size={14} /></span>
              <div>
                <p className="text-xs font-extrabold text-ink">Explore the report</p>
                <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">Jump to the signal you want to review next.</p>
              </div>
            </div>
            <nav className="mt-3 grid grid-cols-2 gap-2" aria-label="Report sections">
              <a href="#performance-summary" className="inline-flex min-h-9 items-center justify-between gap-2 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Summary <AdminIcon name="arrow" size={12} />
              </a>
              <a href="#trend-analysis" className="inline-flex min-h-9 items-center justify-between gap-2 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Trend <AdminIcon name="arrow" size={12} />
              </a>
              <a href="#branch-comparison" className="inline-flex min-h-9 items-center justify-between gap-2 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Branches <AdminIcon name="arrow" size={12} />
              </a>
              <a href="#operational-health" className="inline-flex min-h-9 items-center justify-between gap-2 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                Operations <AdminIcon name="arrow" size={12} />
              </a>
              {report.detail && (
                <a href="#branch-detail" className="col-span-2 inline-flex min-h-9 items-center justify-between gap-2 rounded-btn border border-line bg-surface-raised px-2.5 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Selected branch <AdminIcon name="arrow" size={12} />
                </a>
              )}
            </nav>
          </div>
        </fieldset>

        <form method="get" aria-label="Branch performance filters" className="rounded-card border border-line bg-surface p-3">
          {filters.branchId && <input type="hidden" name="branch" value={filters.branchId} />}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">Custom filters</p>
            <p className="mt-1 text-xs text-ink-muted">Edit the window, detail level, and branch scope.</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}><AdminIcon name="calendar" size={13} />From date</span>
              <input type="date" name="from" defaultValue={filters.from} className="admin-filter-input" />
            </label>
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}><AdminIcon name="calendar" size={13} />To date</span>
              <input type="date" name="to" defaultValue={filters.to} className="admin-filter-input" />
            </label>
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}><AdminIcon name="columns" size={13} />Group by</span>
              <select name="grouping" defaultValue={filters.grouping} className="admin-filter-input">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className={fieldLabelClassName}><AdminIcon name="search" size={13} />Search branch</span>
              <input type="search" name="q" defaultValue={filters.query} placeholder="All branches" className="admin-filter-input" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
            <fieldset className="min-w-0">
              <legend className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Report options</legend>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-ink-muted">
                <label className="admin-report-option inline-flex items-center gap-2">
                  <input type="hidden" name="compare" value="0" />
                  <input type="checkbox" name="compare" value="1" defaultChecked={filters.compare} />
                  Compare period
                </label>
                <label className="admin-report-option inline-flex items-center gap-2">
                  <input type="hidden" name="includeInactive" value="0" />
                  <input type="checkbox" name="includeInactive" value="1" defaultChecked={filters.includeInactive} />
                  Include inactive
                </label>
              </div>
            </fieldset>
            <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg shadow-sm transition hover:bg-primary-hover">
              <AdminIcon name="filter" size={14} />
              Apply filters
            </button>
          </div>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-btn bg-primary-soft text-primary"><AdminIcon name="download" size={14} /></span>
          <div>
            <p className="text-xs font-extrabold text-ink">Export filtered views</p>
            <p className="text-[10px] font-semibold text-ink-muted">CSV files use the current report filters.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="CSV exports">
          <Link href={hrefFor(filters, {}, "summary")} className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft"><AdminIcon name="download" size={12} />Summary</Link>
          <Link href={hrefFor(filters, {}, "trend")} className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft"><AdminIcon name="download" size={12} />Trend</Link>
          <Link href={hrefFor(filters, {}, "payments")} className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft"><AdminIcon name="download" size={12} />Payments</Link>
          <Link href={hrefFor(filters, {}, "operations")} className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft"><AdminIcon name="download" size={12} />Operations</Link>
        </div>
      </div>
    </Panel>
  );
}

function ReportNotices({ report }: { report: BranchPerformanceData }) {
  return (
    <div className="mt-4 grid gap-3">
      {report.queryWarning && (
        <div role="status" className="flex gap-3 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
          <AdminIcon name="alert" size={18} />
          <div><strong>Some operational data needs attention.</strong><p className="mt-1 text-xs leading-5 text-ink-muted">The sales ledger is still shown, but one or more branch, inventory, staffing, device, or closeout queries could not be refreshed completely.</p></div>
        </div>
      )}
      {report.truncated && (
        <div role="alert" className="flex gap-3 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-ink">
          <AdminIcon name="alert" size={18} />
          <div><strong>This report reached a row limit.</strong><p className="mt-1 text-xs leading-5 text-ink-muted">The visible figures may be partial. Narrow the date range or branch scope before exporting or making a decision.</p></div>
        </div>
      )}
      {!report.reconciliation.balanced && !report.truncated && (
        <div role="status" className="flex gap-3 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
          <AdminIcon name="alert" size={18} />
          <div><strong>Reconciliation needs review.</strong><p className="mt-1 text-xs leading-5 text-ink-muted">The raw order candidates and report summary do not currently balance. Review the general Reports page before relying on this view.</p></div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ report }: { report: BranchPerformanceData }) {
  const { periodRows, trendSeries, filters } = report;
  const max = Math.max(...periodRows.flatMap((row) => [row.netSales, row.previousNetSales]), 1);
  const chartWidth = 640;
  const chartHeight = 220;
  const left = 38;
  const right = 12;
  const top = 18;
  const bottom = 188;
  const xFor = (index: number) => left + (index / Math.max(periodRows.length - 1, 1)) * (chartWidth - left - right);
  const yFor = (value: number) => bottom - (value / max) * (bottom - top);
  const pointsFor = (values: number[]) => values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
  const currentPoints = pointsFor(periodRows.map((row) => row.netSales));
  const previousPoints = pointsFor(periodRows.map((row) => row.previousNetSales));
  const areaPoints = `${left},${bottom} ${currentPoints} ${chartWidth - right},${bottom}`;
  const peak = periodRows.reduce<BranchPerformancePeriodRow | null>((best, row) => best === null || row.netSales > best.netSales ? row : best, null);
  const labels = periodRows.length > 8
    ? periodRows.filter((_, index) => index === 0 || index === periodRows.length - 1 || index % Math.ceil(periodRows.length / 6) === 0)
    : periodRows;

  if (!periodRows.length) return <EmptyReportState title="No sales in this window" detail="Choose another range or check whether the branch has completed orders." />;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-ink-muted">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-primary" />Current net sales</span>
        {filters.compare && <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-secondary ring-1 ring-line-strong" />Previous equivalent period</span>}
        {trendSeries.map((series) => <Link key={series.branchId} href={`${hrefFor(filters, { branchId: series.branchId, query: "" })}#branch-detail`} className="inline-flex items-center gap-2 font-bold text-primary hover:underline"><i className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[series.colorIndex] ?? CHART_COLORS[0] }} />{series.label}</Link>)}
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[220px] min-w-[560px] w-full" role="img" aria-labelledby="branch-trend-title branch-trend-desc">
          <title id="branch-trend-title">Net sales trend</title>
          <desc id="branch-trend-desc">Current net sales by {filters.grouping}, with the previous equivalent period shown as a dashed line when comparison is enabled.</desc>
          <g stroke="var(--border)" strokeWidth="1"><path d={`M${left} ${top}H${chartWidth - right}`} /><path d={`M${left} ${(top + bottom) / 2}H${chartWidth - right}`} /><path d={`M${left} ${bottom}H${chartWidth - right}`} /></g>
          <polygon points={areaPoints} fill="var(--primary-soft)" fillOpacity=".62" />
          {filters.compare && <polyline points={previousPoints} fill="none" stroke="var(--ink-muted)" strokeWidth="2" strokeDasharray="5 5" />}
          <polyline points={currentPoints} fill="none" stroke="var(--primary)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          {periodRows.map((row, index) => <circle key={row.key} cx={xFor(index)} cy={yFor(row.netSales)} r="3.5" fill="var(--primary)" stroke="var(--surface)" strokeWidth="2" tabIndex={0} aria-label={`${row.label}: ${money(row.netSales)}`} />)}
          <g fill="var(--ink-muted)" fontSize="10"><text x="4" y={top + 4}>{money(max)}</text><text x="4" y={(top + bottom) / 2 + 4}>{money(max / 2)}</text><text x="15" y={bottom + 4}>₱0</text></g>
        </svg>
        <div className="flex min-w-[560px] justify-between gap-3 pl-10 pr-2 text-[10px] font-bold text-ink-muted">{labels.map((row) => <span key={row.key}>{row.label}</span>)}</div>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{peak ? `Peak period: ${peak.label} at ${money(peak.netSales)}.` : "No completed sales were recorded."} {filters.compare ? `The equivalent previous period totals ${money(periodRows.reduce((sum, row) => sum + row.previousNetSales, 0))}.` : "Enable comparison to see the previous equivalent period."}</p>
      <details className="mt-3 rounded-btn border border-line bg-surface-raised px-3 py-2">
        <summary className="cursor-pointer text-xs font-extrabold text-primary">View exact trend values</summary>
        <div className="mt-3 overflow-x-auto"><table className="admin-list-table min-w-[520px]"><thead><tr><th>Period</th><th>Net sales</th><th>Orders</th>{filters.compare && <th>Previous</th>}</tr></thead><tbody>{periodRows.map((row) => <tr key={row.key}><td>{row.label}</td><td className="tnums font-extrabold">{money(row.netSales)}</td><td className="tnums">{integer(row.orders)}</td>{filters.compare && <td className="tnums text-ink-muted">{money(row.previousNetSales)}</td>}</tr>)}</tbody></table></div>
      </details>
    </div>
  );
}

function ShareDonut({ report }: { report: BranchPerformanceData }) {
  const { shareRows, filters } = report;
  const gradient = shareRows.length
    ? (() => {
        let cursor = 0;
        return shareRows.map((row) => {
          const start = cursor;
          cursor += row.share;
          return `${CHART_COLORS[row.colorIndex] ?? CHART_COLORS[0]} ${start}% ${cursor}%`;
        }).join(", ");
      })()
    : "var(--secondary) 0 100%";
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="Branch sales share donut">
          <div className="absolute inset-5 grid place-items-center rounded-full bg-surface text-center"><span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Net sales</span><strong className="tnums text-sm text-primary">{money(report.totals.netSales)}</strong></div>
        </div>
        <ul className="min-w-[180px] flex-1 space-y-2 text-xs">
          {shareRows.length === 0 && <li className="text-ink-muted">No branch sales to share yet.</li>}
          {shareRows.map((row) => <li key={`${row.name}-${row.branchId ?? "other"}`} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[row.colorIndex] ?? CHART_COLORS[0] }} />{row.branchId ? <Link href={`${hrefFor(filters, { branchId: row.branchId, query: "" })}#branch-row-${row.branchId}`} className="truncate font-extrabold text-primary hover:underline">{row.name}</Link> : <span className="truncate font-extrabold">{row.name}</span>}</span><span className="tnums shrink-0 text-right font-extrabold">{money(row.netSales)} <span className="text-ink-muted">· {percent(row.share)}</span></span></li>)}
        </ul>
      </div>
      <p className="mt-4 text-xs leading-5 text-ink-muted">The chart shows the five largest branches individually; smaller branches are grouped as Other.</p>
    </div>
  );
}

function MetricSwitcher({ report }: { report: BranchPerformanceData }) {
  const { filters } = report;
  return <div className="flex flex-wrap gap-1 rounded-pill bg-secondary p-1">{(["sales", "orders", "average"] as BranchPerformanceMetric[]).map((metric) => <Link key={metric} href={hrefFor(filters, { metric })} className={`rounded-pill px-2.5 py-1.5 text-[10px] font-extrabold ${filters.metric === metric ? "bg-surface text-primary shadow-sm" : "text-ink-muted hover:text-primary"}`}>{metricLabel(metric)}</Link>)}</div>;
}

function ComparisonBars({ report }: { report: BranchPerformanceData }) {
  const { filters } = report;
  const rows = [...report.branchRows].sort((left, right) => metricValue(right, filters.metric) - metricValue(left, filters.metric));
  const max = Math.max(...rows.map((row) => metricValue(row, filters.metric)), 1);
  return (
    <div className="mt-4">
      <MetricSwitcher report={report} />
      {!rows.length ? <div className="mt-4"><EmptyReportState title="No branches in scope" detail="The current access scope does not have branch records to compare." /></div> : <div className="mt-5 space-y-4">{rows.slice(0, 10).map((row) => <div key={row.branchId}><div className="flex items-center justify-between gap-3 text-xs"><Link href={hrefFor(filters, { branchId: row.branchId })} className="truncate font-extrabold text-primary hover:underline">{row.name}</Link><span className="tnums shrink-0 font-extrabold">{filters.metric === "orders" ? integer(metricValue(row, filters.metric)) : filters.metric === "average" ? moneyWhen(metricValue(row, filters.metric), row.orders) : money(metricValue(row, filters.metric))}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-secondary"><div className="h-full rounded-pill bg-primary" style={{ width: `${Math.max((metricValue(row, filters.metric) / max) * 100, row[filters.metric === "orders" ? "orders" : "netSales"] > 0 ? 3 : 0)}%` }} aria-hidden="true" /></div></div>)}</div>}
      {rows.length > 10 && <p className="mt-4 text-xs text-ink-muted">Showing the top 10 branches for this measure. Use the comparison table for the complete list.</p>}
    </div>
  );
}

function PaymentMix({ report }: { report: BranchPerformanceData }) {
  const { filters } = report;
  const rows = report.branchRows;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">{["cash", "gcash", "maya", "card"].map((method) => <span key={method} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: PAYMENT_COLORS[method] }} />{paymentLabel(method as BranchPerformancePayment["method"])}</span>)}</div>
      {!rows.length ? <div className="mt-4"><EmptyReportState title="No payment data" detail="Completed sales will appear here once the selected period has activity." /></div> : <div className="mt-5 space-y-4">{rows.map((row) => <div key={row.branchId}><div className="flex items-center justify-between gap-3 text-xs"><Link href={hrefFor(filters, { branchId: row.branchId })} className="truncate font-extrabold text-primary hover:underline">{row.name}</Link><span className="tnums text-ink-muted">{money(row.netSales)}</span></div><div className="mt-1.5 flex h-3 overflow-hidden rounded-pill bg-secondary" role="img" aria-label={`${row.name} payment mix: ${row.payments.map((payment) => `${paymentLabel(payment.method)} ${percent(payment.share)}`).join(", ")}`}>{row.payments.map((payment) => <span key={payment.method} style={{ width: `${payment.share}%`, background: PAYMENT_COLORS[payment.method] }} />)}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted">{row.payments.filter((payment) => payment.orders > 0).map((payment) => <span key={payment.method}>{paymentLabel(payment.method)} {percent(payment.share)}</span>)}</div></div>)}</div>}
    </div>
  );
}

export function BranchPerformanceReport({ report, canManageBranches }: { report: BranchPerformanceData; canManageBranches: boolean }) {
  const { filters, totals } = report;
  const topBranch = [...report.branchRows].sort((left, right) => right.netSales - left.netSales)[0] ?? null;
  const exportHref = hrefFor(filters, {}, "summary");
  const comparisonDetail = filters.compare
    ? `${change(totals.salesChange, totals.salesChangeIsNew)} vs ${money(totals.previousNetSales)} previous net sales`
    : "Comparison is off";

  return (
    <div className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-10 sm:px-6 lg:px-8">
        <AdminPageHeader title="Branch performance">
          <Link href="/admin/branches" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover"><AdminIcon name="branches" size={14} /> Manage branches</Link>
          <Link href={exportHref} className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover"><AdminIcon name="download" size={14} /> Export report</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Multi-branch intelligence</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Branch performance</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Compare sales momentum, payment behavior, and operating signals across {scopeLabel(report).toLowerCase()}. Net sales follow the same reversal-aware definitions as Reports.</p></div>
          <div className="text-right"><span className="rounded-pill bg-success/10 px-3 py-2 text-xs font-extrabold text-success">{report.branchName}</span><p className="mt-2 text-[11px] font-semibold text-ink-muted">Refreshed {dateTime(report.generatedAt)} · Singapore</p></div>
        </div>

        <ReportControls report={report} />
        <ReportNotices report={report} />

        <section id="performance-summary" aria-label="Performance summary" className="mt-4 scroll-mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Net sales" value={money(totals.netSales)} detail={<span className="text-ink-muted">Current period · reversal-aware</span>} tone="brown" icon="wallet" />
          <KpiCard label="Sales change" value={change(totals.salesChange, totals.salesChangeIsNew)} detail={<span className="text-ink-muted">{comparisonDetail}</span>} tone="orange" icon="chart" />
          <KpiCard label="Completed orders" value={integer(totals.orderCount)} detail={<span className="text-ink-muted">{filters.compare ? `${integer(totals.previousOrderCount)} previous orders` : "Voided/refunded rows excluded"}</span>} tone="green" icon="bag" />
          <KpiCard label="Average order value" value={moneyWhen(totals.averageOrder, totals.orderCount)} detail={<span className="text-ink-muted">{filters.compare ? `${moneyWhen(totals.previousAverageOrder, totals.previousOrderCount)} previous average` : "Net sales ÷ completed orders"}</span>} tone="purple" icon="chart" />
          <KpiCard label="Sales per active branch" value={totals.activeBranchCount > 0 ? money(totals.salesPerActiveBranch) : "—"} detail={<span className="text-ink-muted">Across {integer(totals.activeBranchCount)} active branches</span>} tone="brown" icon="branches" />
          <KpiCard label="Top branch" value={topBranch?.name ?? "—"} detail={<span className="text-ink-muted">{topBranch ? `${money(topBranch.netSales)} · ${percent(topBranch.salesShare)} of sales` : "No sales in range"}</span>} tone="brown" icon="branches" />
          <KpiCard label="Discounts" value={money(totals.discountTotal)} detail={<span className="text-ink-muted">{percent(totals.discountRate)} of gross sales · {money(totals.grossSales)} gross</span>} tone="orange" icon="tag" />
          <KpiCard label="Reversals" value={integer(totals.reversalCount)} detail={<span className="text-ink-muted">{money(totals.reversalTotal)} · {integer(totals.voidCount)} voids / {integer(totals.refundCount)} refunds</span>} tone="red" icon="alert" />
        </section>

        <div id="trend-analysis" className="mt-4 scroll-mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
          <Panel title="Net sales trend" detail={`${calendarDate(filters.from)} – ${calendarDate(filters.to)} · Grouped by ${filters.grouping}`}>
            <TrendChart report={report} />
          </Panel>
          <Panel title="Sales share by branch" detail="Current-period net sales contribution">
            <ShareDonut report={report} />
          </Panel>
        </div>

        <div id="branch-comparison" className="mt-4 scroll-mt-6 grid gap-4 xl:grid-cols-2">
          <Panel title="Branch comparison" detail="Switch the measure to find the strongest branch signal.">
            <ComparisonBars report={report} />
          </Panel>
          <Panel title="Payment mix by branch" detail="Completed net sales by payment method.">
            <PaymentMix report={report} />
          </Panel>
        </div>

        <OperationalHealth report={report} />
        <ComparisonTable report={report} canManageBranches={canManageBranches} />
        {report.detail && <BranchDrilldown report={report} canManageBranches={canManageBranches} />}

        <p className="mt-5 text-xs leading-5 text-ink-muted">Data source: organization-scoped orders, branch records, devices, staff, inventory, and Z-readings. Values are bounded for a responsive admin report; warnings above are actionable.</p>
      </div>
    </div>
  );
}

function healthLabel(status: BranchPerformanceHealthRow["status"]) {
  return status === "no_data" ? "No data" : status === "inactive" ? "Inactive" : status === "attention" ? "Attention" : "Healthy";
}

function healthClass(status: BranchPerformanceHealthRow["status"]) {
  return status === "healthy"
    ? "bg-success/10 text-success"
    : status === "inactive"
      ? "bg-secondary text-ink-muted"
      : status === "no_data"
        ? "bg-secondary text-ink-muted"
        : "bg-warning/15 text-warning";
}

function OperationalHealth({ report }: { report: BranchPerformanceData }) {
  const healthyCount = report.healthRows.filter((row) => row.status === "healthy").length;
  return (
    <Panel
      id="operational-health"
      title="Operational health"
      detail="Signals that help explain performance changes. These checks do not affect sales totals."
      className="mt-4"
      action={<span className="rounded-pill bg-secondary px-3 py-2 text-xs font-extrabold text-primary">{healthyCount}/{report.healthRows.length} healthy</span>}
    >
      {!report.healthRows.length ? <div className="mt-4"><EmptyReportState title="No branch health data" detail="Branch records will appear here when the organization scope is available." /></div> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[860px]"><thead><tr><th>Branch</th><th>Status</th><th>POS terminals</th><th>Active staff</th><th>Tracked stock</th><th>Latest closeout</th><th>Signal</th></tr></thead><tbody>{report.healthRows.map((row) => <tr key={row.branchId}><td><Link href={hrefFor(report.filters, { branchId: row.branchId })} className="font-extrabold text-primary hover:underline">{row.name}</Link>{!row.isActive && <span className="ml-2 rounded-pill bg-secondary px-2 py-1 text-[10px] font-extrabold text-ink-muted">Inactive</span>}</td><td><span className={`rounded-pill px-2 py-1 text-[10px] font-extrabold ${healthClass(row.status)}`}>{healthLabel(row.status)}</span></td><td className="tnums">{integer(row.activeDevices)} / {integer(row.deviceCount)} active</td><td className="tnums">{integer(row.activeStaff)}</td><td className="tnums">{integer(row.outOfStockCount)} out · {integer(row.lowStockCount)} low</td><td className="whitespace-nowrap"><span>{dateTime(row.latestCloseoutAt)}</span>{row.latestCloseoutVariance !== null && row.latestCloseoutVariance !== 0 && <span className="ml-2 tnums text-danger">{money(row.latestCloseoutVariance)}</span>}</td><td className="max-w-[260px] text-xs text-ink-muted">{row.reasons.length ? row.reasons.join(" · ") : "Baseline checks are clear"}</td></tr>)}</tbody></table></div>}
      <p className="mt-3 text-[11px] leading-5 text-ink-muted">Inventory availability uses the existing current-stock read model with a bounded movement fallback. Missing source queries are called out above instead of being presented as healthy.</p>
    </Panel>
  );
}

function sortHref(report: BranchPerformanceData, sort: BranchPerformanceSort) {
  const { filters } = report;
  const direction: BranchPerformanceDirection = filters.sort === sort && filters.direction === "desc" ? "asc" : "desc";
  return hrefFor(filters, { sort, direction });
}

function SortLink({ report, sort, label }: { report: BranchPerformanceData; sort: BranchPerformanceSort; label: string }) {
  const active = report.filters.sort === sort;
  const direction = active ? report.filters.direction : "desc";
  return <Link href={sortHref(report, sort)} className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline" aria-label={`Sort by ${label} ${direction === "desc" ? "descending" : "ascending"}`}>{label}{active && <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span>}</Link>;
}

function ComparisonTable({ report, canManageBranches }: { report: BranchPerformanceData; canManageBranches: boolean }) {
  const { filters, tableRows } = report;
  const healthByBranch = new Map(report.healthRows.map((row) => [row.branchId, row]));
  const tableDetail = filters.query ? `${integer(tableRows.length)} matching branch${tableRows.length === 1 ? "" : "es"}` : `${integer(tableRows.length)} branch${tableRows.length === 1 ? "" : "es"} in scope`;
  return (
    <Panel title="Branch comparison table" detail={`${tableDetail} · Click a branch for its drilldown`} className="mt-4" action={<Link href={hrefFor(filters, {}, "summary")} className="admin-kpi-card__link mt-0"><AdminIcon name="download" size={13} /> CSV</Link>}>
      <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[1250px]"><thead><tr><th className="sticky left-0 z-[1] bg-surface">Branch</th><th><SortLink report={report} sort="sales" label="Net sales" /></th><th><SortLink report={report} sort="change" label="Change" /></th><th><SortLink report={report} sort="orders" label="Orders" /></th><th><SortLink report={report} sort="average" label="Average" /></th><th>Sales share</th><th>Discounts</th><th><SortLink report={report} sort="alerts" label="Reversals" /></th><th>Operations</th><th>Actions</th></tr></thead><tbody>{tableRows.length === 0 ? <tr><td colSpan={10}><EmptyReportState title="No matching branches" detail={filters.query ? "Try a different branch search." : "Create a branch or change the selected scope."} /></td></tr> : tableRows.map((row) => { const health = healthByBranch.get(row.branchId); return <tr key={row.branchId} id={`branch-row-${row.branchId}`}><td className="sticky left-0 z-[1] bg-surface"><Link href={hrefFor(filters, { branchId: row.branchId })} className="font-extrabold text-primary hover:underline">{row.name}</Link><div className="mt-1 flex flex-wrap gap-1">{!row.isActive && <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-extrabold text-ink-muted">Inactive</span>}{report.filters.branchId === row.branchId && <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">Selected</span>}</div></td><td className="tnums whitespace-nowrap font-extrabold">{money(row.netSales)}</td><td className={`tnums whitespace-nowrap font-extrabold ${changeClass(row.change)}`}>{change(row.change, row.changeIsNew)}</td><td className="tnums">{integer(row.orders)}</td><td className="tnums whitespace-nowrap">{moneyWhen(row.averageOrder, row.orders)}</td><td className="tnums font-extrabold text-primary">{percent(row.salesShare)}</td><td className="tnums whitespace-nowrap">{money(row.discountTotal)} <span className="text-[10px] text-ink-muted">({percent(row.discountRate)})</span></td><td className="tnums whitespace-nowrap">{integer(row.reversalCount)} <span className="text-[10px] text-ink-muted">· {money(row.reversalTotal)}</span></td><td className="text-xs"><span className="block whitespace-nowrap">{health ? `${integer(health.activeDevices)} POS · ${integer(health.activeStaff)} staff` : "—"}</span><span className="mt-1 block whitespace-nowrap text-[10px] text-ink-muted">{health ? `${integer(health.outOfStockCount)} out · ${integer(health.lowStockCount)} low` : "Health unavailable"}</span></td><td><div className="flex flex-wrap gap-2"><Link href={hrefFor(filters, { branchId: row.branchId })} className="text-xs font-extrabold text-primary hover:underline">View</Link><Link href={`/admin/orders?branch=${encodeURIComponent(row.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Orders</Link>{canManageBranches && <Link href={`/admin/branches?edit=${encodeURIComponent(row.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Manage</Link>}</div></td></tr>; })}</tbody></table></div>
      <p className="mt-3 text-[11px] leading-5 text-ink-muted">Sorting changes the table only; KPI totals and charts continue to use the full branch scope.</p>
    </Panel>
  );
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${suffix}`;
}

function HourHeatmap({ report }: { report: BranchPerformanceData }) {
  const cells = report.detail?.hourCells ?? [];
  const cellByKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const max = Math.max(...cells.map((cell) => cell.netSales), 1);
  return (
      <div className="mt-4 overflow-x-auto"><div className="min-w-[780px]"><div className="grid grid-cols-[46px_repeat(24,minmax(24px,1fr))] gap-1 text-center text-[9px] font-extrabold text-ink-muted"><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{hour % 3 === 0 ? hourLabel(hour) : ""}</span>)}{Array.from({ length: 7 }, (_, weekday) => <Fragment key={weekday}><span className="self-center text-left">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday]}</span>{Array.from({ length: 24 }, (_, hour) => { const cell = cellByKey.get(`${weekday}-${hour}`); const opacity = cell ? 0.12 + (cell.netSales / max) * 0.78 : 0; return <span key={`${weekday}-${hour}`} role="img" className="relative h-6 rounded-sm bg-secondary" title={`${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday]} ${hourLabel(hour)}: ${cell ? `${money(cell.netSales)} · ${integer(cell.orders)} orders` : "No sales"}`} aria-label={`${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday]} ${hourLabel(hour)}: ${cell ? `${money(cell.netSales)} from ${integer(cell.orders)}` : "No sales"}`}><i className="absolute inset-0 rounded-sm bg-primary" style={{ opacity }} /></span>; })}</Fragment>)} </div></div></div>
  );
}

function BranchDrilldown({ report, canManageBranches }: { report: BranchPerformanceData; canManageBranches: boolean }) {
  const detail = report.detail;
  if (!detail) return null;
  const row = report.branchRows.find((branch) => branch.branchId === detail.branchId);
  const health = report.healthRows.find((branch) => branch.branchId === detail.branchId);
  const paymentLeader = row?.payments.slice().sort((left, right) => right.netSales - left.netSales).find((payment) => payment.orders > 0) ?? null;
  const categoryMax = Math.max(...detail.categoryRows.map((category) => category.netSales), 1);
  const allBranchesHref = hrefFor(report.filters, { branchId: "" });
  return (
    <div id="branch-detail">
    <Panel
      eyebrow="Selected branch drilldown"
      title={detail.branchName}
      detail={`${detail.address ?? "Address not recorded"} · ${detail.isActive ? "Active branch" : "Inactive branch"}`}
      className="mt-4"
      action={<div className="flex flex-wrap gap-3">{canManageBranches && <Link href={`/admin/branches?edit=${encodeURIComponent(detail.branchId)}`} className="admin-kpi-card__link mt-0">Manage branch <AdminIcon name="arrow" size={13} /></Link>}<Link href={allBranchesHref} className="admin-kpi-card__link mt-0">Clear drilldown <AdminIcon name="close" size={13} /></Link></div>}
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-btn bg-secondary px-4 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Net sales</span><strong className="mt-1 block tnums text-lg text-primary">{money(row?.netSales ?? 0)}</strong><span className={`text-xs font-extrabold ${changeClass(row?.change ?? null)}`}>{change(row?.change ?? null, row?.changeIsNew)}</span></div>
        <div className="rounded-btn bg-secondary px-4 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Orders</span><strong className="mt-1 block tnums text-lg text-primary">{integer(row?.orders ?? 0)}</strong><span className="text-xs text-ink-muted">{filtersLabel(report)}</span></div>
        <div className="rounded-btn bg-secondary px-4 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Average order</span><strong className="mt-1 block tnums text-lg text-primary">{moneyWhen(row?.averageOrder ?? 0, row?.orders ?? 0)}</strong><span className="text-xs text-ink-muted">Current period</span></div>
        <div className="rounded-btn bg-secondary px-4 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Payment leader</span><strong className="mt-1 block text-lg text-primary">{paymentLeader ? paymentLabel(paymentLeader.method) : "—"}</strong><span className="text-xs text-ink-muted">By net sales</span></div>
        <div className="rounded-btn bg-secondary px-4 py-3"><span className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Stock signal</span><strong className="mt-1 block text-lg text-primary">{health ? `${integer(health.outOfStockCount)} out` : "—"}</strong><span className="text-xs text-ink-muted">{health ? `${integer(health.lowStockCount)} low stock` : "Health unavailable"}</span></div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-card border border-line bg-surface-raised p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-extrabold text-ink">Top items</h3><p className="mt-1 text-xs text-ink-muted">Item sales from completed orders in this period.</p></div><div className="flex flex-wrap gap-3"><Link href={`/admin/reports?branch=${encodeURIComponent(detail.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Open reports</Link><Link href={`/admin/orders?branch=${encodeURIComponent(detail.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Open orders</Link></div></div>{detail.itemRows.length === 0 ? <div className="mt-4"><EmptyReportState title="No item detail" detail="Order items will appear once this branch has completed sales." /></div> : <div className="mt-3 overflow-x-auto"><table className="admin-list-table min-w-[520px]"><thead><tr><th>Item</th><th>Qty</th><th>Orders</th><th>Net sales</th></tr></thead><tbody>{detail.itemRows.slice(0, 8).map((item) => <tr key={`${item.name}-${item.unit}`}><td className="font-extrabold">{item.name}<span className="ml-1 text-[10px] font-semibold text-ink-muted">/{item.unit}</span></td><td className="tnums">{quantity(item.qty)}</td><td className="tnums">{integer(item.orders)}</td><td className="tnums font-extrabold">{money(item.netSales)}</td></tr>)}</tbody></table></div>}</div>
        <div className="rounded-card border border-line bg-surface-raised p-4"><h3 className="text-sm font-extrabold text-ink">Category mix</h3><p className="mt-1 text-xs text-ink-muted">Contribution to this branch&apos;s net sales.</p>{detail.categoryRows.length === 0 ? <div className="mt-4"><EmptyReportState title="No category detail" detail="Categories will appear once completed order items are available." /></div> : <div className="mt-4 space-y-4">{detail.categoryRows.slice(0, 8).map((category) => <div key={`${category.name}-${category.unit}`}><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-extrabold">{category.name}</span><span className="tnums shrink-0 font-extrabold">{money(category.netSales)} · {percent(category.share)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-secondary"><div className="h-full rounded-pill bg-accent" style={{ width: `${Math.max((category.netSales / categoryMax) * 100, category.netSales > 0 ? 3 : 0)}%` }} /></div></div>)}</div>}</div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="rounded-card border border-line bg-surface-raised p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold text-ink">Peak trading hours</h3><p className="mt-1 text-xs text-ink-muted">Singapore local time · darker cells indicate more net sales.</p></div>{detail.peakHour && <span className="rounded-pill bg-primary-soft px-3 py-2 text-xs font-extrabold text-primary">Peak: {weekdayName(detail.peakHour.weekday)} {hourLabel(detail.peakHour.hour)}</span>}</div><HourHeatmap report={report} /></div>
        <div className="rounded-card border border-line bg-surface-raised p-4"><h3 className="text-sm font-extrabold text-ink">Payment mix</h3><p className="mt-1 text-xs text-ink-muted">Branch-level payment behavior.</p><div className="mt-4 space-y-3">{(row?.payments ?? []).map((payment) => <div key={payment.method}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-extrabold">{paymentLabel(payment.method)}</span><span className="tnums text-ink-muted">{money(payment.netSales)} · {percent(payment.share)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-secondary"><div className="h-full rounded-pill" style={{ width: `${payment.share}%`, background: PAYMENT_COLORS[payment.method] }} /></div></div>)}</div></div>
      </div>

      <div className="mt-4 rounded-card border border-line bg-surface-raised p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-extrabold text-ink">Recent closeouts</h3><p className="mt-1 text-xs text-ink-muted">Z-readings and declared-cash variances from the branch.</p></div><div className="flex flex-wrap gap-3"><Link href={`/admin/inventory?branch=${encodeURIComponent(detail.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Open inventory</Link><Link href={`/admin/shifts?branch=${encodeURIComponent(detail.branchId)}`} className="text-xs font-extrabold text-primary hover:underline">Open shifts</Link></div></div>{detail.closeouts.length === 0 ? <div className="mt-4"><EmptyReportState title="No closeouts recorded" detail="Review shifts and Z-readings if this branch should be closing out daily." /></div> : <div className="mt-3 overflow-x-auto"><table className="admin-list-table min-w-[720px]"><thead><tr><th>Z number</th><th>Business date</th><th>Closed</th><th>Net sales</th><th>Declared cash</th><th>Variance</th></tr></thead><tbody>{detail.closeouts.map((closeout) => <tr key={closeout.id}><td className="tnums font-extrabold">#{integer(closeout.zNumber)}</td><td>{calendarDate(closeout.businessDate)}</td><td className="whitespace-nowrap">{dateTime(closeout.closedAt || closeout.generatedAt)}</td><td className="tnums">{money(closeout.netSales)}</td><td className="tnums">{money(closeout.declaredCash)}</td><td className={`tnums font-extrabold ${closeout.cashVariance === 0 ? "text-success" : "text-danger"}`}>{money(closeout.cashVariance)}</td></tr>)}</tbody></table></div>}</div>
    </Panel>
    </div>
  );
}

function filtersLabel(report: BranchPerformanceData) {
  return `${calendarDate(report.filters.from)} – ${calendarDate(report.filters.to)}`;
}

function weekdayName(weekday: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday] ?? "";
}
