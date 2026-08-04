import Image from "next/image";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { salesQuantity, stockStatus } from "@/lib/inventory";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";
type SalesRange = "7d" | "30d" | "90d";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = { id: string; name: string; is_active: boolean };
type CashierRecord = { id: string; full_name: string; role: AdminRole };

type SalesOrder = {
  id: string;
  order_no: string;
  store_id: string;
  cashier_id: string;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  payment_method: PaymentMethod;
  created_at: string;
};

type OrderItemRecord = {
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  line_total: number;
};

type ProductRecord = {
  id: string;
  name: string;
  unit: string;
  store_id: string;
  image_url: string | null;
  track_stock: boolean;
  min_stock: number | null;
  is_active: boolean;
};

type StockRow = {
  store_id: string;
  product_id: string;
  qty: number;
};

type DailyBucket = {
  key: string;
  date: Date;
  sales: number;
  orders: number;
  grossSales: number;
  discounts: number;
  refunds: number;
};

type BestSellingItem = {
  key: string;
  name: string;
  qty: number;
  total: number;
  imageUrl: string | null;
  unit: string;
};

type StockAlertRow = {
  product: ProductRecord;
  branchName: string;
  onHand: number;
  status: "out" | "low";
};

const DAY_MS = 24 * 60 * 60 * 1000;
const rangeOptions: Array<{ value: SalesRange; label: string; days: number }> = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
];
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourlyRange = Array.from({ length: 14 }, (_, index) => index + 7);
const singaporeDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const singaporeWeekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Singapore" });
const singaporeHourFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Singapore" });

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readPageSize(value: string) {
  return value === "25" || value === "50" ? Number(value) : 10;
}

