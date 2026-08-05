import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { readAdminBranding } from "@/lib/admin/branding";
import { getAdminProfile } from "@/lib/admin/profile";
import { formatStockQuantity, stockMovementDelta } from "@/lib/inventory";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { recordInventoryCount } from "../actions";
import { OwnerGuidance } from "@/components/admin/OwnerOnboardingPanel";

type AdminRole = "admin" | "manager" | "cashier";
type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
  organizations: { settings?: unknown } | null;
};
type BranchRecord = { id: string; name: string; is_active: boolean };
type ProductRecord = { id: string; name: string; unit: string; min_stock: number | null };
type ExpectedRow = { product_id: string; qty: number };
type CountRecord = { product_id: string; expected_qty: number; counted_qty: number; variance_qty: number; updated_at: string };
type VarianceStatus = "pending" | "balanced" | "short" | "over";
type VarianceRow = ProductRecord & { expectedQty: number; countedQty: number | null; varianceQty: number | null; status: VarianceStatus };

const DAY_MS = 24 * 60 * 60 * 1000;

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getSingaporeDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date());
}

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getSingaporeDayEnd(value: string) {
  return new Date(new Date(`${value}T00:00:00+08:00`).getTime() + DAY_MS);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Singapore" }).format(new Date(`${value}T00:00:00+08:00`));
}

function statusLabel(status: VarianceStatus) {
  if (status === "pending") return "Not counted";
  if (status === "balanced") return "Balanced";
  if (status === "short") return "Short";
  return "Over";
}

function statusClass(status: VarianceStatus) {
  if (status === "pending") return "bg-secondary text-ink-muted";
  if (status === "balanced") return "bg-success/10 text-success";
  if (status === "short") return "bg-danger-soft text-danger";
  return "bg-warning/15 text-warning";
}

