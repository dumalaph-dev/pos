"use client";

import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminOrderActions } from "@/components/admin/AdminOrderActions";
import { salesQuantity } from "@/lib/inventory";
import { formatPeso } from "@/lib/money";

type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";

export type OrderReceiptData = {
  order: {
    id: string;
    order_no: string;
    status: OrderStatus;
    subtotal: number;
    discount_amount: number;
    discount_ref: string | null;
    vatable_sale: number;
    vat_amount: number;
    vat_exempt_sale: number;
    total: number;
    payment_method: PaymentMethod;
    payment_ref: string | null;
    amount_tendered: number | null;
    change_due: number | null;
    note: string | null;
    created_at: string;
    created_at_device: string;
  };
  items: Array<{
    order_id: string;
    product_id: string | null;
    name_snapshot: string;
    qty: number;
    weight_kg: number | null;
    unit: string;
    line_total: number;
  }>;
  branch: {
    name: string;
    address: string | null;
    tin: string | null;
    vatRegistered: boolean;
    vatRate: number;
  };
  cashierName: string;
  returnTo: string;
  canManage: boolean;
  canReprint: boolean;
  reversal: { status: OrderStatus; order_no: string; created_at: string } | null;
};

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

export function OrderDialogController({
  children,
  receipts,
  initialOrderId,
}: {
  children: ReactNode;
  receipts: OrderReceiptData[];
  initialOrderId: string | null;
}) {
  const [openOrderId, setOpenOrderId] = useState(initialOrderId);
  const openedFromTableRef = useRef(false);
  const receiptById = useMemo(() => new Map(receipts.map((receipt) => [receipt.order.id, receipt])), [receipts]);

  useEffect(() => {
    function handlePopState() {
      const orderId = new URL(window.location.href).searchParams.get("order");
      setOpenOrderId(orderId && receiptById.has(orderId) ? orderId : null);
      openedFromTableRef.current = false;
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [receiptById]);

  const openReceipt = useCallback((orderId: string) => {
    if (!receiptById.has(orderId)) return;

    const url = new URL(window.location.href);
    url.searchParams.set("order", orderId);
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    openedFromTableRef.current = true;
    setOpenOrderId(orderId);
  }, [receiptById]);

  const closeReceipt = useCallback(() => {
    if (!openOrderId) return;

    const url = new URL(window.location.href);
    const openedOrderIsCurrent = url.searchParams.get("order") === openOrderId;
    if (openedFromTableRef.current && openedOrderIsCurrent) {
      openedFromTableRef.current = false;
      setOpenOrderId(null);
      window.history.back();
      return;
    }

    url.searchParams.delete("order");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    openedFromTableRef.current = false;
    setOpenOrderId(null);
  }, [openOrderId]);

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const trigger = event.target.closest<HTMLElement>("[data-order-trigger]");
    if (!trigger || !event.currentTarget.contains(trigger)) return;

    const orderId = trigger.dataset.orderTrigger;
    if (!orderId || !receiptById.has(orderId)) return;
    event.preventDefault();
    openReceipt(orderId);
  }, [openReceipt, receiptById]);

  const receipt = openOrderId ? receiptById.get(openOrderId) : null;

  return (
    <div className="order-dialog-controller" onClickCapture={handleClick}>
      {children}
      {receipt ? (
        <AdminDialog
          key={receipt.order.id}
          onClose={closeReceipt}
          titleId={`order-detail-heading-${receipt.order.id}`}
          descriptionId={`order-detail-meta-${receipt.order.id}`}
          bodyClassName="order-modal-open"
          backdropClassName="order-dialog__backdrop"
          dialogClassName="order-dialog"
        >
          <OrderReceipt receipt={receipt} onClose={closeReceipt} />
        </AdminDialog>
      ) : null}
    </div>
  );
}

