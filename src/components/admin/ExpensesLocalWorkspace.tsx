"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import { createExpense, updateExpense } from "@/app/admin/expenses/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import { useAdminUrlQuery } from "@/components/admin/AdminUrlQuery";
import { formatPeso } from "@/lib/money";

type ExpenseRange = "30d" | "90d" | "all";
type ExpensePaymentMethod = "cash" | "gcash" | "maya" | "card" | "other";
type BranchRecord = { id: string; name: string; is_active: boolean };

export type AdminExpenseRecord = {
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

function paymentLabel(value: ExpensePaymentMethod) {
  if (value === "gcash") return "GCash";
  if (value === "maya") return "Maya";
  if (value === "card") return "Card";
  if (value === "other") return "Other";
  return "Cash";
}

function expenseHref(range: ExpenseRange, category: string, branch: string, q: string, edit?: string) {
  const params = new URLSearchParams();
  if (range !== "30d") params.set("range", range);
  if (category) params.set("category", category);
  if (branch) params.set("branch", branch);
  if (q) params.set("q", q);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/expenses?${query}` : "/admin/expenses";
}

export function ExpensesLocalWorkspace({
  expenses,
  branches,
  initialRange,
  initialCategory,
  initialBranch,
  initialQuery,
  initialEditId,
  canWrite,
  defaultBranch,
  notice,
}: {
  expenses: AdminExpenseRecord[];
  branches: BranchRecord[];
  initialRange: ExpenseRange;
  initialCategory: string;
  initialBranch: string;
  initialQuery: string;
  initialEditId: string | null;
  canWrite: boolean;
  defaultBranch: string;
  notice?: { kind: "success" | "error" | "warning"; message: string };
}) {
  const [query, updateQuery] = useAdminUrlQuery({ range: initialRange, category: initialCategory, branch: initialBranch, q: initialQuery });
  const range: ExpenseRange = query.range === "90d" || query.range === "all" ? query.range : "30d";
  const category = query.category ?? "";
  const branch = query.branch ?? "";
  const searchQuery = query.q ?? "";
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredExpenses = useMemo(() => {
    const start = rangeStart(range);
    return expenses.filter((expense) => {
      if (start && expense.incurred_on < start) return false;
      if (branch && expense.store_id !== branch) return false;
      if (category && expense.category !== category) return false;
      if (!normalizedQuery) return true;
      return [expense.description, expense.category, expense.reference, expense.notes].filter(Boolean).some((value) => value!.toLowerCase().includes(normalizedQuery));
    });
  }, [branch, category, expenses, normalizedQuery, range]);
  const branchById = useMemo(() => new Map(branches.map((item) => [item.id, item])), [branches]);
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const averageExpense = filteredExpenses.length ? Math.round(totalExpenses / filteredExpenses.length) : 0;
  const largestExpense = filteredExpenses.reduce((largest, expense) => Math.max(largest, Number(expense.amount)), 0);

  return (
    <UrlLocalDialogController
      className="expense-dialog-controller"
      records={expenses}
      initialId={initialEditId}
      queryKey="edit"
      triggerSelector="[data-expense-trigger]"
      readTriggerId={(trigger) => trigger.dataset.expenseTrigger ?? null}
      getRecordId={(expense) => expense.id}
      performanceSurface="expenses"
      renderDialog={(expense, onClose) => (
        <AdminDialog
          key={expense.id}
          onClose={onClose}
          titleId={`expense-dialog-heading-${expense.id}`}
          descriptionId={`expense-dialog-description-${expense.id}`}
          bodyClassName="admin-dialog-open"
          backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
          dialogClassName="relative my-4 w-full max-w-2xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6"
        >
          <ExpenseEditorDialog expense={expense} branches={branches} canWrite={canWrite} onClose={onClose} />
        </AdminDialog>
      )}
    >
      <div className="admin-directory-workspace">
        {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mt-5 rounded-card border px-4 py-3 text-sm font-semibold ${notice.kind === "success" ? "border-success/25 bg-success/10 text-success" : notice.kind === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-warning/30 bg-warning/10 text-ink"}`}>{notice.message}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><ExpenseMetric label="Total expenses" value={displayPeso(totalExpenses)} detail={`${rangeLabel(range)} · filtered view`} tone="bg-primary text-primary-fg" icon="wallet" /><ExpenseMetric label="Entries" value={String(filteredExpenses.length)} detail="Ledger records shown" tone="bg-secondary text-primary" icon="expenses" /><ExpenseMetric label="Average entry" value={displayPeso(averageExpense)} detail="Per expense record" tone="bg-success text-white" icon="chart" /><ExpenseMetric label="Largest entry" value={displayPeso(largestExpense)} detail="Highest single cost" tone="bg-warning/15 text-warning" icon="expenses" /></div>

        <section aria-labelledby="expense-filters-heading" className="admin-panel mt-6 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Cost review</p><h2 id="expense-filters-heading" className="admin-panel__title">Filter expense ledger</h2></div>{(range !== "30d" || category || branch || searchQuery) && <button type="button" onClick={() => updateQuery({ range: "30d", category: "", branch: "", q: "" })} className="admin-kpi-card__link mt-0">Clear filters <AdminIcon name="arrow" size={14} /></button>}</div><form onSubmit={(event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); updateQuery({ q: String(formData.get("q") ?? ""), range: String(formData.get("range") ?? ""), category: String(formData.get("category") ?? ""), branch: String(formData.get("branch") ?? "") }); }} className="mt-4 grid gap-3 lg:grid-cols-[minmax(210px,1.3fr)_minmax(145px,0.8fr)_minmax(170px,0.9fr)_minmax(170px,0.9fr)_auto] lg:items-end"><label className="block"><span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Search</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted"><AdminIcon name="search" size={16} /></span><input name="q" value={searchQuery} onChange={(event) => updateQuery({ q: event.target.value })} placeholder="Description, category, reference" className="inventory-input pl-10" /></span></label><FilterField label="Period" htmlFor="expense-range"><select id="expense-range" name="range" value={range} onChange={(event) => updateQuery({ range: event.target.value })} className="inventory-input">{rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterField><FilterField label="Category" htmlFor="expense-category"><select id="expense-category" name="category" value={category} onChange={(event) => updateQuery({ category: event.target.value })} className="inventory-input"><option value="">All categories</option>{categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></FilterField><FilterField label="Branch" htmlFor="expense-branch"><select id="expense-branch" name="branch" value={branch} onChange={(event) => updateQuery({ branch: event.target.value })} className="inventory-input"><option value="">All branches</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " · inactive"}</option>)}</select></FilterField><button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button></form><p className="mt-3 text-xs text-ink-muted">Filtering happens in this browser; the URL remains shareable and back/forward friendly.</p></section>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(310px,0.68fr)_minmax(0,1.32fr)]"><ExpenseCreateForm branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><section aria-labelledby="expense-ledger-heading" className="admin-panel min-w-0 p-5"><div className="admin-panel__header"><div><p className="admin-panel__eyebrow">Auditable operating costs</p><h2 id="expense-ledger-heading" className="admin-panel__title">Expense ledger</h2><p className="admin-panel__subtitle">{filteredExpenses.length} matching entr{filteredExpenses.length === 1 ? "y" : "ies"}. Records are retained for review; edit details when a correction is needed.</p></div><span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">Local filter</span></div>{filteredExpenses.length === 0 ? <EmptyLedger /> : <div className="mt-4 overflow-x-auto"><table className="admin-list-table min-w-[820px]"><thead><tr><th>Date</th><th>Expense</th><th>Branch</th><th>Payment</th><th>Recorded</th><th>Amount</th></tr></thead><tbody>{filteredExpenses.map((expense) => <tr key={expense.id}><td className="whitespace-nowrap text-ink-muted">{formatDate(expense.incurred_on)}</td><td><a data-expense-trigger={expense.id} href={expenseHref(range, category, branch, searchQuery, expense.id)} className="font-extrabold text-primary hover:underline">{expense.description}</a><small className="mt-1 block text-[10px] text-ink-muted">{expense.category}{expense.reference ? ` · ${expense.reference}` : ""}</small></td><td className="whitespace-nowrap">{branchById.get(expense.store_id)?.name ?? "Unknown branch"}</td><td className="whitespace-nowrap">{paymentLabel(expense.payment_method)}</td><td className="whitespace-nowrap text-ink-muted">{formatDateTime(expense.created_at)}</td><td className="tnums whitespace-nowrap text-right font-extrabold">{displayPeso(Number(expense.amount))}</td></tr>)}</tbody></table></div>}</section></div>
      </div>
    </UrlLocalDialogController>
  );
}

