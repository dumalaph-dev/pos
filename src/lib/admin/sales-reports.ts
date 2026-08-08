/**
 * P8 sales reporting. One reversal-aware aggregation feeding the Reports page
 * and its CSV exports.
 *
 * Correctness note that shapes everything below: a void or refund (0020) does
 * not mutate the original sale. It inserts a linked reversal row and leaves the
 * original at `completed`. Filtering on `status = 'completed'` therefore counts
 * voided sales as revenue, which is what this module exists to avoid — the
 * shift readings in `0024` already exclude them, and the two views must agree
 * about the same day or the owner stops trusting both.
 *
 * A reversal can be recorded after the reporting window closes, so the reversal
 * lookup is keyed on the order ids in range rather than on a date filter.
 */
import type { createClient } from "@/lib/supabase/server";
import { getSelectedAdminBranchId, type AdminBranchOption } from "@/lib/admin/branch-context";
import { salesQuantity } from "@/lib/inventory";

const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_ROW_LIMIT = 10000;
const ITEM_ROW_LIMIT = 20000;

export type SalesReportClient = Awaited<ReturnType<typeof createClient>>;
export type SalesReportParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type SalesPaymentMethod = "cash" | "gcash" | "maya" | "card";
export type SalesDiscountType = "none" | "senior" | "pwd" | "custom";
export type SalesGrouping = "day" | "week" | "month";

export const SALES_PAYMENT_METHODS: SalesPaymentMethod[] = ["cash", "gcash", "maya", "card"];
export const SALES_GROUPINGS: SalesGrouping[] = ["day", "week", "month"];

export type SalesReportFilters = {
  from: string;
  to: string;
  branchId: string;
  cashierId: string;
  paymentMethod: string;
  grouping: SalesGrouping;
};

export type SalesReportProfile = {
  org_id: string;
  role: "admin" | "manager";
  store_id: string | null;
};

export type SalesReportTotals = {
  orderCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  vatableSale: number;
  vatAmount: number;
  vatExemptSale: number;
  averageOrder: number;
  qtySold: number;
  kgSold: number;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;
  discountedOrderCount: number;
};

export type SalesPeriodRow = { key: string; label: string; orders: number; netSales: number; discountTotal: number; averageOrder: number };
export type SalesPaymentRow = { method: SalesPaymentMethod; orders: number; netSales: number; share: number };
export type SalesItemRow = { name: string; unit: string; qty: number; netSales: number; orders: number; share: number };
export type SalesCategoryRow = { name: string; unit: string; qty: number; netSales: number; share: number };
export type SalesCashierRow = { cashierId: string; name: string; orders: number; netSales: number; discountTotal: number; averageOrder: number; voidCount: number; refundCount: number; share: number };
export type SalesBranchRow = { branchId: string; name: string; isActive: boolean; orders: number; netSales: number; discountTotal: number; averageOrder: number; share: number };
export type SalesDiscountRow = { type: SalesDiscountType; label: string; orders: number; discountTotal: number; netSales: number };
export type SalesHourCell = { weekday: number; hour: number; orders: number; netSales: number };
export type SalesReportReconciliation = {
  rawSaleCandidateCount: number;
  rawReversalCount: number;
  netOrderCount: number;
  rawGrossSales: number;
  rawNetSales: number;
  summaryGrossSales: number;
  summaryNetSales: number;
  balanced: boolean;
};

export type SalesReportData = {
  filters: SalesReportFilters;
  branches: AdminBranchOption[];
  cashiers: Array<{ id: string; name: string }>;
  totals: SalesReportTotals;
  periodRows: SalesPeriodRow[];
  paymentRows: SalesPaymentRow[];
  itemRows: SalesItemRow[];
  categoryRows: SalesCategoryRow[];
  cashierRows: SalesCashierRow[];
  branchRows: SalesBranchRow[];
  discountRows: SalesDiscountRow[];
  hourCells: SalesHourCell[];
  peakHour: SalesHourCell | null;
  reconciliation: SalesReportReconciliation;
  branchName: string;
  canCompareBranches: boolean;
  queryWarning: boolean;
  truncated: boolean;
};

