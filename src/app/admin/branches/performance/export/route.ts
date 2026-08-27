import { NextResponse } from "next/server";
import { loadBranchPerformanceReport, readBranchPerformanceFilters } from "@/lib/admin/branch-performance";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type ExportKind = "summary" | "trend" | "payments" | "operations";

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function kindOf(value: string | null): ExportKind {
  return value === "trend" || value === "payments" || value === "operations" ? value : "summary";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getAdminProfile(user.id) as { org_id: string; role: "admin" | "manager" | "cashier" | null; store_id: string | null } | null;
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const report = await loadBranchPerformanceReport(
    supabase,
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    readBranchPerformanceFilters(url.searchParams),
  );
  if (report.truncated) return NextResponse.json({ error: "Narrow the report before exporting; the current result reached a row limit." }, { status: 409 });

  const kind = kindOf(url.searchParams.get("kind"));
  const rows: Array<Array<string | number | boolean | null | undefined>> = [];
  if (kind === "trend") {
    rows.push(["Period", "Net sales centavos", "Orders", "Previous net sales centavos", "Previous orders"]);
    for (const row of report.periodRows) rows.push([row.label, row.netSales, row.orders, row.previousNetSales, row.previousOrders]);
  } else if (kind === "payments") {
    rows.push(["Branch", "Payment method", "Orders", "Net sales centavos", "Share percent"]);
    for (const branch of report.branchRows) for (const payment of branch.payments) rows.push([branch.name, payment.method, payment.orders, payment.netSales, payment.share]);
  } else if (kind === "operations") {
    rows.push(["Branch", "Status", "Active devices", "Devices", "Active staff", "Tracked items", "Out of stock", "Low stock", "Latest closeout", "Cash variance centavos", "Signals"]);
    for (const row of report.healthRows) rows.push([row.name, row.status, row.activeDevices, row.deviceCount, row.activeStaff, row.trackedItems, row.outOfStockCount, row.lowStockCount, row.latestCloseoutAt, row.latestCloseoutVariance, row.reasons.join(" | ")]);
  } else {
    rows.push(["Branch", "Active", "Orders", "Net sales centavos", "Previous net sales centavos", "Change percent", "Average order centavos", "Sales share percent", "Discount centavos", "Discount rate percent", "Reversals", "Reversal centavos"]);
    for (const row of report.tableRows) rows.push([row.name, row.isActive, row.orders, row.netSales, row.previousNetSales, row.change, row.averageOrder, row.salesShare, row.discountTotal, row.discountRate, row.reversalCount, row.reversalTotal]);
  }

  const dateLabel = `${report.filters.from}-to-${report.filters.to}`;
  return new NextResponse(`\uFEFF${csv(rows)}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="branch-performance-${kind}-${dateLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