function readPage(value: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function isSalesRange(value: string): value is SalesRange {
  return rangeOptions.some((option) => option.value === value);
}

function dateKey(value: Date) {
  const parts = new Map(singaporeDateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

function getSingaporeDayBounds() {
  const start = new Date(`${dateKey(new Date())}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function rangeDays(range: SalesRange) {
  return rangeOptions.find((option) => option.value === range)?.days ?? 7;
}

function rangeWindow(range: SalesRange, todayStart: Date) {
  const days = rangeDays(range);
  const currentStart = new Date(todayStart.getTime() - DAY_MS * (days - 1));
  const currentEnd = new Date(todayStart.getTime() + DAY_MS);
  return {
    currentStart,
    currentEnd,
    previousStart: new Date(currentStart.getTime() - DAY_MS * days),
    previousEnd: currentStart,
  };
}

function formatDateRange(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive.getTime() - DAY_MS);
  const formatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone: "Asia/Singapore", year: "numeric" }).format(new Date(value));
}

function formatDay(value: Date) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Singapore" }).format(value);
}

function formatHour(hour: number) {
  const date = new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00+08:00`);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true, timeZone: "Asia/Singapore" }).format(date);
}

function formatHourRange(hour: number) {
  return `${formatHour(hour)} – ${formatHour(hour + 1)}`;
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function statusLabel(status: OrderStatus) {
  if (status === "voided") return "Voided";
  if (status === "refunded") return "Refunded";
  return "Completed";
}

function statusClass(status: OrderStatus) {
  if (status === "voided") return "bg-danger-soft text-danger";
  if (status === "refunded") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

function productImage(product: ProductRecord | undefined) {
  return product?.image_url?.startsWith("/") ? product.image_url : null;
}

function summarizeOrders(orders: SalesOrder[]) {
  const completed = orders.filter((order) => order.status === "completed");
  const refunded = orders.filter((order) => order.status === "refunded");
  return {
    sales: completed.reduce((sum, order) => sum + Number(order.total), 0),
    orders: completed.length,
    grossSales: completed.reduce((sum, order) => sum + Number(order.subtotal), 0),
    discounts: completed.reduce((sum, order) => sum + Number(order.discount_amount), 0),
    vat: completed.reduce((sum, order) => sum + Number(order.vat_amount), 0),
    refunds: refunded.reduce((sum, order) => sum + Number(order.total), 0),
    refundOrders: refunded.length,
  };
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function sparklinePoints(values: number[], width = 160, height = 30) {
  if (values.length === 0) return "0,30";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function buildDailyBuckets(start: Date, days: number) {
  return Array.from({ length: days }, (_, index): DailyBucket => {
    const date = new Date(start.getTime() + DAY_MS * index);
    return { key: dateKey(date), date, sales: 0, orders: 0, grossSales: 0, discounts: 0, refunds: 0 };
  });
}

function weekdayIndex(value: Date) {
  const weekday = singaporeWeekdayFormatter.format(value);
  return weekdayLabels.indexOf(weekday);
}

function hourIndex(value: Date) {
  const hour = Number(singaporeHourFormatter.format(value));
  return hour === 24 ? 0 : hour;
}

function salesHref({ range, branch, page, pageSize, order }: { range: SalesRange; branch: string; page?: number; pageSize?: number; order?: string }) {
  const params = new URLSearchParams();
  params.set("range", range);
  if (branch) params.set("branch", branch);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== 10) params.set("pageSize", String(pageSize));
  if (order) params.set("order", order);
  return `/admin/sales?${params.toString()}`;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; branch?: string | string[]; page?: string | string[]; pageSize?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedRange = readParam(params.range);
  const range: SalesRange = isSalesRange(requestedRange) ? requestedRange : "7d";
  const branchFilter = readParam(params.branch);
  const pageSize = readPageSize(readParam(params.pageSize));
  const requestedPage = readPage(readParam(params.page));
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <SalesProfileMissing />;

  const { start: todayStart } = getSingaporeDayBounds();
  const window = rangeWindow(range, todayStart);
  let currentOrdersQuery = supabase
    .from("orders")
    .select("id, order_no, store_id, cashier_id, status, subtotal, discount_amount, vat_amount, total, payment_method, created_at")
    .eq("org_id", profile.org_id)
    .gte("created_at", window.currentStart.toISOString())
    .lt("created_at", window.currentEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  let previousOrdersQuery = supabase
    .from("orders")
    .select("id, order_no, store_id, cashier_id, status, subtotal, discount_amount, vat_amount, total, payment_method, created_at")
    .eq("org_id", profile.org_id)
    .gte("created_at", window.previousStart.toISOString())
    .lt("created_at", window.previousEnd.toISOString())
    .limit(5000);
  let productsQuery = supabase
    .from("products")
    .select("id, name, unit, store_id, image_url, track_stock, min_stock, is_active")
    .eq("org_id", profile.org_id)
    .order("name")
    .limit(1000);
  if (branchFilter) {
    currentOrdersQuery = currentOrdersQuery.eq("store_id", branchFilter);
    previousOrdersQuery = previousOrdersQuery.eq("store_id", branchFilter);
    productsQuery = productsQuery.eq("store_id", branchFilter);
  }

  const [branchesResult, cashiersResult, productsResult, stockResult, itemsResult, currentOrdersResult, previousOrdersResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name"),
    supabase.from("profiles").select("id, full_name, role").eq("org_id", profile.org_id).order("full_name").limit(200),
    productsQuery,
    // Aggregate the stock ledger in Postgres instead of shipping up to 10,000
    // raw movement rows to the browser on every sales-page load.
    supabase.rpc("current_stock", { p_org_id: profile.org_id }),
    // Items join straight to the current window's orders so this runs in the
    // same round trip as the batch instead of a second sequential .in() query.
    supabase
      .from("order_items")
      .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status)")
      .eq("orders.org_id", profile.org_id)
      .gte("orders.created_at", window.currentStart.toISOString())
      .lt("orders.created_at", window.currentEnd.toISOString()),
    currentOrdersQuery,
    previousOrdersQuery,
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const cashiers = (cashiersResult.data ?? []) as CashierRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const stock = (stockResult.data ?? []) as StockRow[];
  const currentOrders = (currentOrdersResult.data ?? []) as SalesOrder[];
  const previousOrders = (previousOrdersResult.data ?? []) as SalesOrder[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const cashierById = new Map(cashiers.map((cashier) => [cashier.id, cashier]));
  const productById = new Map(products.map((product) => [product.id, product]));

  const orderItems = (itemsResult.data ?? []) as OrderItemRecord[];
  const orderItemsError = Boolean(itemsResult.error);

  const currentSummary = summarizeOrders(currentOrders);
  const previousSummary = summarizeOrders(previousOrders);
  const completedOrderIds = new Set(currentOrders.filter((order) => order.status === "completed").map((order) => order.id));
  const dailyBuckets = buildDailyBuckets(window.currentStart, rangeDays(range));
  const dailyByKey = new Map(dailyBuckets.map((bucket) => [bucket.key, bucket]));
  const hourlySales = weekdayLabels.map(() => hourlyRange.map(() => 0));
  const weekdaySales = weekdayLabels.map(() => 0);
  for (const order of currentOrders) {
    const createdAt = new Date(order.created_at);
    const bucket = dailyByKey.get(dateKey(createdAt));
    if (order.status === "completed") {
      if (bucket) {
        bucket.sales += Number(order.total);
        bucket.orders += 1;
        bucket.grossSales += Number(order.subtotal);
        bucket.discounts += Number(order.discount_amount);
      }
      const day = weekdayIndex(createdAt);
      const hour = hourIndex(createdAt);
      const hourOffset = hourlyRange.indexOf(hour);
      if (day >= 0) {
        weekdaySales[day] += Number(order.total);
        if (hourOffset >= 0) hourlySales[day][hourOffset] += Number(order.total);
      }
    }
    if (order.status === "refunded" && bucket) bucket.refunds += Number(order.total);
  }

  const bestItemsByKey = new Map<string, BestSellingItem>();
  const itemCountByOrder = new Map<string, number>();
  for (const item of orderItems) {
    itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + salesQuantity(item));
    if (!completedOrderIds.has(item.order_id)) continue;
    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const key = item.product_id ?? `name:${item.name_snapshot}`;
    const existing = bestItemsByKey.get(key) ?? {
      key,
      name: product?.name ?? item.name_snapshot,
      qty: 0,
      total: 0,
      imageUrl: productImage(product),
      unit: product?.unit ?? "pcs",
    };
    existing.qty += salesQuantity(item);
    existing.total += Number(item.line_total);
    bestItemsByKey.set(key, existing);
  }
  const bestSellingItems = [...bestItemsByKey.values()].sort((left, right) => right.total - left.total || right.qty - left.qty).slice(0, 5);

  const stockByKey = new Map<string, number>();
  for (const row of stock) {
    stockByKey.set(`${row.store_id}:${row.product_id}`, Number(row.qty));
  }
  const stockRows = products
    .filter((product) => product.track_stock)
    .map((product) => {
      const onHand = stockByKey.get(`${product.store_id}:${product.id}`) ?? 0;
      const status = stockStatus(onHand, product.min_stock);
      return { product, onHand, status, branchName: branchById.get(product.store_id)?.name ?? "Unknown branch" };
    })
    .filter((row): row is StockAlertRow => row.status === "low" || row.status === "out")
    .sort((left, right) => left.onHand - right.onHand);
  const lowStockRows = stockRows.filter((row) => row.status === "low");
  const outOfStockRows = stockRows.filter((row) => row.status === "out");

  const todayBucket = dailyByKey.get(dateKey(todayStart));
  const historicalBuckets = dailyBuckets.filter((bucket) => bucket.key !== dateKey(todayStart));
  const historicalAverage = historicalBuckets.length ? historicalBuckets.reduce((sum, bucket) => sum + bucket.sales, 0) / historicalBuckets.length : 0;
  const demandChange = historicalAverage > 0 ? ((todayBucket?.sales ?? 0) - historicalAverage) / historicalAverage * 100 : null;
  let peakHour: { hour: number; total: number } | null = null;
  for (let offset = 0; offset < hourlyRange.length; offset += 1) {
    const total = hourlySales.reduce((sum, row) => sum + row[offset], 0);
    if (total > 0 && (!peakHour || total > peakHour.total)) peakHour = { hour: hourlyRange[offset], total };
  }
  const peakShare = peakHour && currentSummary.sales > 0 ? Math.round((peakHour.total / currentSummary.sales) * 100) : 0;

  const queryWarning = Boolean(branchesResult.error || cashiersResult.error || productsResult.error || stockResult.error || currentOrdersResult.error || previousOrdersResult.error || orderItemsError);
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const branchLabel = branchFilter ? branchById.get(branchFilter)?.name ?? "Selected branch" : "All branches";
  const totalPages = Math.max(1, Math.ceil(currentOrders.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const visibleOrders = currentOrders.slice((page - 1) * pageSize, page * pageSize);
  const comparisonLabel = range === "7d" ? "previous 7 days" : range === "30d" ? "previous 30 days" : "previous 90 days";
  const exportHref = `/admin/report?range=${range}${branchFilter ? `&branch=${encodeURIComponent(branchFilter)}` : ""}`;

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-4 pt-1">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Performance workspace · {branchLabel}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-ink sm:text-4xl">Sales</h1><p className="mt-1 text-sm text-ink-muted">Track your sales performance and grow your business, {firstName}.</p></div>
            <div className="admin-compact-toolbar">
              <form action="/admin/sales" method="get" className="admin-compact-toolbar__filters">
                <label className="sr-only" htmlFor="sales-range">Sales period</label>
                <select id="sales-range" name="range" defaultValue={range} className="inventory-input admin-compact-toolbar__select admin-compact-toolbar__select--range bg-surface font-bold">
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
                <label className="sr-only" htmlFor="sales-branch">Sales branch</label>
                <select id="sales-branch" name="branch" defaultValue={branchFilter} className="inventory-input admin-compact-toolbar__select bg-surface font-bold">
                  <option value="">All branches</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}
                </select>
                <button type="submit" className="admin-compact-toolbar__button rounded-btn bg-primary text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
              </form>
              <Link href={exportHref} className="admin-compact-toolbar__button gap-2 rounded-btn bg-primary text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover"><span aria-hidden="true">↓</span> Export CSV</Link>
              <Link href="/pos" className="admin-compact-toolbar__button hidden rounded-btn bg-secondary text-xs font-extrabold text-primary transition hover:bg-secondary-hover xl:inline-flex">New sale</Link>
              <SignOutButton className="admin-compact-toolbar__button text-xs" />
            </div>
          </header>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some Sales data could not refresh. The page is showing the records that were available; check the Supabase connection and RLS scope if totals look incomplete.</div>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <SalesMetric label="Total sales" value={displayPeso(currentSummary.sales)} trend={percentChange(currentSummary.sales, previousSummary.sales)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.sales)} tone="bg-primary text-primary-fg" icon="sales" />
            <SalesMetric label="Total orders" value={String(currentSummary.orders)} trend={percentChange(currentSummary.orders, previousSummary.orders)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.orders)} tone="bg-accent text-accent-fg" icon="bag" />
            <SalesMetric label="Average order value" value={displayPeso(currentSummary.orders ? Math.round(currentSummary.sales / currentSummary.orders) : 0)} trend={percentChange(currentSummary.orders ? currentSummary.sales / currentSummary.orders : 0, previousSummary.orders ? previousSummary.sales / previousSummary.orders : 0)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.orders ? bucket.sales / bucket.orders : 0)} tone="bg-success text-white" icon="wallet" />
            <SalesMetric label="Gross sales" value={displayPeso(currentSummary.grossSales)} trend={percentChange(currentSummary.grossSales, previousSummary.grossSales)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.grossSales)} tone="bg-[#5f4b93] text-white" icon="chart" />
            <SalesMetric label="Discounts given" value={displayPeso(currentSummary.discounts)} trend={percentChange(currentSummary.discounts, previousSummary.discounts)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.discounts)} tone="bg-warning text-white" icon="promotions" favorable="down" />
            <SalesMetric label="Refunds" value={displayPeso(currentSummary.refunds)} trend={percentChange(currentSummary.refunds, previousSummary.refunds)} comparisonLabel={comparisonLabel} values={dailyBuckets.map((bucket) => bucket.refunds)} tone="bg-[#3c8fe6] text-white" icon="orders" favorable="down" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.38fr)_minmax(350px,0.9fr)_minmax(280px,0.82fr)]">
            <section aria-labelledby="sales-trend-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="sales-trend-heading" className="admin-panel__title">Sales trend</h2><p className="admin-panel__subtitle">Daily sales for {formatDateRange(window.currentStart, window.currentEnd)}</p></div><span className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary">Daily</span></div><SalesTrendChart buckets={dailyBuckets} /></section>
            <HourlyHeatmap hourlySales={hourlySales} peakHour={peakHour} peakShare={peakShare} />
            <AlertsPanel lowStockCount={lowStockRows.length} outOfStockCount={outOfStockRows.length} demandChange={demandChange} todaySales={todayBucket?.sales ?? 0} peakHour={peakHour} range={range} branch={branchFilter} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(270px,0.85fr)]">
            <BestSellingPanel items={bestSellingItems} range={range} branch={branchFilter} />
            <WeekdayPanel weekdaySales={weekdaySales} />
            <SummaryPanel summary={currentSummary} />
          </div>

          <RecentTransactions orders={visibleOrders} totalOrders={currentOrders.length} page={page} pageSize={pageSize} totalPages={totalPages} range={range} branch={branchFilter} branchById={branchById} cashierById={cashierById} itemCountByOrder={itemCountByOrder} />
      </div>
    </main>
  );
}

