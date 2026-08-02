import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";
type OrderRange = "today" | "7d" | "30d" | "all";
type OrderStatusFilter = "all" | OrderStatus;

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
};

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

type CashierRecord = {
  id: string;
  full_name: string;
  role: AdminRole;
};

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
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  unit_price_snapshot: number;
  line_total: number;
};

type OrderItemCountRecord = {
  order_id: string;
  qty: number;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const DAY_MS = 24 * 60 * 60 * 1000;
const rangeOptions: Array<{ value: OrderRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];
const statusOptions: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "voided", label: "Voided" },
  { value: "refunded", label: "Refunded" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isOrderRange(value: string): value is OrderRange {
  return rangeOptions.some((option) => option.value === value);
}

function isOrderStatusFilter(value: string): value is OrderStatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function getSingaporeDayBounds() {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

function rangeStart(range: OrderRange, todayStart: Date) {
  if (range === "today") return todayStart;
  if (range === "7d") return new Date(todayStart.getTime() - DAY_MS * 6);
  if (range === "30d") return new Date(todayStart.getTime() - DAY_MS * 29);
  return null;
}

function rangeLabel(range: OrderRange) {
  return rangeOptions.find((option) => option.value === range)?.label ?? "Last 7 days";
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

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function buildOrderHref({
  range,
  status,
  branch,
  query,
  order,
}: {
  range: OrderRange;
  status: OrderStatusFilter;
  branch: string;
  query: string;
  order?: string;
}) {
  const params = new URLSearchParams();
  params.set("range", range);
  if (status !== "all") params.set("status", status);
  if (branch) params.set("branch", branch);
  if (query) params.set("q", query);
  if (order) params.set("order", order);
  return `/admin/orders?${params.toString()}`;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; status?: string | string[]; branch?: string | string[]; q?: string | string[]; order?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as ProfileRecord | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <OrdersProfileMissing />;

  const requestedRange = readParam(params.range);
  const requestedStatus = readParam(params.status);
  const range: OrderRange = isOrderRange(requestedRange) ? requestedRange : "7d";
  const status: OrderStatusFilter = isOrderStatusFilter(requestedStatus) ? requestedStatus : "all";
  const branchFilter = readParam(params.branch);
  const searchQuery = readParam(params.q).trim();
  const selectedOrderId = readParam(params.order);
  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const startDate = rangeStart(range, todayStart);

  let ordersQuery = supabase
    .from("orders")
    .select("id, order_no, store_id, cashier_id, status, subtotal, discount_type, discount_amount, discount_ref, vat_amount, total, payment_method, payment_ref, amount_tendered, change_due, note, created_at, created_at_device")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (startDate) ordersQuery = ordersQuery.gte("created_at", startDate.toISOString()).lt("created_at", todayEnd.toISOString());
  if (status !== "all") ordersQuery = ordersQuery.eq("status", status);

  const [branchesResult, cashiersResult, ordersResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("org_id", profile.org_id)
      .order("full_name")
      .limit(200),
    ordersQuery,
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const cashiers = (cashiersResult.data ?? []) as CashierRecord[];
  const orders = (ordersResult.data ?? []) as OrderRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const cashierById = new Map(cashiers.map((cashier) => [cashier.id, cashier]));

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredOrders = orders.filter((order) => {
    if (branchFilter && order.store_id !== branchFilter) return false;
    if (!normalizedQuery) return true;
    const branchName = branchById.get(order.store_id)?.name ?? "";
    const cashierName = cashierById.get(order.cashier_id)?.full_name ?? "";
    return [order.order_no, branchName, cashierName].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedOrder = selectedOrderId ? filteredOrders.find((order) => order.id === selectedOrderId) ?? null : null;

  let itemCounts: OrderItemCountRecord[] = [];
  let selectedItems: OrderItemRecord[] = [];
  let orderItemsError = false;
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length > 0) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, qty")
      .in("order_id", orderIds);
    itemCounts = (data ?? []) as OrderItemCountRecord[];
    orderItemsError = Boolean(error);
  }
  if (selectedOrder) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, name_snapshot, qty, weight_kg, unit_price_snapshot, line_total")
      .eq("order_id", selectedOrder.id);
    selectedItems = (data ?? []) as OrderItemRecord[];
    orderItemsError = orderItemsError || Boolean(error);
  }

  const itemCountByOrder = new Map<string, number>();
  for (const item of itemCounts) {
    itemCountByOrder.set(item.order_id, (itemCountByOrder.get(item.order_id) ?? 0) + Number(item.qty));
  }
  const completedOrders = filteredOrders.filter((order) => order.status === "completed");
  const completedSales = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const averageOrder = completedOrders.length ? Math.round(completedSales / completedOrders.length) : 0;
  const issueCount = filteredOrders.filter((order) => order.status !== "completed").length;
  const discountsGiven = completedOrders.reduce((sum, order) => sum + Number(order.discount_amount), 0);
  const queryWarning = Boolean(branchesResult.error || cashiersResult.error || ordersResult.error || orderItemsError);
  const branchByDefault = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const clearSelectionHref = buildOrderHref({ range, status, branch: branchFilter, query: searchQuery });
  const exportHref = `/admin/report?range=${range === "all" ? "30d" : range}`;

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={branchByDefault} active="orders" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="orders" size={20} /></Link>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p>
                <h1 className="truncate text-lg font-extrabold text-primary">Orders</h1>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link href={exportHref} className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Export</Link>
              <Link href="/pos" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">New sale</Link>
              <SignOutButton className="px-3 py-2 text-xs" />
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Operations &middot; {rangeLabel(range)}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Every order, accounted for.</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-muted">Review sales, payment details, and exceptions across {branchByDefault}, {firstName}.</p>
            </div>
            <span className="rounded-pill border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted">{filteredOrders.length} matching order{filteredOrders.length === 1 ? "" : "s"}</span>
          </div>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some order data could not refresh. The page is showing the records that were available.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OrderMetric label="Completed sales" value={displayPeso(completedSales)} detail={`${completedOrders.length} completed order${completedOrders.length === 1 ? "" : "s"}`} tone="bg-primary text-primary-fg" icon="wallet" />
            <OrderMetric label="Average order" value={displayPeso(averageOrder)} detail="Per completed order" tone="bg-success text-white" icon="chart" />
            <OrderMetric label="Discounts given" value={displayPeso(discountsGiven)} detail="From completed orders" tone="bg-secondary text-primary" icon="promotions" />
            <OrderMetric label="Voids & refunds" value={String(issueCount)} detail="Needs review" tone="bg-danger-soft text-danger" icon="orders" />
          </div>

          <section aria-labelledby="order-filters-heading" className="admin-panel mt-6 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Find a transaction</p>
                <h2 id="order-filters-heading" className="admin-panel__title">Filter orders</h2>
              </div>
              {(range !== "7d" || status !== "all" || branchFilter || searchQuery) && <Link href="/admin/orders" className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></Link>}
            </div>
            <form action="/admin/orders" method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(145px,0.8fr)_minmax(145px,0.8fr)_minmax(145px,0.8fr)_auto] lg:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span>
                <span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" defaultValue={searchQuery} placeholder="Order no., branch, cashier" className="inventory-input pl-10" /></span>
              </label>
              <FilterField label="Period" htmlFor="order-range"><select id="order-range" name="range" defaultValue={range} className="inventory-input">{rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField>
              <FilterField label="Status" htmlFor="order-status"><select id="order-status" name="status" defaultValue={status} className="inventory-input">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField>
              <FilterField label="Branch" htmlFor="order-branch"><select id="order-branch" name="branch" defaultValue={branchFilter} className="inventory-input"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}</select></FilterField>
              <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
            </form>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
            <section aria-labelledby="orders-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">Transaction log</p>
                  <h2 id="orders-heading" className="admin-panel__title">Recent orders</h2>
                  <p className="admin-panel__subtitle">Newest transactions first. Select an order to inspect its receipt.</p>
                </div>
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Up to 1,000 rows</span>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="orders" size={23} /></span>
                  <p className="mt-4 text-sm font-extrabold text-ink">No orders match these filters</p>
                  <p className="mt-1 text-xs text-ink-muted">Try a wider period or clear the search to see more transactions.</p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="admin-list-table min-w-[830px]">
                    <thead><tr><th>Order</th><th>When</th><th>Branch</th><th>Items</th><th>Payment</th><th>Status</th><th>Amount</th></tr></thead>
                    <tbody>
                      {filteredOrders.map((order) => {
                        const itemCount = itemCountByOrder.get(order.id) ?? 0;
                        const href = buildOrderHref({ range, status, branch: branchFilter, query: searchQuery, order: order.id });
                        return (
                          <tr key={order.id} className={selectedOrder?.id === order.id ? "bg-primary-soft/55" : undefined}>
                            <td><Link href={href} className="font-extrabold text-primary hover:underline">{order.order_no}</Link><small className="mt-1 block text-[10px] text-ink-muted">{cashierById.get(order.cashier_id)?.full_name ?? "Unknown cashier"}</small></td>
                            <td className="whitespace-nowrap text-ink-muted">{formatDateTime(order.created_at)}</td>
                            <td className="whitespace-nowrap">{branchById.get(order.store_id)?.name ?? "Unknown branch"}</td>
                            <td className="tnums whitespace-nowrap">{formatQuantity(itemCount)}</td>
                            <td className="whitespace-nowrap">{paymentLabel(order.payment_method)}</td>
                            <td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></td>
                            <td className="tnums whitespace-nowrap font-extrabold">{displayPeso(order.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {selectedOrder ? (
              <OrderDetail
                order={selectedOrder}
                items={selectedItems}
                branchName={branchById.get(selectedOrder.store_id)?.name ?? "Unknown branch"}
                cashierName={cashierById.get(selectedOrder.cashier_id)?.full_name ?? "Unknown cashier"}
                clearHref={clearSelectionHref}
              />
            ) : (
              <aside className="admin-panel flex min-h-[320px] flex-col justify-center p-5 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="orders" size={25} /></span>
                <h2 className="mt-4 text-base font-extrabold text-ink">Select an order</h2>
                <p className="mx-auto mt-2 max-w-[230px] text-xs leading-5 text-ink-muted">Open any order number to see its items, payment details, notes, and receipt totals.</p>
              </aside>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function OrderMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "wallet" | "chart" | "promotions" | "orders" }) {
  return (
    <article className="admin-kpi-card min-h-[132px]">
      <div className="admin-kpi-card__inner">
        <div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div>
        <p className="admin-kpi-card__value tnums">{value}</p>
        <p className="admin-kpi-card__trend">{detail}</p>
      </div>
    </article>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function OrderDetail({ order, items, branchName, cashierName, clearHref }: { order: OrderRecord; items: OrderItemRecord[]; branchName: string; cashierName: string; clearHref: string }) {
  return (
    <aside id="order-detail" aria-labelledby="order-detail-heading" className="admin-panel min-w-0 self-start p-5 xl:sticky xl:top-4">
      <div className="admin-panel__header">
        <div>
          <p className="admin-panel__eyebrow">Receipt view</p>
          <h2 id="order-detail-heading" className="admin-panel__title">{order.order_no}</h2>
          <p className="admin-panel__subtitle">{formatDateTime(order.created_at)}</p>
        </div>
        <Link href={clearHref} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close order detail">&times;</Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
        <span className="text-xs font-extrabold text-ink">{paymentLabel(order.payment_method)}</span>
      </div>

      <div className="mt-4 grid gap-2 rounded-btn bg-surface-raised p-3 text-xs">
        <ReceiptMeta label="Branch" value={branchName} />
        <ReceiptMeta label="Cashier" value={cashierName} />
        {order.payment_ref && <ReceiptMeta label="Payment ref" value={order.payment_ref} />}
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Items</p>
        {items.length === 0 ? <p className="mt-3 rounded-btn border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">Item details are unavailable for this order.</p> : <div className="mt-2 divide-y divide-line/70">{items.map((item, index) => <div key={`${item.order_id}-${index}`} className="flex items-start justify-between gap-3 py-3"><span className="min-w-0"><strong className="block truncate text-xs font-extrabold text-ink">{item.name_snapshot}</strong><small className="mt-1 block text-[10px] text-ink-muted">{formatQuantity(Number(item.qty))} x {item.weight_kg ? `${Number(item.weight_kg).toFixed(2)} kg` : displayPeso(item.unit_price_snapshot)}</small></span><strong className="tnums whitespace-nowrap text-xs font-extrabold text-ink">{displayPeso(item.line_total)}</strong></div>)}</div>}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <ReceiptTotal label="Subtotal" value={displayPeso(order.subtotal)} />
        <ReceiptTotal label="Discount" value={displayPeso(order.discount_amount)} muted />
        <ReceiptTotal label="VAT" value={displayPeso(order.vat_amount)} muted />
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-sm font-extrabold text-ink">Total</span><strong className="tnums text-xl font-extrabold text-primary">{displayPeso(order.total)}</strong></div>
      </div>

      {(order.amount_tendered != null || order.change_due != null || order.note) && <div className="mt-4 border-t border-line pt-4">
        {order.amount_tendered != null && <ReceiptTotal label="Amount tendered" value={displayPeso(order.amount_tendered)} />}
        {order.change_due != null && <ReceiptTotal label="Change due" value={displayPeso(order.change_due)} />}
        {order.note && <div className="mt-3 rounded-btn bg-secondary/60 px-3 py-2.5 text-xs leading-5 text-ink"><strong className="block text-[10px] uppercase tracking-[0.1em] text-ink-muted">Order note</strong><span className="mt-1 block">{order.note}</span></div>}
      </div>}
    </aside>
  );
}

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-ink-muted">{label}</span><strong className="max-w-[62%] text-right font-extrabold text-ink">{value}</strong></div>;
}

function ReceiptTotal({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex items-center justify-between py-1 text-xs ${muted ? "text-ink-muted" : "text-ink"}`}><span>{label}</span><strong className="tnums font-extrabold">{value}</strong></div>;
}

function OrdersProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div>
      </div>
    </main>
  );
}