function OrderReceipt({ receipt, onClose }: { receipt: OrderReceiptData; onClose: () => void }) {
  const { order } = receipt;

  return (
    <section aria-labelledby={`order-detail-heading-${order.id}`} className="admin-panel p-5">
      <div className="admin-panel__header">
        <div>
          <p className="admin-panel__eyebrow">Receipt view</p>
          <h2 id={`order-detail-heading-${order.id}`} className="admin-panel__title">{order.order_no}</h2>
          <p className="admin-panel__subtitle">{formatDateTime(order.created_at)}</p>
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
      </div>

      <p id={`order-detail-meta-${order.id}`} className="sr-only">Receipt details for {order.order_no}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <span className={`inline-flex rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
        <span className="text-xs font-extrabold text-ink">{paymentLabel(order.payment_method)}</span>
      </div>

      {receipt.reversal && (
        <div className="mt-4 rounded-btn border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-ink">
          <strong className="block text-[10px] uppercase tracking-[0.1em] text-warning">Reversal recorded</strong>
          <span className="mt-1 block">{statusLabel(receipt.reversal.status)} as {receipt.reversal.order_no} on {formatDateTime(receipt.reversal.created_at)}.</span>
        </div>
      )}

      <div className="mt-4 grid gap-2 rounded-btn bg-surface-raised p-3 text-xs">
        <ReceiptMeta label="Branch" value={receipt.branch.name} />
        <ReceiptMeta label="Cashier" value={receipt.cashierName} />
        {order.payment_ref && <ReceiptMeta label="Payment ref" value={order.payment_ref} />}
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Items</p>
        {receipt.items.length === 0 ? (
          <p className="mt-3 rounded-btn border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">Item details are unavailable for this order.</p>
        ) : (
          <div className="mt-2 divide-y divide-line/70">
            {receipt.items.map((item, index) => (
              <div key={`${item.order_id}-${index}`} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <strong className="block truncate text-xs font-extrabold text-ink">{item.name_snapshot}</strong>
                  <small className="mt-1 block text-[10px] text-ink-muted">{formatQuantity(salesQuantity(item))} {item.unit}</small>
                </span>
                <strong className="tnums whitespace-nowrap text-xs font-extrabold text-ink">{displayPeso(item.line_total)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <ReceiptTotal label="Subtotal" value={displayPeso(order.subtotal)} />
        <ReceiptTotal label="Discount" value={displayPeso(order.discount_amount)} muted />
        <ReceiptTotal label="VAT" value={displayPeso(order.vat_amount)} muted />
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-sm font-extrabold text-ink">Total</span><strong className="tnums text-xl font-extrabold text-primary">{displayPeso(order.total)}</strong></div>
      </div>

      {(order.amount_tendered != null || order.change_due != null || order.note) && (
        <div className="mt-4 border-t border-line pt-4">
          {order.amount_tendered != null && <ReceiptTotal label="Amount tendered" value={displayPeso(order.amount_tendered)} />}
          {order.change_due != null && <ReceiptTotal label="Change due" value={displayPeso(order.change_due)} />}
          {order.note && <div className="mt-3 rounded-btn bg-secondary/60 px-3 py-2.5 text-xs leading-5 text-ink"><strong className="block text-[10px] uppercase tracking-[0.1em] text-ink-muted">Order note</strong><span className="mt-1 block">{order.note}</span></div>}
        </div>
      )}

      <AdminOrderActions
        order={order}
        items={receipt.items}
        branchName={receipt.branch.name}
        branchAddress={receipt.branch.address}
        branchTin={receipt.branch.tin}
        branchVatRegistered={receipt.branch.vatRegistered}
        branchVatRate={receipt.branch.vatRate}
        cashierName={receipt.cashierName}
        returnTo={receipt.returnTo}
        canManage={receipt.canManage}
        canReprint={receipt.canReprint}
        hasReversal={Boolean(receipt.reversal)}
      />
    </section>
  );
}

function ReceiptMeta({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-ink-muted">{label}</span><strong className="max-w-[62%] text-right font-extrabold text-ink">{value}</strong></div>;
}

function ReceiptTotal({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex items-center justify-between py-1 text-xs ${muted ? "text-ink-muted" : "text-ink"}`}><span>{label}</span><strong className="tnums font-extrabold">{value}</strong></div>;
}