function SalesMetric({ label, value, trend, comparisonLabel, values, tone, icon, favorable = "up" }: { label: string; value: string; trend: number | null; comparisonLabel: string; values: number[]; tone: string; icon: "sales" | "bag" | "wallet" | "chart" | "promotions" | "orders"; favorable?: "up" | "down" }) {
  const trendIsFavorable = trend === null ? false : favorable === "down" ? trend <= 0 : trend >= 0;
  return <article className="admin-kpi-card min-h-[139px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums text-[19px]">{value}</p><p className="admin-kpi-card__trend"><strong className={trend === null ? "text-ink-muted" : trendIsFavorable ? "text-success" : "text-danger"}>{trend === null ? "—" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(1)}%`}</strong><span>{trend === null ? "No prior baseline" : `vs ${comparisonLabel}`}</span></p><svg className="admin-sparkline" viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={sparklinePoints(values)} stroke={tone.includes("accent") ? "#9a2e13" : "#5b2a0a"} /></svg></div></article>;
}

function SalesTrendChart({ buckets }: { buckets: DailyBucket[] }) {
  const maxValue = Math.max(...buckets.map((bucket) => bucket.sales), 0);
  if (maxValue === 0) return <EmptyPanelState title="No completed sales in this period" detail="The trend will populate as completed POS orders are recorded." />;
  const width = 650;
  const height = 220;
  const left = 48;
  const top = 14;
  const plotWidth = 590;
  const plotHeight = 172;
  const maxY = Math.ceil(maxValue / 5000) * 5000 || maxValue;
  const pointFor = (value: number, index: number) => {
    const x = left + (buckets.length === 1 ? plotWidth / 2 : (index / (buckets.length - 1)) * plotWidth);
    const y = top + plotHeight - (value / maxY) * plotHeight;
    return { x, y };
  };
  const points = buckets.map((bucket, index) => pointFor(bucket.sales, index));
  const linePoints = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const areaPoints = `${left},${top + plotHeight} ${linePoints} ${left + plotWidth},${top + plotHeight}`;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));
  return <div className="mt-4 overflow-x-auto"><svg role="img" aria-label="Daily completed sales trend" viewBox={`0 0 ${width} ${height}`} className="min-w-[600px] w-full"><title>Daily completed sales trend</title><defs><linearGradient id="sales-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b97837" stopOpacity="0.32" /><stop offset="100%" stopColor="#b97837" stopOpacity="0.03" /></linearGradient></defs>{[0, 0.25, 0.5, 0.75, 1].map((fraction) => { const y = top + plotHeight - fraction * plotHeight; return <g key={fraction}><line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="#eee4d7" strokeWidth="1" /><text x={left - 8} y={y + 4} textAnchor="end" fill="#8c7b67" fontSize="10">{displayPeso(maxY * fraction)}</text></g>; })}<polygon points={areaPoints} fill="url(#sales-trend-fill)" /><polyline points={linePoints} fill="none" stroke="#7a3c0c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{points.map((point, index) => <g key={buckets[index].key}><circle cx={point.x} cy={point.y} r="4" fill="#7a3c0c" stroke="#fffaf3" strokeWidth="2"><title>{`${formatDay(buckets[index].date)}: ${displayPeso(buckets[index].sales)}`}</title></circle>{(index % labelEvery === 0 || index === buckets.length - 1) && <text x={point.x} y={top + plotHeight + 28} textAnchor="middle" fill="#5f5145" fontSize="10">{formatDay(buckets[index].date)}</text>}</g>)}</svg></div>;
}

function HourlyHeatmap({ hourlySales, peakHour, peakShare }: { hourlySales: number[][]; peakHour: { hour: number; total: number } | null; peakShare: number }) {
  const maxValue = Math.max(...hourlySales.flat(), 0);
  return <section id="hourly-sales" aria-labelledby="hourly-sales-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="hourly-sales-heading" className="admin-panel__title">Top performing hours</h2><p className="admin-panel__subtitle">Completed sales by hour of the day</p></div><span className="rounded-btn border border-line bg-surface px-3 py-2 text-xs font-extrabold text-primary">Heatmap</span></div><div className="mt-5 overflow-x-auto"><div className="min-w-[505px]"><div className="grid grid-cols-[42px_repeat(14,minmax(28px,1fr))] gap-1 text-center text-[9px] font-bold text-ink-muted"><span></span>{hourlyRange.map((hour) => <span key={hour}>{formatHour(hour)}</span>)}{weekdayLabels.map((day, dayIndex) => <Fragment key={day}><span className="flex items-center text-left">{day}</span>{hourlyRange.map((hour, hourIndex) => { const value = hourlySales[dayIndex][hourIndex]; const alpha = maxValue > 0 && value > 0 ? 0.16 + (value / maxValue) * 0.72 : 0.06; return <span key={`${day}-${hour}`} title={`${day} ${formatHour(hour)}: ${displayPeso(value)}`} aria-label={`${day} ${formatHour(hour)}: ${displayPeso(value)}`} className="aspect-[1.18] rounded-[3px]" style={{ backgroundColor: `rgba(91, 42, 10, ${alpha})` }} />; })}</Fragment>)}</div><div className="mt-3 flex items-center justify-end gap-2 text-[9px] text-ink-muted"><span>Low sales</span><span className="h-2 w-28 rounded-full bg-gradient-to-r from-[#f5eadc] to-[#6f2e08]"></span><span>High sales</span></div></div></div><div className="mt-4 flex items-center justify-between gap-3 rounded-btn border border-line bg-surface-raised px-3 py-3"><span className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><AdminIcon name="chart" size={16} /></span><span className="min-w-0"><strong className="block text-xs font-extrabold text-ink">Peak hour</strong><small className="block truncate text-[10px] text-ink-muted">{peakHour ? formatHourRange(peakHour.hour) : "No completed sales yet"}</small></span></span><span className="text-right"><strong className="block text-lg font-extrabold text-accent">{peakHour ? `${peakShare}%` : "—"}</strong><small className="block text-[10px] text-ink-muted">of total sales</small></span></div></section>;
}

function AlertsPanel({ lowStockCount, outOfStockCount, demandChange, todaySales, peakHour, range, branch }: { lowStockCount: number; outOfStockCount: number; demandChange: number | null; todaySales: number; peakHour: { hour: number; total: number } | null; range: SalesRange; branch: string }) {
  const inventoryHref = branch ? `/admin/inventory` : "/admin/inventory";
  const demandDetail = demandChange === null ? todaySales > 0 ? "Not enough prior days for a comparison" : "No completed sales recorded today" : `Sales ${Math.abs(demandChange).toFixed(0)}% ${demandChange >= 0 ? "higher" : "lower"} than the recent daily average`;
  return <section aria-labelledby="sales-alerts-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="sales-alerts-heading" className="admin-panel__title">Alerts &amp; reminders</h2><p className="admin-panel__subtitle">Signals from inventory and current sales</p></div><Link href={inventoryHref} className="text-xs font-extrabold text-primary hover:underline">View all</Link></div><div className="mt-4 divide-y divide-line/70"><AlertRow href={inventoryHref} icon="inventory" tone="bg-danger-soft text-danger" label="Low stock items" detail={`${lowStockCount} item${lowStockCount === 1 ? " is" : "s are"} at or below the configured minimum`} badge={lowStockCount} /><AlertRow href={inventoryHref} icon="inventory" tone="bg-danger-soft text-danger" label="Out of stock items" detail={`${outOfStockCount} item${outOfStockCount === 1 ? " is" : "s are"} out of stock`} badge={outOfStockCount} /><AlertRow href={salesHref({ range, branch })} icon="chart" tone="bg-success/10 text-success" label="Demand today" detail={demandDetail} /><AlertRow href="#hourly-sales" icon="chart" tone="bg-warning/15 text-warning" label="Top selling hour" detail={peakHour ? formatHourRange(peakHour.hour) : "No completed sales yet"} /></div></section>;
}

function AlertRow({ href, icon, tone, label, detail, badge }: { href: string; icon: "inventory" | "chart"; tone: string; label: string; detail: string; badge?: number }) {
  return <Link href={href} className="flex items-center gap-3 py-3 transition hover:bg-primary-soft/35"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-btn ${tone}`}><AdminIcon name={icon} size={18} /></span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-ink">{label}</strong><small className="mt-1 block truncate text-[10px] text-ink-muted">{detail}</small></span>{badge !== undefined && <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[9px] font-extrabold ${badge > 0 ? "bg-danger text-white" : "bg-secondary text-primary"}`}>{badge}</span>}<AdminIcon name="arrow" size={14} /></Link>;
}

