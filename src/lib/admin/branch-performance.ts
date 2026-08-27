/**
 * Branch-first performance reporting for the admin workspace.
 *
 * This module deliberately keeps the report server-rendered and bounded. The
 * order ledger remains the source of truth, and net sales always flow through
 * the same reversal-aware helpers used by the general Reports page.
 */
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { getAdminBranches, type AdminBranchRecord } from "@/lib/admin/branches";
import { stockMovementDelta, stockStatus, salesQuantity } from "@/lib/inventory";
import {
  loadReversedOrderIds,
  selectNetSales,
  selectReversals,
  type SalesGrouping,
  type SalesPaymentMethod,
  type SalesReportClient,
  type SalesReportProfile,
} from "@/lib/admin/sales-reports";

const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Keep this aligned with the bounded Reports loader. A report that reaches a
// boundary is marked incomplete instead of presenting a plausible partial.
export const BRANCH_PERFORMANCE_ORDER_LIMIT = 10_000;
export const BRANCH_PERFORMANCE_ITEM_LIMIT = 20_000;
const DEVICE_LIMIT = 2_000;
const STAFF_LIMIT = 2_000;
const PRODUCT_LIMIT = 5_000;
const CATEGORY_LIMIT = 1_000;
const CLOSEOUT_LIMIT = 2_000;
const MOVEMENT_LIMIT = 10_000;

export type BranchPerformanceMetric = "sales" | "orders" | "average";
export type BranchPerformanceSort = "sales" | "change" | "orders" | "average" | "alerts";
export type BranchPerformanceDirection = "asc" | "desc";

export const BRANCH_PERFORMANCE_GROUPINGS: SalesGrouping[] = ["day", "week", "month"];
export const BRANCH_PERFORMANCE_METRICS: BranchPerformanceMetric[] = ["sales", "orders", "average"];
export const BRANCH_PERFORMANCE_SORTS: BranchPerformanceSort[] = ["sales", "change", "orders", "average", "alerts"];
export const BRANCH_PERFORMANCE_PAYMENT_METHODS: SalesPaymentMethod[] = ["cash", "gcash", "maya", "card"];

export type BranchPerformanceParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type BranchPerformanceFilters = {
  from: string;
  to: string;
  branchId: string;
  grouping: SalesGrouping;
  compare: boolean;
  includeInactive: boolean;
  metric: BranchPerformanceMetric;
  query: string;
  sort: BranchPerformanceSort;
  direction: BranchPerformanceDirection;
};

export type BranchPerformancePayment = {
  method: SalesPaymentMethod;
  orders: number;
  netSales: number;
  share: number;
};

export type BranchPerformanceBranchRow = {
  branchId: string;
  name: string;
  address: string | null;
  isActive: boolean;
  orders: number;
  previousOrders: number;
  netSales: number;
  previousNetSales: number;
  grossSales: number;
  discountTotal: number;
  discountRate: number;
  averageOrder: number;
  change: number | null;
  changeIsNew: boolean;
  salesShare: number;
  reversalCount: number;
  reversalTotal: number;
  payments: BranchPerformancePayment[];
};

export type BranchPerformanceHealthStatus = "healthy" | "attention" | "inactive" | "no_data";

export type BranchPerformanceHealthRow = {
  branchId: string;
  name: string;
  isActive: boolean;
  deviceCount: number;
  activeDevices: number;
  activeStaff: number;
  trackedItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  latestCloseoutAt: string | null;
  latestCloseoutVariance: number | null;
  latestCloseoutZNumber: number | null;
  latestSaleAt: string | null;
  status: BranchPerformanceHealthStatus;
  reasons: string[];
};

export type BranchPerformancePeriodRow = {
  key: string;
  label: string;
  orders: number;
  netSales: number;
  previousOrders: number;
  previousNetSales: number;
};

export type BranchPerformanceTrendSeries = {
  branchId: string;
  label: string;
  colorIndex: number;
  values: number[];
  previousValues: number[];
};

export type BranchPerformanceItemRow = {
  name: string;
  unit: string;
  qty: number;
  netSales: number;
  orders: number;
};

export type BranchPerformanceCategoryRow = {
  name: string;
  unit: string;
  qty: number;
  netSales: number;
  share: number;
};

export type BranchPerformanceHourCell = {
  weekday: number;
  hour: number;
  orders: number;
  netSales: number;
};

export type BranchPerformanceCloseout = {
  id: string;
  zNumber: number;
  businessDate: string;
  closedAt: string;
  generatedAt: string;
  netSales: number;
  declaredCash: number;
  cashVariance: number;
};

export type BranchPerformanceDetail = {
  branchId: string;
  branchName: string;
  address: string | null;
  isActive: boolean;
  itemRows: BranchPerformanceItemRow[];
  categoryRows: BranchPerformanceCategoryRow[];
  hourCells: BranchPerformanceHourCell[];
  peakHour: BranchPerformanceHourCell | null;
  closeouts: BranchPerformanceCloseout[];
};

export type BranchPerformanceTotals = {
  orderCount: number;
  previousOrderCount: number;
  grossSales: number;
  discountTotal: number;
  discountRate: number;
  netSales: number;
  previousNetSales: number;
  averageOrder: number;
  previousAverageOrder: number;
  salesChange: number | null;
  salesChangeIsNew: boolean;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;
  reversalCount: number;
  reversalTotal: number;
  activeBranchCount: number;
  includedBranchCount: number;
  salesPerActiveBranch: number;
};

