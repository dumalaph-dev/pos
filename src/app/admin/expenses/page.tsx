import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { getAdminProfile } from "@/lib/admin/profile";
import { getAdminBranchOptions } from "@/lib/admin/branches";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { createExpense, updateExpense } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type ExpenseRange = "30d" | "90d" | "all";
type ExpensePaymentMethod = "cash" | "gcash" | "maya" | "card" | "other";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = { id: string; name: string; is_active: boolean };

type ExpenseRecord = {
  id: string;
  store_id: string;
  category: string;
  description: string;
  amount: number;
  incurred_on: string;
  payment_method: ExpensePaymentMethod;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_STORE_NAME = "Your Store";
const rangeOptions: Array<{ value: ExpenseRange; label: string }> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];
const categoryOptions = ["Utilities", "Rent", "Payroll", "Supplies", "Transport", "Maintenance", "Marketing", "Other"];
const paymentOptions: Array<{ value: ExpensePaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isExpenseRange(value: string): value is ExpenseRange {
  return value === "30d" || value === "90d" || value === "all";
}

function todayInputDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function rangeStart(range: ExpenseRange) {
  if (range === "all") return null;
  const current = new Date(`${todayInputDate()}T00:00:00+08:00`);
  current.setUTCDate(current.getUTCDate() - (range === "30d" ? 29 : 89));
  return current.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(`${value}T00:00:00+08:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function paymentLabel(value: ExpensePaymentMethod) {
  if (value === "gcash") return "GCash";
  if (value === "maya") return "Maya";
  if (value === "card") return "Card";
  if (value === "other") return "Other";
  return "Cash";
}

function expenseHref({ range, category, branch, q, edit }: { range: ExpenseRange; category: string; branch: string; q: string; edit?: string }) {
  const params = new URLSearchParams();
  if (range !== "30d") params.set("range", range);
  if (category) params.set("category", category);
  if (branch) params.set("branch", branch);
  if (q) params.set("q", q);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/expenses?${query}` : "/admin/expenses";
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; range?: string | string[]; category?: string | string[]; branch?: string | string[]; q?: string | string[]; edit?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedRange = readParam(params.range);
  const range: ExpenseRange = isExpenseRange(requestedRange) ? requestedRange : "30d";
  const categoryFilter = readParam(params.category);
  const branchFilter = readParam(params.branch);
  const searchQuery = readParam(params.q);
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <ExpensesProfileMissing />;

  let expensesQuery = supabase
    .from("expenses")
    .select("id, store_id, category, description, amount, incurred_on, payment_method, reference, notes, created_at, updated_at")
    .eq("org_id", profile.org_id)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  const start = rangeStart(range);
  if (start) expensesQuery = expensesQuery.gte("incurred_on", start);
  if (branchFilter) expensesQuery = expensesQuery.eq("store_id", branchFilter);
  if (categoryFilter) expensesQuery = expensesQuery.eq("category", categoryFilter);

  const [branchesResult, expensesResult] = await Promise.all([
    getAdminBranchOptions(profile.org_id),
    expensesQuery,
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const expenses = (expensesResult.data ?? []) as ExpenseRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredExpenses = expenses.filter((expense) => {
    if (!normalizedQuery) return true;
    return [expense.description, expense.category, expense.reference, expense.notes]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const selectedId = readParam(params.edit);
  const selectedExpense = selectedId ? filteredExpenses.find((expense) => expense.id === selectedId) ?? null : null;
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const averageExpense = filteredExpenses.length ? Math.round(totalExpenses / filteredExpenses.length) : 0;
  const largestExpense = filteredExpenses.reduce((largest, expense) => Math.max(largest, Number(expense.amount)), 0);
  const queryWarning = Boolean(branchesResult.error || expensesResult.error);
  const canWrite = profile.role === "admin";
  const branchByDefault = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const defaultBranch = profile.store_id ?? branches.find((branch) => branch.is_active)?.id ?? branches[0]?.id ?? "";
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const saved = readParam(params.saved);
  const savedMessage = saved === "created" ? "Expense recorded in the ledger." : saved === "updated" ? "Expense details updated." : "";
  const hasFilters = Boolean(range !== "30d" || categoryFilter || branchFilter || searchQuery);

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
          <AdminPageHeader title="Expenses">
            <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
            <Link href="/admin/reports" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Reports</Link>
            <SignOutButton className="px-3 py-2 text-xs" />
          </AdminPageHeader>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Operating costs · {branchByDefault}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">See what it costs to keep selling.</h2><p className="mt-2 max-w-2xl text-sm text-ink-muted">Record branch expenses with enough context to explain every peso, {firstName}.</p></div><span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span></div>

          {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
          {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
          {queryWarning && <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some expense data could not refresh. Check that the business-record migration is applied in Supabase.</div>}
          {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">This ledger is read-only for your role. Ask an organization admin to record or edit expenses.</div>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ExpenseMetric label="Total expenses" value={displayPeso(totalExpenses)} detail={`${rangeLabel(range)} · filtered view`} tone="bg-primary text-primary-fg" icon="wallet" /><ExpenseMetric label="Entries" value={String(filteredExpenses.length)} detail="Ledger records shown" tone="bg-secondary text-primary" icon="expenses" /><ExpenseMetric label="Average entry" value={displayPeso(averageExpense)} detail="Per expense record" tone="bg-success text-white" icon="chart" /><ExpenseMetric label="Largest entry" value={displayPeso(largestExpense)} detail="Highest single cost" tone="bg-warning/15 text-warning" icon="expenses" /></div>

          <section aria-labelledby="expense-filters-heading" className="admin-panel mt-6 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Cost review</p><h2 id="expense-filters-heading" className="admin-panel__title">Filter expense ledger</h2></div>{hasFilters && <Link href="/admin/expenses" className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></Link>}</div><form action="/admin/expenses" method="get" className="mt-4 grid gap-3 lg:grid-cols-[minmax(210px,1.3fr)_minmax(145px,0.8fr)_minmax(170px,0.9fr)_minmax(170px,0.9fr)_auto] lg:items-end"><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" defaultValue={searchQuery} placeholder="Description, category, reference" className="inventory-input pl-10" /></span></label><FilterField label="Period" htmlFor="expense-range"><select id="expense-range" name="range" defaultValue={range} className="inventory-input">{rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField><FilterField label="Category" htmlFor="expense-category"><select id="expense-category" name="category" defaultValue={categoryFilter} className="inventory-input"><option value="">All categories</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></FilterField><FilterField label="Branch" htmlFor="expense-branch"><select id="expense-branch" name="branch" defaultValue={branchFilter} className="inventory-input"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></FilterField><button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button></form></section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(310px,0.68fr)_minmax(0,1.32fr)]">
            {selectedExpense ? <ExpenseEditor expense={selectedExpense} branches={branches} canWrite={canWrite} cancelHref={expenseHref({ range, category: categoryFilter, branch: branchFilter, q: searchQuery })} /> : <ExpenseCreateForm branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} />}

            <section aria-labelledby="expense-ledger-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Auditable operating costs</p><h2 id="expense-ledger-heading" className="admin-panel__title">Expense ledger</h2><p className="admin-panel__subtitle">{filteredExpenses.length} matching entr{filteredExpenses.length === 1 ? "y" : "ies"}. Records are retained for review; edit details when a correction is needed.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Up to 1,000 rows</span></div>{filteredExpenses.length === 0 ? <EmptyLedger /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[820px]"><thead><tr><th>Date</th><th>Expense</th><th>Branch</th><th>Payment</th><th>Recorded</th><th>Amount</th></tr></thead><tbody>{filteredExpenses.map((expense) => <tr key={expense.id}><td className="whitespace-nowrap text-ink-muted">{formatDate(expense.incurred_on)}</td><td><Link href={expenseHref({ range, category: categoryFilter, branch: branchFilter, q: searchQuery, edit: expense.id })} className="font-extrabold text-primary hover:underline">{expense.description}</Link><small className="mt-1 block text-[10px] text-ink-muted">{expense.category}{expense.reference ? ` · ${expense.reference}` : ""}</small></td><td className="whitespace-nowrap">{branchById.get(expense.store_id)?.name ?? "Unknown branch"}</td><td className="whitespace-nowrap">{paymentLabel(expense.payment_method)}</td><td className="whitespace-nowrap text-ink-muted">{formatDateTime(expense.created_at)}</td><td className="tnums whitespace-nowrap text-right font-extrabold">{displayPeso(Number(expense.amount))}</td></tr>)}</tbody></table></div>}</section>
          </div>
      </div>
    </main>
  );
}

function rangeLabel(range: ExpenseRange) {
  return range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time";
}

function ExpenseCreateForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section aria-labelledby="new-expense-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">Ledger action</p><h2 id="new-expense-heading" className="admin-panel__title">Record expense</h2><p className="admin-panel__subtitle">Enter the cost in pesos. The ledger stores exact centavos.</p></div><form action={createExpense} className="mt-5 space-y-3"><ExpenseFields branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><button type="submit" disabled={!canWrite} className="mt-2 w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Record expense</button></form></section>;
}

function ExpenseEditor({ expense, branches, canWrite, cancelHref }: { expense: ExpenseRecord; branches: BranchRecord[]; canWrite: boolean; cancelHref: string }) {
  return <section aria-labelledby="edit-expense-heading" className="admin-panel self-start p-5"><div className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Ledger action</p><h2 id="edit-expense-heading" className="admin-panel__title">Edit expense</h2><p className="admin-panel__subtitle">Correct the details while keeping the record in the ledger.</p></div><Link href={cancelHref} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close expense editor">&times;</Link></div><form action={updateExpense} className="mt-5 space-y-3"><input type="hidden" name="expense_id" value={expense.id} /><ExpenseFields expense={expense} branches={branches} defaultBranch={expense.store_id} canWrite={canWrite} /><div className="flex gap-2"><Link href={cancelHref} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</Link><button type="submit" disabled={!canWrite} className="flex-1 rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">Save changes</button></div></form></section>;
}

function ExpenseFields({ expense, branches, defaultBranch, canWrite }: { expense?: ExpenseRecord; branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <>
    <Field label="Branch" htmlFor="expense-store"><select id="expense-store" name="store_id" defaultValue={defaultBranch} required disabled={!canWrite} className="inventory-input"><option value="">Choose branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Category" htmlFor="expense-category-input"><input id="expense-category-input" name="category" list="expense-category-options" defaultValue={expense?.category ?? ""} placeholder="e.g. Supplies" required disabled={!canWrite} className="inventory-input" /><datalist id="expense-category-options">{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist></Field><Field label="Amount · ₱" htmlFor="expense-amount"><input id="expense-amount" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={expense ? (Number(expense.amount) / 100).toFixed(2) : ""} placeholder="0.00" required disabled={!canWrite} className="inventory-input tnums" /></Field></div>
    <Field label="Description" htmlFor="expense-description"><input id="expense-description" name="description" defaultValue={expense?.description ?? ""} placeholder="e.g. Cooking gas refill" required disabled={!canWrite} className="inventory-input" /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Date incurred" htmlFor="expense-date"><input id="expense-date" name="incurred_on" type="date" defaultValue={expense?.incurred_on ?? todayInputDate()} required disabled={!canWrite} className="inventory-input" /></Field><Field label="Payment method" htmlFor="expense-payment"><select id="expense-payment" name="payment_method" defaultValue={expense?.payment_method ?? "cash"} required disabled={!canWrite} className="inventory-input">{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>
    <Field label="Reference" htmlFor="expense-reference"><input id="expense-reference" name="reference" defaultValue={expense?.reference ?? ""} placeholder="Receipt no. or vendor reference" disabled={!canWrite} className="inventory-input" /></Field>
    <Field label="Notes" htmlFor="expense-notes"><textarea id="expense-notes" name="notes" defaultValue={expense?.notes ?? ""} rows={2} placeholder="Optional context for the owner" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
  </>;
}

function ExpenseMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "wallet" | "expenses" | "chart" }) {
  return <article className="admin-kpi-card min-h-[132px]"><div className="admin-kpi-card__inner"><div className="admin-kpi-card__top"><span className="admin-kpi-card__label">{label}</span><span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span></div><p className="admin-kpi-card__value tnums">{value}</p><p className="admin-kpi-card__trend">{detail}</p></div></article>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>{children}</label>;
}

function EmptyLedger() {
  return <div className="mt-5 rounded-btn border border-dashed border-line-strong bg-surface-raised px-4 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary"><AdminIcon name="expenses" size={23} /></span><p className="mt-4 text-sm font-extrabold text-ink">No expenses match this view</p><p className="mt-1 text-xs text-ink-muted">Try a wider period or record the first operating cost for this branch.</p></div>;
}

function ExpensesProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
