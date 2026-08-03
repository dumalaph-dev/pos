import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatStockQuantity, salesQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";
type ReportRange = "7d" | "30d";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
};

type BranchRecord = { id: string; name: string; is_active: boolean };
type CategoryRecord = { id: string; name: string };
type ProductRecord = { id: string; name: string; category_id: string | null; unit: string };
type OrderRecord = {
  id: string;
  store_id: string;
  status: OrderStatus;
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

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const rangeOptions: Array<{ value: ReportRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isReportRange(value: string): value is ReportRange {
  return rangeOptions.some((option) => option.value === value);
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

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function compactPeso(value: number) {
  const amount = Number(value) / 100;
  if (amount >= 1000) return `PHP ${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}K`;
  return `PHP ${Math.round(amount)}`;
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

function dayLabel(value: Date, range: ReportRange) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: range === "30d" ? "numeric" : "short",
    timeZone: "Asia/Singapore",
  }).format(value);
}

function dayKey(value: Date) {
  return SINGAPORE_DAY_FORMATTER.format(value);
}

function formatReportDate(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeZone: "Asia/Singapore",
  }).format(value);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const rangeParam = readParam(params.range);
  const range: ReportRange = isReportRange(rangeParam) ? rangeParam : "7d";
  const dayCount = range === "30d" ? 30 : 7;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as ProfileRecord | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <ReportsProfileMissing />;

  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const startDate = new Date(todayStart.getTime() - DAY_MS * (dayCount - 1));
  const [branchesResult, categoriesResult, productsResult, ordersResult, itemsResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name"),
    supabase.from("categories").select("id, name").eq("org_id", profile.org_id).order("sort_order").order("name"),
    supabase.from("products").select("id, name, category_id, unit").eq("org_id", profile.org_id).limit(1000),
    supabase
      .from("orders")
      .select("id, store_id, status, discount_amount, vat_amount, total, payment_method, created_at")
      .eq("org_id", profile.org_id)
      .gte("created_at", startDate.toISOString())
      .lt("created_at", todayEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    // Items are joined straight to the range's completed orders so they run
    // in the same round trip as the batch instead of a second .in() query.
    supabase
      .from("order_items")
      .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status)")
      .eq("orders.org_id", profile.org_id)
      .eq("orders.status", "completed")
      .gte("orders.created_at", startDate.toISOString())
      .lt("orders.created_at", todayEnd.toISOString()),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const orders = (ordersResult.data ?? []) as OrderRecord[];
  const orderItems = (itemsResult.data ?? []) as OrderItemRecord[];
  const orderItemsError = Boolean(itemsResult.error);

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const completedOrders = orders.filter((order) => order.status === "completed");
  const completedOrderIds = new Set(completedOrders.map((order) => order.id));
  let totalSales = 0;
  let discountsGiven = 0;
  let taxCollected = 0;
  const paymentTotalsByMethod = new Map<PaymentMethod, { orders: number; total: number }>();
  const branchTotalsById = new Map<string, { orders: number; sales: number }>();
  const salesByDay = new Map<string, number>();

  for (const order of completedOrders) {
    const total = Number(order.total);
    totalSales += total;
    discountsGiven += Number(order.discount_amount);
    taxCollected += Number(order.vat_amount);

    const payment = paymentTotalsByMethod.get(order.payment_method) ?? { orders: 0, total: 0 };
    payment.orders += 1;
    payment.total += total;
    paymentTotalsByMethod.set(order.payment_method, payment);

    const branch = branchTotalsById.get(order.store_id) ?? { orders: 0, sales: 0 };
    branch.orders += 1;
    branch.sales += total;
    branchTotalsById.set(order.store_id, branch);

    const key = dayKey(new Date(order.created_at));
    salesByDay.set(key, (salesByDay.get(key) ?? 0) + total);
  }

  const averageOrder = completedOrders.length ? Math.round(totalSales / completedOrders.length) : 0;
  const paymentTotals = (["cash", "gcash", "maya", "card"] as PaymentMethod[]).map((method) => ({
    method,
    ...(paymentTotalsByMethod.get(method) ?? { orders: 0, total: 0 }),
  }));

  const topItemsByName = new Map<string, { name: string; qty: number; unit: string; total: number }>();
  const categorySalesById = new Map<string, { name: string; qty: number; unit: string; total: number }>();
  for (const item of orderItems) {
    if (!completedOrderIds.has(item.order_id)) continue;

    const product = item.product_id ? productById.get(item.product_id) : null;
    const topItem = topItemsByName.get(item.name_snapshot) ?? { name: item.name_snapshot, qty: 0, unit: product?.unit ?? "items", total: 0 };
    topItem.qty += salesQuantity(item);
    topItem.total += Number(item.line_total);
    topItemsByName.set(item.name_snapshot, topItem);

    const category = product?.category_id ? categoryById.get(product.category_id) : null;
    const categoryKey = category?.id ?? "uncategorized";
    const categoryItem = categorySalesById.get(categoryKey) ?? { name: category?.name ?? "Uncategorized", qty: 0, unit: product?.unit ?? "items", total: 0 };
    categoryItem.qty += salesQuantity(item);
    categoryItem.total += Number(item.line_total);
    categorySalesById.set(categoryKey, categoryItem);
  }

  const topItems = Array.from(topItemsByName.values())
    .sort((a, b) => b.total - a.total || b.qty - a.qty)
    .slice(0, 5);
  const categorySales = Array.from(categorySalesById.values())
    .sort((a, b) => b.total - a.total || b.qty - a.qty)
    .slice(0, 5);
  const dailySeries = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate.getTime() + DAY_MS * index);
    const value = salesByDay.get(dayKey(date)) ?? 0;
    return { label: dayLabel(date, range), value };
  });
  const branchStats = branches
    .map((branch) => ({ ...branch, ...(branchTotalsById.get(branch.id) ?? { sales: 0, orders: 0 }) }))
    .sort((a, b) => b.sales - a.sales);
  const queryWarning = Boolean(branchesResult.error || categoriesResult.error || productsResult.error || ordersResult.error || orderItemsError);
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="reports" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="reports" size={20} /></Link>
              <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Reports</h1></div>
            </div>
            <div className="ml-auto flex items-center gap-2"><Link href={`/admin/report?range=${range}`} className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Export CSV</Link><Link href="/admin/orders" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">View orders</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Business intelligence &middot; {range === "7d" ? "Last 7 days" : "Last 30 days"}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Know what is moving the business.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">A live view of completed sales, menu performance, and branch contribution, {firstName}.</p></div>
            <div className="flex items-center gap-2">{rangeOptions.map((option) => <Link key={option.value} href={`/admin/reports?range=${option.value}`} className={`rounded-btn border px-3 py-2 text-xs font-extrabold transition ${range === option.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-primary hover:bg-primary-soft"}`}>{option.label}</Link>)}</div>
          </div>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some report data could not refresh. The panels are showing the data that was available.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ReportMetric label="Net sales" value={displayPeso(totalSales)} detail={`${completedOrders.length} completed orders`} tone="bg-primary text-primary-fg" icon="wallet" /><ReportMetric label="Average order" value={displayPeso(averageOrder)} detail="Per completed order" tone="bg-success text-white" icon="chart" /><ReportMetric label="Discounts given" value={displayPeso(discountsGiven)} detail="Across the selected period" tone="bg-secondary text-primary" icon="promotions" /><ReportMetric label="Tax collected" value={displayPeso(taxCollected)} detail="Recorded VAT amount" tone="bg-warning/15 text-warning" icon="reports" /></div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <section aria-labelledby="trend-heading" className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Sales trend</p><h2 id="trend-heading" className="admin-panel__title">Daily completed sales</h2><p className="admin-panel__subtitle">{formatReportDate(startDate)} to {formatReportDate(todayStart)}</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{compactPeso(Math.max(...dailySeries.map((point) => point.value), 0))} peak day</span></div><ReportTrend series={dailySeries} range={range} /></section>
            <section aria-labelledby="payment-heading" className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Tender mix</p><h2 id="payment-heading" className="admin-panel__title">Payment totals</h2><p className="admin-panel__subtitle">Completed sales by method</p></div></div><div className="mt-4 divide-y divide-line/70">{paymentTotals.map((payment) => <div key={payment.method} className="flex items-center justify-between gap-3 py-3"><span className="flex items-center gap-2 text-xs font-extrabold text-ink"><i className={`h-2.5 w-2.5 rounded-full ${payment.method === "cash" ? "bg-primary" : payment.method === "gcash" ? "bg-success" : payment.method === "maya" ? "bg-warning" : "bg-[#8064a7]"}`} />{paymentLabel(payment.method)}</span><span className="text-right"><strong className="tnums block text-xs font-extrabold text-ink">{displayPeso(payment.total)}</strong><small className="tnums mt-1 block text-[10px] text-ink-muted">{payment.orders} order{payment.orders === 1 ? "" : "s"} &middot; {totalSales ? Math.round((payment.total / totalSales) * 100) : 0}%</small></span></div>)}</div></section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <ReportListPanel title="Best sellers" subtitle="Top items by revenue" emptyTitle="No completed sales yet" emptyDetail="Items will appear after the first completed order." items={topItems.map((item) => ({ label: item.name, detail: `${formatStockQuantity(item.qty)} ${item.unit} sold`, value: displayPeso(item.total) }))} />
            <ReportListPanel title="Sales by category" subtitle="Menu families driving item sales" emptyTitle="No category sales yet" emptyDetail="Category performance will appear after completed orders." items={categorySales.map((item) => ({ label: item.name, detail: `${formatStockQuantity(item.qty)} ${item.unit} sold`, value: displayPeso(item.total) }))} />
          </div>

          <section aria-labelledby="branch-report-heading" className="admin-panel mt-4 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Branch comparison</p><h2 id="branch-report-heading" className="admin-panel__title">Where sales are happening</h2><p className="admin-panel__subtitle">Completed sales for the selected period</p></div><Link href="/admin/employees" className="admin-kpi-card__link mt-0">Manage staff <AdminIcon name="arrow" size={14} /></Link></div>{branchStats.length === 0 ? <ReportEmpty title="No branches found" detail="Create a branch to compare performance." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[620px]"><thead><tr><th>Branch</th><th>Orders</th><th>Total sales</th><th>Share</th><th>Average order</th></tr></thead><tbody>{branchStats.map((branch) => <tr key={branch.id}><td><strong>{branch.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">{branch.is_active ? "Active" : "Inactive"}</small></td><td className="tnums">{branch.orders}</td><td className="tnums font-extrabold">{displayPeso(branch.sales)}</td><td className="tnums">{totalSales ? Math.round((branch.sales / totalSales) * 100) : 0}%</td><td className="tnums font-extrabold">{displayPeso(branch.orders ? Math.round(branch.sales / branch.orders) : 0)}</td></tr>)}</tbody></table></div>}</section>
        </div>
      </div>
    </main>
  );
}

function ReportMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "wallet" | "chart" | "promotions" | "reports" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function ReportTrend({ series, range }: { series: Array<{ label: string; value: number }>; range: ReportRange }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  return <div className="mt-5"><div className="flex h-[220px] items-end gap-1 border-b border-line px-1">{series.map((point, index) => <div key={`${point.label}-${index}`} className="group flex h-full min-w-0 flex-1 items-end justify-center" title={`${point.label}: ${displayPeso(point.value)}`}><span className="w-full max-w-7 rounded-t-sm bg-primary transition-all duration-200 group-hover:bg-accent" style={{ height: `${Math.max(point.value ? 5 : 1, Math.round((point.value / max) * 100))}%` }} /></div>)}</div><div className="mt-2 flex gap-1 px-1 text-[9px] font-semibold text-ink-muted">{series.map((point, index) => <span key={`${point.label}-label-${index}`} className="min-w-0 flex-1 truncate text-center">{range === "7d" || index === 0 || index === series.length - 1 || index % 5 === 0 ? point.label : ""}</span>)}</div></div>;
}

function ReportListPanel({ title, subtitle, items, emptyTitle, emptyDetail }: { title: string; subtitle: string; items: Array<{ label: string; detail: string; value: string }>; emptyTitle: string; emptyDetail: string }) {
  return <section className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Performance list</p><h2 className="admin-panel__title">{title}</h2><p className="admin-panel__subtitle">{subtitle}</p></div></div>{items.length === 0 ? <ReportEmpty title={emptyTitle} detail={emptyDetail} /> : <div className="admin-ranking">{items.map((item, index) => <div key={item.label} className="admin-ranking__item"><span className="admin-ranking__rank">{index + 1}</span><span className="admin-ranking__copy"><strong>{item.label}</strong><small>{item.detail}</small></span><strong className="admin-ranking__total tnums">{item.value}</strong></div>)}</div>}</section>;
}

function ReportEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="py-8 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="reports" size={21} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function ReportsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div></div></main>;
}