export default async function InventoryVariancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; branch?: string | string[]; error?: string | string[]; saved?: string | string[] }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <VarianceProfileMissing />;

  const branding = readAdminBranding(profile.organizations?.settings);
  const requestedDate = readParam(params.date);
  const countDate = isValidDateString(requestedDate) ? requestedDate : getSingaporeDateString();
  const branchesResult = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .eq("is_active", true)
    .order("name");
  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const contextBranchId = await getSelectedAdminBranchId(branches, profile.store_id);
  const requestedBranchId = readParam(params.branch);
  const requestedBranchIsAllowed = profile.role === "admin" && branches.some((branch) => branch.id === requestedBranchId);
  const branchId = (requestedBranchIsAllowed ? requestedBranchId : null)
    ?? contextBranchId
    ?? profile.store_id
    ?? branches[0]?.id
    ?? "";
  const branch = branches.find((item) => item.id === branchId);
  const canWrite = profile.role === "admin";
  const dayEnd = getSingaporeDayEnd(countDate);

  const productsResult = branchId
    ? await supabase
      .from("products")
      .select("id, name, unit, min_stock")
      .eq("org_id", profile.org_id)
      .eq("store_id", branchId)
      .eq("track_stock", true)
      .eq("is_active", true)
      .order("name")
      .limit(2000)
    : { data: [], error: null };
  const countsResult = branchId
    ? await supabase
      .from("inventory_counts")
      .select("product_id, expected_qty, counted_qty, variance_qty, updated_at")
      .eq("org_id", profile.org_id)
      .eq("store_id", branchId)
      .eq("count_date", countDate)
    : { data: [], error: null };
  const expectedResult = branchId
    ? await supabase.rpc("inventory_expected_stock", {
      p_org_id: profile.org_id,
      p_store_id: branchId,
      p_until: dayEnd.toISOString(),
    })
    : { data: [], error: null };

  const products = (productsResult.data ?? []) as ProductRecord[];
  const counts = (countsResult.data ?? []) as CountRecord[];
  let expectedRows = (expectedResult.data ?? []) as ExpectedRow[];
  let expectedWarning = Boolean(expectedResult.error);

  if (expectedResult.error && branchId) {
    const fallbackResult = await supabase
      .from("stock_movements")
      .select("product_id, type, qty")
      .eq("org_id", profile.org_id)
      .eq("store_id", branchId)
      .lt("created_at", dayEnd.toISOString())
      .limit(10000);
    if (fallbackResult.error) {
      expectedWarning = true;
    } else {
      const fallbackByProduct = new Map<string, number>();
      for (const movement of (fallbackResult.data ?? []) as Array<{ product_id: string; type: string; qty: number }>) {
        fallbackByProduct.set(movement.product_id, (fallbackByProduct.get(movement.product_id) ?? 0) + stockMovementDelta(movement.type, Number(movement.qty)));
      }
      expectedRows = Array.from(fallbackByProduct, ([product_id, qty]) => ({ product_id, qty }));
    }
  }

  const expectedByProductId = new Map(expectedRows.map((row) => [row.product_id, Number(row.qty)]));
  const countByProductId = new Map(counts.map((row) => [row.product_id, row]));
  const rows: VarianceRow[] = products.map((product) => {
    const count = countByProductId.get(product.id);
    const countedQty = count ? Number(count.counted_qty) : null;
    const varianceQty = count ? Number(count.variance_qty) : null;
    return {
      ...product,
      expectedQty: count ? Number(count.expected_qty) : expectedByProductId.get(product.id) ?? 0,
      countedQty,
      varianceQty,
      status: countedQty === null ? "pending" : Math.abs(varianceQty ?? 0) < 0.0005 ? "balanced" : (varianceQty ?? 0) < 0 ? "short" : "over",
    };
  });
  const countedRows = rows.filter((row) => row.countedQty !== null);
  const shortRows = rows.filter((row) => row.status === "short");
  const overRows = rows.filter((row) => row.status === "over");
  const queryWarning = Boolean(branchesResult.error || productsResult.error || countsResult.error);
  const errorMessage = readParam(params.error);
  const savedMessage = readParam(params.saved) === "1" ? `End-of-day count saved for ${formatDate(countDate)}.` : "";
  const formDisabled = !canWrite || !branchId || products.length === 0 || Boolean(productsResult.error || countsResult.error);

  return (
    <main data-admin-theme={branding.theme} className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <header className="admin-reference-header flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/admin/inventory" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary-soft text-primary" aria-label="Back to inventory"><AdminIcon name="inventory" size={20} /></Link>
            <div className="min-w-0"><p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-muted">Inventory control</p><h1 className="truncate text-lg font-extrabold text-primary">End-of-day variance</h1></div>
          </div>
          <div className="ml-auto flex items-center gap-2"><Link href="/admin/inventory" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold text-primary transition hover:bg-secondary-hover">Inventory</Link><SignOutButton className="px-3 py-2 text-xs" /></div>
        </header>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Expected versus counted</p><h2 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Close the day with a physical count.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Compare the ledger balance at the end of a business day with what your team actually counted, then reconcile the difference with an auditable adjustment.</p></div>
          <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span>
        </div>

        {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
        {errorMessage && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{errorMessage}</div>}
        {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink"><strong className="font-extrabold">Some count data could not be loaded.</strong> {countsResult.error ? "Apply the inventory workflow migration before saving counts." : "The available ledger data is still shown."}</div>}
        {expectedWarning && !queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">The aggregate stock function is not available yet, so this report is using the raw ledger as a fallback.</div>}
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This report is read-only for your role. Ask an organization admin to save the physical count.</div>}
        {canWrite && <div className="mt-5"><OwnerGuidance topic="variance" /></div>}

        <form action="/admin/inventory/variance" method="get" className="admin-panel mt-6 grid gap-3 p-4 sm:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_auto] sm:items-end">
          <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Business date</span><input type="date" name="date" defaultValue={countDate} className="inventory-input" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Branch</span><select name="branch" defaultValue={branchId} disabled={profile.role !== "admin"} className="inventory-input"><option value="">Choose branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">View variance</button>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <VarianceMetric label="Tracked products" value={String(rows.length)} detail={branch?.name ?? "Choose a branch"} tone="bg-primary text-primary-fg" />
          <VarianceMetric label="Counted lines" value={`${countedRows.length}/${rows.length}`} detail="Physical quantities saved" tone="bg-secondary text-primary" />
          <VarianceMetric label="Short lines" value={String(shortRows.length)} detail="Counted below expected" tone="bg-danger text-white" />
          <VarianceMetric label="Over lines" value={String(overRows.length)} detail="Counted above expected" tone="bg-warning text-white" />
        </div>

        <section className="admin-panel mt-5 overflow-hidden" aria-labelledby="variance-table-heading">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 sm:px-5"><div><p className="admin-panel__eyebrow">{branch?.name ?? "No branch selected"} · {formatDate(countDate)}</p><h2 id="variance-table-heading" className="admin-panel__title">Expected versus counted</h2><p className="admin-panel__subtitle">Expected quantities include ledger activity through the end of the selected Singapore business day.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{countedRows.length === rows.length && rows.length > 0 ? "Count complete" : "Count in progress"}</span></div>
          {rows.length === 0 ? <div className="grid place-items-center px-4 py-14 text-center"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="inventory" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No tracked products found</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink-muted">Enable stock tracking on products before closing a physical inventory count.</p><Link href="/products" className="inventory-button mt-3 rounded-btn bg-primary text-[11px] font-extrabold text-primary-fg">Open Products</Link></div> : <form action={recordInventoryCount}>
            <input type="hidden" name="store_id" value={branchId} />
            <input type="hidden" name="count_date" value={countDate} />
            <div className="overflow-x-auto"><table className="admin-list-table min-w-[760px]"><thead><tr><th>Product</th><th>Expected at close</th><th>Counted quantity</th><th>Variance</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><small className="mt-1 block text-[10px] text-ink-muted">Unit: {row.unit}</small></td><td className="tnums whitespace-nowrap font-extrabold">{formatStockQuantity(row.expectedQty)} {row.unit}</td><td><label className="sr-only" htmlFor={`counted-${row.id}`}>Counted quantity for {row.name}</label><input id={`counted-${row.id}`} name={`counted_${row.id}`} type="number" min="0" step="0.001" inputMode="decimal" defaultValue={row.countedQty === null ? "" : String(row.countedQty)} required disabled={formDisabled} className="inventory-input inventory-input--compact tnums max-w-[160px]" placeholder="Enter count" /></td><td className={`tnums whitespace-nowrap font-extrabold ${row.status === "short" ? "text-danger" : row.status === "over" ? "text-warning" : row.status === "balanced" ? "text-success" : "text-ink-muted"}`}>{row.varianceQty === null ? "—" : `${row.varianceQty >= 0 ? "+" : "−"}${formatStockQuantity(Math.abs(row.varianceQty))} ${row.unit}`}</td><td><span className={`inline-flex whitespace-nowrap rounded-pill px-2.5 py-1 text-[10px] font-extrabold ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td></tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 sm:px-5"><p className="max-w-2xl text-xs leading-5 text-ink-muted">Saving applies a signed adjustment for the difference. If you correct the count later, only the new difference is added, so the ledger will not double-count the reconciliation.</p><button type="submit" disabled={formDisabled} className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save physical count</button></div>
          </form>}
        </section>
      </div>
    </main>
  );
}

function VarianceMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <article className={`rounded-card border border-line p-4 shadow-[var(--shadow-card)] ${tone}`}><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] opacity-80">{label}</p><strong className="mt-2 block text-2xl font-extrabold tracking-[-0.03em]">{value}</strong><span className="mt-1 block text-[10px] font-semibold opacity-75">{detail}</span></article>;
}

function VarianceProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