export type BranchPerformanceReconciliation = {
  rawSaleCandidateCount: number;
  rawReversalCount: number;
  netOrderCount: number;
  rawGrossSales: number;
  rawNetSales: number;
  summaryGrossSales: number;
  summaryNetSales: number;
  balanced: boolean;
};

export type BranchPerformanceShareRow = {
  branchId: string | null;
  name: string;
  netSales: number;
  share: number;
  colorIndex: number;
};

export type BranchPerformanceData = {
  filters: BranchPerformanceFilters;
  branches: AdminBranchRecord[];
  branchName: string;
  canCompareBranches: boolean;
  totals: BranchPerformanceTotals;
  branchRows: BranchPerformanceBranchRow[];
  tableRows: BranchPerformanceBranchRow[];
  healthRows: BranchPerformanceHealthRow[];
  shareRows: BranchPerformanceShareRow[];
  periodRows: BranchPerformancePeriodRow[];
  trendSeries: BranchPerformanceTrendSeries[];
  detail: BranchPerformanceDetail | null;
  reconciliation: BranchPerformanceReconciliation;
  queryWarning: boolean;
  truncated: boolean;
  generatedAt: string;
};

type OrderRecord = {
  id: string;
  store_id: string;
  cashier_id: string;
  status: "completed" | "voided" | "refunded";
  subtotal: number | string;
  discount_amount: number | string;
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

type ProductRecord = {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  unit: string;
  track_stock: boolean;
  min_stock: number | string | null;
  is_active: boolean;
};

type CategoryRecord = { id: string; name: string };
type DeviceRecord = { id: string; store_id: string; is_active: boolean; last_seen_at: string | null };
type StaffRecord = { id: string; store_id: string | null; is_active: boolean };
type FallbackProfileRecord = { id: string; store_id: string | null; is_active: boolean };
type StockRecord = { store_id: string; product_id: string; qty: number | string };
type StockMovementRecord = { store_id: string; product_id: string; type: string; qty: number | string };
type CloseoutRecord = {
  id: string;
  store_id: string;
  z_number: number | string;
  business_date: string;
  closed_at: string;
  generated_at: string;
  net_sales: number | string;
  declared_cash: number | string;
  cash_variance: number | string;
};

type Aggregate = {
  orders: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  voidCount: number;
  voidTotal: number;
  refundCount: number;
  refundTotal: number;
};

type BranchAggregate = Aggregate & {
  previousOrders: number;
  previousNetSales: number;
};

const EMPTY_AGGREGATE: Aggregate = {
  orders: 0,
  grossSales: 0,
  discountTotal: 0,
  netSales: 0,
  voidCount: 0,
  voidTotal: 0,
  refundCount: 0,
  refundTotal: 0,
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function num(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

function readParam(source: BranchPerformanceParamSource, key: string) {
  if (source instanceof URLSearchParams) return source.get(key) ?? "";
  const value = source[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readBooleanParam(source: BranchPerformanceParamSource, key: string, defaultValue: boolean) {
  const values = source instanceof URLSearchParams
    ? source.getAll(key)
    : (() => {
        const value = source[key];
        return Array.isArray(value) ? value : value === undefined ? [] : [value];
      })();
  return values.length ? values.some(isTruthyParam) : defaultValue;
}

function isValidDate(value: string) {
  if (!VALID_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function singaporeDate(value = new Date()) {
  return new Date(value.getTime() + SINGAPORE_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftSingaporeDate(value: string, days: number) {
  return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function dateStart(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

function dateEnd(value: string) {
  return new Date(dateStart(value).getTime() + DAY_MS);
}

function daysInclusive(from: string, to: string) {
  return Math.max(1, Math.round((dateStart(to).getTime() - dateStart(from).getTime()) / DAY_MS) + 1);
}

function percentShare(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function average(value: number, count: number) {
  return count > 0 ? Math.round(value / count) : 0;
}

function percentChange(current: number, previous: number, compare: boolean) {
  if (!compare || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function isTruthyParam(value: string) {
  return value === "1" || value === "true" || value === "on";
}

export function readBranchPerformanceFilters(source: BranchPerformanceParamSource, now = new Date()): BranchPerformanceFilters {
  const today = singaporeDate(now);
  const rangeParam = readParam(source, "range");
  const rangeDays = rangeParam === "7d" ? 7 : rangeParam === "90d" ? 90 : rangeParam === "30d" ? 30 : null;
  const rawFrom = readParam(source, "from");
  const rawTo = readParam(source, "to");
  const toCandidate = isValidDate(rawTo) ? rawTo : today;
  const fromCandidate = isValidDate(rawFrom) ? rawFrom : shiftSingaporeDate(toCandidate, -(rangeDays ?? 30) + 1);
  const from = fromCandidate <= toCandidate ? fromCandidate : toCandidate;
  const to = fromCandidate <= toCandidate ? toCandidate : fromCandidate;
  const grouping = readParam(source, "grouping");
  const metric = readParam(source, "metric");
  const sort = readParam(source, "sort");
  const direction = readParam(source, "dir");

  return {
    from,
    to,
    branchId: readParam(source, "branch"),
    grouping: BRANCH_PERFORMANCE_GROUPINGS.includes(grouping as SalesGrouping) ? grouping as SalesGrouping : "day",
    compare: readBooleanParam(source, "compare", true),
    includeInactive: readBooleanParam(source, "includeInactive", false),
    metric: BRANCH_PERFORMANCE_METRICS.includes(metric as BranchPerformanceMetric) ? metric as BranchPerformanceMetric : "sales",
    query: readParam(source, "q").trim().slice(0, 80),
    sort: BRANCH_PERFORMANCE_SORTS.includes(sort as BranchPerformanceSort) ? sort as BranchPerformanceSort : "sales",
    direction: direction === "asc" ? "asc" : "desc",
  };
}

export function branchPerformanceQuery(filters: BranchPerformanceFilters, kind?: string) {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.branchId) params.set("branch", filters.branchId);
  if (filters.grouping !== "day") params.set("grouping", filters.grouping);
  if (!filters.compare) params.set("compare", "0");
  if (filters.includeInactive) params.set("includeInactive", "1");
  if (filters.metric !== "sales") params.set("metric", filters.metric);
  if (filters.query) params.set("q", filters.query);
  if (filters.sort !== "sales") params.set("sort", filters.sort);
  if (filters.direction !== "desc") params.set("dir", filters.direction);
  if (kind) params.set("kind", kind);
  return params.toString();
}

function singaporeParts(iso: string) {
  const shifted = new Date(new Date(iso).getTime() + SINGAPORE_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
  };
}

function bucketForIso(iso: string, grouping: SalesGrouping) {
  const parts = singaporeParts(iso);
  const pad = (value: number) => String(value).padStart(2, "0");

  if (grouping === "month") {
    const key = `${parts.year}-${pad(parts.month)}`;
    const label = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
    return { key, label };
  }

  if (grouping === "week") {
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

function bucketForDate(value: string, grouping: SalesGrouping) {
  return bucketForIso(`${value}T00:00:00+08:00`, grouping);
}

function enumerateBuckets(from: string, to: string, grouping: SalesGrouping) {
  const buckets: Array<{ key: string; label: string }> = [];
  const first = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);

  if (grouping === "month") {
    const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    while (cursor <= end) {
      buckets.push(bucketForDate(cursor.toISOString().slice(0, 10), grouping));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return buckets;
  }

  const firstBucket = bucketForDate(from, grouping);
  const cursor = new Date(`${firstBucket.key}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const step = grouping === "week" ? 7 : 1;
  while (cursor <= end) {
    buckets.push(bucketForDate(cursor.toISOString().slice(0, 10), grouping));
    cursor.setUTCDate(cursor.getUTCDate() + step);
  }
  return buckets;
}

function cloneAggregate(): Aggregate {
  return { ...EMPTY_AGGREGATE };
}

function aggregateOrders(orders: OrderRecord[], reversals: OrderRecord[]): Aggregate {
  const aggregate = cloneAggregate();
  for (const order of orders) {
    aggregate.orders += 1;
    aggregate.grossSales += num(order.subtotal);
    aggregate.discountTotal += num(order.discount_amount);
    aggregate.netSales += num(order.total);
  }
  for (const reversal of reversals) {
    if (reversal.status === "voided") {
      aggregate.voidCount += 1;
      aggregate.voidTotal += num(reversal.total);
    } else if (reversal.status === "refunded") {
      aggregate.refundCount += 1;
      aggregate.refundTotal += num(reversal.total);
    }
  }
  return aggregate;
}

function inWindow(iso: string, start: Date, end: Date) {
  const value = new Date(iso).getTime();
  return value >= start.getTime() && value < end.getTime();
}

function paymentRows(entries: Map<SalesPaymentMethod, { orders: number; netSales: number }>, total: number) {
  return BRANCH_PERFORMANCE_PAYMENT_METHODS.map((method) => {
    const entry = entries.get(method) ?? { orders: 0, netSales: 0 };
    return { method, orders: entry.orders, netSales: entry.netSales, share: percentShare(entry.netSales, total) };
  });
}

function sortRows(rows: BranchPerformanceBranchRow[], sort: BranchPerformanceSort, direction: BranchPerformanceDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    let leftValue = left.netSales;
    let rightValue = right.netSales;
    if (sort === "change") {
      leftValue = left.change ?? Number.NEGATIVE_INFINITY;
      rightValue = right.change ?? Number.NEGATIVE_INFINITY;
    } else if (sort === "orders") {
      leftValue = left.orders;
      rightValue = right.orders;
    } else if (sort === "average") {
      leftValue = left.averageOrder;
      rightValue = right.averageOrder;
    } else if (sort === "alerts") {
      leftValue = left.reversalCount;
      rightValue = right.reversalCount;
    }
    return (rightValue - leftValue) * multiplier || left.name.localeCompare(right.name);
  });
}

function createShareRows(rows: BranchPerformanceBranchRow[], total: number): BranchPerformanceShareRow[] {
  const ranked = rows.filter((row) => row.netSales > 0).sort((left, right) => right.netSales - left.netSales);
  const top: BranchPerformanceShareRow[] = ranked.slice(0, 5).map((row, index) => ({
    branchId: row.branchId,
    name: row.name,
    netSales: row.netSales,
    share: percentShare(row.netSales, total),
    colorIndex: index,
  }));
  const otherSales = ranked.slice(5).reduce((sum, row) => sum + row.netSales, 0);
  if (otherSales > 0) {
    top.push({ branchId: null, name: "Other", netSales: otherSales, share: percentShare(otherSales, total), colorIndex: 5 });
  }
  return top;
}

function createDetail(
  branch: AdminBranchRecord,
  items: OrderItemRecord[],
  products: ProductRecord[],
  categories: CategoryRecord[],
  closeouts: CloseoutRecord[],
  totalSales: number,
): BranchPerformanceDetail {
  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const itemMap = new Map<string, { name: string; unit: string; qty: number; netSales: number; orders: Set<string> }>();
  const categoryMap = new Map<string, { name: string; unit: string; qty: number; netSales: number }>();
  for (const item of items) {
    const product = item.product_id ? productById.get(item.product_id) : null;
    const unit = product?.unit ?? "items";
    const quantity = salesQuantity({ qty: item.qty, weight_kg: item.weight_kg });
    const lineTotal = num(item.line_total);
    const itemEntry = itemMap.get(item.name_snapshot) ?? { name: item.name_snapshot, unit, qty: 0, netSales: 0, orders: new Set<string>() };
    itemEntry.qty += quantity;
    itemEntry.netSales += lineTotal;
    itemEntry.orders.add(item.order_id);
    itemMap.set(item.name_snapshot, itemEntry);

    const category = product?.category_id ? categoryById.get(product.category_id) : null;
    const categoryKey = category?.id ?? "uncategorized";
    const categoryEntry = categoryMap.get(categoryKey) ?? { name: category?.name ?? "Uncategorized", unit, qty: 0, netSales: 0 };
    categoryEntry.qty += quantity;
    categoryEntry.netSales += lineTotal;
    categoryMap.set(categoryKey, categoryEntry);
  }

  const itemRows = Array.from(itemMap.values())
    .map((entry) => ({ name: entry.name, unit: entry.unit, qty: entry.qty, netSales: entry.netSales, orders: entry.orders.size }))
    .sort((left, right) => right.netSales - left.netSales || right.qty - left.qty);
  const categoryRows = Array.from(categoryMap.values())
    .map((entry) => ({ ...entry, share: percentShare(entry.netSales, totalSales) }))
    .sort((left, right) => right.netSales - left.netSales || right.qty - left.qty);
  const hourCells: BranchPerformanceHourCell[] = [];
  const peakHour: BranchPerformanceHourCell | null = null;

  return {
    branchId: branch.id,
    branchName: branch.name,
    address: branch.address,
    isActive: branch.is_active,
    itemRows,
    categoryRows,
    hourCells,
    peakHour,
    closeouts: closeouts
      .filter((row) => row.store_id === branch.id)
      .sort((left, right) => right.generated_at.localeCompare(left.generated_at))
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        zNumber: num(row.z_number),
        businessDate: row.business_date,
        closedAt: row.closed_at,
        generatedAt: row.generated_at,
        netSales: num(row.net_sales),
        declaredCash: num(row.declared_cash),
        cashVariance: num(row.cash_variance),
      })),
  };
}

function addHourCell(map: Map<string, BranchPerformanceHourCell>, iso: string, total: number) {
  const parts = singaporeParts(iso);
  const key = `${parts.weekday}-${parts.hour}`;
  const current = map.get(key) ?? { weekday: parts.weekday, hour: parts.hour, orders: 0, netSales: 0 };
  current.orders += 1;
  current.netSales += total;
  map.set(key, current);
}

function mergeDetailHours(detail: BranchPerformanceDetail, orders: OrderRecord[]) {
  const hourMap = new Map<string, BranchPerformanceHourCell>();
  for (const order of orders) addHourCell(hourMap, order.created_at, num(order.total));
  detail.hourCells = Array.from(hourMap.values());
  detail.peakHour = detail.hourCells.reduce<BranchPerformanceHourCell | null>(
    (best, cell) => best === null || cell.netSales > best.netSales ? cell : best,
    null,
  );
}

export async function loadBranchPerformanceReport(
  supabase: SalesReportClient,
  profile: SalesReportProfile,
  requestedFilters: BranchPerformanceFilters,
): Promise<BranchPerformanceData> {
  const branchesResult = await getAdminBranches(profile.org_id);
  const branches = branchesResult.data;
  const workspaceBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const requestedBranchIsValid = branches.some((branch) => branch.id === requestedFilters.branchId && (branch.is_active || requestedFilters.includeInactive));
  const branchId = profile.role === "manager"
    ? profile.store_id ?? ""
    : workspaceBranchId ?? (requestedBranchIsValid ? requestedFilters.branchId : "");
  const filters = { ...requestedFilters, branchId };
  const visibleBranches = profile.role === "manager" && !profile.store_id
    ? []
    : branchId
      ? branches.filter((branch) => branch.id === branchId)
      : branches.filter((branch) => filters.includeInactive || branch.is_active);
  const visibleBranchIds = new Set(visibleBranches.map((branch) => branch.id));

  const currentStart = dateStart(filters.from);
  const currentEnd = dateEnd(filters.to);
  const previousTo = shiftSingaporeDate(filters.from, -1);
  const previousFrom = shiftSingaporeDate(previousTo, -(daysInclusive(filters.from, filters.to) - 1));
  const previousStart = dateStart(previousFrom);
  const previousEnd = dateEnd(previousTo);
  const queryStart = filters.compare ? previousStart : currentStart;

  let ordersQuery = supabase
    .from("orders")
    .select("id, store_id, cashier_id, status, subtotal, discount_amount, total, payment_method, created_at, reversal_of")
    .eq("org_id", profile.org_id)
    .gte("created_at", queryStart.toISOString())
    .lt("created_at", currentEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(BRANCH_PERFORMANCE_ORDER_LIMIT);
  if (branchId) ordersQuery = ordersQuery.eq("store_id", branchId);

  const devicesQuery = supabase
    .from("devices")
    .select("id, store_id, is_active, last_seen_at")
    .eq("org_id", profile.org_id)
    .limit(DEVICE_LIMIT);
  const staffQuery = supabase
    .from("employee_records")
    .select("id, store_id, is_active")
    .eq("org_id", profile.org_id)
    .limit(STAFF_LIMIT);
  const productsQuery = supabase
    .from("products")
    .select("id, store_id, category_id, name, unit, track_stock, min_stock, is_active")
    .eq("org_id", profile.org_id)
    .eq("track_stock", true)
    .limit(PRODUCT_LIMIT);
  const categoriesQuery = supabase
    .from("categories")
    .select("id, name")
    .eq("org_id", profile.org_id)
    .limit(CATEGORY_LIMIT);
  const stockQuery = supabase.rpc("current_stock", { p_org_id: profile.org_id }).limit(PRODUCT_LIMIT);
  const closeoutsQuery = supabase
    .from("z_readings")
    .select("id, store_id, z_number, business_date, closed_at, generated_at, net_sales, declared_cash, cash_variance")
    .eq("org_id", profile.org_id)
    .order("generated_at", { ascending: false })
    .limit(CLOSEOUT_LIMIT);

  const [ordersResult, devicesResult, staffResult, productsResult, categoriesResult, stockResult, closeoutsResult] = await Promise.all([
    ordersQuery,
    devicesQuery,
    staffQuery,
    productsQuery,
    categoriesQuery,
    stockQuery,
    closeoutsQuery,
  ]);

  const allOrders = (ordersResult.data ?? []) as OrderRecord[];
  const saleCandidates = allOrders.filter((order) => order.status === "completed" && order.reversal_of === null);
  const reversalRows = selectReversals(allOrders) as OrderRecord[];
  const reversalLookup = await loadReversedOrderIds(supabase, profile.org_id, saleCandidates.map((order) => order.id));
  const reversedIds = reversalLookup.reversedIds;
  for (const reversal of reversalRows) {
    if (reversal.reversal_of) reversedIds.add(reversal.reversal_of);
  }
  const netOrders = selectNetSales(saleCandidates, reversedIds) as OrderRecord[];
  const currentNetOrders = netOrders.filter((order) => inWindow(order.created_at, currentStart, currentEnd) && visibleBranchIds.has(order.store_id));
  const previousNetOrders = netOrders.filter((order) => filters.compare && inWindow(order.created_at, previousStart, previousEnd) && visibleBranchIds.has(order.store_id));
  const currentReversals = reversalRows.filter((row) => inWindow(row.created_at, currentStart, currentEnd) && visibleBranchIds.has(row.store_id));
  const previousReversals = reversalRows.filter((row) => filters.compare && inWindow(row.created_at, previousStart, previousEnd) && visibleBranchIds.has(row.store_id));
  const currentAggregate = aggregateOrders(currentNetOrders, currentReversals);
  const previousAggregate = aggregateOrders(previousNetOrders, previousReversals);

  let staffRows = (staffResult.data ?? []) as StaffRecord[];
  let staffFallbackError = false;
  if (staffResult.error) {
    const fallbackStaffResult = await supabase
      .from("profiles")
      .select("id, store_id, is_active")
      .eq("org_id", profile.org_id)
      .limit(STAFF_LIMIT);
    staffRows = (fallbackStaffResult.data ?? []) as FallbackProfileRecord[];
    staffFallbackError = Boolean(fallbackStaffResult.error);
  }

  let stockRows = (stockResult.data ?? []) as StockRecord[];
  let stockFallbackError = false;
  let stockFallbackTruncated = false;
  if (stockResult.error) {
    let movementQuery = supabase
      .from("stock_movements")
      .select("store_id, product_id, type, qty")
      .eq("org_id", profile.org_id)
      .limit(MOVEMENT_LIMIT);
    if (branchId) movementQuery = movementQuery.eq("store_id", branchId);
    const movementResult = await movementQuery;
    const movementRows = (movementResult.data ?? []) as StockMovementRecord[];
    const stockByKey = new Map<string, number>();
    for (const movement of movementRows) {
      const key = `${movement.store_id}:${movement.product_id}`;
      stockByKey.set(key, (stockByKey.get(key) ?? 0) + stockMovementDelta(movement.type, num(movement.qty)));
    }
    stockRows = Array.from(stockByKey.entries()).map(([key, qty]) => {
      const [storeId, productId] = key.split(":");
      return { store_id: storeId, product_id: productId, qty };
    });
    stockFallbackError = Boolean(movementResult.error);
    stockFallbackTruncated = movementRows.length >= MOVEMENT_LIMIT;
  }

  const products = (productsResult.data ?? []) as ProductRecord[];
  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const devices = (devicesResult.data ?? []) as DeviceRecord[];
  const closeouts = (closeoutsResult.data ?? []) as CloseoutRecord[];
  const stockByKey = new Map(stockRows.map((row) => [`${row.store_id}:${row.product_id}`, num(row.qty)]));

  const branchAggregates = new Map<string, BranchAggregate>();
  const paymentByBranch = new Map<string, Map<SalesPaymentMethod, { orders: number; netSales: number }>>();
  const currentTrend = new Map<string, Map<string, { orders: number; netSales: number }>>();
  const previousTrend = new Map<string, Map<string, { orders: number; netSales: number }>>();
  const periodCurrent = new Map<string, { orders: number; netSales: number }>();
  const periodPrevious = new Map<string, { orders: number; netSales: number }>();

  for (const branch of visibleBranches) {
    branchAggregates.set(branch.id, { ...cloneAggregate(), previousOrders: 0, previousNetSales: 0 });
    paymentByBranch.set(branch.id, new Map());
    currentTrend.set(branch.id, new Map());
    previousTrend.set(branch.id, new Map());
  }

  for (const order of currentNetOrders) {
    const branch = branchAggregates.get(order.store_id);
    if (!branch) continue;
    const total = num(order.total);
    branch.orders += 1;
    branch.grossSales += num(order.subtotal);
    branch.discountTotal += num(order.discount_amount);
    branch.netSales += total;
    const payment = paymentByBranch.get(order.store_id)?.get(order.payment_method) ?? { orders: 0, netSales: 0 };
    payment.orders += 1;
    payment.netSales += total;
    paymentByBranch.get(order.store_id)?.set(order.payment_method, payment);
    const bucket = bucketForIso(order.created_at, filters.grouping);
    const branchBucket = currentTrend.get(order.store_id)?.get(bucket.key) ?? { orders: 0, netSales: 0 };
    branchBucket.orders += 1;
    branchBucket.netSales += total;
    currentTrend.get(order.store_id)?.set(bucket.key, branchBucket);
    const period = periodCurrent.get(bucket.key) ?? { orders: 0, netSales: 0 };
    period.orders += 1;
    period.netSales += total;
    periodCurrent.set(bucket.key, period);
  }

  for (const order of previousNetOrders) {
    const branch = branchAggregates.get(order.store_id);
    if (!branch) continue;
    const total = num(order.total);
    branch.previousOrders += 1;
    branch.previousNetSales += total;
    const bucket = bucketForIso(order.created_at, filters.grouping);
    const branchBucket = previousTrend.get(order.store_id)?.get(bucket.key) ?? { orders: 0, netSales: 0 };
    branchBucket.orders += 1;
    branchBucket.netSales += total;
    previousTrend.get(order.store_id)?.set(bucket.key, branchBucket);
    const period = periodPrevious.get(bucket.key) ?? { orders: 0, netSales: 0 };
    period.orders += 1;
    period.netSales += total;
    periodPrevious.set(bucket.key, period);
  }

  for (const reversal of currentReversals) {
    const branch = branchAggregates.get(reversal.store_id);
    if (!branch) continue;
    if (reversal.status === "voided") {
      branch.voidCount += 1;
      branch.voidTotal += num(reversal.total);
    } else if (reversal.status === "refunded") {
      branch.refundCount += 1;
      branch.refundTotal += num(reversal.total);
    }
  }

  const branchRows = visibleBranches.map((branch) => {
    const aggregate = branchAggregates.get(branch.id) ?? { ...cloneAggregate(), previousOrders: 0, previousNetSales: 0 };
    const change = percentChange(aggregate.netSales, aggregate.previousNetSales, filters.compare);
    return {
      branchId: branch.id,
      name: branch.name,
      address: branch.address,
      isActive: branch.is_active,
      orders: aggregate.orders,
      previousOrders: aggregate.previousOrders,
      netSales: aggregate.netSales,
      previousNetSales: aggregate.previousNetSales,
      grossSales: aggregate.grossSales,
      discountTotal: aggregate.discountTotal,
      discountRate: percentShare(aggregate.discountTotal, aggregate.grossSales),
      averageOrder: average(aggregate.netSales, aggregate.orders),
      change,
      changeIsNew: Boolean(filters.compare && aggregate.previousNetSales === 0 && aggregate.netSales > 0),
      salesShare: percentShare(aggregate.netSales, currentAggregate.netSales),
      reversalCount: aggregate.voidCount + aggregate.refundCount,
      reversalTotal: aggregate.voidTotal + aggregate.refundTotal,
      payments: paymentRows(paymentByBranch.get(branch.id) ?? new Map(), aggregate.netSales),
    } satisfies BranchPerformanceBranchRow;
  });

  const tableRows = sortRows(
    branchRows.filter((row) => !filters.query || row.name.toLowerCase().includes(filters.query.toLowerCase())),
    filters.sort,
    filters.direction,
  );
  const deviceRowsByBranch = new Map<string, DeviceRecord[]>();
  for (const device of devices) {
    const rows = deviceRowsByBranch.get(device.store_id) ?? [];
    rows.push(device);
    deviceRowsByBranch.set(device.store_id, rows);
  }
  const staffCountByBranch = new Map<string, number>();
  for (const staff of staffRows) {
    if (!staff.is_active || !staff.store_id || !visibleBranchIds.has(staff.store_id)) continue;
    staffCountByBranch.set(staff.store_id, (staffCountByBranch.get(staff.store_id) ?? 0) + 1);
  }
  const productsByBranch = new Map<string, ProductRecord[]>();
  for (const product of products) {
    if (!product.is_active || !visibleBranchIds.has(product.store_id)) continue;
    const rows = productsByBranch.get(product.store_id) ?? [];
    rows.push(product);
    productsByBranch.set(product.store_id, rows);
  }
  const latestCloseoutByBranch = new Map<string, CloseoutRecord>();
  for (const closeout of closeouts) {
    if (!visibleBranchIds.has(closeout.store_id) || latestCloseoutByBranch.has(closeout.store_id)) continue;
    latestCloseoutByBranch.set(closeout.store_id, closeout);
  }
  const latestSaleByBranch = new Map<string, string>();
  for (const order of currentNetOrders) {
    const current = latestSaleByBranch.get(order.store_id);
    if (!current || order.created_at > current) latestSaleByBranch.set(order.store_id, order.created_at);
  }
  const today = singaporeDate();
  const staleCutoff = dateStart(shiftSingaporeDate(today, -6)).getTime();
  const healthRows = visibleBranches.map((branch) => {
    const branchDevices = deviceRowsByBranch.get(branch.id) ?? [];
    const branchProducts = productsByBranch.get(branch.id) ?? [];
    const lowStockCount = branchProducts.filter((product) => stockStatus(stockByKey.get(`${branch.id}:${product.id}`), product.min_stock) === "low").length;
    const outOfStockCount = branchProducts.filter((product) => stockStatus(stockByKey.get(`${branch.id}:${product.id}`), product.min_stock) === "out").length;
    const closeout = latestCloseoutByBranch.get(branch.id);
    const latestSaleAt = latestSaleByBranch.get(branch.id) ?? null;
    const reasons: string[] = [];
    if (!branch.is_active) reasons.push("Inactive branch");
    if (branchDevices.length === 0) reasons.push("No POS terminal registered");
    else if (branchDevices.every((device) => !device.is_active)) reasons.push("No active POS terminal");
    if (outOfStockCount > 0) reasons.push(`${outOfStockCount} out of stock`);
    if (lowStockCount > 0) reasons.push(`${lowStockCount} low stock`);
    const branchAggregate = branchAggregates.get(branch.id) ?? { ...cloneAggregate(), previousOrders: 0, previousNetSales: 0 };
    if (branchAggregate.orders === 0 || !latestSaleAt) reasons.push("No sales in range");
    else if (currentEnd.getTime() >= dateEnd(today).getTime() && new Date(latestSaleAt).getTime() < staleCutoff) reasons.push("No activity in the last 7 days");
    if (closeoutsResult.error) reasons.push("Closeout data unavailable");
    else if (!closeout) reasons.push("No closeout recorded");
    else if (num(closeout.cash_variance) !== 0) reasons.push("Cash variance recorded");
    const hasData = Boolean(latestSaleAt || closeout || branchDevices.length || branchProducts.length || staffCountByBranch.get(branch.id));
    const status: BranchPerformanceHealthStatus = !branch.is_active
      ? "inactive"
      : reasons.length > 0
        ? hasData ? "attention" : "no_data"
        : "healthy";
    return {
      branchId: branch.id,
      name: branch.name,
      isActive: branch.is_active,
      deviceCount: branchDevices.length,
      activeDevices: branchDevices.filter((device) => device.is_active).length,
      activeStaff: staffCountByBranch.get(branch.id) ?? 0,
      trackedItems: branchProducts.length,
      lowStockCount,
      outOfStockCount,
      latestCloseoutAt: closeout?.closed_at ?? closeout?.generated_at ?? null,
      latestCloseoutVariance: closeout ? num(closeout.cash_variance) : null,
      latestCloseoutZNumber: closeout ? num(closeout.z_number) : null,
      latestSaleAt,
      status,
      reasons,
    } satisfies BranchPerformanceHealthRow;
  });

  const periodBuckets = enumerateBuckets(filters.from, filters.to, filters.grouping);
  const previousBuckets = filters.compare ? enumerateBuckets(previousFrom, previousTo, filters.grouping) : [];
  const periodRows = periodBuckets.map((bucket, index) => {
    const previousBucket = previousBuckets[index];
    const current = periodCurrent.get(bucket.key) ?? { orders: 0, netSales: 0 };
    const previous = previousBucket ? periodPrevious.get(previousBucket.key) ?? { orders: 0, netSales: 0 } : { orders: 0, netSales: 0 };
    return { key: bucket.key, label: bucket.label, orders: current.orders, netSales: current.netSales, previousOrders: previous.orders, previousNetSales: previous.netSales };
  });
  const rankedForTrend = [...branchRows].sort((left, right) => right.netSales - left.netSales).slice(0, 4);
  const trendSeries = rankedForTrend.map((branch, index) => ({
    branchId: branch.branchId,
    label: branch.name,
    colorIndex: index + 1,
    values: periodBuckets.map((bucket) => currentTrend.get(branch.branchId)?.get(bucket.key)?.netSales ?? 0),
    previousValues: periodBuckets.map((_, bucketIndex) => {
      const previousBucket = previousBuckets[bucketIndex];
      return previousBucket ? previousTrend.get(branch.branchId)?.get(previousBucket.key)?.netSales ?? 0 : 0;
    }),
  }));

  let detail: BranchPerformanceDetail | null = null;
  let itemsQueryError = false;
  let itemRowsTruncated = false;
  if (branchId) {
    const detailOrderIds = new Set(currentNetOrders.filter((order) => order.store_id === branchId).map((order) => order.id));
    if (detailOrderIds.size > 0) {
      const itemsResult = await supabase
        .from("order_items")
        .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status, org_id, store_id, created_at, reversal_of)")
        .eq("orders.org_id", profile.org_id)
        .eq("orders.store_id", branchId)
        .eq("orders.status", "completed")
        .is("orders.reversal_of", null)
        .gte("orders.created_at", currentStart.toISOString())
        .lt("orders.created_at", currentEnd.toISOString())
        .limit(BRANCH_PERFORMANCE_ITEM_LIMIT);
      const rawItems = (itemsResult.data ?? []) as OrderItemRecord[];
      const items = rawItems.filter((item) => detailOrderIds.has(item.order_id));
      itemsQueryError = Boolean(itemsResult.error);
      itemRowsTruncated = rawItems.length >= BRANCH_PERFORMANCE_ITEM_LIMIT;
      const branch = visibleBranches[0];
      if (branch) {
        detail = createDetail(branch, items, products, categories, closeouts, branchRows.find((row) => row.branchId === branch.id)?.netSales ?? 0);
        mergeDetailHours(detail, currentNetOrders.filter((order) => order.store_id === branch.id));
      }
    } else {
      const branch = visibleBranches[0];
      if (branch) {
        detail = createDetail(branch, [], products, categories, closeouts, branchRows.find((row) => row.branchId === branch.id)?.netSales ?? 0);
      }
    }
  }

  const activeBranchCount = visibleBranches.filter((branch) => branch.is_active).length;
  const includedBranchCount = visibleBranches.length;
  const denominator = filters.includeInactive ? includedBranchCount : activeBranchCount;
  const queryWarning = Boolean(
    branchesResult.error
      || ordersResult.error
      || devicesResult.error
      || staffFallbackError
      || productsResult.error
      || categoriesResult.error
      || stockFallbackError
      || closeoutsResult.error
      || itemsQueryError
      || reversalLookup.failed,
  );
  const truncated = Boolean(
    allOrders.length >= BRANCH_PERFORMANCE_ORDER_LIMIT
      || devices.length >= DEVICE_LIMIT
      || staffRows.length >= STAFF_LIMIT
      || products.length >= PRODUCT_LIMIT
      || categories.length >= CATEGORY_LIMIT
      || stockRows.length >= PRODUCT_LIMIT
      || closeouts.length >= CLOSEOUT_LIMIT
      || stockFallbackTruncated
      || itemRowsTruncated,
  );
  const rawGrossSales = currentNetOrders.reduce((sum, order) => sum + num(order.subtotal), 0);
  const rawNetSales = currentNetOrders.reduce((sum, order) => sum + num(order.total), 0);
  const reconciliation: BranchPerformanceReconciliation = {
    rawSaleCandidateCount: saleCandidates.filter((order) => inWindow(order.created_at, currentStart, currentEnd) && visibleBranchIds.has(order.store_id)).length,
    rawReversalCount: currentReversals.length,
    netOrderCount: currentNetOrders.length,
    rawGrossSales,
    rawNetSales,
    summaryGrossSales: currentAggregate.grossSales,
    summaryNetSales: currentAggregate.netSales,
    balanced: !truncated && !reversalLookup.failed && rawGrossSales === currentAggregate.grossSales && rawNetSales === currentAggregate.netSales,
  };
  const salesChange = percentChange(currentAggregate.netSales, previousAggregate.netSales, filters.compare);
  const totals: BranchPerformanceTotals = {
    orderCount: currentAggregate.orders,
    previousOrderCount: previousAggregate.orders,
    grossSales: currentAggregate.grossSales,
    discountTotal: currentAggregate.discountTotal,
    discountRate: percentShare(currentAggregate.discountTotal, currentAggregate.grossSales),
    netSales: currentAggregate.netSales,
    previousNetSales: previousAggregate.netSales,
    averageOrder: average(currentAggregate.netSales, currentAggregate.orders),
    previousAverageOrder: average(previousAggregate.netSales, previousAggregate.orders),
    salesChange,
    salesChangeIsNew: Boolean(filters.compare && previousAggregate.netSales === 0 && currentAggregate.netSales > 0),
    voidCount: currentAggregate.voidCount,
    voidTotal: currentAggregate.voidTotal,
    refundCount: currentAggregate.refundCount,
    refundTotal: currentAggregate.refundTotal,
    reversalCount: currentAggregate.voidCount + currentAggregate.refundCount,
    reversalTotal: currentAggregate.voidTotal + currentAggregate.refundTotal,
    activeBranchCount,
    includedBranchCount,
    salesPerActiveBranch: denominator > 0 ? Math.round(currentAggregate.netSales / denominator) : 0,
  };

  return {
    filters,
    branches,
    branchName: profile.role === "manager" && !profile.store_id
      ? "No assigned branch"
      : branchId
        ? branches.find((branch) => branch.id === branchId)?.name ?? "Selected branch"
        : "All branches",
    canCompareBranches: profile.role === "admin" && !branchId && visibleBranches.length > 1,
    totals,
    branchRows,
    tableRows,
    healthRows,
    shareRows: createShareRows(branchRows, currentAggregate.netSales),
    periodRows,
    trendSeries,
    detail,
    reconciliation,
    queryWarning,
    truncated,
    generatedAt: new Date().toISOString(),
  };
}

export function weekdayLabel(weekday: number) {
  return WEEKDAY_LABELS[weekday] ?? "";
}
