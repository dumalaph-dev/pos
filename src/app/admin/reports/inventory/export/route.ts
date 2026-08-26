import { getAdminProfile } from "@/lib/admin/profile";
import { readAdminInventorySettings } from "@/lib/admin/inventory-settings";
import {
  loadInventoryReport,
  readInventoryReportFilters,
  type InventoryReportData,
} from "@/lib/admin/inventory-reports";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type ProfileRecord = {
  role: "admin" | "manager" | "cashier" | null;
  org_id: string;
  store_id: string | null;
  organizations: { settings?: unknown } | null;
};

type ExportKind = "inventory" | "movements" | "variance";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(kind: ExportKind, report: InventoryReportData, rows: unknown[][]) {
  const dateLabel = `${report.filters.from.replaceAll("-", "")}-to-${report.filters.to.replaceAll("-", "")}`;
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${dateLabel}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function exportInventory(report: InventoryReportData) {
  return [
    ["Branch", "Inventory item", "Category", "Supplier", "Unit", "On hand", "Minimum", "Status", "Estimated value centavos"],
    ...report.inventoryRows.map((row) => [row.branchName, row.productName, row.categoryName, row.supplierName, row.unit, row.onHand, row.minimum, row.status, Math.round(row.inventoryValue)]),
  ];
}

function exportMovements(report: InventoryReportData) {
  return [
    ["Created at", "Branch", "Inventory item", "Category", "Supplier", "Movement", "Quantity", "Unit", "Net change", "Reason"],
    ...report.movementRows.map((row) => [row.createdAt, row.branchName, row.productName, row.categoryName, row.supplierName, row.typeLabel, row.quantity, row.unit, row.netChange, row.reason]),
  ];
}

function exportVariance(report: InventoryReportData) {
  return [
    ["Business date", "Updated at", "Branch", "Inventory item", "Category", "Supplier", "Unit", "Expected", "Counted", "Variance", "Status"],
    ...report.varianceRows.map((row) => [row.countDate, row.updatedAt, row.branchName, row.productName, row.categoryName, row.supplierName, row.unit, row.expected, row.counted, row.variance, row.status]),
  ];
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (!profile || (profile.role !== "admin" && profile.role !== "manager")) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind: ExportKind = kindParam === "movements" || kindParam === "variance" ? kindParam : "inventory";
  const report = await loadInventoryReport(
    await createClient(),
    { org_id: profile.org_id, role: profile.role, store_id: profile.store_id },
    readInventoryReportFilters(url.searchParams),
    readAdminInventorySettings(profile.organizations?.settings).defaultLowStockThreshold,
  );

  if (kind === "movements") return csvResponse(kind, report, exportMovements(report));
  if (kind === "variance") return csvResponse(kind, report, exportVariance(report));
  return csvResponse(kind, report, exportInventory(report));
}
