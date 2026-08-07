"use client";

/**
 * Till control for the POS (P8, PRD §6.5).
 *
 * A cashier opens a shift with a declared opening float, watches the running
 * X-reading mid-shift, and closes with a counted-cash reconciliation. Every
 * figure comes from the `shift_reading` RPC so the drawer the cashier counts
 * against is the same one the backoffice seals into a Z-reading.
 *
 * Shifts require the network — they are a server-side reconciliation record,
 * not sale data. The POS never blocks a sale on this panel: an offline sale
 * still rings up and carries the last known shift id through the outbox.
 */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPeso, toCentavos } from "@/lib/money";
import { buildReadingSlip } from "@/lib/receipt";
import type { PaperWidth } from "@/lib/paper-width";
import {
  formatShiftDuration,
  formatShiftTime,
  parseShiftReading,
  readActiveShift,
  shiftLabel,
  varianceLabel,
  writeActiveShift,
  type ActiveShift,
  type ShiftReading,
} from "@/lib/shifts";

type ShiftProfile = {
  id: string;
  org_id: string;
  store_id: string | null;
  store_name: string | null;
  store_address: string | null;
  store_tin: string | null;
  full_name: string | null;
};

export type ShiftReceiptSettings = {
  paperWidth: PaperWidth;
  vatRate: number;
  showVat: boolean;
};

const displayPeso = (centavos: number) => formatPeso(centavos).replace(/\.00$/, "");

/**
 * Resolves the till this device is ringing into. The device cache keeps the
 * shift id available while offline; the server is the authority whenever it is
 * reachable, so a shift closed on another terminal drops out here too.
 */
export function useActiveShift(profile: ShiftProfile | null, offline: boolean) {
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const storeId = profile?.store_id ?? null;
  const cashierId = profile?.id ?? null;

  const applyShift = useCallback((next: ActiveShift | null) => {
    writeActiveShift(next);
    setShift(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!storeId || !cashierId) {
      setShift(null);
      return;
    }

    const cached = readActiveShift(storeId, cashierId);
    setShift(cached);
    if (offline) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shifts")
        .select("id, shift_no, opened_at, opening_cash")
        .eq("store_id", storeId)
        .eq("cashier_id", cashierId)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // A failed lookup must not clear a cached shift — the sale path depends
      // on it and a transient error is not evidence the till was closed.
      if (error) return;
      applyShift(
        data
          ? {
              id: data.id as string,
              storeId,
              cashierId,
              shiftNo: (data.shift_no as string | null) ?? null,
              openedAt: (data.opened_at as string) ?? "",
              openingCash: Number(data.opening_cash ?? 0),
            }
          : null,
      );
    } catch {
      // Offline mid-request: keep the cached shift.
    }
  }, [applyShift, cashierId, offline, storeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the till lives in the device cache and on the server, both external to React.
    void refresh();
  }, [refresh]);

  return { shift, setShift: applyShift, refresh };
}

