"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { OverlayDialog } from "@/components/ui/OverlayLayer";
import { formatPeso } from "@/lib/money";
import { varianceLabel } from "@/lib/shifts";
import type { DashboardShiftReport } from "@/lib/admin/shift-reports";

const DATE_FORMAT = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Singapore",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const CLOCK_FORMAT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Singapore",
});

const displayPeso = (centavos: number) => formatPeso(Number(centavos)).replace(/\.00$/, "");

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME_FORMAT.format(date);
}

function formatClock(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : CLOCK_FORMAT.format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(value);
}

function reportLabel(report: DashboardShiftReport) {
  return report.reading.shiftNo ?? `Shift ${report.shiftId.slice(0, 8)}`;
}

export function DailySalesReportPanel({
  reports,
  salesReportHref,
  shiftReportsHref,
}: {
  reports: DashboardShiftReport[];
  salesReportHref: string;
  shiftReportsHref: string;
}) {
  const [selectedReport, setSelectedReport] = useState<DashboardShiftReport | null>(null);
  const summary = useMemo(() => {
    const totals = {
      netSales: 0,
      orderCount: 0,
      qtySold: 0,
      cash: 0,
      eWallet: 0,
      card: 0,
      variance: 0,
    };

    for (const report of reports) {
      totals.netSales += report.reading.netSales;
      totals.orderCount += report.reading.orderCount;
      totals.qtySold += report.reading.qtySold;
      totals.cash += report.reading.cashSales;
      totals.eWallet += report.reading.gcashSales + report.reading.mayaSales;
      totals.card += report.reading.cardSales;
      totals.variance += report.reading.cashVariance ?? 0;
    }

    return totals;
  }, [reports]);

  const latestReport = reports[0] ?? null;
  const totalTender = summary.cash + summary.eWallet + summary.card;
  const summaryVariance = reports.length > 0 ? summary.variance : null;

  return (
    <>
      <section aria-labelledby="today-report-heading" className="admin-panel min-w-0 p-5">
        <div className="admin-panel__header items-start">
          <div>
            <p className="admin-panel__eyebrow">Automatic closeout</p>
            <h2 id="today-report-heading" className="admin-panel__title">Today&apos;s Sales Report</h2>
            <p className="admin-panel__subtitle">Each closed shift is saved here as a sealed report.</p>
          </div>
          <Link
            href={salesReportHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-btn border border-line bg-surface px-2.5 py-2 text-[10px] font-extrabold text-primary transition hover:border-line-strong hover:bg-primary-soft"
          >
            Full report <AdminIcon name="arrow" size={12} />
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ReportSummaryMetric icon="wallet" label="Net sales" value={displayPeso(summary.netSales)} detail={`${reports.length} shift${reports.length === 1 ? "" : "s"} closed`} tone="bg-primary-soft text-primary" />
          <ReportSummaryMetric icon="bag" label="Orders" value={String(summary.orderCount)} detail={`${formatQuantity(summary.qtySold)} items sold`} tone="bg-success/10 text-success" />
          <ReportSummaryMetric icon="check" label="Cash variance" value={summaryVariance === null ? "—" : varianceLabel(summaryVariance, displayPeso)} detail={summaryVariance === 0 ? "Balanced" : "Across closed shifts"} tone={summaryVariance === null || summaryVariance === 0 ? "bg-success/10 text-success" : "bg-warning/15 text-warning"} />
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Shift reports</p>
              <p className="mt-1 text-xs text-ink-muted">Click any report to inspect the complete closeout.</p>
            </div>
            {reports.length > 3 && <span className="text-[10px] font-extrabold text-ink-muted">+{reports.length - 3} more</span>}
          </div>

          {reports.length === 0 ? (
            <div className="mt-3 rounded-card border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="reports" size={17} /></span>
              <p className="mt-3 text-sm font-extrabold text-ink">No shift report yet</p>
              <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-ink-muted">The first report will appear automatically when a cashier closes a shift.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {reports.slice(0, 3).map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedReport(report)}
                  className="group flex w-full items-center gap-3 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-left transition hover:border-primary/35 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label={`Open sales report for ${reportLabel(report)}`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-success/10 text-success"><AdminIcon name="reports" size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs font-extrabold text-ink">{reportLabel(report)}</strong>
                    <small className="mt-1 block truncate text-[10px] text-ink-muted">{report.cashierName} · Closed {formatClock(report.reading.closedAt)}{report.branchName ? ` · ${report.branchName}` : ""}</small>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="tnums block text-xs font-extrabold text-ink">{displayPeso(report.reading.netSales)}</strong>
                    <small className="mt-1 flex items-center justify-end gap-1 text-[10px] font-extrabold text-primary opacity-80 transition group-hover:opacity-100">View <AdminIcon name="arrow" size={11} /></small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Tender mix</p>
            <span className="text-[10px] font-semibold text-ink-muted">{totalTender ? displayPeso(totalTender) : "₱0"}</span>
          </div>
          <div className="mt-3 grid gap-3">
            <TenderBar label="Cash" value={summary.cash} total={totalTender} tone="bg-primary" />
            <TenderBar label="E-wallet" value={summary.eWallet} total={totalTender} tone="bg-success" />
            <TenderBar label="Card" value={summary.card} total={totalTender} tone="bg-accent" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[10px] text-ink-muted">{latestReport ? `Latest: ${formatDate(latestReport.businessDate)}` : "Reports are ready after closeout"}</span>
          <Link href={shiftReportsHref} className="text-[10px] font-extrabold text-primary hover:underline">View shift history <AdminIcon name="arrow" size={11} /></Link>
        </div>
      </section>

      {selectedReport && <ShiftSalesReportDialog report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </>
  );
}

function ReportSummaryMetric({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: AdminIconName;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-btn border border-line bg-surface-raised px-3 py-2.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}><AdminIcon name={icon} size={15} /></span>
      <span className="min-w-0">
        <small className="block truncate text-[10px] font-semibold text-ink-muted">{label}</small>
        <strong className="tnums mt-0.5 block truncate text-sm font-extrabold text-ink">{value}</strong>
        <small className="mt-0.5 block truncate text-[9px] text-ink-muted">{detail}</small>
      </span>
    </div>
  );
}

function TenderBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-2 font-extrabold text-ink"><i className={`h-2.5 w-2.5 rounded-full ${tone}`} />{label}</span>
        <span className="text-right"><strong className="tnums font-extrabold text-ink">{displayPeso(value)}</strong><small className="ml-1.5 text-[10px] text-ink-muted">{share}%</small></span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${share}%` }} /></div>
    </div>
  );
}

function ShiftSalesReportDialog({ report, onClose }: { report: DashboardShiftReport; onClose: () => void }) {
  const { reading } = report;
  const titleId = `dashboard-report-title-${report.id}`;
  const descriptionId = `dashboard-report-description-${report.id}`;
  const detailRows: Array<[string, string]> = [
    ["Gross sales", displayPeso(reading.grossSales)],
    [`Discounts (${reading.discountedOrderCount})`, `−${displayPeso(reading.discountTotal)}`],
    ["VATable sale", displayPeso(reading.vatableSale)],
    ["VAT collected", displayPeso(reading.vatAmount)],
    ["VAT-exempt sale", displayPeso(reading.vatExemptSale)],
    ["Items sold", formatQuantity(reading.qtySold)],
    ["Kg sold", reading.kgSold.toFixed(2)],
  ];
  const tenderRows = [
    ["Cash", reading.cashSales, "bg-primary"],
    ["GCash", reading.gcashSales, "bg-success"],
    ["Maya", reading.mayaSales, "bg-success"],
    ["Card", reading.cardSales, "bg-accent"],
  ] as const;
  const tenderTotal = tenderRows.reduce((sum, [, value]) => sum + value, 0);
  const cashRows: Array<[string, string]> = [
    ["Opening float", displayPeso(reading.openingCash)],
    ["Expected cash", displayPeso(reading.expectedCash)],
    ["Counted cash", reading.declaredCash === null ? "Not counted" : displayPeso(reading.declaredCash)],
    ["Cash variance", varianceLabel(reading.cashVariance, displayPeso)],
    ["Voids", `${reading.voidCount} · ${displayPeso(reading.voidTotal)}`],
    ["Refunds", `${reading.refundCount} · ${displayPeso(reading.refundTotal)}`],
  ];

  return (
    <OverlayDialog
      onClose={onClose}
      titleId={titleId}
      descriptionId={descriptionId}
      backdropClassName="fixed inset-0 flex min-h-full items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:p-6"
      dialogClassName="my-2 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-card bg-raised shadow-[var(--shadow-pop)] sm:my-6"
      initialFocusSelector="[data-dialog-autofocus]"
    >
      <div className="p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="admin-panel__eyebrow text-success">Automatic daily report</p>
              <span className="rounded-pill bg-success/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-success">Sealed</span>
              <span className="rounded-pill bg-secondary px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">Z #{report.zNumber}</span>
            </div>
            <h2 id={titleId} className="mt-2 truncate text-2xl font-extrabold tracking-[-0.04em] text-ink sm:text-3xl">{reportLabel(report)}</h2>
            <p className="mt-1 text-sm text-ink-muted">{report.branchName} · {report.cashierName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-dialog-autofocus
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close daily sales report"
          >
            <AdminIcon name="close" size={16} />
          </button>
        </header>

        <p id={descriptionId} className="mt-3 text-xs text-ink-muted">Business date {formatDate(report.businessDate)} · {formatDateTime(reading.openedAt)} to {formatClock(reading.closedAt)} · generated {formatDateTime(report.generatedAt)}</p>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <DialogMetric label="Net sales" value={displayPeso(reading.netSales)} emphasis />
          <DialogMetric label="Orders" value={String(reading.orderCount)} />
          <DialogMetric label="Cash variance" value={varianceLabel(reading.cashVariance, displayPeso)} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ReportDetailSection title="Sales breakdown" eyebrow="Revenue">
            <DetailRows rows={detailRows} />
          </ReportDetailSection>
          <ReportDetailSection title="Tender mix" eyebrow="Payments">
            <div className="grid gap-3">
              {tenderRows.map(([label, value, tone]) => <TenderBar key={label} label={label} value={value} total={tenderTotal} tone={tone} />)}
            </div>
            <div className="mt-4 border-t border-line pt-3"><DetailRow label="Total tender" value={displayPeso(tenderTotal)} emphasis /></div>
          </ReportDetailSection>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ReportDetailSection title="Cash control" eyebrow="Drawer reconciliation">
            <DetailRows rows={cashRows} emphasizeLast />
          </ReportDetailSection>
          <ReportDetailSection title="Closeout notes" eyebrow="Audit context">
            <div className="rounded-btn border border-line bg-surface-raised px-3 py-3 text-sm leading-6 text-ink-muted">
              {report.note || reading.note ? <><strong className="block text-xs font-extrabold uppercase tracking-wide text-ink">Shift note</strong><span className="mt-1 block">{report.note || reading.note}</span></> : <span>No note was added to this closeout.</span>}
            </div>
            <div className="mt-3"><DetailRow label="Branch grand total" value={displayPeso(report.grandTotalAfter)} /></div>
          </ReportDetailSection>
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-[10px] text-ink-muted">This report is immutable and tied to the closed shift.</span>
          <button type="button" onClick={onClose} className="rounded-btn bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Done</button>
        </footer>
      </div>
    </OverlayDialog>
  );
}

function DialogMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="rounded-btn border border-line bg-surface-raised px-3 py-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-muted">{label}</p><p className={`tnums mt-1 text-lg font-extrabold ${emphasis ? "text-primary" : "text-ink"}`}>{value}</p></div>;
}

function ReportDetailSection({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="rounded-card border border-line bg-surface-raised p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent">{eyebrow}</p><h3 className="mt-1 text-sm font-extrabold text-ink">{title}</h3><div className="mt-3">{children}</div></section>;
}

function DetailRows({ rows, emphasizeLast = false }: { rows: Array<[string, string]>; emphasizeLast?: boolean }) {
  return <div className="divide-y divide-line/70">{rows.map(([label, value], index) => <DetailRow key={label} label={label} value={value} emphasis={emphasizeLast && index === rows.length - 1} />)}</div>;
}

function DetailRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><span className={`text-xs ${emphasis ? "font-extrabold text-ink" : "text-ink-muted"}`}>{label}</span><strong className={`tnums text-xs ${emphasis ? "font-extrabold text-primary" : "font-semibold text-ink"}`}>{value}</strong></div>;
}
