"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { updatePosOnlineOrderStatus } from "@/app/admin/online-ordering/actions";
import { formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import {
  formatOnlineEta,
  formatOrderStatusLabel,
  getOnlineOrderNextAction,
  ONLINE_ORDER_STATUSES,
  pickupSlotLabel,
  type OnlineOrderStatus,
  type OnlineOrderingFulfillmentMethod,
} from "@/lib/online-ordering";

type OnlineQueueFilter = "attention" | "preparing" | "ready" | "all";

export type OnlineQueueProfile = {
  id: string;
  org_id: string;
  store_id: string | null;
  role: "admin" | "manager" | "cashier" | null;
};

type OnlineQueueItem = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

type OnlineQueueOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  fulfillmentMethod: OnlineOrderingFulfillmentMethod;
  deliveryAddress: string | null;
  deliveryNote: string | null;
  deliveryFee: number;
  pickupSlot: string;
  status: OnlineOrderStatus;
  queuePosition: number;
  subtotal: number;
  total: number;
  note: string | null;
  etaAt: string;
  createdAt: string;
  items: OnlineQueueItem[];
};

type OnlineOrderRow = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  fulfillment_method: string;
  delivery_address: string | null;
  delivery_note: string | null;
  delivery_fee: number | string;
  pickup_slot: string;
  status: string;
  queue_position: number | string;
  subtotal: number | string;
  total: number | string;
  note: string | null;
  eta_at: string;
  created_at: string;
};

type OnlineOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number | string;
  unit_price_snapshot: number | string;
  line_total: number | string;
};

type OnlineQueuePanelProps = {
  profile: OnlineQueueProfile;
  offline: boolean;
  onClose: () => void;
  onToast: (message: string) => void;
  onSummaryChange: (summary: { attentionCount: number; activeCount: number }) => void;
};

const ACTIVE_STATUSES: OnlineOrderStatus[] = ["new", "confirmed", "preparing"];

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOnlineStatus(value: unknown): OnlineOrderStatus {
  return ONLINE_ORDER_STATUSES.includes(value as OnlineOrderStatus)
    ? value as OnlineOrderStatus
    : "new";
}

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatQueueTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatOrderFulfillment(order: OnlineQueueOrder) {
  if (order.fulfillmentMethod === "delivery") {
    return order.deliveryAddress ? `Delivery · ${order.deliveryAddress}` : "Delivery";
  }
  return order.pickupSlot === "asap" ? "ASAP pickup" : `Pickup · ${pickupSlotLabel(order.pickupSlot)}`;
}

function statusClass(status: OnlineOrderStatus) {
  if (status === "ready") return "is-online-ready";
  if (status === "preparing") return "is-online-preparing";
  if (status === "confirmed") return "is-online-confirmed";
  if (status === "cancelled") return "is-online-cancelled";
  if (status === "picked_up") return "is-online-picked-up";
  return "is-online-new";
}

function getCashierNextAction(order: OnlineQueueOrder) {
  const nextAction = getOnlineOrderNextAction(order.status, order.fulfillmentMethod);
  return nextAction?.status === "picked_up" ? null : nextAction;
}

