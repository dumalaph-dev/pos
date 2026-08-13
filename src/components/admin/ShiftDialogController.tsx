"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { closeShiftFromAdmin, generateZReading } from "@/app/admin/shifts/actions";
import { ShiftDialog } from "@/components/admin/ShiftDialog";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import {
  createAdminCacheScopeKey,
  getAdminCacheRecords,
  upsertAdminCacheRecords,
  type AdminCacheRecord,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";
import type { ShiftDialogReadModel, ShiftZReadingRecord } from "@/lib/admin/shift-readings";
import { formatPeso } from "@/lib/money";
import {
  formatShiftDuration,
  formatShiftTime,
  shiftLabel,
  varianceLabel,
  type ShiftReading,
} from "@/lib/shifts";

export type { ShiftZReadingRecord } from "@/lib/admin/shift-readings";

export type ShiftDialogRecord = ShiftDialogReadModel & {
  cashierName: string;
  canWrite: boolean;
  returnTo: string;
  isCached?: boolean;
  cachedAt?: string | null;
};

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(
    new Date(`${value}T00:00:00+08:00`),
  );
}

function formatCachedAt(value: string | null | undefined) {
  if (!value) return "Cached shift reading";
  return `Last synced ${new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value))}`;
}

function readingTitle(reading: ShiftReading, zReading: ShiftZReadingRecord | null) {
  if (reading.isOpen) return "X-reading · live";
  return zReading ? "Z-reading" : "Closed shift";
}

const shiftRecordId = (record: ShiftDialogRecord) => record.reading.shiftId;
const readShiftTriggerId = (trigger: HTMLElement) => trigger.dataset.shiftTrigger ?? null;

export function ShiftDialogController({
  children,
  initialShiftId,
  records,
  cacheScope,
}: {
  children: ReactNode;
  initialShiftId: string | null;
  records: ShiftDialogRecord[];
  cacheScope?: AdminCacheScope;
}) {
  const [cachedState, setCachedState] = useState<{
    scopeKey: string | null;
    shifts: Array<AdminCacheRecord<ShiftDialogReadModel>>;
    zReadings: Array<AdminCacheRecord<ShiftZReadingRecord>>;
  }>({ scopeKey: null, shifts: [], zReadings: [] });
  const cacheScopeKey = useMemo(() => (cacheScope ? createAdminCacheScopeKey(cacheScope) : null), [cacheScope]);
  const cachedShifts = useMemo(
    () => cachedState.scopeKey === cacheScopeKey ? cachedState.shifts : [],
    [cacheScopeKey, cachedState],
  );
  const cachedZReadings = useMemo(
    () => cachedState.scopeKey === cacheScopeKey ? cachedState.zReadings : [],
    [cacheScopeKey, cachedState],
  );

  useEffect(() => {
    let active = true;
    if (!cacheScope) return () => { active = false; };

    void Promise.all([
      getAdminCacheRecords<ShiftDialogReadModel>(cacheScope, "shifts"),
      getAdminCacheRecords<ShiftZReadingRecord>(cacheScope, "z_readings"),
    ])
      .then(([shifts, zReadings]) => {
        if (active) setCachedState({ scopeKey: cacheScopeKey, shifts, zReadings });
      })
      .catch(() => {
        if (active) setCachedState({ scopeKey: cacheScopeKey, shifts: [], zReadings: [] });
      });

    return () => {
      active = false;
    };
  }, [cacheScope, cacheScopeKey]);

  useEffect(() => {
    if (!cacheScope || records.length === 0) return;
    void Promise.all([
      upsertAdminCacheRecords(
        cacheScope,
        "shifts",
        records.map((record) => ({
          id: record.reading.shiftId,
          data: {
            reading: record.reading,
            zReading: record.zReading,
            cashierName: record.cashierName,
            branchName: record.branchName,
          },
        })),
      ),
      upsertAdminCacheRecords(
        cacheScope,
        "z_readings",
        records.flatMap((record) => record.zReading ? [{ id: record.zReading.id, data: record.zReading }] : []),
      ),
    ]).catch(() => {
      // IndexedDB is an optimization; the online/server-rendered reading must continue to work.
    });
  }, [cacheScope, records]);

  const liveRecordIds = useMemo(() => new Set(records.map((record) => record.reading.shiftId)), [records]);
  const cachedZByShiftId = useMemo(
    () => new Map(cachedZReadings.map((record) => [record.data.shift_id, record])),
    [cachedZReadings],
  );
  const mergedRecords = useMemo<ShiftDialogRecord[]>(() => {
    const cachedOnly = cachedShifts
      .filter((record) => !liveRecordIds.has(record.id))
      .map((record) => ({
        ...record.data,
        zReading: record.data.zReading ?? cachedZByShiftId.get(record.data.reading.shiftId)?.data ?? null,
        canWrite: false,
        returnTo: "/admin/shifts",
        isCached: true,
        cachedAt: record.fetchedAt,
      }));
    return [
      ...records.map((record) => ({ ...record, isCached: false, cachedAt: null })),
      ...cachedOnly,
    ];
  }, [cachedShifts, cachedZByShiftId, liveRecordIds, records]);

  return (
    <UrlLocalDialogController
      className="shift-dialog-controller"
      records={mergedRecords}
      initialId={initialShiftId}
      queryKey="shift"
      triggerSelector="[data-shift-trigger]"
      readTriggerId={readShiftTriggerId}
      getRecordId={shiftRecordId}
      performanceSurface="shifts"
      renderDialog={(record, onClose) => {
        const titleId = `shift-detail-heading-${record.reading.shiftId}`;
        const metaId = `shift-detail-meta-${record.reading.shiftId}`;
        return (
          <ShiftDialog
            key={record.reading.shiftId}
            onClose={onClose}
            titleId={titleId}
            descriptionId={metaId}
          >
            <ShiftDetail record={record} onClose={onClose} titleId={titleId} metaId={metaId} />
          </ShiftDialog>
        );
      }}
    >
      {children}
    </UrlLocalDialogController>
  );
}

