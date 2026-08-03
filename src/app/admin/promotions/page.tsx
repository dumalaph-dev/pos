import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

type AdminRole = "admin" | "manager" | "cashier";
type OrderStatus = "completed" | "voided" | "refunded";
type DiscountType = "senior" | "pwd" | "custom";
type PromotionRange = "7d" | "30d" | "all";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
};

type BranchRecord = { id: string; name: string; is_active: boolean };
type OrderRecord = {
  id: string;
  order_no: string;
  store_id: string;
  status: OrderStatus;
  discount_type: "none" | DiscountType;
  discount_amount: number;
  discount_ref: string | null;
  subtotal: number;
  total: number;
  created_at: string;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";
const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Singapore",
  year: "numeric",
});
const rangeOptions: Array<{ value: PromotionRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];
const discountTypes: DiscountType[] = ["senior", "pwd", "custom"];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isPromotionRange(value: string): value is PromotionRange {
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

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function discountLabel(type: DiscountType | "none") {
  if (type === "senior") return "Senior citizen";
  if (type === "pwd") return "PWD";
  if (type === "custom") return "Custom discount";
  return "No discount";
}

function discountClass(type: DiscountType) {
  if (type === "senior") return "bg-primary-soft text-primary";
  if (type === "pwd") return "bg-success/10 text-success";
  return "bg-warning/15 text-warning";
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

function dayLabel(value: Date, range: PromotionRange) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: range === "7d" ? "short" : "numeric",
    timeZone: "Asia/Singapore",
  }).format(value);
}