export default function OnlineQueuePanel({
  profile,
  offline,
  onClose,
  onToast,
  onSummaryChange,
}: OnlineQueuePanelProps) {
  // The queue is branch-scoped by Supabase RLS; the server action separately
  // enforces the allowed status transitions for cashier operations.
  const supabase = useMemo(() => createClient(), []);
  const requestIdRef = useRef(0);
  const [orders, setOrders] = useState<OnlineQueueOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OnlineQueueFilter>("attention");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadQueue = useCallback(async (silent = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!profile.store_id) {
      setOrders([]);
      setNotice("This terminal is not assigned to a branch, so the online queue is unavailable.");
      setLoading(false);
      return;
    }

    if (offline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setOrders([]);
      setNotice("Reconnect this terminal to check the online order queue.");
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    let data: unknown[] | null = null;
    let error: { message?: string } | null = null;
    try {
      const result = await supabase
        .from("online_orders")
        .select("id, order_no, customer_name, customer_phone, fulfillment_method, delivery_address, delivery_note, delivery_fee, pickup_slot, status, queue_position, subtotal, total, note, eta_at, created_at")
        .eq("org_id", profile.org_id)
        .eq("store_id", profile.store_id)
        .order("created_at", { ascending: false })
        .limit(100);
      data = result.data as unknown[] | null;
      error = result.error;
    } catch {
      error = { message: "Online queue request failed." };
    }

    if (requestId !== requestIdRef.current) return;
    if (error) {
      setOrders([]);
      setNotice("The online queue could not be loaded. Check the online-ordering setup and try again.");
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as OnlineOrderRow[];
    const orderIds = rows.map((row) => row.id).filter(Boolean);
    const itemsResult = orderIds.length > 0
      ? await supabase
        .from("online_order_items")
        .select("id, order_id, product_id, name_snapshot, qty, unit_price_snapshot, line_total")
        .in("order_id", orderIds)
      : { data: [], error: null };

    if (requestId !== requestIdRef.current) return;
    if (itemsResult.error) {
      setOrders([]);
      setNotice("The online queue loaded without readable item details. Try again or ask a manager to review it.");
      setLoading(false);
      return;
    }

    const itemsByOrder = new Map<string, OnlineQueueItem[]>();
    for (const item of (itemsResult.data ?? []) as unknown as OnlineOrderItemRow[]) {
      const items = itemsByOrder.get(item.order_id) ?? [];
      items.push({
        id: item.id,
        productId: item.product_id,
        name: item.name_snapshot,
        qty: readNumber(item.qty, 1),
        unitPrice: readNumber(item.unit_price_snapshot),
        lineTotal: readNumber(item.line_total),
      });
      itemsByOrder.set(item.order_id, items);
    }

    const nextOrders = rows.map((row, index) => ({
      id: row.id,
      orderNo: row.order_no,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      fulfillmentMethod: row.fulfillment_method === "delivery" ? "delivery" as const : "pickup" as const,
      deliveryAddress: row.delivery_address,
      deliveryNote: row.delivery_note,
      deliveryFee: readNumber(row.delivery_fee),
      pickupSlot: row.pickup_slot,
      status: readOnlineStatus(row.status),
      queuePosition: readNumber(row.queue_position, index + 1),
      subtotal: readNumber(row.subtotal),
      total: readNumber(row.total),
      note: row.note,
      etaAt: row.eta_at,
      createdAt: row.created_at,
      items: itemsByOrder.get(row.id) ?? [],
    }));

    setOrders(nextOrders);
    setLastUpdatedAt(new Date().toISOString());
    setNotice(null);
    setLoading(false);
  }, [offline, profile.org_id, profile.store_id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- queue hydration crosses the Supabase client boundary.
    void loadQueue();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void loadQueue(true);
    }, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadQueue(true);
    };
    const handleOnline = () => void loadQueue(true);
    const handleOffline = () => {
      requestIdRef.current += 1;
      setOrders([]);
      setLoading(false);
      setLastUpdatedAt(null);
      setNotice("Reconnect this terminal to check the online order queue.");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadQueue]);

  const attentionCount = orders.filter((order) => order.status === "new" || order.status === "confirmed").length;
  const activeCount = orders.filter((order) => ACTIVE_STATUSES.includes(order.status)).length;
  const preparingCount = orders.filter((order) => order.status === "preparing").length;
  const readyCount = orders.filter((order) => order.status === "ready").length;

  useEffect(() => {
    onSummaryChange({ attentionCount, activeCount });
  }, [activeCount, attentionCount, onSummaryChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the selected detail record valid after live queue refreshes.
    setSelectedId((current) => current && orders.some((order) => order.id === current) ? current : orders[0]?.id ?? null);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === "attention" && order.status !== "new" && order.status !== "confirmed") return false;
      if (filter === "preparing" && order.status !== "preparing") return false;
      if (filter === "ready" && order.status !== "ready") return false;
      if (!query) return true;
      return [
        order.orderNo,
        order.customerName,
        order.customerPhone,
        order.deliveryAddress ?? "",
        ...order.items.map((item) => item.name),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [filter, orders, search]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;
  const nextAction = selectedOrder ? getCashierNextAction(selectedOrder) : null;

  const refreshQueue = async () => {
    setRefreshing(true);
    try {
      await loadQueue();
    } finally {
      setRefreshing(false);
    }
  };

  const advanceSelectedOrder = async () => {
    if (!selectedOrder || !nextAction || actionId) return;
    setActionId(selectedOrder.id);
    try {
      const result = await updatePosOnlineOrderStatus(selectedOrder.id, nextAction.status);
      if (result.ok) {
        onToast(result.message);
        await loadQueue(true);
      } else {
        setNotice(result.message);
      }
    } catch {
      setNotice("The online order could not be updated. Check the connection and try again.");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div id="online-queue-panel" role="tabpanel" aria-labelledby="order-history-online-tab" tabIndex={0} className="order-history-online-view">
      <div className="order-history-online-toolbar">
        <div className="order-history-filter" role="tablist" aria-label="Online queue filter">
          <button type="button" role="tab" aria-selected={filter === "attention"} className={filter === "attention" ? "is-active" : ""} onClick={() => setFilter("attention")}>
            Needs attention <span>{attentionCount}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === "preparing"} className={filter === "preparing" ? "is-active" : ""} onClick={() => setFilter("preparing")}>
            Preparing <span>{preparingCount}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === "ready"} className={filter === "ready" ? "is-active" : ""} onClick={() => setFilter("ready")}>
            Ready <span>{readyCount}</span>
          </button>
          <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
            All <span>{orders.length}</span>
          </button>
        </div>
        <div className="order-history-online-toolbar__actions">
          <span className="order-history-online-live"><i />{lastUpdatedAt ? `Live · ${formatQueueTime(lastUpdatedAt)}` : "Live queue"}</span>
          <button type="button" className="order-history-button order-history-button--soft" onClick={() => void refreshQueue()} disabled={loading || refreshing}>
            <AdminIcon name="refresh" size={15} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <label className="order-history-search">
          <AdminIcon name="search" size={16} />
          <span className="sr-only">Search online orders</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, customer, or item" />
        </label>
      </div>

      {notice && (
        <div className="order-history-notice" role="status">
          <AdminIcon name="alert" size={16} />
          <span>{notice}</span>
        </div>
      )}

      <div className="order-history-content online-queue-content">
        <section className="order-history-list-panel online-queue-list-panel" aria-label="Online order queue">
          <div className="order-history-list-panel__heading">
            <div>
              <p>Live online queue</p>
              <strong>{loading ? "Loading orders…" : `${filteredOrders.length} order${filteredOrders.length === 1 ? "" : "s"}`}</strong>
            </div>
            <span>{activeCount} active</span>
          </div>
          <div className="order-history-list" aria-busy={loading}>
            {loading ? (
              <div className="order-history-empty"><span className="order-history-empty__mark"><AdminIcon name="refresh" size={22} /></span><strong>Loading online queue</strong><span>Checking this branch for customer orders.</span></div>
            ) : filteredOrders.length === 0 ? (
              <div className="order-history-empty"><span className="order-history-empty__mark"><AdminIcon name="bag" size={22} /></span><strong>{orders.length === 0 ? "No online orders yet" : "No matching online orders"}</strong><span>{orders.length === 0 ? "Orders placed through the online menu will appear here." : "Try another filter or search term."}</span></div>
            ) : (
              filteredOrders.map((order) => (
                <button key={order.id} type="button" className={`order-history-row online-queue-row${selectedId === order.id ? " is-selected" : ""}`} onClick={() => setSelectedId(order.id)}>
                  <span className="online-queue-row__number">{order.queuePosition}</span>
                  <span className="order-history-row__main">
                    <span className="order-history-row__topline">
                      <strong>{order.orderNo}</strong>
                      <span className={`order-history-status ${statusClass(order.status)}`}>{formatOrderStatusLabel(order.status)}</span>
                    </span>
                    <span className="order-history-row__summary">{order.customerName} · {order.items.length > 0 ? order.items.map((item) => `${formatQuantity(item.qty)} × ${item.name}`).join(", ") : "Items not available"}</span>
                    <span className="order-history-row__meta">{formatOrderFulfillment(order)} · {formatOnlineEta(order.etaAt)}</span>
                  </span>
                  <strong className="order-history-row__total">{displayPeso(order.total)}</strong>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="order-history-detail online-queue-detail" aria-label="Selected online order detail">
          {selectedOrder ? (
            <>
              <header className="order-history-detail__header">
                <div>
                  <p>Online queue · #{selectedOrder.queuePosition}</p>
                  <h2>{selectedOrder.orderNo}</h2>
                  <span>{formatQueueTime(selectedOrder.createdAt)} · {selectedOrder.customerName}</span>
                </div>
                <span className={`order-history-status order-history-status--large ${statusClass(selectedOrder.status)}`}>{formatOrderStatusLabel(selectedOrder.status)}</span>
              </header>

              <div className="order-history-detail__scroll">
                <div className="online-queue-fulfillment-card">
                  <div><span>{selectedOrder.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}</span><strong>{formatOrderFulfillment(selectedOrder)}</strong></div>
                  <div><span>ETA</span><strong>{formatOnlineEta(selectedOrder.etaAt)}</strong></div>
                </div>

                <div className="order-history-ticket">
                  <div className="order-history-ticket__columns" aria-hidden="true"><span>QTY</span><span>ITEM</span><span>AMOUNT</span></div>
                  <ul className="order-history-ticket__items">
                    {selectedOrder.items.length === 0 ? (
                      <li className="order-history-ticket__empty">Item details are not available yet.</li>
                    ) : selectedOrder.items.map((item) => (
                      <li key={item.id}>
                        <span>{formatQuantity(item.qty)}</span>
                        <span><strong>{item.name}</strong><small>{displayPeso(item.unitPrice)} each</small></span>
                        <strong>{displayPeso(item.lineTotal)}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="order-history-ticket__summary">
                    <div><span>Subtotal</span><strong>{displayPeso(selectedOrder.subtotal)}</strong></div>
                    {selectedOrder.deliveryFee > 0 && <div><span>Delivery fee</span><strong>{displayPeso(selectedOrder.deliveryFee)}</strong></div>}
                    <div className="order-history-ticket__total"><span>Total</span><strong>{displayPeso(selectedOrder.total)}</strong></div>
                  </div>
                </div>

                <div className="order-history-meta-grid">
                  <div><span>Customer</span><strong>{selectedOrder.customerName}</strong></div>
                  <div><span>Phone</span><strong>{selectedOrder.customerPhone}</strong></div>
                  <div><span>Fulfillment</span><strong>{selectedOrder.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}</strong></div>
                  <div><span>Promise</span><strong>{selectedOrder.fulfillmentMethod === "delivery" ? selectedOrder.deliveryAddress || "Address not provided" : selectedOrder.pickupSlot === "asap" ? "ASAP pickup" : pickupSlotLabel(selectedOrder.pickupSlot)}</strong></div>
                </div>

                {(selectedOrder.note || selectedOrder.deliveryNote) && (
                  <div className="order-history-note">
                    <span>Order note</span>
                    <p>{[selectedOrder.note, selectedOrder.deliveryNote].filter(Boolean).join(" · ")}</p>
                  </div>
                )}
              </div>

              <footer className="order-history-detail__footer">
                <div>
                  <span>Next step</span>
                  <small>{selectedOrder.status === "ready" ? "Take payment and complete the handoff in POS." : selectedOrder.status === "picked_up" ? "This order has been completed in POS." : selectedOrder.status === "cancelled" ? "This order is cancelled." : "Move the order forward as the team prepares it."}</small>
                </div>
                <div className="order-history-detail__footer-actions">
                  {nextAction && (
                    <button type="button" className="order-history-button order-history-button--online-action" onClick={() => void advanceSelectedOrder()} disabled={actionId !== null || offline}>
                      {actionId === selectedOrder.id ? "Saving…" : nextAction.label}
                      <AdminIcon name="arrow" size={15} />
                    </button>
                  )}
                  {selectedOrder.status !== "picked_up" && selectedOrder.status !== "cancelled" && (
                    <a href={`/pos?onlineOrder=${encodeURIComponent(selectedOrder.id)}`} onClick={onClose} className="order-history-button order-history-button--online-open">
                      <AdminIcon name="bag" size={15} />
                      Open in POS
                    </a>
                  )}
                </div>
              </footer>
            </>
          ) : (
            <div className="order-history-detail__empty"><span className="order-history-empty__mark"><AdminIcon name="bag" size={26} /></span><strong>Select an online order</strong><span>Choose an order to review its customer details, items, and next step.</span></div>
          )}
        </section>
      </div>
    </div>
  );
}