function BestSellingPanel({ items, range, branch }: { items: BestSellingItem[]; range: SalesRange; branch: string }) {
  return <section aria-labelledby="best-selling-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="best-selling-heading" className="admin-panel__title">Best selling items</h2><p className="admin-panel__subtitle">Top 5 items by completed sales</p></div><Link href={`/admin/orders?range=${range}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`} className="text-xs font-extrabold text-primary hover:underline">View all</Link></div>{items.length === 0 ? <EmptyPanelState title="No item sales yet" detail="Best sellers appear after completed orders include line items." /> : <div className="mt-4 grid gap-2.5">{items.map((item, index) => <div key={item.key} className="grid grid-cols-[22px_36px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line/70 pb-2.5 last:border-0 last:pb-0"><span className="grid h-5 w-5 place-items-center rounded-md bg-secondary text-[9px] font-extrabold text-primary">{index + 1}</span><ItemThumb imageUrl={item.imageUrl} alt={item.name} size={36} /><span className="min-w-0"><strong className="block truncate text-[11px] font-extrabold text-ink">{item.name}</strong><small className="mt-1 block text-[9px] text-ink-muted">{formatQuantity(item.qty)} {item.unit} sold</small></span><strong className="tnums whitespace-nowrap text-[10px] font-extrabold text-ink">{displayPeso(item.total)}</strong></div>)}</div>}</section>;
}

function WeekdayPanel({ weekdaySales }: { weekdaySales: number[] }) {
  const maxValue = Math.max(...weekdaySales, 0);
  return <section aria-labelledby="weekday-sales-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="weekday-sales-heading" className="admin-panel__title">Sales by day of week</h2><p className="admin-panel__subtitle">Total completed sales breakdown</p></div></div>{maxValue === 0 ? <EmptyPanelState title="No weekday signal yet" detail="The breakdown will fill in after completed sales are recorded." /> : <div className="mt-5 grid h-[170px] grid-cols-7 items-end gap-2">{weekdayLabels.map((day, index) => { const value = weekdaySales[index]; const height = `${Math.max((value / maxValue) * 100, 3)}%`; return <div key={day} className="flex h-full flex-col items-center justify-end gap-2"><span className="text-[9px] font-extrabold text-ink">{displayPeso(value)}</span><span className={`w-full max-w-9 rounded-t-md ${value === maxValue ? "bg-primary" : "bg-secondary"}`} style={{ height }} title={`${day}: ${displayPeso(value)}`} /><span className="text-[9px] font-bold text-ink-muted">{day}</span></div>; })}</div>}</section>;
}

function SummaryPanel({ summary }: { summary: ReturnType<typeof summarizeOrders> }) {
  const netSales = summary.sales - summary.refunds;
  const returnedRate = summary.orders > 0 ? ((summary.refundOrders / summary.orders) * 100).toFixed(2) : "0.00";
  const rows = [["Total sales", displayPeso(summary.sales)], ["Total orders", String(summary.orders)], ["Returned orders", `${summary.refundOrders} (${returnedRate}%)`], ["Net sales", displayPeso(netSales)], ["Tax collected", displayPeso(summary.vat)], ["Discounts given", displayPeso(summary.discounts)]];
  return <section aria-labelledby="sales-summary-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="sales-summary-heading" className="admin-panel__title">Sales summary</h2><p className="admin-panel__subtitle">Key summary for the selected period</p></div></div><div className="mt-4 divide-y divide-line/70 rounded-btn bg-surface-raised px-3">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[10px]"><span className="text-ink-muted">{label}</span><strong className="tnums text-right font-extrabold text-ink">{value}</strong></div>)}</div></section>;
}

