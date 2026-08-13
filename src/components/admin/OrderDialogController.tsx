"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import { salesQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";
import {
  createAdminCacheScopeKey,
  getAdminCacheRecords,
  upsertAdminCacheRecords,
  type AdminCacheRecord,
  type AdminCacheScope,
} from "@/lib/admin/local-first-store";
import type { OrderReceiptData, OrderStatus, PaymentMethod } from "@/lib/admin/order-receipts";
import type { AdminPerformanceSurface } from "@/lib/admin/performance";

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function paymentLabel(method: PaymentMethod) {
  if (method === "gcash") return "GCash";
  if (method === "maya") return "Maya";
  if (method === "card") return "Card";
  return "Cash";
}

function statusLabel(status: OrderStatus) {
  if (status === "voided") return "Voided";
  if (status === "refunded") return "Refunded";
  return "Completed";
}

function statusClass(status: OrderStatus) {
  if (status === "voided") return "bg-danger-soft text-danger";
  if (status === "refunded") return "bg-warning/15 text-warning";
  return "bg-success/10 text-success";
}

const orderReceiptId = (receipt: OrderReceiptData) => receipt.order.id;
const readOrderTriggerId = (trigger: HTMLElement) => trigger.dataset.orderTrigger ?? null;

export function OrderDialogController({
  children,
  receipts,
  initialOrderId,
  cacheScope,
  performanceSurface = "orders",
}: {
  children: ReactNode;
  receipts: OrderReceiptData[];
  initialOrderId: string | null;
  cacheScope?: AdminCacheScope;
  performanceSurface?: AdminPerformanceSurface;
}) {
  const [cachedState, setCachedState] = useState<{ scopeKey: string | null; records: Array<AdminCacheRecord<OrderReceiptData>> }>({ scopeKey: null, records: [] });
  const cacheScopeKey = useMemo(() => (cacheScope ? createAdminCacheScopeKey(cacheScope) : null), [cacheScope]);
  const cachedRecords = useMemo(
    () => cachedState.scopeKey === cacheScopeKey ? cachedState.records : [],
    [cacheScopeKey, cachedState],
  );

  useEffect(() => {
    let active = true;
    if (!cacheScope) return () => { active = false; };

    void getAdminCacheRecords<OrderReceiptData>(cacheScope, "order_receipts")
      .then((records) => {
        if (active) setCachedState({ scopeKey: cacheScopeKey, records });
      })
      .catch(() => {
        if (active) setCachedState({ scopeKey: cacheScopeKey, records: [] });
      });

    return () => {
      active = false;
    };
  }, [cacheScope, cacheScopeKey]);

  useEffect(() => {
    if (!cacheScope || receipts.length === 0) return;
    void upsertAdminCacheRecords(
      cacheScope,
      "order_receipts",
      receipts.map((receipt) => ({ id: receipt.order.id, data: receipt })),
    ).catch(() => {
      // IndexedDB is an optimization; the online/server-rendered receipt must continue to work.
    });
  }, [cacheScope, receipts]);

  const liveRecordIds = useMemo(() => new Set(receipts.map(orderReceiptId)), [receipts]);
  const cachedAtById = useMemo(() => new Map(cachedRecords.map((record) => [record.id, record.fetchedAt])), [cachedRecords]);
  const mergedReceipts = useMemo(() => {
    const liveIds = new Set(receipts.map(orderReceiptId));
    return [
      ...receipts,
      ...cachedRecords
        .filter((record) => !liveIds.has(record.id))
        .map((record) => record.data),
    ];
  }, [cachedRecords, receipts]);

  return (
    <UrlLocalDialogController
      className="order-dialog-controller"
      records={mergedReceipts}
      initialId={initialOrderId}
      queryKey="order"
      triggerSelector="[data-order-trigger]"
      readTriggerId={readOrderTriggerId}
      getRecordId={orderReceiptId}
      performanceSurface={performanceSurface}
      renderDialog={(receipt, onClose) => (
        <AdminDialog
          key={receipt.order.id}
          onClose={onClose}
          titleId={`order-detail-heading-${receipt.order.id}`}
          descriptionId={`order-detail-meta-${receipt.order.id}`}
          bodyClassName="order-modal-open"
          backdropClassName="order-dialog__backdrop"
          dialogClassName="order-dialog"
        >
          <OrderReceipt
            receipt={receipt}
            onClose={onClose}
            isCached={!liveRecordIds.has(orderReceiptId(receipt))}
            cachedAt={cachedAtById.get(orderReceiptId(receipt)) ?? null}
          />
        </AdminDialog>
      )}
    >
      {children}
    </UrlLocalDialogController>
  );
}

