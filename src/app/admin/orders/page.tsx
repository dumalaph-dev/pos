import Image from "next/image";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { salesQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";
type OrderRange = "today" | "7d" | "30d" | "90d" | "all";
type OrderStatusFilter = "all" | OrderStatus;
type PaymentFilter = "all" | PaymentMethod;

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = { id: string; name: string; is_active: boolean };
type CashierRecord = { id: string; full_name: string; role: AdminRole };

type OrderRecord = {
  id: string;
  order_no: string;
  store_id: string;
  cashier_id: string;
  status: OrderStatus;
  subtotal: number;
  discount_type: string;
  discount_amount: number;
  discount_ref: string | null;
  vat_amount: number;
  total: number;
  payment_method: PaymentMethod;
  payment_ref: string | null;
  amount_tendered: number | null;
  change_due: number | null;
  note: string | null;
  created_at: string;
  created_at_device: string;
};

type OrderItemRecord = {
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  unit_price_snapshot: number;
  line_total: number;
};

type ProductRecord = { id: string; image_url: string | null; unit: string };

type TrendBucket = {
  key: string;
  date: Date;
  orders: number;
  completed: number;
  refunded: number;
  voided: number;
  sales: number;
  discounts: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const rangeOptions: Array<{ value: OrderRange; label: string; days?: number }> = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time" },
];
const statusOptions: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "refunded", label: "Refunded" },
  { value: "voided", label: "Voided" },
];
const paymentOptions: Array<{ value: PaymentFilter; label: string }> = [
  { value: "all", label: "All payment methods" },
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
];
const ORDER_LIST_FIELDS = "id, order_no, store_id, cashier_id, status, discount_amount, total, payment_method, created_at";
const ORDER_DETAIL_FIELDS = "id, order_no, store_id, cashier_id, status, subtotal, discount_type, discount_amount, discount_ref, vat_amount, total, payment_method, payment_ref, amount_tendered, change_due, note, created_at, created_at_device";
const singaporeDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Singapore",
  year: "numeric",
});

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isOrderRange(value: string): value is OrderRange {
  return rangeOptions.some((option) => option.value === value);
}

function isOrderStatusFilter(value: string): value is OrderStatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function isPaymentFilter(value: string): value is PaymentFilter {
  return paymentOptions.some((option) => option.value === value);
}

function readPageSize(value: string) {
  return value === "25" || value === "50" ? Number(value) : 10;
}