function RecentTransactions({ orders, totalOrders, page, pageSize, totalPages, range, branch, branchById, cashierById, itemCountByOrder }: { orders: SalesOrder[]; totalOrders: number; page: number; pageSize: number; totalPages: number; range: SalesRange; branch: string; branchById: Map<string, BranchRecord>; cashierById: Map<string, CashierRecord>; itemCountByOrder: Map<string, number> }) {
  const firstRow = totalOrders === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalOrders);
  return <section aria-labelledby="recent-sales-heading" className="admin-panel mt-4 min-w-0 p-5"><div className="admin-panel__header"><div><h2 id="recent-sales-heading" className="admin-panel__title">Recent sales transactions</h2><p className="admin-panel__subtitle">Latest transactions in the selected period</p></div><Link href={`/admin/orders?range=${range}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`} className="text-xs font-extrabold text-primary hover:underline">View all</Link></div>{orders.length === 0 ? <EmptyPanelState title="No transactions in this period" detail="Completed POS activity will appear here once orders are recorded." /> : <><div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[900px]"><thead><tr><th>Invoice no.</th><th>Date &amp; time</th><th>Branch</th><th>Cashier</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><Link href={`/admin/orders?range=${range}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}&order=${order.id}`} className="font-extrabold text-primary hover:underline">{order.order_no}</Link></td><td className="whitespace-nowrap text-ink-muted">{formatDateTime(order.created_at)}</td><td className="whitespace-nowrap">{branchById.get(order.store_id)?.name ?? "Unknown branch"}</td><td className="whitespace-nowrap">{cashierById.get(order.cashier_id)?.full_name ?? "Unknown cashier"}</td><td className="tnums whitespace-nowrap">{formatQuantity(itemCountByOrder.get(order.id) ?? 0)}</td><td className="tnums whitespace-nowrap font-extrabold">{displayPeso(order.total)}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></td><td><Link href={`/admin/orders?range=${range}${branch ? `&branch=${encodeURIComponent(branch)}` : ""}&order=${order.id}`} className="inline-flex items-center gap-1 font-extrabold text-primary hover:underline">View <AdminIcon name="arrow" size={12} /></Link></td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><span className="text-[10px] font-semibold text-ink-muted">Showing {firstRow} to {lastRow} of {totalOrders} transactions</span><div className="flex items-center gap-1"><PaginationLink href={page > 1 ? salesHref({ range, branch, page: page - 1, pageSize }) : undefined} label="Previous" symbol="‹" />{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <Link key={pageNumber} href={salesHref({ range, branch, page: pageNumber, pageSize })} className={`grid h-8 min-w-8 place-items-center rounded-btn px-2 text-[10px] font-extrabold ${pageNumber === page ? "bg-primary text-primary-fg" : "border border-line bg-surface text-primary hover:bg-primary-soft"}`}>{pageNumber}</Link>)}{totalPages > 5 && <span className="grid h-8 min-w-8 place-items-center text-[10px] text-ink-muted">…</span>}<PaginationLink href={page < totalPages ? salesHref({ range, branch, page: page + 1, pageSize }) : undefined} label="Next" symbol="›" /></div><PageSizeForm range={range} branch={branch} pageSize={pageSize} /></div></>}</section>;
}

