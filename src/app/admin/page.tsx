import Image from "next/image";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { formatStockQuantity, salesQuantity, stockStatus, stockThreshold } from "@/lib/inventory";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  organizations: { name?: string } | null;
};

type BranchRecord = {
  id: string;
  name: string;
  is_active: boolean;
};

type CategoryRecord = {
  id: string;
  name: string;
};

type ProductRecord = {
  id: string;
  name: string;
  category_id: string | null;
  unit: string;
  store_id: string;
  image_url: string | null;
  track_stock: boolean;
  min_stock: number | null;
};

type OrderRecord = {
  id: string;
  order_no: string;
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
  product_id: string;
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  line_total: number;
};

type StockRow = {
  store_id: string;
  product_id: string;
  qty: number;
};

type DeviceRecord = {
  is_active: boolean;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const LOCAL_PRODUCT_IMAGES: Record<string, string> = {
  "whole lechon (small)": "/food/whole-lechon-small.png",
  "whole lechon (medium)": "/food/whole-lechon-medium.png",
  "whole lechon (large)": "/food/whole-lechon-medium.png",
  "lechon belly (1/2kg)": "/food/lechon-belly-half.png",
  "lechon belly (1kg)": "/food/lechon-belly-one.png",
  "lechon paksiw (1/2kg)": "/food/lechon-paksiw.png",
  "lechon kawali (1/2kg)": "/food/lechon-kawali.png",
  "java rice": "/food/java-rice.png",
  "mang tomas (small)": "/food/mang-tomas.png",
};

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

function dayKey(value: Date) {
  return SINGAPORE_DAY_FORMATTER.format(value);
}

function dayLabel(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatToday() {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
    timeZone: "Asia/Singapore",
  }).format(new Date());
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function compactPeso(value: number) {
  const peso = Number(value) / 100;
  if (peso >= 1000) return `₱${(peso / 1000).toFixed(peso >= 10000 ? 0 : 1)}K`;
  return `₱${Math.round(peso)}`;
}

function paymentLabel(method: PaymentMethod) {
  if (method === "gcash") return "GCash";
  if (method === "maya") return "Maya";
  if (method === "card") return "Card";
  return "Cash";
}

function productImage(product: { name: string; image_url?: string | null }) {
  return product.image_url?.startsWith("/")
    ? product.image_url
    : LOCAL_PRODUCT_IMAGES[product.name.trim().toLowerCase()] ?? "/food/whole-lechon-small.png";
}

export default async function AdminPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) redirect("/");

  const { start, end } = getSingaporeDayBounds();
  const weekStart = new Date(start.getTime() - DAY_MS * 6);
  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id, organizations!profiles_org_id_fkey(name)")
    .eq("id", user.id)
    .single();
  const profile = profileData as ProfileRecord | null;

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <AdminProfileMissing />;

  const [branchesResult, productsResult, categoriesResult, ordersResult, stockResult, itemsResult, devicesResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, category_id, unit, store_id, image_url, track_stock, min_stock")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
    supabase
      .from("categories")
      .select("id, name")
      .eq("org_id", profile.org_id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("orders")
      .select("id, order_no, store_id, status, discount_amount, vat_amount, total, payment_method, created_at")
      .eq("org_id", profile.org_id)
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000),
    // Aggregate the stock ledger in Postgres instead of shipping up to 5,000
    // raw movement rows to the browser on every dashboard load.
    supabase.rpc("current_stock", { p_org_id: profile.org_id }),
    // Items are joined straight to today's completed orders so this runs in
    // the same round trip as the rest of the batch instead of a second
    // sequential query with a huge .in() filter.
    supabase
      .from("order_items")
      .select("order_id, product_id, name_snapshot, qty, weight_kg, line_total, orders!inner(status)")
      .eq("orders.org_id", profile.org_id)
      .eq("orders.status", "completed")
      .gte("orders.created_at", start.toISOString())
      .lt("orders.created_at", end.toISOString()),
    supabase
      .from("devices")
      .select("is_active")
      .eq("org_id", profile.org_id)
      .limit(100),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const categories = (categoriesResult.data ?? []) as CategoryRecord[];
  const allOrders = (ordersResult.data ?? []) as OrderRecord[];
  const stock = (stockResult.data ?? []) as StockRow[];
  const devices = (devicesResult.data ?? []) as DeviceRecord[];
  const todayOrders = allOrders.filter((order) => {
    const timestamp = new Date(order.created_at).getTime();
    return timestamp >= start.getTime() && timestamp < end.getTime();
  });
  const orderItems = (itemsResult.data ?? []) as OrderItemRecord[];
  const orderItemsError = Boolean(itemsResult.error);

  const queryWarning = Boolean(
    branchesResult.error || productsResult.error || categoriesResult.error || ordersResult.error || stockResult.error || devicesResult.error || orderItemsError,
  );
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const completedOrders = todayOrders.filter((order) => order.status === "completed");
  const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const averageTicket = completedOrders.length ? Math.round(totalSales / completedOrders.length) : 0;
  const activeBranches = branches.filter((branch) => branch.is_active).length;
  const activeDevices = devices.filter((device) => device.is_active).length;

  const stockByKey = new Map<string, number>();
  for (const row of stock) {
    stockByKey.set(`${row.store_id}:${row.product_id}`, Number(row.qty));
  }
  const trackedProductsByStore = new Map<string, ProductRecord[]>();
  for (const product of products) {
    if (!product.track_stock) continue;
    const storeProducts = trackedProductsByStore.get(product.store_id) ?? [];
    storeProducts.push(product);
    trackedProductsByStore.set(product.store_id, storeProducts);
  }
  const stockRows = branches.flatMap((branch) =>
    (trackedProductsByStore.get(branch.id) ?? [])
      .map((product) => {
        const onHand = stockByKey.get(`${branch.id}:${product.id}`) ?? 0;
        return { branch, product, onHand, status: stockStatus(onHand, product.min_stock) };
      }),
  );
  const lowStockRows = stockRows
    .filter((row) => row.status === "low" || row.status === "out")
    .sort((a, b) => a.onHand - b.onHand)
    .slice(0, 5);
  const lowStockCount = stockRows.filter((row) => row.status === "low").length;
  const outOfStockCount = stockRows.filter((row) => row.status === "out").length;
  const inventoryAlertCount = lowStockCount + outOfStockCount;

  const completedOrderIds = new Set(completedOrders.map((order) => order.id));
  const topItemsByName = new Map<string, { name: string; qty: number; unit: string; total: number }>();
  const categorySalesById = new Map<string, { id: string; name: string; qty: number; total: number }>();
  let itemsSold = 0;
  for (const item of orderItems) {
    if (!completedOrderIds.has(item.order_id)) continue;
    const product = productById.get(item.product_id);
    const topItem = topItemsByName.get(item.name_snapshot) ?? { name: item.name_snapshot, qty: 0, unit: product?.unit ?? "items", total: 0 };
    topItem.qty += salesQuantity(item);
    topItem.total += Number(item.line_total);
    topItemsByName.set(item.name_snapshot, topItem);

    const category = product?.category_id ? categoryById.get(product.category_id) : null;
    const categoryKey = category?.id ?? "uncategorized";
    const categoryItem = categorySalesById.get(categoryKey) ?? { id: categoryKey, name: category?.name ?? "Uncategorized", qty: 0, total: 0 };
    categoryItem.qty += salesQuantity(item);
    categoryItem.total += Number(item.line_total);
    categorySalesById.set(categoryKey, categoryItem);
    itemsSold += salesQuantity(item);
  }

  const topItems = Array.from(topItemsByName.values())
    .sort((a, b) => b.qty - a.qty || b.total - a.total)
    .slice(0, 5);
  const categorySales = Array.from(categorySalesById.values())
    .sort((a, b) => b.total - a.total || b.qty - a.qty)
    .slice(0, 5);
  const largestCategorySale = Math.max(...categorySales.map((category) => category.total), 1);

  const salesByDay = new Map<string, number>();
  for (const order of allOrders) {
    if (order.status !== "completed") continue;
    const key = dayKey(new Date(order.created_at));
    salesByDay.set(key, (salesByDay.get(key) ?? 0) + Number(order.total));
  }
  const weekSeries = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + DAY_MS * index);
    const value = salesByDay.get(dayKey(date)) ?? 0;
    return { label: dayLabel(date), value };
  });
  const weekPeak = Math.max(...weekSeries.map((point) => point.value), 1);

  const discountsGiven = completedOrders.reduce((sum, order) => sum + Number(order.discount_amount), 0);
  const taxCollected = completedOrders.reduce((sum, order) => sum + Number(order.vat_amount), 0);
  const returnsAndVoids = todayOrders.filter((order) => order.status !== "completed").reduce((sum, order) => sum + Number(order.total), 0);
  const branchTotalsById = new Map<string, { orderCount: number; sales: number }>();
  for (const order of completedOrders) {
    const branch = branchTotalsById.get(order.store_id) ?? { orderCount: 0, sales: 0 };
    branch.orderCount += 1;
    branch.sales += Number(order.total);
    branchTotalsById.set(order.store_id, branch);
  }
  const branchStats = branches.map((branch) => {
    const totals = branchTotalsById.get(branch.id) ?? { orderCount: 0, sales: 0 };
    return { ...branch, ...totals, average: totals.orderCount ? Math.round(totals.sales / totals.orderCount) : 0 };
  });
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const userInitial = firstName.charAt(0).toUpperCase();

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1700px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="overview" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-topbar">
            <Link href="/admin" className="admin-mobile-brand" aria-label="Admin dashboard">
              <span className="admin-brand__mark"><AdminIcon name="pig" size={20} /></span>
              <span className="admin-brand__copy"><strong>Mario&apos;s</strong><small>LECHON HOUSE</small></span>
            </Link>
            <Link href="/products" className="admin-icon-button" aria-label="Open products"><AdminIcon name="box" size={19} /></Link>
            <Link href="/admin/inventory" className="admin-icon-button admin-icon-button--alert" aria-label={inventoryAlertCount ? `View ${inventoryAlertCount} inventory alerts` : "View inventory status"}>
              <AdminIcon name="bell" size={19} />
              {inventoryAlertCount > 0 && <span className="admin-icon-button__badge" aria-hidden="true">{inventoryAlertCount > 9 ? "9+" : inventoryAlertCount}</span>}
            </Link>
            <Link href="#system-status" className="admin-icon-button admin-icon-button--help" aria-label="View system status"><AdminIcon name="help" size={19} /></Link>
            <div className="admin-user-chip">
              <span className="admin-user-chip__avatar" aria-hidden="true">{userInitial}</span>
              <span className="admin-user-chip__copy"><strong>{firstName}</strong><small>{profile.role === "manager" ? "Manager" : "Admin"}⌄</small></span>
            </div>
            <SignOutButton className="px-2 py-2 text-[10px]" />
          </header>

          <div className="flex flex-wrap items-end justify-between gap-5 pt-2">
            <div>
              <p className="text-sm font-semibold text-ink">Good morning, {firstName}! <span aria-hidden="true">👋</span></p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-[-0.05em] text-ink sm:text-[34px]">Dashboard Overview</h1>
              <p className="mt-1 text-sm text-ink-muted">Here&apos;s what&apos;s happening with your business today.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin/reports?range=7d" className="flex h-10 items-center gap-2 rounded-btn border border-line bg-surface px-3 text-xs font-semibold text-ink transition hover:border-line-strong hover:bg-primary-soft" aria-label="Open the last 7 days report"><AdminIcon name="calendar" size={15} />{formatToday()} <AdminIcon name="arrow" size={14} /></Link>
              <Link href="/admin/orders?range=today" className="flex h-10 items-center gap-2 rounded-btn border border-line bg-surface px-3 text-xs font-semibold text-ink transition hover:border-line-strong hover:bg-primary-soft">Today&apos;s orders <AdminIcon name="arrow" size={14} /></Link>
              <Link href="/admin/report?range=7d" className="flex h-10 items-center rounded-btn bg-primary px-4 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover">Export report</Link>
            </div>
          </div>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some data could not refresh. The dashboard is showing the data that was available; the POS remains available.</div>}

          <section aria-label="Key performance indicators" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Total sales" value={displayPeso(totalSales)} detail={completedOrders.length ? `${completedOrders.length} completed orders` : "No sales yet"} trend={weekSeries[6].value > weekSeries[5].value ? "Today is up" : undefined} icon="wallet" tone="brown" spark={weekSeries.map((point) => point.value)} />
            <KpiCard label="Orders" value={String(completedOrders.length)} detail={todayOrders.length ? "Completed today" : "No orders yet"} trend={todayOrders.length ? "Live from orders" : undefined} icon="bag" tone="orange" spark={weekSeries.map((point) => point.value ? point.value / weekPeak : 0)} />
            <KpiCard label="Net revenue" value={displayPeso(totalSales)} detail="Completed order total" trend={completedOrders.length ? "After discounts" : undefined} icon="wallet" tone="green" spark={weekSeries.map((point) => point.value)} />
            <KpiCard label="Avg. order value" value={displayPeso(averageTicket)} detail={completedOrders.length ? "Per completed order" : "After first sale"} icon="chart" tone="purple" spark={weekSeries.map((point) => point.value ? point.value / Math.max(completedOrders.length, 1) : 0)} />
            <KpiCard label="Low stock items" value={String(lowStockCount)} detail="Needs restocking" icon="box" tone="yellow" href="/admin/inventory" />
            <KpiCard label="Out of stock" value={String(outOfStockCount)} detail="Needs attention" icon="box" tone="red" href="/admin/inventory" />
          </section>

          <div className="admin-chart-grid mt-5">
            <section id="sales-summary" aria-labelledby="sales-summary-heading" className="admin-panel p-5">
              <div className="admin-panel__header">
                <div><h2 id="sales-summary-heading" className="admin-panel__title">Sales Summary</h2><p className="admin-panel__subtitle">Daily sales for the last 7 days</p></div>
                <Link href="/admin/reports?range=7d" className="flex h-9 items-center gap-2 rounded-btn border border-line bg-surface px-3 text-xs font-semibold text-ink transition hover:border-line-strong hover:bg-primary-soft">Open 7-day report <AdminIcon name="arrow" size={14} /></Link>
              </div>
              <SalesChart series={weekSeries} />
            </section>

            <section aria-labelledby="category-performance-heading" className="admin-panel p-5">
              <div className="admin-panel__header">
                <div><h2 id="category-performance-heading" className="admin-panel__title">Sales by Category</h2><p className="admin-panel__subtitle">Where today&apos;s revenue is coming from</p></div>
                <Link href="/products" className="admin-kpi-card__link mt-0">Manage <AdminIcon name="arrow" size={14} /></Link>
              </div>
              <div className="admin-category-bars mt-5">
                {categorySales.length === 0 ? <EmptyState title="No category sales yet" detail="Completed orders will show which parts of your menu drive revenue." /> : categorySales.map((category, index) => <div key={category.id} className="admin-category-bar">
                  <div className="admin-category-bar__meta"><span><i className={`admin-category-bar__rank ${index === 0 ? "is-top" : ""}`}>{index + 1}</i><strong>{category.name}</strong></span><span className="tnums">{displayPeso(category.total)}</span></div>
                  <div className="admin-category-bar__track"><span style={{ width: `${Math.max(7, Math.round((category.total / largestCategorySale) * 100))}%` }} /></div>
                  <div className="admin-category-bar__detail"><span>{formatStockQuantity(category.qty)} item{category.qty === 1 ? "" : "s"} sold</span><span>{totalSales ? Math.round((category.total / totalSales) * 100) : 0}% of today&apos;s sales</span></div>
                </div>)}
              </div>
            </section>

            <section aria-labelledby="best-selling-heading" className="admin-panel p-5">
              <div className="admin-panel__header"><div><h2 id="best-selling-heading" className="admin-panel__title">Best Selling Items</h2><p className="admin-panel__subtitle">Top 5 items by quantity sold</p></div></div>
              <div className="admin-ranking">
                {topItems.length === 0 ? <EmptyState title="No sales yet" detail="Best sellers will appear after the first completed order." /> : topItems.map((item, index) => <div key={item.name} className="admin-ranking__item"><span className="admin-ranking__rank">{index + 1}</span><span className="admin-ranking__image"><Image src={productImage({ name: item.name })} alt="" width={34} height={34} /></span><span className="admin-ranking__copy"><strong>{item.name}</strong><small>{formatStockQuantity(item.qty)} {item.unit} sold</small></span><strong className="admin-ranking__total">{displayPeso(item.total)}</strong></div>)}
              </div>
              <Link href="/products" className="admin-kpi-card__link mt-4">View all items <AdminIcon name="arrow" size={14} /></Link>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)_minmax(260px,0.86fr)]">
            <section id="recent-transactions" aria-labelledby="recent-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><h2 id="recent-heading" className="admin-panel__title">Recent Transactions</h2><p className="admin-panel__subtitle">Latest completed transactions</p></div><Link href="/admin/orders?range=today" className="admin-kpi-card__link mt-0">View all</Link></div>
              <div className="mt-3 overflow-x-auto"><table className="admin-list-table min-w-[500px]"><thead><tr><th>Time</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Amount</th></tr></thead><tbody>{completedOrders.slice(0, 5).length === 0 ? <tr><td colSpan={5}><EmptyState title="No transactions today" detail="Completed sales will appear here." /></td></tr> : completedOrders.slice(0, 5).map((order) => <tr key={order.id}><td className="whitespace-nowrap text-ink-muted">{formatDateTime(order.created_at)}</td><td className="whitespace-nowrap">{order.order_no}</td><td>Walk-in customer</td><td>{paymentLabel(order.payment_method)}</td><td className="tnums whitespace-nowrap text-right font-extrabold text-success">{displayPeso(order.total)}</td></tr>)}</tbody></table></div>
            </section>

            <section id="low-stock-alerts" aria-labelledby="low-stock-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><h2 id="low-stock-heading" className="admin-panel__title">Low Stock Alerts</h2><p className="admin-panel__subtitle">Items that need to be restocked</p></div><Link href="/admin/inventory" className="admin-kpi-card__link mt-0">View all</Link></div>
              <div className="mt-3">{lowStockRows.length === 0 ? <EmptyState title="Stock levels look good" detail="Tracked products will appear here when they reach their configured minimum." /> : lowStockRows.map((row) => <StockAlert key={`${row.branch.id}:${row.product.id}`} name={row.product.name} detail={`${row.branch.name} · Stock: ${formatStockQuantity(row.onHand)} ${row.product.unit}`} minimum={`Min: ${formatStockQuantity(stockThreshold(row.product.min_stock))} ${row.product.unit}`} threshold={stockThreshold(row.product.min_stock)} onHand={row.onHand} image={productImage(row.product)} danger={row.status === "out"} />)}</div>
            </section>

            <section aria-labelledby="today-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><h2 id="today-heading" className="admin-panel__title">Today&apos;s Overview</h2><p className="admin-panel__subtitle">Key business metrics at a glance</p></div></div>
              <div className="mt-4 grid gap-2">
                <OverviewMetric icon="chart" label="Average order value" value={displayPeso(averageTicket)} />
                <OverviewMetric icon="bag" label="Items sold" value={String(itemsSold)} />
                <OverviewMetric icon="promotions" label="Discounts given" value={displayPeso(discountsGiven)} />
                <OverviewMetric icon="orders" label="Returns & voids" value={displayPeso(returnsAndVoids)} />
                <OverviewMetric icon="wallet" label="Tax collected" value={displayPeso(taxCollected)} />
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
            <section aria-labelledby="branch-performance-heading" className="admin-panel min-w-0 p-5">
              <div className="admin-panel__header"><div><h2 id="branch-performance-heading" className="admin-panel__title">Branch Performance</h2><p className="admin-panel__subtitle">Latest comparison across branches</p></div><span className="text-xs font-bold text-ink-muted">{activeBranches} active</span></div>
              <div className="mt-3 overflow-x-auto"><table className="admin-list-table min-w-[620px]"><thead><tr><th>Branch</th><th>Total sales</th><th>Orders</th><th>Avg. order value</th><th>Sales share</th></tr></thead><tbody>{branchStats.length === 0 ? <tr><td colSpan={5}><EmptyState title="No branches found" detail="Create a branch to start comparing performance." /></td></tr> : branchStats.map((branch) => <tr key={branch.id}><td><strong>{branch.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">{branch.is_active ? "Active" : "Inactive"}</small></td><td className="tnums font-extrabold">{displayPeso(branch.sales)}</td><td className="tnums">{branch.orderCount}</td><td className="tnums">{displayPeso(branch.average)}</td><td className="tnums font-extrabold text-primary">{totalSales ? `${Math.round((branch.sales / totalSales) * 100)}%` : "—"}</td></tr>)}</tbody></table></div>
            </section>

            <section id="system-status" aria-labelledby="system-status-heading" className="admin-panel p-5">
              <div className="admin-panel__header"><div><h2 id="system-status-heading" className="admin-panel__title">System Status</h2><p className="admin-panel__subtitle">Live checks from this session</p></div></div>
              <div className="admin-status-grid mt-5">
                <SystemStatus name="POS terminals" status={devicesResult.error ? "Unavailable" : devices.length ? `${activeDevices} active` : "Not registered"} warning={Boolean(devicesResult.error || devices.length === 0)} />
                <SystemStatus name="Database" status={queryWarning ? "Check" : "Online"} warning={queryWarning} />
                <SystemStatus name="Inventory" status={stockResult.error ? "Check" : "Online"} warning={Boolean(stockResult.error)} />
                <SystemStatus name="Access scope" status={profile.role === "admin" ? "Org-wide" : "Branch-only"} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, detail, trend, icon, tone, spark, href }: { label: string; value: string; detail: string; trend?: string; icon: "wallet" | "bag" | "chart" | "box"; tone: "brown" | "orange" | "green" | "purple" | "yellow" | "red"; spark?: number[]; href?: string }) {
  const toneClass = { brown: "bg-primary text-primary-fg", orange: "bg-[#f3972e] text-white", green: "bg-[#4f9661] text-white", purple: "bg-[#8064a7] text-white", yellow: "bg-[#f2ad32] text-white", red: "bg-[#e64646] text-white" }[tone];
  return (
    <article className="admin-kpi-card">
      <div className="admin-kpi-card__inner">
        <div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${toneClass}`}><AdminIcon name={icon} size={18} /></span></div>
        <p className="admin-kpi-card__value tnums">{value}</p>
        {href ? <Link href={href} className="admin-kpi-card__link">View items <AdminIcon name="arrow" size={13} /></Link> : <p className="admin-kpi-card__trend">{trend && <strong>▲</strong>} {trend ?? detail}</p>}
      </div>
      {spark && <Sparkline values={spark} />}
    </article>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${28 - (value / max) * 23}`).join(" ");
  return <svg className="admin-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>;
}

function SalesChart({ series }: { series: Array<{ label: string; value: number }> }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  const points = series.map((point, index) => {
    const x = 34 + (index / Math.max(series.length - 1, 1)) * 540;
    const y = 165 - (point.value / max) * 126;
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `34,165 ${points} 574,165`;
  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <div className="flex h-[190px] flex-col justify-between py-1 text-[9px] font-semibold text-ink-muted"><span>{compactPeso(max)}</span><span>{compactPeso(max * 0.75)}</span><span>{compactPeso(max * 0.5)}</span><span>{compactPeso(max * 0.25)}</span><span>₱0</span></div>
        <div className="min-w-0 flex-1"><svg viewBox="0 0 608 190" className="h-[190px] w-full" role="img" aria-label="Sales summary for the last seven days"><g stroke="#eee4d7" strokeWidth="1"><path d="M32 26H582M32 61H582M32 96H582M32 131H582M32 166H582" /></g><polygon points={areaPoints} fill="#eadac6" fillOpacity=".58" /><polyline points={points} fill="none" stroke="#8b4c16" strokeWidth="2.2" /><g fill="#8b4c16" stroke="#fffdf9" strokeWidth="2">{series.map((point, index) => { const x = 34 + (index / Math.max(series.length - 1, 1)) * 540; const y = 165 - (point.value / max) * 126; return <circle key={point.label} cx={x} cy={y} r="4" />; })}</g></svg><div className="flex justify-between pl-1 text-[9px] font-semibold text-ink-muted">{series.map((point) => <span key={point.label}>{point.label}</span>)}</div></div>
      </div>
    </div>
  );
}

function StockAlert({ name, detail, minimum, threshold, onHand, image, danger }: { name: string; detail: string; minimum: string; threshold: number; onHand: number; image: string; danger: boolean }) {
  const percentage = Math.max(8, Math.min(100, (onHand / Math.max(threshold, 1)) * 100));
  return <div className="admin-stock-alert"><span className="admin-stock-alert__image"><Image src={image} alt="" width={38} height={38} /></span><span className="admin-stock-alert__copy"><strong>{name}</strong><small>{detail}</small></span><span className="admin-stock-alert__bar"><small>{minimum}</small><div><span className={danger ? "is-danger" : ""} style={{ width: `${percentage}%` }} /></div></span></div>;
}

function OverviewMetric({ icon, label, value }: { icon: "chart" | "bag" | "promotions" | "orders" | "wallet"; label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-btn border border-[#f0e8dc] bg-[#fffdf9] px-3 py-2.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name={icon} size={14} /></span><span className="min-w-0 flex-1 text-[10px] font-semibold text-ink-muted">{label}</span><strong className="tnums text-[11px] font-extrabold text-ink">{value}</strong></div>;
}

function SystemStatus({ name, status, warning = false }: { name: string; status: string; warning?: boolean }) {
  return <div className="admin-status-card"><span className="admin-status-card__name"><i className="admin-status-card__dot" style={warning ? { background: "var(--warning)" } : undefined} />{name}</span><small style={warning ? { color: "var(--warning)" } : undefined}>{status}</small></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="py-5 text-center"><p className="text-sm font-extrabold text-ink">{title}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function AdminProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2"><Link href="/pos" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Open POS</Link><SignOutButton /></div>
      </div>
    </main>
  );
}