function OrderReceipt({ receipt, onClose, isCached, cachedAt }: { receipt: OrderReceiptData; onClose: () => void; isCached: boolean; cachedAt: string | null }) {
  const { order } = receipt;

  return (
    <section aria-labelledby={`order-detail-heading-${order.id}`} className="admin-panel receipt-dialog__content p-5">
      <header className="receipt-dialog__header">
        <div>
          <div className="receipt-dialog__eyebrow-row">
            <p className="admin-panel__eyebrow">Receipt view</p>
            <span className={`receipt-dialog__status ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
            <span className="receipt-dialog__payment">{paymentLabel(order.payment_method)}</span>
            {isCached && <span className="receipt-dialog__payment" title={cachedAt ? `Last synced ${formatDateTime(cachedAt)}` : "Cached receipt copy"}>Cached copy</span>}
          </div>
          <h2 id={`order-detail-heading-${order.id}`} className="admin-panel__title">{order.order_no}</h2>
          <p className="admin-panel__subtitle">{formatDateTime(order.created_at)} · {receipt.branch.name}</p>
        </div>
        <button
          type="button"
          data-order-dialog-autofocus
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-primary transition hover:bg-secondary-hover"
          aria-label="Close receipt view"
        >
          &times;
        </button>
      </header>

      <p id={`order-detail-meta-${order.id}`} className="sr-only">Receipt details for {order.order_no}</p>

      {receipt.reversal && (
        <div className="receipt-dialog__reversal">
          <strong>Reversal recorded</strong>
          <span>{statusLabel(receipt.reversal.status)} as {receipt.reversal.order_no} on {formatDateTime(receipt.reversal.created_at)}.</span>
        </div>
      )}

      <div className="receipt-dialog__layout">
        <section className="receipt-dialog__items" aria-labelledby={`order-items-heading-${order.id}`}>
          <div className="receipt-dialog__section-heading">
            <div>
              <p className="receipt-dialog__section-label">Line items</p>
              <h3 id={`order-items-heading-${order.id}`}>{receipt.items.length} item{receipt.items.length === 1 ? "" : "s"}</h3>
            </div>
            <span className="receipt-dialog__section-note">Receipt</span>
          </div>
          {receipt.items.length === 0 ? (
            <p className="receipt-dialog__empty">Item details are unavailable for this order.</p>
          ) : (
            <div className="receipt-dialog__items-list">
              {receipt.items.map((item, index) => (
                <div key={`${item.order_id}-${index}`} className="receipt-dialog__item">
                  <span className="min-w-0">
                    <strong className="block truncate">{item.name_snapshot}</strong>
                    <small>{formatQuantity(salesQuantity(item))} {item.unit}</small>
                  </span>
                  <strong className="tnums whitespace-nowrap">{displayPeso(item.line_total)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="receipt-dialog__summary" aria-label="Receipt summary">
          <div className="receipt-dialog__meta-grid">
            <ReceiptMeta label="Branch" value={receipt.branch.name} />
            <ReceiptMeta label="Cashier" value={receipt.cashierName} />
            {order.payment_ref && <ReceiptMeta label="Payment ref" value={order.payment_ref} />}
          </div>

          <div className="receipt-dialog__totals">
            <ReceiptTotal label="Subtotal" value={displayPeso(order.subtotal)} />
            <ReceiptTotal label="Discount" value={displayPeso(order.discount_amount)} muted />
            <ReceiptTotal label="VAT" value={displayPeso(order.vat_amount)} muted />
            <div className="receipt-dialog__grand-total"><span>Total</span><strong className="tnums">{displayPeso(order.total)}</strong></div>
          </div>

          {(order.amount_tendered != null || order.change_due != null || order.note) && (
            <div className="receipt-dialog__tender">
              {order.amount_tendered != null && <ReceiptTotal label="Amount tendered" value={displayPeso(order.amount_tendered)} />}
              {order.change_due != null && <ReceiptTotal label="Change due" value={displayPeso(order.change_due)} />}
              {order.note && <p><strong>Order note</strong><span>{order.note}</span></p>}
            </div>
          )}

          <AdminOrderActions
            className="receipt-dialog__actions"
            order={order}
            items={receipt.items}
            branchName={receipt.branch.name}
            branchAddress={receipt.branch.address}
            branchTin={receipt.branch.tin}
            branchVatRegistered={receipt.branch.vatRegistered}
            branchVatRate={receipt.branch.vatRate}
            cashierName={receipt.cashierName}
            returnTo={receipt.returnTo}
            canManage={receipt.canManage && !isCached}
            canReprint={receipt.canReprint && !isCached}
            hasReversal={Boolean(receipt.reversal)}
            readOnlyReason={isCached ? "cached" : undefined}
          />
        </aside>
      </div>
    </section>
  );
}

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return <div className="receipt-dialog__meta-row"><span>{label}</span><strong>{value}</strong></div>;
}

function ReceiptTotal({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className={`receipt-dialog__total-row ${muted ? "receipt-dialog__total-row--muted" : ""}`}><span>{label}</span><strong className="tnums">{value}</strong></div>;
}
