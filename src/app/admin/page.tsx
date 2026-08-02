import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

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
  address: string | null;
  is_active: boolean;
};

type ProductRecord = {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  store_id: string;
};

type StaffRecord = {
  id: string;
  full_name: string;
  role: AdminRole;
  store_id: string | null;
  is_active: boolean;
};

type OrderRecord = {
  id: string;
  order_no: string;
  store_id: string;
  cashier_id: string;
  status: OrderStatus;
  total: number;
  payment_method: PaymentMethod;
  created_at: string;
};

type OrderItemRecord = {
  order_id: string;
  name_snapshot: string;
  qty: number;
  line_total: number;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

function getSingaporeDayBounds() {
  const date = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
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

function paymentLabel(method: PaymentMethod) {
  if (method === "gcash") return "GCash";
  if (method === "maya") return "Maya";
  if (method === "card") return "Card";
  return "Cash";
}

function statusLabel(status: OrderStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: OrderStatus) {
  if (status === "completed") return "bg-success/10 text-success";
  if (status === "refunded") return "bg-warning/15 text-warning";
  return "bg-danger-soft text-danger";
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, role, org_id, store_id, organizations(name)")
    .eq("id", user.id)
    .single();

  const profile = profileData as ProfileRecord | null;

  // Proxy already blocks cashiers; defense in depth here too.
  if (profile?.role === "cashier") redirect("/pos");

  if (!profile) {
    return <AdminProfileMissing />;
  }

  const { start, end } = getSingaporeDayBounds();
  const [branchesResult, productsResult, staffResult, ordersResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, address, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, price, is_active, store_id")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
    supabase
      .from("profiles")
      .select("id, full_name, role, store_id, is_active")
      .eq("org_id", profile.org_id)
      .order("full_name")
      .limit(1000),
    supabase
      .from("orders")
      .select("id, order_no, store_id, cashier_id, status, total, payment_method, created_at")
      .eq("org_id", profile.org_id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const staff = (staffResult.data ?? []) as StaffRecord[];
  const todayOrders = (ordersResult.data ?? []) as OrderRecord[];
  const orderIds = todayOrders.map((order) => order.id);

  let orderItems: OrderItemRecord[] = [];
  let orderItemsError = false;
  if (orderIds.length > 0) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, name_snapshot, qty, line_total")
      .in("order_id", orderIds);
    orderItems = (data ?? []) as OrderItemRecord[];
    orderItemsError = Boolean(error);
  }

  const queryWarning = Boolean(
    branchesResult.error ||
      productsResult.error ||
      staffResult.error ||
      ordersResult.error ||
      orderItemsError,
  );
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const completedOrders = todayOrders.filter((order) => order.status === "completed");
  const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const averageTicket = completedOrders.length ? Math.round(totalSales / completedOrders.length) : 0;
  const activeProducts = products.filter((product) => product.is_active).length;
  const activeBranches = branches.filter((branch) => branch.is_active).length;
  const activeStaff = staff.filter((member) => member.is_active).length;

  const paymentTotals = (["cash", "gcash", "maya", "card"] as PaymentMethod[]).map((method) => ({
    method,
    value: completedOrders
      .filter((order) => order.payment_method === method)
      .reduce((sum, order) => sum + Number(order.total), 0),
  }));
  const largestPayment = Math.max(...paymentTotals.map((payment) => payment.value), 1);

  const completedOrderIds = new Set(completedOrders.map((order) => order.id));
  const topItems = Array.from(
    orderItems
      .filter((item) => completedOrderIds.has(item.order_id))
      .reduce((items, item) => {
        const current = items.get(item.name_snapshot) ?? { name: item.name_snapshot, qty: 0, total: 0 };
        current.qty += Number(item.qty);
        current.total += Number(item.line_total);
        items.set(item.name_snapshot, current);
        return items;
      }, new Map<string, { name: string; qty: number; total: number }>()),
  )
    .map(([, item]) => item)
    .sort((a, b) => b.qty - a.qty || b.total - a.total)
    .slice(0, 5);

  const branchStats = branches.map((branch) => {
    const branchOrders = completedOrders.filter((order) => order.store_id === branch.id);
    return {
      ...branch,
      orderCount: branchOrders.length,
      sales: branchOrders.reduce((sum, order) => sum + Number(order.total), 0),
    };
  });

  const orgName =
    (profile.organizations as { name?: string } | null)?.name ?? "Mario's Lechon House";
  const currentBranchName = profile.store_id
    ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME
    : "All branches";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));

  const metrics = [
    {
      label: "Today's sales",
      value: formatPeso(totalSales),
      detail: completedOrders.length ? `${completedOrders.length} completed orders` : "No completed sales yet",
      icon: "₱",
      tone: "bg-accent text-accent-fg",
    },
    {
      label: "Average ticket",
      value: formatPeso(averageTicket),
      detail: completedOrders.length ? "Per completed order" : "Will appear after the first sale",
      icon: "↗",
      tone: "bg-primary text-primary-fg",
    },
    {
      label: "Active products",
      value: String(activeProducts),
      detail: `${products.length - activeProducts} hidden from POS`,
      icon: "▦",
      tone: "bg-secondary text-primary",
    },
    {
      label: "Team on file",
      value: String(activeStaff),
      detail: `${activeBranches} active branch${activeBranches === 1 ? "" : "es"}`,
      icon: "•",
      tone: "bg-primary-soft text-primary",
    },
  ];

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} />

        <div className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <Link href="/admin" className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-lg text-primary" aria-hidden="true">
                ◉
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-extrabold text-primary">Mario&apos;s Lechon House</strong>
                <small className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Admin backoffice</small>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/pos" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover focus-visible:outline-none">
                Open POS
              </Link>
              <SignOutButton className="px-3 py-2 text-xs" />
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Operations overview · {currentBranchName}</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Good morning, {firstName}.</h1>
              <p className="mt-2 text-sm text-ink-muted">Here is the pulse of {orgName} for today.</p>
            </div>
            <p className="rounded-pill border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted">{formatToday()}</p>
          </div>

          {queryWarning && (
            <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
              Some metrics could not refresh. The dashboard is showing the data that was available; the POS remains available for sales.
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-transform duration-150 hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-ink-muted">{metric.label}</p>
                  <span className={`grid h-9 w-9 place-items-center rounded-btn text-sm font-extrabold ${metric.tone}`} aria-hidden="true">{metric.icon}</span>
                </div>
                <p className="tnums mt-5 text-2xl font-extrabold tracking-[-0.04em] text-ink">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold text-ink-muted">{metric.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <section aria-labelledby="sales-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Today</p>
                  <h2 id="sales-heading" className="mt-1 text-xl font-extrabold text-ink">Sales pulse</h2>
                </div>
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Live from orders</span>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
                <div className="rounded-btn bg-surface-panel p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-ink-muted">Completed revenue</p>
                  <p className="tnums mt-2 text-3xl font-extrabold tracking-[-0.05em] text-accent">{formatPeso(totalSales)}</p>
                  <div className="mt-5 h-2 overflow-hidden rounded-pill bg-primary-soft">
                    <div className="h-full w-full rounded-pill bg-accent transition-[width] duration-500" />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">{completedOrders.length ? "All completed orders for this branch scope." : "Complete a sale to start the daily pulse."}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-ink-muted">Payment mix</p>
                    <span className="text-xs font-semibold text-ink-muted">{completedOrders.length} orders</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {paymentTotals.map((payment) => (
                      <div key={payment.method}>
                        <div className="mb-1 flex items-center justify-between text-xs font-bold text-ink">
                          <span>{paymentLabel(payment.method)}</span>
                          <span className="tnums text-ink-muted">{formatPeso(payment.value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-pill bg-primary-soft">
                          <div className="h-full rounded-pill bg-primary transition-[width] duration-500" style={{ width: `${Math.max(0, Math.round((payment.value / largestPayment) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section aria-labelledby="branches-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Branches</p>
                  <h2 id="branches-heading" className="mt-1 text-xl font-extrabold text-ink">Branch pulse</h2>
                </div>
                <span className="rounded-pill bg-secondary px-3 py-1.5 text-xs font-extrabold text-primary">{branches.length} total</span>
              </div>
              <div className="mt-5 space-y-2">
                {branchStats.length === 0 ? (
                  <EmptyState title="No branches found" detail="Create a branch to start organizing the backoffice." />
                ) : (
                  branchStats.map((branch) => (
                    <div key={branch.id} className="flex items-center gap-3 rounded-btn border border-line bg-surface-raised px-3 py-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${branch.is_active ? "bg-success" : "bg-ink-subtle"}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-extrabold text-ink">{branch.name}</strong>
                        <span className="text-xs text-ink-muted">{branch.orderCount} completed order{branch.orderCount === 1 ? "" : "s"} today</span>
                      </div>
                      <strong className="tnums text-sm font-extrabold text-accent">{formatPeso(branch.sales)}</strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <section aria-labelledby="orders-heading" className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Activity</p>
                  <h2 id="orders-heading" className="mt-1 text-xl font-extrabold text-ink">Recent orders</h2>
                </div>
                <span className="rounded-pill border border-line bg-surface-raised px-3 py-1.5 text-xs font-bold text-ink-muted">Today</span>
              </div>
              {todayOrders.length === 0 ? (
                <EmptyState title="No orders today" detail="Completed sales will appear here as the team uses the POS." />
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">
                        <th className="px-2 py-3">Order</th>
                        <th className="px-2 py-3">Branch</th>
                        <th className="px-2 py-3">Cashier</th>
                        <th className="px-2 py-3">Payment</th>
                        <th className="px-2 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayOrders.slice(0, 8).map((order) => (
                        <tr key={order.id} className="border-b border-line/70 last:border-0">
                          <td className="px-2 py-3">
                            <strong className="block text-sm font-extrabold text-ink">{order.order_no}</strong>
                            <span className="text-xs text-ink-muted">{formatDateTime(order.created_at)}</span>
                          </td>
                          <td className="px-2 py-3 text-sm font-semibold text-ink-muted">{branchById.get(order.store_id)?.name ?? "Unknown branch"}</td>
                          <td className="px-2 py-3 text-sm font-semibold text-ink-muted">{staffById.get(order.cashier_id)?.full_name ?? "Unknown cashier"}</td>
                          <td className="px-2 py-3">
                            <span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                            <span className="mt-1 block text-xs font-semibold text-ink-muted">{paymentLabel(order.payment_method)}</span>
                          </td>
                          <td className="tnums px-2 py-3 text-right text-sm font-extrabold text-accent">{formatPeso(Number(order.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="top-items-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Menu performance</p>
                  <h2 id="top-items-heading" className="mt-1 text-xl font-extrabold text-ink">Top items</h2>
                </div>
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">By quantity</span>
              </div>
              {topItems.length === 0 ? (
                <EmptyState title="No item data yet" detail="Product performance appears after the first completed order." />
              ) : (
                <ol className="mt-4 space-y-3">
                  {topItems.map((item, index) => (
                    <li key={item.name} className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-secondary text-xs font-extrabold text-primary">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-extrabold text-ink">{item.name}</strong>
                        <span className="text-xs font-semibold text-ink-muted">{item.qty} sold</span>
                      </div>
                      <strong className="tnums text-sm font-extrabold text-accent">{formatPeso(item.total)}</strong>
                    </li>
                  ))}
                </ol>
              )}
              {orderItemsError && <p className="mt-4 text-xs font-semibold text-warning">Item breakdown is waiting for the order-items query.</p>}
            </section>
          </div>

          <section aria-labelledby="next-heading" className="mt-4 rounded-card border border-primary/15 bg-primary p-5 text-primary-fg shadow-[var(--shadow-pop)] sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary-fg/70">Next workspace</p>
              <h2 id="next-heading" className="mt-1 text-lg font-extrabold">Inventory is now connected to the POS.</h2>
              <p className="mt-1 max-w-2xl text-sm text-primary-fg/75">Record branch stock movements, then let completed POS sales flow into the same append-only ledger for reliable on-hand counts.</p>
            </div>
            <Link href="/admin/inventory" className="mt-4 inline-flex shrink-0 items-center justify-center rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover sm:mt-0">
              Open inventory
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function AdminSidebar({ branchName }: { branchName: string }) {
  const upcoming = ["Branches", "Products", "Orders", "Staff"];

  return (
    <aside className="hidden border-r border-line bg-sidebar lg:block">
      <div className="sticky top-0 flex h-screen flex-col p-5">
        <Link href="/admin" className="flex items-center gap-3 rounded-btn p-2 transition hover:bg-primary-soft">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-xl text-primary" aria-hidden="true">◉</span>
          <span className="min-w-0">
            <strong className="block truncate text-sm font-extrabold tracking-tight text-primary">Mario&apos;s Lechon</strong>
            <small className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">House · Backoffice</small>
          </span>
        </Link>

        <p className="mt-10 px-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-subtle">Workspace</p>
        <nav aria-label="Admin navigation" className="mt-3 space-y-1">
          <Link href="/admin" aria-current="page" className="flex items-center gap-3 rounded-btn bg-primary px-3 py-3 text-sm font-extrabold text-primary-fg shadow-[var(--shadow-card)]">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-fg/15 text-xs" aria-hidden="true">▦</span>
            Overview
          </Link>
          <Link href="/admin/inventory" className="flex items-center gap-3 rounded-btn px-3 py-3 text-sm font-extrabold text-ink-muted transition hover:bg-primary-soft hover:text-primary">
            <span className="grid h-6 w-6 place-items-center rounded-lg border border-line text-xs text-ink-subtle" aria-hidden="true">▦</span>
            Inventory
          </Link>
          {upcoming.map((item) => (
            <div key={item} className="flex items-center justify-between rounded-btn px-3 py-3 text-sm font-bold text-ink-muted">
              <span className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-lg border border-line text-[10px] text-ink-subtle" aria-hidden="true">·</span>{item}</span>
              <small className="rounded-pill bg-secondary px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">Next</small>
            </div>
          ))}
        </nav>

        <div className="mt-auto rounded-card border border-line bg-surface p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Current scope</p>
          <strong className="mt-2 block truncate text-sm font-extrabold text-ink">{branchName}</strong>
          <span className="mt-1 block text-xs text-ink-muted">Data is protected by Supabase RLS.</span>
          <Link href="/pos" className="mt-4 flex items-center justify-center rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Open POS</Link>
        </div>
      </div>
    </aside>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center">
      <p className="text-sm font-extrabold text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

function AdminProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/pos" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Open POS</Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
