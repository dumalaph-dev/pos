import { getAdminProfile } from "@/lib/admin/profile";
import {
  loadSalesReport,
  readSalesReportFilters,
  weekdayLabel,
  type SalesReportData,
} from "@/lib/admin/sales-reports";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type ProfileRecord = {
  role: "admin" | "manager" | "cashier" | null;
  org_id: string;
  store_id: string | null;
};

type ExportKind = "summary" | "periods" | "items" | "categories" | "cashiers" | "branches" | "discounts" | "hourly";

const EXPORT_KINDS: ExportKind[] = ["summary", "periods", "items", "categories", "cashiers", "branches", "discounts", "hourly"];

/**
 * Guards against CSV formula injection: a leading =, +, - or @ is what makes a
 * spreadsheet treat a product name as an expression.
 */
function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(kind: ExportKind, report: SalesReportData, rows: unknown[][]) {
  const dateLabel = `${report.filters.from.replaceAll("-", "")}-to-${report.filters.to.replaceAll("-", "")}`;
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`﻿${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-${kind}-${dateLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// Money stays in centavos so a spreadsheet never inherits a rounding decision
// the app did not make. Every export labels the unit in its header.
function exportSummary(report: SalesReportData) {
  const t = report.totals;
  return [
    ["Metric", "Value"],
    ["Branch scope", report.branchName],
    ["From", report.filters.from],
    ["To", report.filters.to],
    ["Orders", t.orderCount],
    ["Gross sales centavos", t.grossSales],
    ["Discounts centavos", t.discountTotal],
    ["Net sales centavos", t.netSales],
    ["Average order centavos", t.averageOrder],
    ["VATable sale centavos", t.vatableSale],
    ["VAT centavos", t.vatAmount],
    ["VAT-exempt sale centavos", t.vatExemptSale],
    ["Discounted orders", t.discountedOrderCount],
    ["Voids", t.voidCount],
    ["Voided centavos", t.voidTotal],
    ["Refunds", t.refundCount],
    ["Refunded centavos", t.refundTotal],
    ["Quantity sold", t.qtySold],
    ["Kg sold", t.kgSold],
  ];
}

function exportPeriods(report: SalesReportData) {
  return [
    ["Period", "Label", "Orders", "Net sales centavos", "Discounts centavos", "Average order centavos"],
    ...report.periodRows.map((row) => [row.key, row.label, row.orders, row.netSales, row.discountTotal, row.averageOrder]),
  ];
}

function exportItems(report: SalesReportData) {
  return [
    ["Item", "Unit", "Quantity sold", "Orders", "Net sales centavos", "Share percent"],
    ...report.itemRows.map((row) => [row.name, row.unit, row.qty, row.orders, row.netSales, row.share]),
  ];
}

function exportCategories(report: SalesReportData) {
  return [
    ["Category", "Unit", "Quantity sold", "Net sales centavos", "Share percent"],
    ...report.categoryRows.map((row) => [row.name, row.unit, row.qty, row.netSales, row.share]),
  ];
}

function exportCashiers(report: SalesReportData) {
  return [
    ["Cashier", "Orders", "Net sales centavos", "Discounts centavos", "Average order centavos", "Voids", "Refunds", "Share percent"],
    ...report.cashierRows.map((row) => [row.name, row.orders, row.netSales, row.discountTotal, row.averageOrder, row.voidCount, row.refundCount, row.share]),
  ];
}

function exportBranches(report: SalesReportData) {
  return [
    ["Branch", "Active", "Orders", "Net sales centavos", "Discounts centavos", "Average order centavos", "Share percent"],
    ...report.branchRows.map((row) => [row.name, row.isActive ? "yes" : "no", row.orders, row.netSales, row.discountTotal, row.averageOrder, row.share]),
  ];
}

function exportDiscounts(report: SalesReportData) {
  return [
    ["Discount type", "Orders", "Discount centavos", "Net sales centavos"],
    ...report.discountRows.map((row) => [row.label, row.orders, row.discountTotal, row.netSales]),
  ];
}

function exportHourly(report: SalesReportData) {
  const sorted = [...report.hourCells].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
  return [
    ["Weekday", "Hour", "Orders", "Net sales centavos"],
    ...sorted.map((cell) => [weekdayLabel(cell.weekday), `${String(cell.hour).padStart(2, "0")}:00`, cell.orders, cell.netSales]),
  ];
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const profile = (await getAdminProfile(user.id)) as ProfileRecord | null;
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "";
  const kind: ExportKind = EXPORT_KINDS.includes(kindParam as ExportKind) ? (kindParam as ExportKind) : "summary";

  const report = await loadSalesReport(
    await createClient(),
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    readSalesReportFilters(url.searchParams),
  );

  // A partial export is worse than none: the caller would reconcile against a
  // silently truncated file and never know the totals were short.
  if (report.truncated) {
    return new Response("This report exceeds the export row limit. Narrow the date range and try again.", { status: 413 });
  }

  if (kind === "periods") return csvResponse(kind, report, exportPeriods(report));
  if (kind === "items") return csvResponse(kind, report, exportItems(report));
  if (kind === "categories") return csvResponse(kind, report, exportCategories(report));
  if (kind === "cashiers") return csvResponse(kind, report, exportCashiers(report));
  if (kind === "branches") return csvResponse(kind, report, exportBranches(report));
  if (kind === "discounts") return csvResponse(kind, report, exportDiscounts(report));
  if (kind === "hourly") return csvResponse(kind, report, exportHourly(report));
  return csvResponse(kind, report, exportSummary(report));
}