type OrderRecord = {
  id: string;
  store_id: string;
  cashier_id: string;
  status: "completed" | "voided" | "refunded";
  subtotal: number | string;
  discount_type: SalesDiscountType;
  discount_amount: number | string;
  vatable_sale: number | string;
  vat_amount: number | string;
  vat_exempt_sale: number | string;
  total: number | string;
  payment_method: SalesPaymentMethod;
  created_at: string;
  reversal_of: string | null;
};

type OrderItemRecord = {
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number | string;
  weight_kg: number | string | null;
  line_total: number | string;
};

type ProductRecord = { id: string; store_id: string; category_id: string | null; unit: string };
type CategoryRecord = { id: string; name: string };

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DISCOUNT_LABELS: Record<SalesDiscountType, string> = {
  none: "No discount",
  senior: "Senior citizen",
  pwd: "PWD",
  custom: "Custom percentage",
};

export function discountLabel(type: SalesDiscountType) {
  return DISCOUNT_LABELS[type] ?? type;
}

export function weekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[weekday] ?? "";
}

function num(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function readParam(source: SalesReportParamSource, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) ?? "";
  const value = source[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isValidDate(value: string) {
  if (!VALID_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Asia/Singapore is UTC+8 year-round with no daylight saving, so shifting the
 * instant and reading UTC parts is exact and avoids running an Intl formatter
 * once per order across a 10k-row report.
 */
function singaporeParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + SINGAPORE_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
    time: shifted.getTime(),
  };
}

function singaporeDate(value = new Date()) {
  return new Date(value.getTime() + SINGAPORE_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftSingaporeDate(value: string, days: number) {
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function reportDateStart(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

function reportDateEnd(value: string) {
  return new Date(new Date(`${value}T00:00:00+08:00`).getTime() + DAY_MS);
}

export function readSalesReportFilters(source: SalesReportParamSource, now = new Date()): SalesReportFilters {
  const toDefault = singaporeDate(now);
  const fromDefault = shiftSingaporeDate(toDefault, -6);
  const fromParam = readParam(source, "from");
  const toParam = readParam(source, "to");
  const rawFrom = isValidDate(fromParam) ? fromParam : fromDefault;
  const rawTo = isValidDate(toParam) ? toParam : toDefault;
  const groupingParam = readParam(source, "grouping");
  const paymentParam = readParam(source, "payment");

  return {
    from: rawFrom <= rawTo ? rawFrom : rawTo,
    to: rawFrom <= rawTo ? rawTo : rawFrom,
    branchId: readParam(source, "branch"),
    cashierId: readParam(source, "cashier"),
    paymentMethod: SALES_PAYMENT_METHODS.includes(paymentParam as SalesPaymentMethod) ? paymentParam : "",
    grouping: SALES_GROUPINGS.includes(groupingParam as SalesGrouping) ? (groupingParam as SalesGrouping) : "day",
  };
}

export function salesReportQuery(filters: SalesReportFilters, kind?: string) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.branchId) params.set("branch", filters.branchId);
  if (filters.cashierId) params.set("cashier", filters.cashierId);
  if (filters.paymentMethod) params.set("payment", filters.paymentMethod);
  if (filters.grouping !== "day") params.set("grouping", filters.grouping);
  if (kind) params.set("kind", kind);
  return params.toString();
}

export type ReversibleOrder = { id: string; status: string; reversal_of?: string | null };

/**
 * The ids of orders that have since been voided or refunded.
 *
 * Keyed on order ids rather than a date filter because a reversal can be
 * recorded long after the sale — filtering reversals by the reporting window
 * would let a sale voided next week still count as revenue this week.
 *
 * `failed` is surfaced instead of swallowed: falling back to "nothing was
 * reversed" would silently overstate revenue, which is the exact bug this
 * helper exists to prevent.
 */
export async function loadReversedOrderIds(
  supabase: SalesReportClient,
  orgId: string,
  orderIds: string[],
): Promise<{ reversedIds: Set<string>; failed: boolean }> {
  const reversedIds = new Set<string>();
  if (orderIds.length === 0) return { reversedIds, failed: false };

  for (let index = 0; index < orderIds.length; index += 300) {
    const chunk = orderIds.slice(index, index + 300);
    const { data, error } = await supabase
      .from("orders")
      .select("reversal_of")
      .eq("org_id", orgId)
      .in("reversal_of", chunk);
    if (error) return { reversedIds, failed: true };
    for (const row of (data ?? []) as Array<{ reversal_of: string | null }>) {
      if (row.reversal_of) reversedIds.add(row.reversal_of);
    }
  }

  return { reversedIds, failed: false };
}

/** Completed sales that are not themselves reversals and have not been reversed. */
export function selectNetSales<T extends ReversibleOrder>(orders: T[], reversedIds: Set<string>): T[] {
  return orders.filter(
    (order) => order.status === "completed" && !order.reversal_of && !reversedIds.has(order.id),
  );
}

/** The reversal rows themselves — what a void/refund report counts. */
export function selectReversals<T extends ReversibleOrder>(orders: T[]): T[] {
  return orders.filter((order) => Boolean(order.reversal_of));
}

function resolveBranchFilter(
  requestedBranchId: string,
  workspaceBranchId: string | null,
  profile: SalesReportProfile,
  branches: AdminBranchOption[],
) {
  if (profile.role === "manager") return profile.store_id ?? "";
  if (workspaceBranchId) return workspaceBranchId;
  return branches.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : "";
}

/** Bucket key + human label for the selected grouping, in Singapore time. */
function periodBucket(iso: string, grouping: SalesGrouping) {
  const parts = singaporeParts(iso);
  const pad = (value: number) => String(value).padStart(2, "0");

  if (grouping === "month") {
    const key = `${parts.year}-${pad(parts.month)}`;
    const label = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
    return { key, label };
  }

  if (grouping === "week") {
    // Week starts Monday. `weekday` is 0=Sunday, so Sunday steps back six days.
    const offset = (parts.weekday + 6) % 7;
    const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset * DAY_MS);
    const key = monday.toISOString().slice(0, 10);
    const label = `Wk of ${new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", timeZone: "UTC" }).format(monday)}`;
    return { key, label };
  }

  const key = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  const label = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  return { key, label };
}

function share(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function average(total: number, count: number) {
  return count > 0 ? Math.round(total / count) : 0;
}

export async function loadSalesReport(
  supabase: SalesReportClient,
  profile: SalesReportProfile,
  requestedFilters: SalesReportFilters,
): Promise<SalesReportData> {
  const branchesResult = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .order("name");
  const branches = (branchesResult.data ?? []) as AdminBranchOption[];
  const workspaceBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const branchId = resolveBranchFilter(requestedFilters.branchId, workspaceBranchId, profile, branches);
  const filters: SalesReportFilters = { ...requestedFilters, branchId };

  const rangeStart = reportDateStart(filters.from).toISOString();
  const rangeEnd = reportDateEnd(filters.to).toISOString();

  let ordersQuery = supabase
    .from("orders")
    .select("id, store_id, cashier_id, status, subtotal, discount_type, discount_amount, vatable_sale, vat_amount, vat_exempt_sale, total, payment_method, created_at, reversal_of")
    .eq("org_id", profile.org_id)
    .gte("created_at", rangeStart)
    .lt("created_at", rangeEnd)
    .order("created_at", { ascending: false })
    .limit(ORDER_ROW_LIMIT);
  if (branchId) ordersQuery = ordersQuery.eq("store_id", branchId);

  const [ordersResult, staffResult, productsResult, categoriesResult] = await Promise.all([
    ordersQuery,
    supabase.from("profiles").select("id, full_name").eq("org_id", profile.org_id).limit(500),
    supabase.from("products").select("id, store_id, category_id, unit").eq("org_id", profile.org_id).limit(3000),
    supabase.from("categories").select("id, name").eq("org_id", profile.org_id).limit(1000),
  ]);

  const allOrders = (ordersResult.data ?? []) as OrderRecord[];
  const staff = (staffResult.data ?? []) as Array<{ id: string; full_name: string | null }>;
  const products = (productsResult.data ?? []) as ProductRecord[];
  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const staffById = new Map(staff.map((person) => [person.id, person.full_name ?? "Unknown"]));

  const saleCandidates = allOrders.filter((order) => order.reversal_of === null && order.status === "completed");
  const reversalRows = selectReversals(allOrders);

  const reversalLookup = await loadReversedOrderIds(
    supabase,
    profile.org_id,
    saleCandidates.map((order) => order.id),
  );
  const reversedIds = reversalLookup.reversedIds;
  // Reversals already inside the window need no second lookup.
  for (const row of reversalRows) {
    if (row.reversal_of) reversedIds.add(row.reversal_of);
  }
  const reversalLookupFailed = reversalLookup.failed;

  const matchesReportFilters = (row: { cashier_id: string; payment_method: SalesPaymentMethod }) => {
    if (filters.cashierId && row.cashier_id !== filters.cashierId) return false;
    if (filters.paymentMethod && row.payment_method !== filters.paymentMethod) return false;
    return true;
  };
  const scopedSaleCandidates = saleCandidates.filter(matchesReportFilters);
  const scopedReversalRows = reversalRows.filter(matchesReportFilters);
  const netOrders = selectNetSales(saleCandidates, reversedIds).filter(matchesReportFilters);
  const netOrderIds = new Set(netOrders.map((order) => order.id));

  let itemsQuery = supabase
    .from("order_items")
    .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status, org_id, store_id, created_at, reversal_of)")
    .eq("orders.org_id", profile.org_id)
    .eq("orders.status", "completed")
    .is("orders.reversal_of", null)
    .gte("orders.created_at", rangeStart)
    .lt("orders.created_at", rangeEnd)
    .limit(ITEM_ROW_LIMIT);
  if (branchId) itemsQuery = itemsQuery.eq("orders.store_id", branchId);
  const itemsResult = await itemsQuery;
  const orderItems = ((itemsResult.data ?? []) as OrderItemRecord[]).filter((item) => netOrderIds.has(item.order_id));

  const totals: SalesReportTotals = {
    orderCount: 0,
    grossSales: 0,
    discountTotal: 0,
    netSales: 0,
    vatableSale: 0,
    vatAmount: 0,
    vatExemptSale: 0,
    averageOrder: 0,
    qtySold: 0,
    kgSold: 0,
    voidCount: 0,
    voidTotal: 0,
    refundCount: 0,
    refundTotal: 0,
    discountedOrderCount: 0,
  };

  const periodMap = new Map<string, SalesPeriodRow>();
  const paymentMap = new Map<SalesPaymentMethod, { orders: number; netSales: number }>();
  const cashierMap = new Map<string, { orders: number; netSales: number; discountTotal: number; voidCount: number; refundCount: number }>();
  const branchMap = new Map<string, { orders: number; netSales: number; discountTotal: number }>();
  const discountMap = new Map<SalesDiscountType, { orders: number; discountTotal: number; netSales: number }>();
  const hourMap = new Map<string, SalesHourCell>();

  for (const order of netOrders) {
    const total = num(order.total);
    const discount = num(order.discount_amount);

    totals.orderCount += 1;
    totals.grossSales += num(order.subtotal);
    totals.discountTotal += discount;
    totals.netSales += total;
    totals.vatableSale += num(order.vatable_sale);
    totals.vatAmount += num(order.vat_amount);
    totals.vatExemptSale += num(order.vat_exempt_sale);
    if (discount > 0) totals.discountedOrderCount += 1;

    const bucket = periodBucket(order.created_at, filters.grouping);
    const period = periodMap.get(bucket.key) ?? { key: bucket.key, label: bucket.label, orders: 0, netSales: 0, discountTotal: 0, averageOrder: 0 };
    period.orders += 1;
    period.netSales += total;
    period.discountTotal += discount;
    periodMap.set(bucket.key, period);

    const payment = paymentMap.get(order.payment_method) ?? { orders: 0, netSales: 0 };
    payment.orders += 1;
    payment.netSales += total;
    paymentMap.set(order.payment_method, payment);

    const cashier = cashierMap.get(order.cashier_id) ?? { orders: 0, netSales: 0, discountTotal: 0, voidCount: 0, refundCount: 0 };
    cashier.orders += 1;
    cashier.netSales += total;
    cashier.discountTotal += discount;
    cashierMap.set(order.cashier_id, cashier);

    const branch = branchMap.get(order.store_id) ?? { orders: 0, netSales: 0, discountTotal: 0 };
    branch.orders += 1;
    branch.netSales += total;
    branch.discountTotal += discount;
    branchMap.set(order.store_id, branch);

    const discountEntry = discountMap.get(order.discount_type) ?? { orders: 0, discountTotal: 0, netSales: 0 };
    discountEntry.orders += 1;
    discountEntry.discountTotal += discount;
    discountEntry.netSales += total;
    discountMap.set(order.discount_type, discountEntry);

    const parts = singaporeParts(order.created_at);
    const hourKey = `${parts.weekday}-${parts.hour}`;
    const cell = hourMap.get(hourKey) ?? { weekday: parts.weekday, hour: parts.hour, orders: 0, netSales: 0 };
    cell.orders += 1;
    cell.netSales += total;
    hourMap.set(hourKey, cell);
  }

  // Reversals are reported as recorded in this window — that is when the money
  // left the drawer — while the net figures above exclude the underlying sale
  // whenever it was reversed.
  for (const reversal of scopedReversalRows) {
    const total = num(reversal.total);
    if (reversal.status === "voided") {
      totals.voidCount += 1;
      totals.voidTotal += total;
    } else if (reversal.status === "refunded") {
      totals.refundCount += 1;
      totals.refundTotal += total;
    }
    const cashier = cashierMap.get(reversal.cashier_id) ?? { orders: 0, netSales: 0, discountTotal: 0, voidCount: 0, refundCount: 0 };
    if (reversal.status === "voided") cashier.voidCount += 1;
    else cashier.refundCount += 1;
    cashierMap.set(reversal.cashier_id, cashier);
  }

  totals.averageOrder = average(totals.netSales, totals.orderCount);

  const itemMap = new Map<string, { name: string; unit: string; qty: number; netSales: number; orders: Set<string> }>();
  const categoryMap = new Map<string, { name: string; unit: string; qty: number; netSales: number }>();
  for (const item of orderItems) {
    const product = item.product_id ? productById.get(item.product_id) : null;
    const unit = product?.unit ?? "items";
    const quantity = salesQuantity({ qty: item.qty, weight_kg: item.weight_kg });
    const lineTotal = num(item.line_total);
    totals.qtySold += num(item.qty);
    totals.kgSold += num(item.weight_kg);

    const entry = itemMap.get(item.name_snapshot) ?? { name: item.name_snapshot, unit, qty: 0, netSales: 0, orders: new Set<string>() };
    entry.qty += quantity;
    entry.netSales += lineTotal;
    entry.orders.add(item.order_id);
    itemMap.set(item.name_snapshot, entry);

    const category = product?.category_id ? categoryById.get(product.category_id) : null;
    const categoryKey = category?.id ?? "uncategorized";
    const categoryEntry = categoryMap.get(categoryKey) ?? { name: category?.name ?? "Uncategorized", unit, qty: 0, netSales: 0 };
    categoryEntry.qty += quantity;
    categoryEntry.netSales += lineTotal;
    categoryMap.set(categoryKey, categoryEntry);
  }

  const itemRows: SalesItemRow[] = Array.from(itemMap.values())
    .map((entry) => ({ name: entry.name, unit: entry.unit, qty: entry.qty, netSales: entry.netSales, orders: entry.orders.size, share: share(entry.netSales, totals.netSales) }))
    .sort((a, b) => b.netSales - a.netSales || b.qty - a.qty);

  const categoryRows: SalesCategoryRow[] = Array.from(categoryMap.values())
    .map((entry) => ({ name: entry.name, unit: entry.unit, qty: entry.qty, netSales: entry.netSales, share: share(entry.netSales, totals.netSales) }))
    .sort((a, b) => b.netSales - a.netSales || b.qty - a.qty);

  const periodRows = Array.from(periodMap.values())
    .map((row) => ({ ...row, averageOrder: average(row.netSales, row.orders) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const paymentRows: SalesPaymentRow[] = SALES_PAYMENT_METHODS.map((method) => {
    const entry = paymentMap.get(method) ?? { orders: 0, netSales: 0 };
    return { method, orders: entry.orders, netSales: entry.netSales, share: share(entry.netSales, totals.netSales) };
  });

  const cashierRows: SalesCashierRow[] = Array.from(cashierMap.entries())
    .map(([cashierId, entry]) => ({
      cashierId,
      name: staffById.get(cashierId) ?? "Unknown",
      orders: entry.orders,
      netSales: entry.netSales,
      discountTotal: entry.discountTotal,
      averageOrder: average(entry.netSales, entry.orders),
      voidCount: entry.voidCount,
      refundCount: entry.refundCount,
      share: share(entry.netSales, totals.netSales),
    }))
    .sort((a, b) => b.netSales - a.netSales || b.orders - a.orders);

  const visibleBranches = branchId ? branches.filter((branch) => branch.id === branchId) : branches;
  const branchRows: SalesBranchRow[] = visibleBranches
    .map((branch) => {
      const entry = branchMap.get(branch.id) ?? { orders: 0, netSales: 0, discountTotal: 0 };
      return {
        branchId: branch.id,
        name: branch.name,
        isActive: branch.is_active,
        orders: entry.orders,
        netSales: entry.netSales,
        discountTotal: entry.discountTotal,
        averageOrder: average(entry.netSales, entry.orders),
        share: share(entry.netSales, totals.netSales),
      };
    })
    .sort((a, b) => b.netSales - a.netSales);

  const discountRows: SalesDiscountRow[] = (["senior", "pwd", "custom", "none"] as SalesDiscountType[])
    .map((type) => {
      const entry = discountMap.get(type) ?? { orders: 0, discountTotal: 0, netSales: 0 };
      return { type, label: discountLabel(type), orders: entry.orders, discountTotal: entry.discountTotal, netSales: entry.netSales };
    });

  const hourCells = Array.from(hourMap.values());
  const peakHour = hourCells.reduce<SalesHourCell | null>(
    (best, cell) => (best === null || cell.netSales > best.netSales ? cell : best),
    null,
  );

  const rawGrossSales = netOrders.reduce((sum, order) => sum + num(order.subtotal), 0);
  const rawNetSales = netOrders.reduce((sum, order) => sum + num(order.total), 0);
  const truncated = allOrders.length >= ORDER_ROW_LIMIT || orderItems.length >= ITEM_ROW_LIMIT;
  const reconciliation: SalesReportReconciliation = {
    rawSaleCandidateCount: scopedSaleCandidates.length,
    rawReversalCount: scopedReversalRows.length,
    netOrderCount: netOrders.length,
    rawGrossSales,
    rawNetSales,
    summaryGrossSales: totals.grossSales,
    summaryNetSales: totals.netSales,
    balanced: !truncated
      && !reversalLookupFailed
      && totals.orderCount === netOrders.length
      && totals.grossSales === rawGrossSales
      && totals.netSales === rawNetSales,
  };

  const cashiers = Array.from(new Set([...cashierMap.keys()]))
    .map((id) => ({ id, name: staffById.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const allCashiers = staff
    .map((person) => ({ id: person.id, name: person.full_name ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    filters,
    branches,
    cashiers: allCashiers.length > 0 ? allCashiers : cashiers,
    totals,
    periodRows,
    paymentRows,
    itemRows,
    categoryRows,
    cashierRows,
    branchRows,
    discountRows,
    hourCells,
    peakHour,
    reconciliation,
    branchName: branchId ? branches.find((branch) => branch.id === branchId)?.name ?? "Selected branch" : "All branches",
    canCompareBranches: !branchId && branches.length > 1,
    queryWarning: Boolean(
      branchesResult.error || ordersResult.error || staffResult.error || productsResult.error || categoriesResult.error || itemsResult.error || reversalLookupFailed,
    ),
    truncated,
  };
}