export default function ShiftPanel({
  profile,
  offline,
  shift,
  onShiftChange,
  receiptSettings,
  onPrint,
  onToast,
  onClose,
}: {
  profile: ShiftProfile;
  offline: boolean;
  shift: ActiveShift | null;
  onShiftChange: (shift: ActiveShift | null) => void;
  receiptSettings: ShiftReceiptSettings;
  onPrint: (bytes: Uint8Array, label?: string) => Promise<boolean>;
  onToast: (msg: string) => void;
  onClose: () => void;
}) {
  const [reading, setReading] = useState<ShiftReading | null>(null);
  const [loadingReading, setLoadingReading] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closedReading, setClosedReading] = useState<ShiftReading | null>(null);

  const loadReading = useCallback(async (shiftId: string) => {
    setLoadingReading(true);
    try {
      const supabase = createClient();
      const { data, error: readingError } = await supabase.rpc("shift_reading", { p_shift_id: shiftId });
      if (readingError) throw new Error(readingError.message);
      setReading(parseShiftReading(data));
    } catch (readingError) {
      setError(readingError instanceof Error ? readingError.message : "The X-reading could not be loaded.");
    } finally {
      setLoadingReading(false);
    }
  }, []);

  useEffect(() => {
    if (!shift || offline) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the reading fetched from the server boundary below.
      setReading(null);
      return;
    }
    void loadReading(shift.id);
  }, [loadReading, offline, shift]);

  const openShift = async () => {
    const amount = toCentavos(Number(openingCash || "0"));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter the opening cash float as a positive amount.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: openError } = await supabase.rpc("open_shift", {
        p_store_id: profile.store_id,
        p_device_id: null,
        p_opening_cash: amount,
      });
      if (openError) throw new Error(openError.message);

      const shiftId = typeof data === "string" ? data : "";
      if (!shiftId || !profile.store_id) throw new Error("The shift could not be started.");

      onShiftChange({
        id: shiftId,
        storeId: profile.store_id,
        cashierId: profile.id,
        shiftNo: null,
        openedAt: new Date().toISOString(),
        openingCash: amount,
      });
      onToast(`Shift opened with ${displayPeso(amount)} float.`);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "The shift could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!shift) return;
    const counted = toCentavos(Number(countedCash || "-1"));
    if (!Number.isFinite(counted) || counted < 0) {
      setError("Count the drawer and enter the cash amount.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: closeError } = await supabase.rpc("close_shift", {
        p_shift_id: shift.id,
        p_declared_cash: counted,
        p_note: note.trim() || null,
      });
      if (closeError) throw new Error(closeError.message);

      const finalReading = parseShiftReading(data);
      setClosedReading(finalReading);
      setReading(finalReading);
      onShiftChange(null);
      onToast("Shift closed. Give the slip to your admin for the Z-reading.");
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "The shift could not be closed.");
    } finally {
      setBusy(false);
    }
  };

  const printReading = async (source: ShiftReading) => {
    const slip = buildReadingSlip({
      kind: "X",
      storeName: profile.store_name ?? "Your Store",
      storeAddress: profile.store_address,
      storeTin: profile.store_tin,
      shiftLabel: shiftLabel(source),
      cashier: profile.full_name ?? "",
      openedAt: new Date(source.openedAt),
      closedAt: source.closedAt ? new Date(source.closedAt) : null,
      printedAt: new Date(),
      orderCount: source.orderCount,
      grossSales: source.grossSales,
      discountTotal: source.discountTotal,
      netSales: source.netSales,
      vatableSale: source.vatableSale,
      vatAmount: source.vatAmount,
      vatExemptSale: source.vatExemptSale,
      vatRate: receiptSettings.vatRate,
      showVat: receiptSettings.showVat,
      voidCount: source.voidCount,
      voidTotal: source.voidTotal,
      refundCount: source.refundCount,
      refundTotal: source.refundTotal,
      cashSales: source.cashSales,
      gcashSales: source.gcashSales,
      mayaSales: source.mayaSales,
      cardSales: source.cardSales,
      openingCash: source.openingCash,
      cashRefunds: source.cashRefunds,
      expectedCash: source.expectedCash,
      declaredCash: source.declaredCash,
      cashVariance: source.cashVariance,
      note: source.note,
      paperWidth: receiptSettings.paperWidth,
    });
    await onPrint(slip, "X-reading");
  };

  const input =
    "w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary";
  const previewVariance =
    reading && countedCash.trim() !== "" ? toCentavos(Number(countedCash || "0")) - reading.expectedCash : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">Shift &amp; till</p>
            <p className="mt-0.5 text-xs text-ink-muted">{profile.store_name ?? "Your branch"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shift panel"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface text-ink-muted transition hover:text-ink"
          >
            &times;
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-btn border border-danger/25 bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {offline && (
          <p role="status" className="mt-3 rounded-btn border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-semibold text-ink">
            Shifts need a connection. Sales still ring up offline and stay attached to the last open shift on this tablet.
          </p>
        )}

        {closedReading ? (
          <div className="mt-4">
            <p className="rounded-btn border border-success/25 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
              Shift closed · {varianceLabel(closedReading.cashVariance, displayPeso)}
            </p>
            <ReadingTable reading={closedReading} />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void printReading(closedReading)}
                className="flex-1 rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondary-hover"
              >
                Print slip
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-btn bg-primary px-4 py-3 text-sm font-extrabold text-primary-fg transition hover:bg-primary-hover"
              >
                Done
              </button>
            </div>
          </div>
        ) : !shift ? (
          <div className="mt-4">
            <p className="text-sm leading-6 text-ink-muted">
              No till is open on this tablet. Count your starting cash and open a shift so every sale is attributed to it.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Opening cash float (₱)</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                disabled={offline || busy || !profile.store_id}
                className={input}
              />
            </label>
            <button
              type="button"
              onClick={() => void openShift()}
              disabled={offline || busy || !profile.store_id}
              className="mt-4 w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Opening…" : "Open shift"}
            </button>
            {!profile.store_id && (
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                This account is not bound to a branch, so it cannot hold a till. Ask your admin to assign a branch.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <div className="rounded-card border border-line bg-surface px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm font-extrabold text-ink">{shift.shiftNo ?? `Shift ${shift.id.slice(0, 8)}`}</strong>
                <span className="rounded-pill bg-success/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-success">Open</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Since {formatShiftTime(shift.openedAt)} · {formatShiftDuration(shift.openedAt, null)} · float {displayPeso(shift.openingCash)}
              </p>
            </div>

            {loadingReading && <p className="mt-4 text-sm text-ink-muted">Loading X-reading…</p>}
            {reading && <ReadingTable reading={reading} />}

            {reading && (
              <>
                <button
                  type="button"
                  onClick={() => void printReading(reading)}
                  className="mt-4 w-full rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold text-primary transition hover:bg-secondary-hover"
                >
                  Print X-reading
                </button>

                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Close the till</p>
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Counted cash in drawer (₱)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={countedCash}
                      onChange={(event) => setCountedCash(event.target.value)}
                      placeholder="Count before you look at expected"
                      disabled={offline || busy}
                      className={input}
                    />
                  </label>
                  {previewVariance !== null && (
                    <p className={`mt-2 text-xs font-extrabold ${previewVariance === 0 ? "text-success" : Math.abs(previewVariance) > reading.varianceThreshold ? "text-danger" : "text-warning"}`}>
                      {varianceLabel(previewVariance, displayPeso)} against {displayPeso(reading.expectedCash)} expected
                      {Math.abs(previewVariance) > reading.varianceThreshold ? " · a note is required" : ""}
                    </p>
                  )}
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Note</span>
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={`Required when the variance is over ${displayPeso(reading.varianceThreshold)}`}
                      disabled={offline || busy}
                      className={`${input} min-h-16 resize-y`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void closeShift()}
                    disabled={offline || busy || countedCash.trim() === ""}
                    className="mt-4 w-full rounded-btn bg-primary px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Closing…" : "Close shift"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReadingTable({ reading }: { reading: ShiftReading }) {
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Orders", value: String(reading.orderCount) },
    { label: "Gross sales", value: displayPeso(reading.grossSales) },
    { label: "Discounts", value: `−${displayPeso(reading.discountTotal)}` },
    { label: "Net sales", value: displayPeso(reading.netSales), strong: true },
    { label: "Cash", value: displayPeso(reading.cashSales) },
    { label: "GCash", value: displayPeso(reading.gcashSales) },
    { label: "Maya", value: displayPeso(reading.mayaSales) },
    { label: "Card", value: displayPeso(reading.cardSales) },
    { label: `Voids (${reading.voidCount})`, value: displayPeso(reading.voidTotal) },
    { label: `Refunds (${reading.refundCount})`, value: displayPeso(reading.refundTotal) },
    { label: "Opening float", value: displayPeso(reading.openingCash) },
    { label: "Expected cash", value: displayPeso(reading.expectedCash), strong: true },
  ];

  if (reading.declaredCash !== null) {
    rows.push({ label: "Counted cash", value: displayPeso(reading.declaredCash) });
    rows.push({ label: "Variance", value: varianceLabel(reading.cashVariance, displayPeso), strong: true });
  }

  return (
    <dl className="mt-4 divide-y divide-line/70 rounded-card border border-line bg-surface px-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-2">
          <dt className={`text-xs ${row.strong ? "font-extrabold text-ink" : "text-ink-muted"}`}>{row.label}</dt>
          <dd className={`tnums text-xs ${row.strong ? "font-extrabold text-ink" : "font-semibold text-ink"}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