function PaginationLink({ href, label, symbol }: { href?: string; label: string; symbol: string }) {
  return href ? <Link href={href} aria-label={label} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line bg-surface px-2 text-sm font-extrabold text-primary hover:bg-primary-soft">{symbol}</Link> : <span aria-disabled="true" aria-label={label} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line/60 bg-surface-raised px-2 text-sm font-extrabold text-ink-muted">{symbol}</span>;
}

function PageSizeForm({ range, branch, pageSize }: { range: SalesRange; branch: string; pageSize: number }) {
  return <form action="/admin/sales" method="get" className="flex items-center gap-2"><input type="hidden" name="range" value={range} />{branch && <input type="hidden" name="branch" value={branch} />}<label htmlFor="sales-page-size" className="text-[10px] font-semibold text-ink-muted">Rows per page</label><select id="sales-page-size" name="pageSize" defaultValue={String(pageSize)} className="inventory-input min-h-8 w-auto py-1 text-[10px]"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><button type="submit" className="rounded-btn border border-line bg-surface px-2 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary-soft">Apply</button></form>;
}

function ItemThumb({ imageUrl, alt, size }: { imageUrl: string | null; alt: string; size: number }) {
  return <span className="grid shrink-0 place-items-center overflow-hidden rounded-md bg-primary-soft text-primary" style={{ width: size, height: size }}>{imageUrl ? <Image src={imageUrl} alt={alt} width={size} height={size} className="h-full w-full object-cover" /> : <AdminIcon name="box" size={Math.max(15, Math.round(size * 0.52))} />}</span>;
}

function EmptyPanelState({ title, detail }: { title: string; detail: string }) {
  return <div className="mt-4 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-8 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="sales" size={19} /></span><p className="mt-3 text-xs font-extrabold text-ink">{title}</p><p className="mt-1 text-[10px] leading-5 text-ink-muted">{detail}</p></div>;
}

function SalesProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-2" /></div></div></main>;
}