function ShiftDetail({
  metaId,
  onClose,
  record,
  titleId,
}: {
  metaId: string;
  onClose: () => void;
  record: ShiftDialogRecord;
  titleId: string;
}) {
  const { reading, zReading } = record;
  const sealedDrift = zReading ? zReading.net_sales !== reading.netSales : false;
  const variance = reading.cashVariance === null ? "Not counted" : varianceLabel(reading.cashVariance, displayPeso);
  const varianceClass = reading.cashVariance === null
    ? "text-ink-muted"
    : reading.cashVariance === 0
      ? "text-success"
      : "text-warning";

  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Gross sales", value: displayPeso(reading.grossSales) },
    { label: `Discounts (${reading.discountedOrderCount})`, value: `−${displayPeso(reading.discountTotal)}` },
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
  ];

  return (
    <section aria-labelledby={titleId} className="admin-panel reading-dialog__content p-5">
      <header className="reading-dialog__header">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`admin-panel__eyebrow ${reading.isOpen ? "text-warning" : "text-success"}`}>
              {readingTitle(reading, zReading)}
            </p>
            <span className={`reading-dialog__status ${reading.isOpen ? "reading-dialog__status--live" : "reading-dialog__status--sealed"}`}>
              {reading.isOpen ? "Live" : zReading ? `Z #${zReading.z_number}` : "Ready to seal"}
            </span>
            {record.isCached && <span className="reading-dialog__status" title={formatCachedAt(record.cachedAt)}>Cached copy</span>}
          </div>
          <h2 id={titleId} className="admin-panel__title truncate">{shiftLabel(reading)}</h2>
          <p className="admin-panel__subtitle">{record.cashierName} · {record.branchName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-shift-dialog-autofocus
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover"
          aria-label="Close shift reading"
        >
          &times;
        </button>
      </header>

      <p id={metaId} className="reading-dialog__meta">
        {formatShiftTime(reading.openedAt)} → {reading.closedAt ? formatShiftTime(reading.closedAt) : "still open"} · {formatShiftDuration(reading.openedAt, reading.closedAt)}
      </p>

      {reading.isOpen && (
        <p role="status" className="reading-dialog__notice reading-dialog__notice--live">
          X-reading: live figures only; the till is not reset.
        </p>
      )}

      {sealedDrift && (
        <p role="status" className="reading-dialog__notice reading-dialog__notice--warning">
          Sealed Z net sales: {displayPeso(zReading!.net_sales)}. Live figures changed after the Z was taken.
        </p>
      )}

      <div className="reading-dialog__hero-grid">
        <ReadingMetric label="Orders" value={String(reading.orderCount)} />
        <ReadingMetric label="Net sales" value={displayPeso(reading.netSales)} emphasis />
        <ReadingMetric label="Expected cash" value={displayPeso(reading.expectedCash)} />
        <ReadingMetric label="Variance" value={variance} valueClassName={varianceClass} />
      </div>

      <div className="reading-dialog__layout">
        <section className="reading-dialog__section" aria-labelledby={`${titleId}-details`}>
          <div className="reading-dialog__section-heading">
            <div>
              <p className="reading-dialog__section-label">Reading details</p>
              <h3 id={`${titleId}-details`}>Sales &amp; tender</h3>
            </div>
            <span className="reading-dialog__section-note">Live totals</span>
          </div>
          <dl className="reading-dialog__stats">
            {rows.map((row) => (
              <div key={row.label} className="reading-dialog__stat">
                <dt className={row.strong ? "font-extrabold text-ink" : "text-ink-muted"}>{row.label}</dt>
                <dd className={`tnums font-extrabold ${row.strong ? "text-ink" : "text-ink"}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="reading-dialog__side">
          {reading.note && (
            <p className="reading-dialog__note"><strong>Shift note</strong><span>{reading.note}</span></p>
          )}

          {reading.isOpen && record.canWrite && (
            <form action={closeShiftFromAdmin} className="reading-dialog__action">
              <input type="hidden" name="shift_id" value={reading.shiftId} />
              <input type="hidden" name="return_to" value={record.returnTo} />
              <div className="reading-dialog__action-heading">
                <div>
                  <p className="reading-dialog__section-label">Close this till</p>
                  <p>Expected cash {displayPeso(reading.expectedCash)}</p>
                </div>
                <span className="reading-dialog__action-icon">$</span>
              </div>
              <label className="reading-dialog__field">
                <span>Counted cash (₱)</span>
                <input type="number" name="declared_cash" min="0" step="0.01" required className="inventory-input" />
              </label>
              <label className="reading-dialog__field">
                <span>Note</span>
                <textarea name="note" rows={1} maxLength={400} placeholder={`Required over ${displayPeso(reading.varianceThreshold)}`} className="inventory-input resize-y" />
              </label>
              <button type="submit" className="reading-dialog__submit">Close shift</button>
            </form>
          )}

          {!reading.isOpen && !zReading && record.canWrite && (
            <form action={generateZReading} className="reading-dialog__action">
              <input type="hidden" name="shift_id" value={reading.shiftId} />
              <input type="hidden" name="return_to" value={record.returnTo} />
              <div className="reading-dialog__action-heading">
                <div>
                  <p className="reading-dialog__section-label">Generate Z-reading</p>
                  <p>Seal the snapshot for this shift.</p>
                </div>
                <span className="reading-dialog__action-icon">Z</span>
              </div>
              <label className="reading-dialog__field">
                <span>Note</span>
                <textarea name="note" rows={1} maxLength={400} placeholder="Optional context" className="inventory-input resize-y" />
              </label>
              <button type="submit" className="reading-dialog__submit">Generate Z-reading</button>
            </form>
          )}

          {zReading && (
            <section className="reading-dialog__sealed" aria-labelledby={`${titleId}-sealed`}>
              <div className="reading-dialog__section-heading">
                <div>
                  <p className="reading-dialog__section-label">Sealed archive</p>
                  <h3 id={`${titleId}-sealed`}>Z-reading #{zReading.z_number}</h3>
                </div>
                <span className="reading-dialog__section-note">Append-only</span>
              </div>
              <dl className="reading-dialog__sealed-grid">
                <ReadingMeta label="Business date" value={formatBusinessDate(zReading.business_date)} />
                <ReadingMeta label="Net sales" value={displayPeso(zReading.net_sales)} />
                <ReadingMeta label="Grand total" value={displayPeso(zReading.grand_total_after)} />
                <ReadingMeta label="Variance" value={varianceLabel(zReading.cash_variance, displayPeso)} />
              </dl>
              {zReading.note && <p className="reading-dialog__note reading-dialog__note--plain"><strong>Z note</strong><span>{zReading.note}</span></p>}
            </section>
          )}

          {record.isCached ? (
            <p className="reading-dialog__readonly">Cached reading is read-only. Reopen it while online to close the till or generate a Z-reading.</p>
          ) : !record.canWrite ? (
            <p className="reading-dialog__readonly">Read-only view. Only an organization admin can close a till or generate a Z-reading.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReadingMetric({
  emphasis = false,
  label,
  value,
  valueClassName = "text-ink",
}: {
  emphasis?: boolean;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className={`reading-dialog__metric ${emphasis ? "reading-dialog__metric--emphasis" : ""}`}>
      <span>{label}</span>
      <strong className={`tnums ${valueClassName}`}>{value}</strong>
    </div>
  );
}

function ReadingMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="reading-dialog__sealed-stat">
      <dt>{label}</dt>
      <dd className="tnums">{value}</dd>
    </div>
  );
}
