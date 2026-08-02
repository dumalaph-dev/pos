import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import {
  formatStockQuantity,
  LOW_STOCK_THRESHOLD,
  stockMovementDelta,
  stockStatus,
  type StockMovementType,
} from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import { recordStockMovement } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";

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

type ProductRecord = {
  id: string;
  name: string;
  unit: string;
  price: number;
  track_stock: boolean;
  is_active: boolean;
  store_id: string;
};

type MovementRecord = {
  id: string;
  store_id: string;
  product_id: string;
  type: StockMovementType;
  qty: number;
  unit: string;
  unit_cost: number | null;
  reason: string | null;
  created_at: string;
};

const DEFAULT_STORE_NAME = "Mario's Lechon House";

const movementOptions: Array<{ value: Exclude<StockMovementType, "sale">; label: string; detail: string }> = [
  { value: "receive", label: "Stock in", detail: "Add purchased or opening stock" },
  { value: "yield_in", label: "Yield in", detail: "Add usable product from prep" },
  { value: "yield_out", label: "Yield out", detail: "Consume raw stock during prep" },
  { value: "waste", label: "Waste / spoilage", detail: "Remove damaged or spoiled stock" },
  { value: "adjust", label: "Adjustment", detail: "Signed correction after a count" },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function movementLabel(type: StockMovementType) {
  if (type === "receive") return "Stock in";
  if (type === "yield_in") return "Yield in";
  if (type === "yield_out") return "Yield out";
  if (type === "waste") return "Waste";
  if (type === "sale") return "POS sale";
  return "Adjustment";
}

function movementClass(type: StockMovementType) {
  if (type === "receive" || type === "yield_in") return "bg-success/10 text-success";
  if (type === "sale" || type === "waste" || type === "yield_out") return "bg-danger-soft text-danger";
  return "bg-warning/15 text-warning";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
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

  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <InventoryProfileMissing />;

  const [branchesResult, productsResult, movementsResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("org_id", profile.org_id)
      .order("name"),
    supabase
      .from("products")
      .select("id, name, unit, price, track_stock, is_active, store_id")
      .eq("org_id", profile.org_id)
      .order("name")
      .limit(1000),
    supabase
      .from("stock_movements")
      .select("id, store_id, product_id, type, qty, unit, unit_cost, reason, created_at")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const products = (productsResult.data ?? []) as ProductRecord[];
  const movements = (movementsResult.data ?? []) as MovementRecord[];
  const trackedProducts = products.filter((product) => product.track_stock);
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const stockByKey = new Map<string, number>();

  for (const movement of movements) {
    const key = `${movement.store_id}:${movement.product_id}`;
    stockByKey.set(key, (stockByKey.get(key) ?? 0) + stockMovementDelta(movement.type, Number(movement.qty)));
  }

  const inventoryRows = branches.flatMap((branch) =>
    trackedProducts
      .filter((product) => product.store_id === branch.id)
      .map((product) => {
        const onHand = stockByKey.get(`${branch.id}:${product.id}`) ?? 0;
        return { branch, product, onHand, status: stockStatus(onHand) };
      }),
  );
  const lowStockCount = inventoryRows.filter((row) => row.status === "low" || row.status === "out").length;
  const queryWarning = Boolean(branchesResult.error || productsResult.error || movementsResult.error);
  const params = await searchParams;
  const canWrite = profile.role === "admin";
  const currentBranchName = profile.store_id
    ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME
    : "All branches";
  const orgName = profile.organizations?.name ?? DEFAULT_STORE_NAME;
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const defaultBranch = profile.store_id ?? branches[0]?.id ?? "";
  const formProducts = trackedProducts.filter((product) => product.is_active);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="mx-auto grid min-h-screen max-w-[1680px] lg:grid-cols-[238px_minmax(0,1fr)]">
        <AdminSidebar branchName={currentBranchName} active="inventory" />

        <div className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
            <Link href="/admin" className="flex min-w-0 items-center gap-3 lg:hidden">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-lg text-primary" aria-hidden="true">◉</span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-extrabold text-primary">Mario&apos;s Lechon House</strong>
                <small className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Inventory · Backoffice</small>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
              <Link href="/pos" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Open POS</Link>
              <SignOutButton className="px-3 py-2 text-xs" />
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Inventory control · {currentBranchName}</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Keep {orgName} in sync, {firstName}.</h1>
              <p className="mt-2 max-w-2xl text-sm text-ink-muted">On-hand counts are derived from the append-only ledger. Completed POS orders add sale movements automatically after the inventory migration is applied.</p>
            </div>
            <span className="rounded-pill border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-muted">Low stock signal · ≤ {LOW_STOCK_THRESHOLD} units</span>
          </div>

          {params.saved === "1" && (
            <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">Stock movement recorded. The ledger and audit trail are up to date.</div>
          )}
          {params.error && (
            <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{params.error}</div>
          )}
          {queryWarning && (
            <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some inventory data could not refresh. Check the Supabase connection and RLS scope before recording a count.</div>
          )}
          {!canWrite && (
            <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This view is read-only for your role. Ask an organization admin to record stock movements.</div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InventoryMetric label="Tracked products" value={String(trackedProducts.length)} detail="Across your visible branches" tone="bg-primary text-primary-fg" />
            <InventoryMetric label="Low / out" value={String(lowStockCount)} detail={`At or below ${LOW_STOCK_THRESHOLD} units`} tone="bg-accent text-accent-fg" />
            <InventoryMetric label="Ledger entries" value={String(movements.length)} detail="Latest 1,000 movement rows" tone="bg-secondary text-primary" />
            <InventoryMetric label="Branches" value={String(branches.length)} detail="RLS-scoped branch view" tone="bg-primary-soft text-primary" />
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
            <section aria-labelledby="movement-heading" className="rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Ledger action</p>
                <h2 id="movement-heading" className="mt-1 text-xl font-extrabold text-ink">Record a movement</h2>
                <p className="mt-2 text-xs leading-5 text-ink-muted">Use a signed delta for adjustments. POS sales are never entered here manually.</p>
              </div>
              {formProducts.length === 0 ? (
                <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-6 text-center">
                  <p className="text-sm font-extrabold text-ink">No tracked products yet</p>
                  <p className="mt-1 text-xs text-ink-muted">Enable Track stock on a product before recording inventory.</p>
                </div>
              ) : (
                <form action={recordStockMovement} className="mt-5 space-y-4">
                  <InventoryField label="Branch" htmlFor="inventory-store">
                    <select id="inventory-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite} className="inventory-input">
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}
                    </select>
                  </InventoryField>
                  <InventoryField label="Tracked product" htmlFor="inventory-product">
                    <select id="inventory-product" name="product_id" defaultValue={formProducts[0]?.id} required disabled={!canWrite} className="inventory-input">
                      {formProducts.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
                    </select>
                  </InventoryField>
                  <InventoryField label="Movement" htmlFor="inventory-type">
                    <select id="inventory-type" name="type" defaultValue="receive" required disabled={!canWrite} className="inventory-input">
                      {movementOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.detail}</option>)}
                    </select>
                  </InventoryField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InventoryField label="Quantity" htmlFor="inventory-qty">
                      <input id="inventory-qty" name="qty" type="number" inputMode="decimal" step="0.001" placeholder="e.g. 10 or -2" required disabled={!canWrite} className="inventory-input tnums" />
                    </InventoryField>
                    <InventoryField label="Unit cost · ₱" htmlFor="inventory-cost">
                      <input id="inventory-cost" name="unit_cost" type="number" inputMode="decimal" min="0" step="0.01" placeholder="Optional" disabled={!canWrite} className="inventory-input tnums" />
                    </InventoryField>
                  </div>
                  <InventoryField label="Reason / reference" htmlFor="inventory-reason">
                    <textarea id="inventory-reason" name="reason" rows={3} placeholder="Required for waste and adjustments" disabled={!canWrite} className="inventory-input min-h-20 resize-y" />
                  </InventoryField>
                  <button type="submit" disabled={!canWrite} className="w-full rounded-btn bg-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">Record movement</button>
                </form>
              )}
            </section>

            <section aria-labelledby="on-hand-heading" className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Derived balance</p>
                  <h2 id="on-hand-heading" className="mt-1 text-xl font-extrabold text-ink">Stock on hand</h2>
                </div>
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Ledger total</span>
              </div>
              {inventoryRows.length === 0 ? (
                <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-8 text-center">
                  <p className="text-sm font-extrabold text-ink">No inventory rows yet</p>
                  <p className="mt-1 text-xs text-ink-muted">Tracked products will appear here branch by branch.</p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">
                        <th className="px-2 py-3">Product</th>
                        <th className="px-2 py-3">Branch</th>
                        <th className="px-2 py-3 text-right">On hand</th>
                        <th className="px-2 py-3 text-right">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryRows.map((row) => (
                        <tr key={`${row.branch.id}:${row.product.id}`} className="border-b border-line/70 last:border-0">
                          <td className="px-2 py-3"><strong className="block text-sm font-extrabold text-ink">{row.product.name}</strong><span className="text-xs text-ink-muted">{row.product.unit}</span></td>
                          <td className="px-2 py-3 text-sm font-semibold text-ink-muted">{row.branch.name}</td>
                          <td className="tnums px-2 py-3 text-right text-sm font-extrabold text-ink">{formatStockQuantity(row.onHand)} <span className="text-xs font-semibold text-ink-muted">{row.product.unit}</span></td>
                          <td className="px-2 py-3 text-right"><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${row.status === "out" ? "bg-danger-soft text-danger" : row.status === "low" ? "bg-warning/15 text-warning" : "bg-success/10 text-success"}`}>{row.status === "out" ? "Out" : row.status === "low" ? "Low" : "Healthy"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="ledger-heading" className="mt-4 min-w-0 rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Audit trail</p>
                <h2 id="ledger-heading" className="mt-1 text-xl font-extrabold text-ink">Recent movements</h2>
              </div>
              <span className="rounded-pill border border-line bg-surface-raised px-3 py-1.5 text-xs font-bold text-ink-muted">Newest first</span>
            </div>
            {movements.length === 0 ? (
              <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-7 text-center">
                <p className="text-sm font-extrabold text-ink">The ledger is ready</p>
                <p className="mt-1 text-xs text-ink-muted">The first stock-in or POS sale will appear here.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">
                      <th className="px-2 py-3">When</th>
                      <th className="px-2 py-3">Product</th>
                      <th className="px-2 py-3">Branch</th>
                      <th className="px-2 py-3">Movement</th>
                      <th className="px-2 py-3 text-right">Delta</th>
                      <th className="px-2 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.slice(0, 30).map((movement) => {
                      const product = productById.get(movement.product_id);
                      const delta = stockMovementDelta(movement.type, Number(movement.qty));
                      return (
                        <tr key={movement.id} className="border-b border-line/70 last:border-0">
                          <td className="px-2 py-3 text-xs font-semibold text-ink-muted">{formatDateTime(movement.created_at)}</td>
                          <td className="px-2 py-3"><strong className="block text-sm font-extrabold text-ink">{product?.name ?? "Unknown product"}</strong><span className="text-xs text-ink-muted">{movement.unit_cost == null ? "No unit cost" : `${formatPeso(Number(movement.unit_cost))} / unit`}</span></td>
                          <td className="px-2 py-3 text-sm font-semibold text-ink-muted">{branchById.get(movement.store_id)?.name ?? "Unknown branch"}</td>
                          <td className="px-2 py-3"><span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${movementClass(movement.type)}`}>{movementLabel(movement.type)}</span></td>
                          <td className={`tnums px-2 py-3 text-right text-sm font-extrabold ${delta >= 0 ? "text-success" : "text-danger"}`}>{delta >= 0 ? "+" : "−"}{formatStockQuantity(Math.abs(delta))} {movement.unit}</td>
                          <td className="max-w-[220px] truncate px-2 py-3 text-sm font-semibold text-ink-muted" title={movement.reason ?? "—"}>{movement.reason ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function InventoryMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <article className="rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-transform duration-150 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-ink-muted">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-btn text-sm font-extrabold ${tone}`} aria-hidden="true">▦</span>
      </div>
      <p className="tnums mt-5 text-2xl font-extrabold tracking-[-0.04em] text-ink">{value}</p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{detail}</p>
    </article>
  );
}

function InventoryField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function InventoryProfileMissing() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink">
      <div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p>
        <h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