function readPage(value: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function dateKey(value: Date) {
  const parts = new Map(singaporeDateFormatter.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

function dateFromKey(key: string) {
  return new Date(`${key}T00:00:00+08:00`);
}

function getSingaporeDayBounds() {
  const start = dateFromKey(dateKey(new Date()));
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function rangeDays(range: OrderRange) {
  return rangeOptions.find((option) => option.value === range)?.days ?? null;
}

function rangeStart(range: OrderRange, todayStart: Date) {
  const days = rangeDays(range);
  return days ? new Date(todayStart.getTime() - DAY_MS * (days - 1)) : null;
}

function rangeLabel(range: OrderRange) {
  return rangeOptions.find((option) => option.value === range)?.label ?? "Last 7 days";
}

function formatDateRange(start: Date | null, endExclusive: Date) {
  if (!start) return "All available dates";
  const end = new Date(endExclusive.getTime() - DAY_MS);
  const formatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date(value));
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function paymentLabel(method: PaymentMethod) {
  if (method === "gcash") return "GCash";
  if (method === "maya") return "Maya";
  if (method === "card") return "Card";
  return "Cash";
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

function orderSummary(orders: OrderRecord[]) {
  const completed = orders.filter((order) => order.status === "completed");
  return {
    total: orders.length,
    completed: completed.length,
    refunded: orders.filter((order) => order.status === "refunded").length,
    voided: orders.filter((order) => order.status === "voided").length,
    sales: completed.reduce((sum, order) => sum + Number(order.total), 0),
    discounts: completed.reduce((sum, order) => sum + Number(order.discount_amount), 0),
  };
}

function percentChange(current: number, previous: number, enabled: boolean) {
  if (!enabled) return null;
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

function buildTrendBuckets(orders: OrderRecord[], start: Date | null, end: Date) {
  const buckets = new Map<string, TrendBucket>();
  if (start) {
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
    for (let index = 0; index < days; index += 1) {
      const date = new Date(start.getTime() + DAY_MS * index);
      const key = dateKey(date);
      buckets.set(key, { key, date, orders: 0, completed: 0, refunded: 0, voided: 0, sales: 0, discounts: 0 });
    }
  } else {
    for (const order of orders) {
      const date = new Date(order.created_at);
      const key = dateKey(date);
      if (!buckets.has(key)) buckets.set(key, { key, date: dateFromKey(key), orders: 0, completed: 0, refunded: 0, voided: 0, sales: 0, discounts: 0 });
    }
  }
  for (const order of orders) {
    const key = dateKey(new Date(order.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    if (order.status === "completed") {
      bucket.completed += 1;
      bucket.sales += Number(order.total);
      bucket.discounts += Number(order.discount_amount);
    } else if (order.status === "refunded") {
      bucket.refunded += 1;
    } else if (order.status === "voided") {
      bucket.voided += 1;
    }
  }
  return [...buckets.values()].sort((left, right) => left.date.getTime() - right.date.getTime());
}

function buildOrderHref({ range, status, payment, branch, query, page, pageSize, order }: { range: OrderRange; status: OrderStatusFilter; payment: PaymentFilter; branch: string; query: string; page?: number; pageSize?: number; order?: string }) {
  const params = new URLSearchParams();
  params.set("range", range);
  if (status !== "all") params.set("status", status);
  if (payment !== "all") params.set("payment", payment);
  if (branch) params.set("branch", branch);
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));
  if (pageSize && pageSize !== 10) params.set("pageSize", String(pageSize));
  if (order) params.set("order", order);
  return `/admin/orders?${params.toString()}`;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; status?: string | string[]; payment?: string | string[]; branch?: string | string[]; q?: string | string[]; order?: string | string[]; page?: string | string[]; pageSize?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <OrdersProfileMissing />;

  const requestedRange = readParam(params.range);
  const requestedStatus = readParam(params.status);
  const requestedPayment = readParam(params.payment);
  const range: OrderRange = isOrderRange(requestedRange) ? requestedRange : "7d";
  const status: OrderStatusFilter = isOrderStatusFilter(requestedStatus) ? requestedStatus : "all";
  const payment: PaymentFilter = isPaymentFilter(requestedPayment) ? requestedPayment : "all";
  const requestedBranchFilter = readParam(params.branch);
  const searchQuery = readParam(params.q).trim();
  const selectedOrderId = readParam(params.order);
  const pageSize = readPageSize(readParam(params.pageSize));
  const requestedPage = readPage(readParam(params.page));
  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const startDate = rangeStart(range, todayStart);
  const previousStart = startDate && rangeDays(range) ? new Date(startDate.getTime() - DAY_MS * rangeDays(range)!) : null;
  const previousEnd = startDate;

  const branchesResult = await supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name");
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const selectedBranchId = profile.role === "admin"
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;
  const branchFilter = selectedBranchId ?? (branches.some((branch) => branch.id === requestedBranchFilter) ? requestedBranchFilter : "");

  let ordersQuery = supabase
    .from("orders")
    .select(ORDER_LIST_FIELDS)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(1000);
  let previousOrdersQuery = supabase
    .from("orders")
    .select(ORDER_LIST_FIELDS)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (startDate) ordersQuery = ordersQuery.gte("created_at", startDate.toISOString()).lt("created_at", todayEnd.toISOString());
  if (previousStart && previousEnd) previousOrdersQuery = previousOrdersQuery.gte("created_at", previousStart.toISOString()).lt("created_at", previousEnd.toISOString());
  if (status !== "all") {
    ordersQuery = ordersQuery.eq("status", status);
    previousOrdersQuery = previousOrdersQuery.eq("status", status);
  }
  if (payment !== "all") {
    ordersQuery = ordersQuery.eq("payment_method", payment);
    previousOrdersQuery = previousOrdersQuery.eq("payment_method", payment);
  }
  if (branchFilter) {
    ordersQuery = ordersQuery.eq("store_id", branchFilter);
    previousOrdersQuery = previousOrdersQuery.eq("store_id", branchFilter);
  }
  const previousOrdersPromise = startDate ? previousOrdersQuery : null;

  // Items are joined straight to the filtered orders so they run in the same
  // round trip as the batch. range=all has no date bound, so that range keeps
  // the bounded two-step .in() fetch below.
  let itemsQuery = startDate
    ? supabase
        .from("order_items")
        .select("order_id, product_id, name_snapshot, qty, weight_kg, unit_price_snapshot, line_total, orders!inner(status)")
        .eq("orders.org_id", profile.org_id)
        .gte("orders.created_at", startDate.toISOString())
        .lt("orders.created_at", todayEnd.toISOString())
    : null;
  if (itemsQuery && status !== "all") itemsQuery = itemsQuery.eq("orders.status", status);
  if (itemsQuery && payment !== "all") itemsQuery = itemsQuery.eq("orders.payment_method", payment);
  if (itemsQuery && branchFilter) itemsQuery = itemsQuery.eq("orders.store_id", branchFilter);
  let selectedOrderBaseQuery = selectedOrderId
    ? supabase.from("orders").select(ORDER_DETAIL_FIELDS).eq("org_id", profile.org_id).eq("id", selectedOrderId)
    : null;
  if (selectedOrderBaseQuery && branchFilter) selectedOrderBaseQuery = selectedOrderBaseQuery.eq("store_id", branchFilter);
  const selectedOrderQuery = selectedOrderBaseQuery ? selectedOrderBaseQuery.maybeSingle() : null;

  let productsQuery = supabase.from("products").select("id, image_url, unit").eq("org_id", profile.org_id);
  if (branchFilter) productsQuery = productsQuery.eq("store_id", branchFilter);
  productsQuery = productsQuery.limit(1000);
  let cashiersQuery = supabase.from("profiles").select("id, full_name, role").eq("org_id", profile.org_id);
  if (branchFilter) cashiersQuery = cashiersQuery.eq("store_id", branchFilter);
  cashiersQuery = cashiersQuery.order("full_name").limit(200);

  const [cashiersResult, productsResult, ordersResult, previousOrdersResult, itemsResult, selectedOrderResult] = await Promise.all([
    cashiersQuery,
    productsQuery,
    ordersQuery,
    previousOrdersPromise,
    itemsQuery,
    selectedOrderQuery,
  ]);

  const cashiers = (cashiersResult.data ?? []) as CashierRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const orders = (ordersResult.data ?? []) as OrderRecord[];
  const previousOrders = (previousOrdersResult?.data ?? []) as OrderRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const cashierById = new Map(cashiers.map((cashier) => [cashier.id, cashier]));
  const productById = new Map(products.map((product) => [product.id, product]));

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredOrders = orders.filter((order) => {
    if (!normalizedQuery) return true;
    const branchName = branchById.get(order.store_id)?.name ?? "";
    const cashierName = cashierById.get(order.cashier_id)?.full_name ?? "";
    return [order.order_no, branchName, cashierName].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedOrderFromList = selectedOrderId ? filteredOrders.find((order) => order.id === selectedOrderId) ?? null : null;
  const selectedOrderDetails = selectedOrderResult?.data as OrderRecord | null;
  const selectedOrder = selectedOrderFromList ? selectedOrderDetails ?? selectedOrderFromList : null;

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const visibleOrderIds = new Set(filteredOrders.slice((page - 1) * pageSize, page * pageSize).map((order) => order.id));
  if (selectedOrder?.id) visibleOrderIds.add(selectedOrder.id);

  let orderItems: OrderItemRecord[] = [];
  let orderItemsError = false;
  if (itemsResult) {
    orderItems = (itemsResult.data ?? []) as OrderItemRecord[];
    orderItemsError = Boolean(itemsResult.error);
  } else if (visibleOrderIds.size > 0) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, product_id, name_snapshot, qty, weight_kg, unit_price_snapshot, line_total")
      .in("order_id", [...visibleOrderIds]);
    orderItems = (data ?? []) as OrderItemRecord[];
    orderItemsError = Boolean(error);
  }

  const itemCountByOrder = new Map<string, number>();
  const itemsByOrder = new Map<string, OrderItemRecord[]>();
  for (const item of orderItems) {
    itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + salesQuantity(item));
    const items = itemsByOrder.get(item.order_id) ?? [];
    items.push(item);
    itemsByOrder.set(item.order_id, items);
  }

  const summary = orderSummary(filteredOrders);
  const previousSummary = orderSummary(previousOrders);
  const canCompare = range !== "all" && !searchQuery;
  const trendBuckets = buildTrendBuckets(filteredOrders, startDate, todayEnd);
  const branchLabel = branchFilter ? branchById.get(branchFilter)?.name ?? "Selected branch" : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const queryWarning = Boolean(branchesResult.error || cashiersResult.error || productsResult.error || ordersResult.error || previousOrdersResult?.error || orderItemsError || selectedOrderResult?.error);
  const visibleOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
  const exportParams = new URLSearchParams({ range });
  if (branchFilter) exportParams.set("branch", branchFilter);
  if (status !== "all") exportParams.set("status", status);
  if (payment !== "all") exportParams.set("payment", payment);
  const exportHref = `/admin/report?${exportParams.toString()}`;

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-4 pt-1">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Order operations · {branchLabel}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-ink sm:text-4xl">Orders</h1><p className="mt-1 text-sm text-ink-muted">Manage and track all customer orders in one place, {firstName}.</p></div>
            <div className="admin-compact-toolbar">
              <form action="/admin/orders" method="get" className="admin-compact-toolbar__filters">
                <input type="hidden" name="status" value={status} />
                <input type="hidden" name="payment" value={payment} />
                <input type="hidden" name="q" value={searchQuery} />
                <label className="sr-only" htmlFor="orders-range">Order date range</label>
                <select id="orders-range" name="range" defaultValue={range} className="inventory-input admin-compact-toolbar__select admin-compact-toolbar__select--range bg-surface font-bold">
                  {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <label className="sr-only" htmlFor="orders-branch">Order branch</label>
                <select id="orders-branch" name="branch" defaultValue={branchFilter} disabled={Boolean(selectedBranchId)} className="inventory-input admin-compact-toolbar__select bg-surface font-bold">
                  <option value="">All branches</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}
                </select>
                <button type="submit" className="admin-compact-toolbar__button rounded-btn bg-primary text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
              </form>
              <Link href={exportHref} className="admin-compact-toolbar__button gap-2 rounded-btn bg-primary text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover"><span aria-hidden="true">↓</span> Export CSV</Link>
              <Link href="/pos" className="admin-compact-toolbar__button hidden rounded-btn bg-secondary text-xs font-extrabold text-primary transition hover:bg-secondary-hover xl:inline-flex">New order</Link>
              <SignOutButton className="admin-compact-toolbar__button text-xs" />
            </div>
          </header>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some order data could not refresh. The page is showing the records that were available; check the Supabase connection and RLS scope if totals look incomplete.</div>}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <OrderMetric label="Total orders" value={String(summary.total)} trend={percentChange(summary.total, previousSummary.total, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.orders)} tone="bg-accent text-accent-fg" icon="bag" />
            <OrderMetric label="Completed" value={String(summary.completed)} trend={percentChange(summary.completed, previousSummary.completed, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.completed)} tone="bg-success text-white" icon="orders" />
            <OrderMetric label="Refunded" value={String(summary.refunded)} trend={percentChange(summary.refunded, previousSummary.refunded, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.refunded)} tone="bg-[#5f4b93] text-white" icon="wallet" favorable="down" />
            <OrderMetric label="Average order" value={displayPeso(summary.completed ? Math.round(summary.sales / summary.completed) : 0)} trend={percentChange(summary.completed ? summary.sales / summary.completed : 0, previousSummary.completed ? previousSummary.sales / previousSummary.completed : 0, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.completed ? bucket.sales / bucket.completed : 0)} tone="bg-primary text-primary-fg" icon="chart" />
            <OrderMetric label="Discounts given" value={displayPeso(summary.discounts)} trend={percentChange(summary.discounts, previousSummary.discounts, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.discounts)} tone="bg-warning text-white" icon="promotions" favorable="down" />
            <OrderMetric label="Voided" value={String(summary.voided)} trend={percentChange(summary.voided, previousSummary.voided, canCompare)} comparisonLabel={rangeLabel(range)} values={trendBuckets.map((bucket) => bucket.voided)} tone="bg-danger text-white" icon="orders" favorable="down" />
          </div>

          <section aria-labelledby="order-filters-heading" className="admin-panel mt-4 p-4">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Order directory</p><h2 id="order-filters-heading" className="admin-panel__title">Find an order</h2></div>{(status !== "all" || payment !== "all" || branchFilter || searchQuery || range !== "7d") && <Link href="/admin/orders" className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></Link>}</div>
            <form action="/admin/orders" method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(170px,0.9fr)_minmax(160px,0.85fr)_auto] lg:items-end"><input type="hidden" name="range" value={range} /><input type="hidden" name="branch" value={branchFilter} /><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" defaultValue={searchQuery} placeholder="Order number, branch, cashier" className="inventory-input pl-10" /></span></label><OrderFilterField label="Status" htmlFor="order-status"><select id="order-status" name="status" defaultValue={status} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></OrderFilterField><OrderFilterField label="Payment" htmlFor="order-payment"><select id="order-payment" name="payment" defaultValue={payment} className="inventory-input">{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></OrderFilterField><OrderFilterField label="Date range" htmlFor="order-filter-range"><select id="order-filter-range" name="range" defaultValue={range} className="inventory-input">{rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></OrderFilterField><button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button></form>
          </section>

          <section aria-labelledby="orders-table-heading" className="admin-panel mt-4 min-w-0 p-5">
            <div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Live order register</p><h2 id="orders-table-heading" className="admin-panel__title">All orders</h2><p className="admin-panel__subtitle">{filteredOrders.length} matching order{filteredOrders.length === 1 ? "" : "s"} · {formatDateRange(startDate, todayEnd)}</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">RLS-scoped records</span></div>
            {filteredOrders.length === 0 ? <EmptyOrders /> : selectedOrder ? <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]"><OrdersTable orders={visibleOrders} selectedOrderId={selectedOrder.id} range={range} status={status} payment={payment} branch={branchFilter} query={searchQuery} page={page} pageSize={pageSize} branchById={branchById} cashierById={cashierById} itemCountByOrder={itemCountByOrder} itemsByOrder={itemsByOrder} productById={productById} totalOrders={filteredOrders.length} totalPages={totalPages} /><OrderDetail order={selectedOrder} items={itemsByOrder.get(selectedOrder.id) ?? []} productById={productById} branchName={branchById.get(selectedOrder.store_id)?.name ?? "Unknown branch"} cashierName={cashierById.get(selectedOrder.cashier_id)?.full_name ?? "Unknown cashier"} clearHref={buildOrderHref({ range, status, payment, branch: branchFilter, query: searchQuery })} /></div> : <OrdersTable orders={visibleOrders} selectedOrderId={null} range={range} status={status} payment={payment} branch={branchFilter} query={searchQuery} page={page} pageSize={pageSize} branchById={branchById} cashierById={cashierById} itemCountByOrder={itemCountByOrder} itemsByOrder={itemsByOrder} productById={productById} totalOrders={filteredOrders.length} totalPages={totalPages} />}
          </section>
      </div>
    </main>
  );
}

function OrderMetric({ label, value, trend, comparisonLabel, values, tone, icon, favorable = "up" }: { label: string; value: string; trend: number | null; comparisonLabel: string; values: number[]; tone: string; icon: "bag" | "orders" | "wallet" | "chart" | "promotions"; favorable?: "up" | "down" }) {
  const favorableTrend = trend === null ? false : favorable === "down" ? trend <= 0 : trend >= 0;
  return <article className="admin-kpi-card min-h-[139px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums text-[20px]">{value}</p><p className="admin-kpi-card__trend"><strong className={trend === null ? "text-ink-muted" : favorableTrend ? "text-success" : "text-danger"}>{trend === null ? "—" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend).toFixed(1)}%`}</strong><span>{trend === null ? "No prior baseline" : `vs ${comparisonLabel.toLowerCase()}`}</span></p><svg className="admin-sparkline" viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={sparklinePoints(values)} stroke="#7a3c0c" /></svg></div></article>;
}

function OrdersTable({ orders, selectedOrderId, range, status, payment, branch, query, page, pageSize, branchById, cashierById, itemCountByOrder, itemsByOrder, productById, totalOrders, totalPages }: { orders: OrderRecord[]; selectedOrderId: string | null; range: OrderRange; status: OrderStatusFilter; payment: PaymentFilter; branch: string; query: string; page: number; pageSize: number; branchById: Map<string, BranchRecord>; cashierById: Map<string, CashierRecord>; itemCountByOrder: Map<string, number>; itemsByOrder: Map<string, OrderItemRecord[]>; productById: Map<string, ProductRecord>; totalOrders: number; totalPages: number }) {
  const firstRow = totalOrders === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalOrders);
  return <div className="min-w-0"><div className="overflow-x-auto"><table className="admin-list-table min-w-[1050px]"><thead><tr><th>Order no.</th><th>Date &amp; time</th><th>Cashier</th><th>Branch</th><th>Order items</th><th>Amount</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => { const items = itemsByOrder.get(order.id) ?? []; const firstItem = items[0]; const itemCount = itemCountByOrder.get(order.id) ?? 0; const href = buildOrderHref({ range, status, payment, branch, query, page, pageSize, order: order.id }); return <tr key={order.id} className={selectedOrderId === order.id ? "bg-primary-soft/55" : undefined}><td><Link href={href} className="font-extrabold text-primary hover:underline">{order.order_no}</Link><small className="mt-1 block text-[10px] text-ink-muted">{cashierById.get(order.cashier_id)?.full_name ?? "Cashier unavailable"}</small></td><td className="whitespace-nowrap text-ink-muted">{formatDateTime(order.created_at)}</td><td className="whitespace-nowrap">{cashierById.get(order.cashier_id)?.full_name ?? "Unknown cashier"}</td><td className="whitespace-nowrap">{branchById.get(order.store_id)?.name ?? "Unknown branch"}</td><td><OrderItemPreview item={firstItem} itemCount={itemCount} productById={productById} /></td><td className="tnums whitespace-nowrap font-extrabold">{displayPeso(order.total)}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></td><td className="whitespace-nowrap">{paymentLabel(order.payment_method)}</td><td><Link href={href} aria-label={`View order ${order.order_no}`} className="grid h-8 w-8 place-items-center rounded-btn border border-line bg-surface text-primary transition hover:bg-primary-soft"><AdminIcon name="eye" size={15} /></Link></td></tr>; })}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><span className="text-[10px] font-semibold text-ink-muted">Showing {firstRow} to {lastRow} of {totalOrders} orders</span><div className="flex items-center gap-1"><PaginationLink href={page > 1 ? buildOrderHref({ range, status, payment, branch, query, page: page - 1, pageSize }) : undefined} label="Previous" symbol="‹" />{Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((pageNumber) => <Link key={pageNumber} href={buildOrderHref({ range, status, payment, branch, query, page: pageNumber, pageSize })} className={`grid h-8 min-w-8 place-items-center rounded-btn px-2 text-[10px] font-extrabold ${pageNumber === page ? "bg-primary text-primary-fg" : "border border-line bg-surface text-primary hover:bg-primary-soft"}`}>{pageNumber}</Link>)}{totalPages > 5 && <span className="grid h-8 min-w-8 place-items-center text-[10px] text-ink-muted">…</span>}<PaginationLink href={page < totalPages ? buildOrderHref({ range, status, payment, branch, query, page: page + 1, pageSize }) : undefined} label="Next" symbol="›" /></div><OrderPageSizeForm range={range} status={status} payment={payment} branch={branch} query={query} pageSize={pageSize} /></div></div>;
}

function OrderItemPreview({ item, itemCount, productById }: { item: OrderItemRecord | undefined; itemCount: number; productById: Map<string, ProductRecord> }) {
  const imageUrl = item?.product_id ? productImage(productById.get(item.product_id)) : null;
  const extraItems = Math.max(0, itemCount - (item ? salesQuantity(item) : 0));
  return <div className="flex min-w-[220px] items-center gap-2"><span className="grid h-7 min-w-7 place-items-center rounded-full bg-secondary px-1 text-[10px] font-extrabold text-primary">{formatQuantity(itemCount)}</span><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-primary-soft text-primary">{imageUrl ? <Image src={imageUrl} alt="" width={36} height={36} className="h-full w-full object-cover" /> : <AdminIcon name="box" size={17} />}</span><span className="min-w-0"><strong className="block max-w-[190px] truncate text-[11px] font-extrabold text-ink">{item?.name_snapshot ?? "Item details unavailable"}</strong><small className="mt-1 block text-[10px] text-ink-muted">{item ? `${formatQuantity(Number(item.qty))} ${productById.get(item.product_id ?? "")?.unit ?? "item"}` : "No line items"}{extraItems > 0 ? ` · +${formatQuantity(extraItems)} more` : ""}</small></span></div>;
}

function PaginationLink({ href, label, symbol }: { href?: string; label: string; symbol: string }) {
  return href ? <Link href={href} aria-label={label} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line bg-surface px-2 text-sm font-extrabold text-primary hover:bg-primary-soft">{symbol}</Link> : <span aria-disabled="true" aria-label={label} className="grid h-8 min-w-8 place-items-center rounded-btn border border-line/60 bg-surface-raised px-2 text-sm font-extrabold text-ink-muted">{symbol}</span>;
}

function OrderPageSizeForm({ range, status, payment, branch, query, pageSize }: { range: OrderRange; status: OrderStatusFilter; payment: PaymentFilter; branch: string; query: string; pageSize: number }) {
  return <form action="/admin/orders" method="get" className="flex items-center gap-2"><input type="hidden" name="range" value={range} /><input type="hidden" name="status" value={status} /><input type="hidden" name="payment" value={payment} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="q" value={query} /><label htmlFor="orders-page-size" className="text-[10px] font-semibold text-ink-muted">Rows per page</label><select id="orders-page-size" name="pageSize" defaultValue={String(pageSize)} className="inventory-input min-h-8 w-auto py-1 text-[10px]"><option value="10">10</option><option value="25">25</option><option value="50">50</option></select><button type="submit" className="rounded-btn border border-line bg-surface px-2 py-1.5 text-[10px] font-extrabold text-primary hover:bg-primary-soft">Apply</button></form>;
}

function OrderDetail({ order, items, productById, branchName, cashierName, clearHref }: { order: OrderRecord; items: OrderItemRecord[]; productById: Map<string, ProductRecord>; branchName: string; cashierName: string; clearHref: string }) {
  return <aside id="order-detail" aria-labelledby="order-detail-heading" className="admin-panel min-w-0 self-start p-5 xl:sticky xl:top-4"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Receipt view</p><h2 id="order-detail-heading" className="admin-panel__title">{order.order_no}</h2><p className="admin-panel__subtitle">{formatDateTime(order.created_at)}</p></div><Link href={clearHref} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close order detail">&times;</Link></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4"><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span><span className="text-xs font-extrabold text-ink">{paymentLabel(order.payment_method)}</span></div><div className="mt-4 grid gap-2 rounded-btn bg-surface-raised p-3 text-xs"><ReceiptMeta label="Branch" value={branchName} /><ReceiptMeta label="Cashier" value={cashierName} />{order.payment_ref && <ReceiptMeta label="Payment ref" value={order.payment_ref} />}</div><div className="mt-5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Items</p>{items.length === 0 ? <p className="mt-3 rounded-btn border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">Item details are unavailable for this order.</p> : <div className="mt-2 divide-y divide-line/70">{items.map((item, index) => <div key={`${item.order_id}-${index}`} className="flex items-start justify-between gap-3 py-3"><span className="min-w-0"><strong className="block truncate text-xs font-extrabold text-ink">{item.name_snapshot}</strong><small className="mt-1 block text-[10px] text-ink-muted">{formatQuantity(salesQuantity(item))} {productById.get(item.product_id ?? "")?.unit ?? (item.weight_kg ? "kg" : "item")}</small></span><strong className="tnums whitespace-nowrap text-xs font-extrabold text-ink">{displayPeso(item.line_total)}</strong></div>)}</div>}</div><div className="mt-4 border-t border-line pt-4"><ReceiptTotal label="Subtotal" value={displayPeso(order.subtotal)} /><ReceiptTotal label="Discount" value={displayPeso(order.discount_amount)} muted /><ReceiptTotal label="VAT" value={displayPeso(order.vat_amount)} muted /><div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-sm font-extrabold text-ink">Total</span><strong className="tnums text-xl font-extrabold text-primary">{displayPeso(order.total)}</strong></div></div>{(order.amount_tendered != null || order.change_due != null || order.note) && <div className="mt-4 border-t border-line pt-4">{order.amount_tendered != null && <ReceiptTotal label="Amount tendered" value={displayPeso(order.amount_tendered)} />}{order.change_due != null && <ReceiptTotal label="Change due" value={displayPeso(order.change_due)} />}{order.note && <div className="mt-3 rounded-btn bg-secondary/60 px-3 py-2.5 text-xs leading-5 text-ink"><strong className="block text-[10px] uppercase tracking-[0.1em] text-ink-muted">Order note</strong><span className="mt-1 block">{order.note}</span></div>}</div>}</aside>;
}

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-ink-muted">{label}</span><strong className="max-w-[62%] text-right font-extrabold text-ink">{value}</strong></div>;
}

function ReceiptTotal({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex items-center justify-between py-1 text-xs ${muted ? "text-ink-muted" : "text-ink"}`}><span>{label}</span><strong className="tnums font-extrabold">{value}</strong></div>;
}

function OrderFilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function EmptyOrders() {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="orders" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No orders match these filters</p><p className="mt-1 text-xs text-ink-muted">Try a wider date range, status, payment method, or search term.</p></div>;
}

function OrdersProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
