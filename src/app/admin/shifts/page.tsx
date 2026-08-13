import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { ShiftDialog } from "@/components/admin/ShiftDialog";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPeso } from "@/lib/money";
import { getSelectedAdminBranchId } from "@/lib/admin/branch-context";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import {
  formatShiftDuration,
  formatShiftTime,
  parseShiftReadingList,
  shiftLabel,
  varianceLabel,
  type ShiftReading,
} from "@/lib/shifts";
import { closeShiftFromAdmin, generateZReading } from "./actions";

type AdminRole = "admin" | "manager" | "cashier";
type ShiftStatusFilter = "all" | "open" | "closed" | "unread";

type ProfileRecord = {
  full_name: string | null;
  role: AdminRole | null;
  org_id: string;
  store_id: string | null;
  password_change_required: boolean;
};

type BranchRecord = { id: string; name: string; is_active: boolean };
type StaffRecord = { id: string; full_name: string | null };

type ZReadingRecord = {
  id: string;
  shift_id: string;
  store_id: string;
  z_number: number;
  business_date: string;
  net_sales: number;
  declared_cash: number;
  cash_variance: number;
  grand_total_after: number;
  note: string | null;
  generated_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;

const statusOptions: Array<{ value: ShiftStatusFilter; label: string }> = [
  { value: "all", label: "All shifts" },
  { value: "open", label: "Open tills" },
  { value: "closed", label: "Closed" },
  { value: "unread", label: "Closed, no Z-reading" },
];

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isShiftStatusFilter(value: string): value is ShiftStatusFilter {
  return statusOptions.some((option) => option.value === value);
}

function singaporeDateInput(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDateInput(value: string, days: number) {
  const date = new Date(`${value}T00:00:00+08:00`);
  return singaporeDateInput(new Date(date.getTime() + days * DAY_MS));
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function dateStartIso(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toISOString();
}

function dateEndExclusiveIso(value: string) {
  return new Date(new Date(`${value}T00:00:00+08:00`).getTime() + DAY_MS).toISOString();
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(
    new Date(`${value}T00:00:00+08:00`),
  );
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function shortName(name: string | null, fallback: string) {
  return name?.trim().split(/\s+/)[0] || fallback;
}

function shiftsHref({
  from,
  to,
  status,
  shift,
}: {
  from: string;
  to: string;
  status: ShiftStatusFilter;
  shift?: string;
}) {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  if (status !== "all") params.set("status", status);
  if (shift) params.set("shift", shift);
  return `/admin/shifts?${params.toString()}`;
}

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string | string[];
    to?: string | string[];
    status?: string | string[];
    shift?: string | string[];
    saved?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();

  if (!user) redirect("/");

  const profile = (await getAdminProfile(user.id)) as ProfileRecord | null;

  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <ShiftsProfileMissing />;

  const { data: branchRows } = await supabase
    .from("stores")
    .select("id, name, is_active")
    .eq("org_id", profile.org_id)
    .order("name");
  const branches = (branchRows ?? []) as BranchRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const canSwitchBranches = profile.role === "admin";
  const selectedBranchId = canSwitchBranches
    ? await getSelectedAdminBranchId(branches, profile.store_id)
    : profile.store_id;

  const today = singaporeDateInput();
  const requestedTo = parseDateInput(readParam(params.to)) ?? today;
  const requestedFrom = parseDateInput(readParam(params.from)) ?? shiftDateInput(requestedTo, -(DEFAULT_RANGE_DAYS - 1));
  const from = requestedFrom > requestedTo ? requestedTo : requestedFrom;
  const to = requestedTo;
  const requestedStatus = readParam(params.status);
  const status: ShiftStatusFilter = isShiftStatusFilter(requestedStatus) ? requestedStatus : "all";

  const [readingResult, staffResult, zReadingResult] = await Promise.all([
    supabase.rpc("shift_reading_list", {
      p_store_id: selectedBranchId,
      p_from: dateStartIso(from),
      p_to: dateEndExclusiveIso(to),
      p_limit: 200,
    }),
    supabase.from("profiles").select("id, full_name").eq("org_id", profile.org_id).limit(500),
    supabase
      .from("z_readings")
      .select("id, shift_id, store_id, z_number, business_date, net_sales, declared_cash, cash_variance, grand_total_after, note, generated_at")
      .order("generated_at", { ascending: false })
      .limit(100),
  ]);

  const allReadings = parseShiftReadingList(readingResult.data);
  const staff = (staffResult.data ?? []) as StaffRecord[];
  const staffById = new Map(staff.map((person) => [person.id, person]));
  const zReadings = (zReadingResult.data ?? []) as ZReadingRecord[];
  const zByShiftId = new Map(zReadings.map((reading) => [reading.shift_id, reading]));

  const readings = allReadings.filter((reading) => {
    if (status === "open") return reading.isOpen;
    if (status === "closed") return !reading.isOpen;
    if (status === "unread") return !reading.isOpen && !zByShiftId.has(reading.shiftId);
    return true;
  });

  const selectedShiftId = readParam(params.shift);
  const selectedReading = selectedShiftId
    ? allReadings.find((reading) => reading.shiftId === selectedShiftId) ?? null
    : null;
  const selectedZReading = selectedReading ? zByShiftId.get(selectedReading.shiftId) ?? null : null;

  const openTills = allReadings.filter((reading) => reading.isOpen).length;
  const netSalesTotal = allReadings.reduce((sum, reading) => sum + reading.netSales, 0);
  const countedShifts = allReadings.filter((reading) => reading.declaredCash !== null);
  const varianceTotal = countedShifts.reduce((sum, reading) => sum + (reading.cashVariance ?? 0), 0);
  const awaitingZ = allReadings.filter((reading) => !reading.isOpen && !zByShiftId.has(reading.shiftId)).length;

  const canWrite = profile.role === "admin";
  const queryWarning = Boolean(readingResult.error || staffResult.error || zReadingResult.error);
  const migrationMissing = /shift_reading_list|does not exist|schema cache/i.test(readingResult.error?.message ?? "");
  const firstName = shortName(profile.full_name, shortName(user.email ?? null, "Admin"));
  const branchLabel = selectedBranchId ? branchById.get(selectedBranchId)?.name ?? "Selected branch" : "All branches";
  const saved = readParam(params.saved);
  const savedMessage =
    saved === "closed"
      ? "Shift closed and reconciled."
      : saved === "z-reading"
        ? "Z-reading generated and sealed into the archive."
        : "";
  const returnTo = shiftsHref({ from, to, status });

  return (
    <main className="admin-page text-ink">
      <div className="min-w-0 px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Shifts &amp; Z-readings">
          <Link href="/admin" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Overview</Link>
          <Link href="/admin/orders" className="rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover">Orders</Link>
          <SignOutButton className="px-3 py-2 text-xs" />
        </AdminPageHeader>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Till control · {branchLabel}</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">Close the day with a straight drawer.</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">Every shift, its counted cash, and the sealed Z-reading that ends it, {firstName}.</p>
          </div>
          <span className={`rounded-pill px-3 py-2 text-xs font-extrabold ${canWrite ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}>
            {canWrite ? "Admin editing enabled" : "Manager view only"}
          </span>
        </div>

        {savedMessage && <div role="status" className="mt-5 rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm font-semibold text-success">{savedMessage}</div>}
        {readParam(params.error) && <div role="alert" className="mt-5 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{readParam(params.error)}</div>}
        {migrationMissing ? (
          <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">
            The shift and Z-reading migration is not applied to this database yet. Apply <code>0024_shifts_and_z_readings.sql</code> in Supabase, then reload.
          </div>
        ) : queryWarning ? (
          <div role="status" className="mt-5 rounded-card border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">Some till data could not refresh. The panels are showing the data that was available.</div>
        ) : null}
        {!canWrite && <div role="status" className="mt-5 rounded-card border border-line bg-secondary px-4 py-3 text-sm font-semibold text-primary">Shifts are read-only for your role. Only an organization admin can close a till or generate a Z-reading.</div>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ShiftMetric label="Shifts in range" value={String(allReadings.length)} detail={`${formatBusinessDate(from)} to ${formatBusinessDate(to)}`} tone="bg-primary text-primary-fg" icon="history" />
          <ShiftMetric label="Open tills" value={String(openTills)} detail={openTills > 0 ? "Still selling or not closed out" : "Every till is closed"} tone={openTills > 0 ? "bg-warning/15 text-warning" : "bg-success text-white"} icon="pos" />
          <ShiftMetric label="Net sales" value={displayPeso(netSalesTotal)} detail="Excludes voided and refunded orders" tone="bg-secondary text-primary" icon="wallet" />
          <ShiftMetric label="Cash variance" value={displayPeso(varianceTotal)} detail={`${countedShifts.length} counted · ${awaitingZ} awaiting Z`} tone={varianceTotal === 0 ? "bg-success text-white" : "bg-danger-soft text-danger"} icon="reports" />
        </div>

        <section aria-labelledby="shift-filters-heading" className="admin-panel mt-6 p-5">
          <div className="admin-panel__header">
            <div>
              <p className="admin-panel__eyebrow">Find a shift</p>
              <h2 id="shift-filters-heading" className="admin-panel__title">Filter tills</h2>
              <p className="admin-panel__subtitle">Dates use the branch business day (Asia/Singapore).</p>
            </div>
            <Link href={shiftsHref({ from: shiftDateInput(today, -(DEFAULT_RANGE_DAYS - 1)), to: today, status: "all" })} className="admin-kpi-card__link mt-0">Reset <AdminIcon name="arrow" size={14} /></Link>
          </div>
          <form action="/admin/shifts" method="get" className="mt-4 grid gap-3 lg:grid-cols-[repeat(3,minmax(150px,1fr))_auto] lg:items-end">
            <FilterField label="From" htmlFor="shift-from"><input id="shift-from" type="date" name="from" defaultValue={from} className="inventory-input" /></FilterField>
            <FilterField label="To" htmlFor="shift-to"><input id="shift-to" type="date" name="to" defaultValue={to} className="inventory-input" /></FilterField>
            <FilterField label="Status" htmlFor="shift-status">
              <select id="shift-status" name="status" defaultValue={status} className="inventory-input">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </FilterField>
            <button type="submit" className="min-h-11 rounded-btn bg-primary px-5 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover">Apply</button>
          </form>
        </section>

        <div className="mt-4 space-y-4">
          <section aria-labelledby="shift-list-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Till register</p>
                <h2 id="shift-list-heading" className="admin-panel__title">Shifts</h2>
                <p className="admin-panel__subtitle">{readings.length} matching shift{readings.length === 1 ? "" : "s"}. Select one to open its reading.</p>
              </div>
            </div>
            {readings.length === 0 ? (
              <ShiftsEmpty
                label="No shifts in this range"
                detail="A shift appears here as soon as a cashier opens a till on the POS. If sales exist without a shift, they were rung up before a till was opened."
              />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="admin-list-table min-w-[880px]">
                  <thead>
                    <tr><th>Shift</th><th>Cashier</th><th>Branch</th><th>Window</th><th>Orders</th><th>Net sales</th><th>Variance</th><th>Z-reading</th></tr>
                  </thead>
                  <tbody>
                    {readings.map((reading) => {
                      const zReading = zByShiftId.get(reading.shiftId);
                      return (
                        <tr key={reading.shiftId}>
                          <td>
                            <Link
                              href={shiftsHref({ from, to, status, shift: reading.shiftId })}
                              className="font-extrabold text-primary hover:underline"
                              aria-haspopup="dialog"
                              aria-label={`Open ${reading.isOpen ? "live X-reading" : "closed shift"} ${shiftLabel(reading)}`}
                            >
                              {shiftLabel(reading)}
                            </Link>
                            <small className="mt-1 block text-[10px] text-ink-muted">{reading.isOpen ? "Open" : "Closed"}</small>
                          </td>
                          <td className="whitespace-nowrap">{staffById.get(reading.cashierId)?.full_name ?? "Unknown"}</td>
                          <td className="whitespace-nowrap">{branchById.get(reading.storeId)?.name ?? "Unknown branch"}</td>
                          <td className="whitespace-nowrap">
                            <span className="block">{formatShiftTime(reading.openedAt)}</span>
                            <small className="mt-1 block text-[10px] text-ink-muted">{formatShiftDuration(reading.openedAt, reading.closedAt)}</small>
                          </td>
                          <td className="tnums">{reading.orderCount}</td>
                          <td className="tnums font-extrabold">{displayPeso(reading.netSales)}</td>
                          <td className={`tnums ${reading.cashVariance === null ? "text-ink-muted" : reading.cashVariance === 0 ? "text-success" : Math.abs(reading.cashVariance) > reading.varianceThreshold ? "text-danger" : "text-warning"}`}>
                            {varianceLabel(reading.cashVariance, displayPeso)}
                          </td>
                          <td>
                            {zReading ? (
                              <span className="inline-flex rounded-pill bg-success/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-success">Z #{zReading.z_number}</span>
                            ) : reading.isOpen ? (
                              <span className="text-[10px] text-ink-muted">Till open</span>
                            ) : (
                              <span className="inline-flex rounded-pill bg-warning/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-warning">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="z-archive-heading" className="admin-panel min-w-0 p-5">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">Sealed archive</p>
                <h2 id="z-archive-heading" className="admin-panel__title">Z-readings</h2>
                <p className="admin-panel__subtitle">Append-only. A Z is a snapshot and never changes after it is taken.</p>
              </div>
            </div>
            {zReadings.length === 0 ? (
              <ShiftsEmpty label="No Z-readings yet" detail="Close a shift, then generate its Z-reading to start the archive." />
            ) : (
              <ul className="mt-4 divide-y divide-line/70">
                {zReadings.slice(0, 12).map((reading) => (
                  <li key={reading.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <Link
                        href={shiftsHref({ from, to, status, shift: reading.shift_id })}
                        className="block text-xs font-extrabold text-primary hover:underline"
                        aria-haspopup="dialog"
                      >
                        Z #{reading.z_number} · {branchById.get(reading.store_id)?.name ?? "Unknown branch"}
                      </Link>
                      <small className="mt-1 block text-[10px] text-ink-muted">{formatBusinessDate(reading.business_date)} · grand total {displayPeso(reading.grand_total_after)}</small>
                    </span>
                    <span className="text-right">
                      <strong className="tnums block text-xs font-extrabold text-ink">{displayPeso(reading.net_sales)}</strong>
                      <small className={`tnums mt-1 block text-[10px] ${reading.cash_variance === 0 ? "text-ink-muted" : "text-danger"}`}>{varianceLabel(reading.cash_variance, displayPeso)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {selectedReading ? (
          <ShiftDialog closeHref={returnTo} titleId="shift-detail-heading">
            <ShiftDetail
              reading={selectedReading}
              zReading={selectedZReading}
              cashierName={staffById.get(selectedReading.cashierId)?.full_name ?? "Unknown"}
              branchName={branchById.get(selectedReading.storeId)?.name ?? "Unknown branch"}
              canWrite={canWrite}
              returnTo={returnTo}
              closeHref={returnTo}
            />
          </ShiftDialog>
        ) : null}
      </div>
    </main>
  );
}

function ShiftDetail({
  reading,
  zReading,
  cashierName,
  branchName,
  canWrite,
  returnTo,
  closeHref,
}: {
  reading: ShiftReading;
  zReading: ZReadingRecord | null;
  cashierName: string;
  branchName: string;
  canWrite: boolean;
  returnTo: string;
  closeHref: string;
}) {
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Orders", value: String(reading.orderCount) },
    { label: "Gross sales", value: displayPeso(reading.grossSales) },
    { label: `Discounts (${reading.discountedOrderCount})`, value: `−${displayPeso(reading.discountTotal)}` },
    { label: "Net sales", value: displayPeso(reading.netSales), strong: true },
    { label: "VATable sale", value: displayPeso(reading.vatableSale) },
    { label: "VAT", value: displayPeso(reading.vatAmount) },
    { label: "VAT-exempt sale", value: displayPeso(reading.vatExemptSale) },
    { label: "Kg sold", value: reading.kgSold.toFixed(2) },
    { label: "Cash", value: displayPeso(reading.cashSales) },
    { label: "GCash", value: displayPeso(reading.gcashSales) },
    { label: "Maya", value: displayPeso(reading.mayaSales) },
    { label: "Card", value: displayPeso(reading.cardSales) },
    { label: `Voids (${reading.voidCount})`, value: displayPeso(reading.voidTotal) },
    { label: `Refunds (${reading.refundCount})`, value: displayPeso(reading.refundTotal) },
    { label: "Opening float", value: displayPeso(reading.openingCash) },
    { label: "Cash refunds", value: `−${displayPeso(reading.cashRefunds)}` },
    { label: "Expected cash", value: displayPeso(reading.expectedCash), strong: true },
  ];

  if (reading.declaredCash !== null) {
    rows.push({ label: "Counted cash", value: displayPeso(reading.declaredCash) });
    rows.push({ label: "Variance", value: varianceLabel(reading.cashVariance, displayPeso), strong: true });
  }

  // A void or refund taken after the Z was generated moves the live figures
  // without touching the sealed snapshot. Surfacing the gap is more honest
  // than silently showing one number or the other.
  const sealedDrift = zReading ? zReading.net_sales !== reading.netSales : false;

  return (
    <section aria-labelledby="shift-detail-heading" className="admin-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`admin-panel__eyebrow ${reading.isOpen ? "text-warning" : "text-success"}`}>
            {reading.isOpen ? "X-reading · live" : "Closed shift"}
          </p>
          <h2 id="shift-detail-heading" className="admin-panel__title truncate">{shiftLabel(reading)}</h2>
          <p className="admin-panel__subtitle">{cashierName} · {branchName}</p>
        </div>
        <Link replace href={closeHref} data-shift-dialog-autofocus className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover" aria-label="Close shift reading">&times;</Link>
      </div>

      <p id="shift-detail-meta" className="mt-3 text-xs text-ink-muted">
        {formatShiftTime(reading.openedAt)} → {reading.closedAt ? formatShiftTime(reading.closedAt) : "still open"} · {formatShiftDuration(reading.openedAt, reading.closedAt)}
      </p>

      {reading.isOpen && (
        <p role="status" className="mt-3 rounded-btn border border-warning/35 bg-warning/10 px-3 py-2 text-xs font-semibold text-ink">
          This is an X-reading. It keeps moving while the till is open and resets nothing.
        </p>
      )}

      {sealedDrift && (
        <p role="status" className="mt-3 rounded-btn border border-warning/35 bg-warning/10 px-3 py-2 text-xs font-semibold text-ink">
          The sealed Z-reading recorded {displayPeso(zReading!.net_sales)} in net sales. The live figures below differ because an order was voided or refunded after the Z was taken.
        </p>
      )}

      <dl className="mt-4 divide-y divide-line/70 rounded-card border border-line bg-surface px-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2">
            <dt className={`text-xs ${row.strong ? "font-extrabold text-ink" : "text-ink-muted"}`}>{row.label}</dt>
            <dd className={`tnums text-xs font-semibold ${row.strong ? "font-extrabold text-ink" : "text-ink"}`}>{row.value}</dd>
          </div>
        ))}
      </dl>

      {reading.note && (
        <p className="mt-3 rounded-btn border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink-muted"><strong className="text-ink">Shift note:</strong> {reading.note}</p>
      )}

      {reading.isOpen && canWrite && (
        <form action={closeShiftFromAdmin} className="mt-5 border-t border-line pt-4">
          <input type="hidden" name="shift_id" value={reading.shiftId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Close this till</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Use this when a cashier left without closing. Expected cash is {displayPeso(reading.expectedCash)}.</p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Counted cash (₱)</span>
            <input type="number" name="declared_cash" min="0" step="0.01" required className="inventory-input" />
          </label>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Note</span>
            <textarea name="note" rows={2} placeholder={`Required when the variance is over ${displayPeso(reading.varianceThreshold)}`} className="inventory-input min-h-16 resize-y" />
          </label>
          <button type="submit" className="mt-4 w-full rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Close shift</button>
        </form>
      )}

      {!reading.isOpen && !zReading && canWrite && (
        <form action={generateZReading} className="mt-5 border-t border-line pt-4">
          <input type="hidden" name="shift_id" value={reading.shiftId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Generate Z-reading</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Seals these figures into the append-only archive and advances this branch&rsquo;s Z number and grand total. It cannot be undone.</p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Note</span>
            <textarea name="note" rows={2} placeholder="Optional context for this reading" className="inventory-input min-h-16 resize-y" />
          </label>
          <button type="submit" className="mt-4 w-full rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover">Generate Z-reading</button>
        </form>
      )}

      {zReading && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Sealed</p>
          <dl className="mt-3 divide-y divide-line/70 rounded-card border border-line bg-surface px-3">
            <div className="flex items-center justify-between gap-3 py-2"><dt className="text-xs text-ink-muted">Z number</dt><dd className="tnums text-xs font-extrabold text-ink">#{zReading.z_number}</dd></div>
            <div className="flex items-center justify-between gap-3 py-2"><dt className="text-xs text-ink-muted">Business date</dt><dd className="text-xs font-semibold text-ink">{formatBusinessDate(zReading.business_date)}</dd></div>
            <div className="flex items-center justify-between gap-3 py-2"><dt className="text-xs text-ink-muted">Sealed net sales</dt><dd className="tnums text-xs font-extrabold text-ink">{displayPeso(zReading.net_sales)}</dd></div>
            <div className="flex items-center justify-between gap-3 py-2"><dt className="text-xs text-ink-muted">Branch grand total</dt><dd className="tnums text-xs font-extrabold text-ink">{displayPeso(zReading.grand_total_after)}</dd></div>
          </dl>
          {zReading.note && <p className="mt-3 text-xs leading-5 text-ink-muted"><strong className="text-ink">Z note:</strong> {zReading.note}</p>}
        </div>
      )}
    </section>
  );
}

function ShiftMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: "history" | "pos" | "wallet" | "reports" }) {
  return (
    <article className="admin-kpi-card min-h-[132px]">
      <div className="admin-kpi-card__inner">
        <div className="admin-kpi-card__top">
          <span className="admin-kpi-card__label">{label}</span>
          <span className={`admin-kpi-card__icon ${tone}`}><AdminIcon name={icon} size={17} /></span>
        </div>
        <p className="admin-kpi-card__value tnums">{value}</p>
        <p className="admin-kpi-card__trend">{detail}</p>
      </div>
    </article>
  );
}

function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function ShiftsEmpty({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="mt-4 rounded-card border border-dashed border-line px-4 py-8 text-center">
      <p className="text-sm font-extrabold text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

function ShiftsProfileMissing() {
  return (
    <main className="admin-page text-ink">
      <div className="px-4 pb-8 sm:px-6 lg:px-8">
        <AdminPageHeader title="Shifts &amp; Z-readings"><SignOutButton className="px-3 py-2 text-xs" /></AdminPageHeader>
        <section className="admin-panel mt-6 p-5">
          <p className="admin-panel__eyebrow">Profile</p>
          <h2 className="admin-panel__title">No profile found</h2>
          <p className="admin-panel__subtitle mt-2">This account has no organization profile yet, so till data cannot be scoped. Ask an admin to finish your account setup.</p>
        </section>
      </div>
    </main>
  );
}