function dayKey(value: Date) {
  return SINGAPORE_DAY_FORMATTER.format(value);
}

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedRange = readParam(params.range);
  const range: PromotionRange = isPromotionRange(requestedRange) ? requestedRange : "30d";
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
  if (!profile) return <PromotionsProfileMissing />;

  const { start: todayStart, end: todayEnd } = getSingaporeDayBounds();
  const startDate = range === "7d" ? new Date(todayStart.getTime() - DAY_MS * 6) : range === "30d" ? new Date(todayStart.getTime() - DAY_MS * 29) : null;
  let ordersQuery = supabase
    .from("orders")
    .select("id, order_no, store_id, status, discount_type, discount_amount, discount_ref, subtotal, total, created_at")
    .eq("org_id", profile.org_id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (startDate) ordersQuery = ordersQuery.gte("created_at", startDate.toISOString()).lt("created_at", todayEnd.toISOString());

  const [branchesResult, ordersResult] = await Promise.all([
    supabase.from("stores").select("id, name, is_active").eq("org_id", profile.org_id).order("name"),
    ordersQuery,
  ]);
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const orders = (ordersResult.data ?? []) as OrderRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const completedOrders = orders.filter((order) => order.status === "completed");
  const discountedOrders: OrderRecord[] = [];
  const typeTotalsByType = new Map<DiscountType, { orders: number; total: number }>();
  const discountByDay = new Map<string, number>();
  let discountsGiven = 0;
  let netSales = 0;
  let grossSales = 0;
  for (const order of completedOrders) {
    const discount = Number(order.discount_amount);
    netSales += Number(order.total);
    grossSales += Number(order.subtotal);
    if (discount <= 0) continue;

    discountedOrders.push(order);
    discountsGiven += discount;
    const type = order.discount_type;
    if (type !== "none") {
      const typeTotal = typeTotalsByType.get(type) ?? { orders: 0, total: 0 };
      typeTotal.orders += 1;
      typeTotal.total += discount;
      typeTotalsByType.set(type, typeTotal);
    }
    const key = dayKey(new Date(order.created_at));
    discountByDay.set(key, (discountByDay.get(key) ?? 0) + discount);
  }
  const averageDiscount = discountedOrders.length ? Math.round(discountsGiven / discountedOrders.length) : 0;
  const discountRate = completedOrders.length ? Math.round((discountedOrders.length / completedOrders.length) * 100) : 0;
  const typeTotals = discountTypes.map((type) => {
    const totals = typeTotalsByType.get(type) ?? { orders: 0, total: 0 };
    return { type, ...totals, average: totals.orders ? Math.round(totals.total / totals.orders) : 0 };
  });
  const chartDays = range === "7d" ? 7 : 30;
  const chartStart = new Date(todayStart.getTime() - DAY_MS * (chartDays - 1));
  const discountSeries = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date(chartStart.getTime() + DAY_MS * index);
    const value = discountByDay.get(dayKey(date)) ?? 0;
    return { label: dayLabel(date, range), value };
  });
  const maxDiscountDay = Math.max(...discountSeries.map((point) => point.value), 0);
  const recentDiscounts = discountedOrders.slice(0, 8);
  const queryWarning = Boolean(branchesResult.error || ordersResult.error);
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const rangeLabel = rangeOptions.find((option) => option.value === range)?.label ?? "Last 30 days";

  return (
    <main className="admin-page text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="promotions" />

        <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <div className="flex min-w-0 items-center gap-3"><Link href="/admin" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to admin overview"><AdminIcon name="promotions" size={20} /></Link><div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</p><h1 className="truncate text-lg font-extrabold text-primary">Promotions</h1></div></div>
            <div className="ml-auto flex items-center gap-2"><Link href="/pos" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Open POS</Link><Link href="/admin/reports" className="rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Reports</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Discount performance &middot; {rangeLabel}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Make every offer earn its place.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">See how much revenue your POS discounts create, protect, and give away, {firstName}.</p></div><div className="flex items-center gap-2">{rangeOptions.map((option) => <Link key={option.value} href={`/admin/promotions?range=${option.value}`} className={`rounded-btn border px-3 py-2 text-xs font-extrabold transition ${range === option.value ? "border-primary bg-primary text-primary-fg" : "border-line bg-surface text-primary hover:bg-primary-soft"}`}>{option.label}</Link>)}</div></div>

          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some promotion data could not refresh. The panels are showing the data that was available.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><PromotionMetric label="Discounts given" value={displayPeso(discountsGiven)} detail={`${discountedOrders.length} orders used a discount`} tone="bg-primary text-primary-fg" icon="promotions" /><PromotionMetric label="Discounted orders" value={`${discountRate}%`} detail={`${discountedOrders.length} of ${completedOrders.length} completed`} tone="bg-success text-white" icon="orders" /><PromotionMetric label="Average discount" value={displayPeso(averageDiscount)} detail="Per discounted order" tone="bg-warning/15 text-warning" icon="chart" /><PromotionMetric label="Net sales" value={displayPeso(netSales)} detail={`Gross before discount ${displayPeso(grossSales)}`} tone="bg-secondary text-primary" icon="wallet" /></div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <section aria-labelledby="discount-trend-heading" className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Discount impact</p><h2 id="discount-trend-heading" className="admin-panel__title">Daily discounts given</h2><p className="admin-panel__subtitle">The last 30 days are shown for the all-time view.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Peak {displayPeso(maxDiscountDay)}</span></div><DiscountTrend series={discountSeries} range={range} /></section>
            <section aria-labelledby="types-heading" className="admin-panel p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Offer mix</p><h2 id="types-heading" className="admin-panel__title">Discount types</h2><p className="admin-panel__subtitle">POS discounts used in the selected period</p></div></div><div className="mt-4 grid gap-3">{typeTotals.map((item) => <div key={item.type} className="rounded-btn border border-line bg-surface-raised p-3"><div className="flex items-center justify-between gap-3"><span className={`rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${discountClass(item.type)}`}>{discountLabel(item.type)}</span><strong className="tnums text-sm font-extrabold text-ink">{displayPeso(item.total)}</strong></div><div className="mt-2 flex justify-between gap-3 text-[10px] text-ink-muted"><span>{item.orders} order{item.orders === 1 ? "" : "s"}</span><span>Avg {displayPeso(item.average)}</span></div></div>)}</div></section>
          </div>

          <section aria-labelledby="discounted-orders-heading" className="admin-panel mt-4 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Audit view</p><h2 id="discounted-orders-heading" className="admin-panel__title">Recent discounted orders</h2><p className="admin-panel__subtitle">Verify that discounts are being applied with the expected reference.</p></div><Link href="/admin/orders?status=completed" className="admin-kpi-card__link mt-0">View all orders <AdminIcon name="arrow" size={14} /></Link></div>{recentDiscounts.length === 0 ? <PromotionEmpty title="No discounts used yet" detail="Completed POS orders with Senior, PWD, or Custom discounts will appear here." /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[760px]"><thead><tr><th>Order</th><th>When</th><th>Branch</th><th>Offer</th><th>Reference</th><th>Discount</th><th>Net total</th></tr></thead><tbody>{recentDiscounts.map((order) => <tr key={order.id}><td className="whitespace-nowrap font-extrabold text-primary">{order.order_no}</td><td className="whitespace-nowrap text-ink-muted">{formatDateTime(order.created_at)}</td><td className="whitespace-nowrap">{branchById.get(order.store_id)?.name ?? "Unknown branch"}</td><td><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${discountClass(order.discount_type as DiscountType)}`}>{discountLabel(order.discount_type)}</span></td><td className="text-ink-muted">{order.discount_ref ? "Reference captured" : "No reference"}</td><td className="tnums whitespace-nowrap font-extrabold text-danger">-{displayPeso(order.discount_amount)}</td><td className="tnums whitespace-nowrap font-extrabold">{displayPeso(order.total)}</td></tr>)}</tbody></table></div>}</section>

          <div className="mt-4 grid gap-4 md:grid-cols-3"><PromotionGuide title="Senior citizen" detail="POS applies the configured statutory discount and captures the reference." tone="bg-primary-soft text-primary" /><PromotionGuide title="PWD" detail="Use the POS discount flow so the order retains its discount reference." tone="bg-success/10 text-success" /><PromotionGuide title="Custom" detail="Custom percentage discounts are recorded for reporting and review." tone="bg-warning/15 text-warning" /></div>
        </div>
      </div>
    </main>
  );
}

function PromotionMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "promotions" | "orders" | "chart" | "wallet" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function DiscountTrend({ series, range }: { series: Array<{ label: string; value: number }>; range: PromotionRange }) {
  const max = Math.max(...series.map((point) => point.value), 1);
  return <div className="mt-5"><div className="flex h-[220px] items-end gap-1 border-b border-line px-1">{series.map((point, index) => <div key={`${point.label}-${index}`} className="group flex h-full min-w-0 flex-1 items-end justify-center" title={`${point.label}: ${displayPeso(point.value)}`}><span className="w-full max-w-7 rounded-t-sm bg-accent transition-all duration-200 group-hover:bg-primary" style={{ height: `${Math.max(point.value ? 5 : 1, Math.round((point.value / max) * 100))}%` }} /></div>)}</div><div className="mt-2 flex gap-1 px-1 text-[9px] font-semibold text-ink-muted">{series.map((point, index) => <span key={`${point.label}-label-${index}`} className="min-w-0 flex-1 truncate text-center">{range === "7d" || index === 0 || index === series.length - 1 || index % 5 === 0 ? point.label : ""}</span>)}</div></div>;
}

function PromotionGuide({ title, detail, tone }: { title: string; detail: string; tone: string }) {
  return <article className="admin-panel p-4"><span className={`grid h-9 w-9 place-items-center rounded-btn text-xs font-extrabold ${tone}`}>{title.charAt(0)}</span><h3 className="mt-3 text-sm font-extrabold text-ink">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></article>;
}

function PromotionEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="py-8 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="promotions" size={21} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div>;
}

function PromotionsProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton /></div></div></main>;
}