function rangeLabel(range: ExpenseRange) {
  return range === "30d" ? "Last 30 days" : range === "90d" ? "Last 90 days" : "All time";
}

function ExpenseCreateForm({ branches, defaultBranch, canWrite }: { branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <section aria-labelledby="new-expense-heading" className="admin-panel self-start p-5"><div><p className="admin-panel__eyebrow">Ledger action</p><h2 id="new-expense-heading" className="admin-panel__title">Record expense</h2><p className="admin-panel__subtitle">Enter the cost in pesos. The ledger stores exact centavos.</p></div><form action={createExpense} className="mt-5 space-y-3"><ExpenseFields branches={branches} defaultBranch={defaultBranch} canWrite={canWrite} /><SubmitButton disabled={!canWrite}>Record expense</SubmitButton></form></section>;
}

function ExpenseEditorDialog({ expense, branches, canWrite, onClose }: { expense: AdminExpenseRecord; branches: BranchRecord[]; canWrite: boolean; onClose: () => void }) {
  return <section aria-labelledby={`expense-dialog-heading-${expense.id}`}><header className="flex items-start justify-between gap-3"><div><p className="admin-panel__eyebrow">Ledger action</p><h2 id={`expense-dialog-heading-${expense.id}`} className="admin-panel__title">Edit expense</h2><p id={`expense-dialog-description-${expense.id}`} className="admin-panel__subtitle">Correct the details while keeping the record in the ledger.</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close expense editor">&times;</button></header><form action={updateExpense} className="mt-5 space-y-3"><input type="hidden" name="expense_id" value={expense.id} /><ExpenseFields expense={expense} branches={branches} defaultBranch={expense.store_id} canWrite={canWrite} /><div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Cancel</button><SubmitButton disabled={!canWrite}>Save changes</SubmitButton></div></form></section>;
}

function ExpenseFields({ expense, branches, defaultBranch, canWrite }: { expense?: AdminExpenseRecord; branches: BranchRecord[]; defaultBranch: string; canWrite: boolean }) {
  return <>
    <Field label="Branch" htmlFor={`expense-store-${expense?.id ?? "new"}`}><select id={`expense-store-${expense?.id ?? "new"}`} name="store_id" defaultValue={defaultBranch} required disabled={!canWrite} className="inventory-input"><option value="">Choose branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " · inactive"}</option>)}</select></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Category" htmlFor={`expense-category-input-${expense?.id ?? "new"}`}><input id={`expense-category-input-${expense?.id ?? "new"}`} name="category" list={`expense-category-options-${expense?.id ?? "new"}`} defaultValue={expense?.category ?? ""} placeholder="e.g. Supplies" required disabled={!canWrite} className="inventory-input" /><datalist id={`expense-category-options-${expense?.id ?? "new"}`}>{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist></Field><Field label="Amount · ₱" htmlFor={`expense-amount-${expense?.id ?? "new"}`}><input id={`expense-amount-${expense?.id ?? "new"}`} name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={expense ? (Number(expense.amount) / 100).toFixed(2) : ""} placeholder="0.00" required disabled={!canWrite} className="inventory-input tnums" /></Field></div>
    <Field label="Description" htmlFor={`expense-description-${expense?.id ?? "new"}`}><input id={`expense-description-${expense?.id ?? "new"}`} name="description" defaultValue={expense?.description ?? ""} placeholder="e.g. Cooking gas refill" required disabled={!canWrite} className="inventory-input" /></Field>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Date incurred" htmlFor={`expense-date-${expense?.id ?? "new"}`}><input id={`expense-date-${expense?.id ?? "new"}`} name="incurred_on" type="date" defaultValue={expense?.incurred_on ?? todayInputDate()} required disabled={!canWrite} className="inventory-input" /></Field><Field label="Payment method" htmlFor={`expense-payment-${expense?.id ?? "new"}`}><select id={`expense-payment-${expense?.id ?? "new"}`} name="payment_method" defaultValue={expense?.payment_method ?? "cash"} required disabled={!canWrite} className="inventory-input">{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field></div>
    <Field label="Reference" htmlFor={`expense-reference-${expense?.id ?? "new"}`}><input id={`expense-reference-${expense?.id ?? "new"}`} name="reference" defaultValue={expense?.reference ?? ""} placeholder="Receipt no. or vendor reference" disabled={!canWrite} className="inventory-input" /></Field>
    <Field label="Notes" htmlFor={`expense-notes-${expense?.id ?? "new"}`}><textarea id={`expense-notes-${expense?.id ?? "new"}`} name="notes" defaultValue={expense?.notes ?? ""} rows={2} placeholder="Optional context for the owner" disabled={!canWrite} className="inventory-input min-h-16 resize-y" /></Field>
  </>;
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="mt-2 flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving..." : children}</button>;
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

