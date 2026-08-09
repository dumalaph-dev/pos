"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { recordPosOrderVoid } from "@/app/admin/orders/actions";
import { createClient } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/money";
import {
  enqueueAuditLog,
  listPendingOrders,
  type PendingOrder,
} from "@/lib/offline";
import { buildReceipt } from "@/lib/receipt";
import type { PaperWidth } from "@/lib/paper-width";

type OrderStatus = "completed" | "voided" | "refunded";
type PaymentMethod = "cash" | "gcash" | "maya" | "card";
type HistoryFilter = "all" | "pending" | "completed";

export type OrderHistoryProfile = {
  id: string;
  org_id: string;
  store_id: string | null;
  store_name: string | null;
  store_tin: string | null;
  full_name: string | null;
};

type OrderHistoryItem = {
  productId: string | null;
  name: string;
  qty: number;
  weightKg: number | null;
  unitPrice: number;
  lineTotal: number;
};

type OrderHistoryRecord = {
  id: string;
  localUuid: string;
  source: "server" | "pending";
  orderNo: string;
  storeId: string | null;
  cashierId: string;
  status: OrderStatus | "pending";
  subtotal: number;
  discountType: string;
  discountAmount: number;
  discountRef: string | null;
  vatableSale: number;
  vatAmount: number;
  vatExemptSale: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentRef: string | null;
  amountTendered: number | null;
  changeDue: number | null;
  note: string | null;
  createdAtDevice: string;
  createdAt: string;
  reversalOf: string | null;
  items: OrderHistoryItem[];
};

type ServerOrderRow = {
  id: string;
  local_uuid: string;
  order_no: string;
  store_id: string;
  cashier_id: string;
  status: string;
  subtotal: number | string;
  discount_type: string;
  discount_amount: number | string;
  discount_ref: string | null;
  vatable_sale: number | string;
  vat_amount: number | string;
  vat_exempt_sale: number | string;
  total: number | string;
  payment_method: string;
  payment_ref: string | null;
  amount_tendered: number | string | null;
  change_due: number | string | null;
  note: string | null;
  created_at_device: string;
  created_at: string;
  reversal_of: string | null;
};

type ServerItemRow = {
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  qty: number | string;
  weight_kg: number | string | null;
  unit_price_snapshot: number | string;
  line_total: number | string;
};

type OrderHistoryProps = {
  profile: OrderHistoryProfile;
  storeName: string;
  offline: boolean;
  pendingCount: number;
  receiptSettings: {
    paperWidth: PaperWidth;
    vatRate: number;
    showVat: boolean;
    receiptHeader: string;
    receiptFooter: string;
    showCashier: boolean;
    storeAddress: string | null;
    storeTin: string | null;
  };
  onClose: () => void;
  onPrint: (bytes: Uint8Array, label?: string) => Promise<boolean>;
  onToast: (message: string) => void;
};

type HistoryIconName = "arrow" | "close" | "printer" | "receipt" | "refresh" | "search" | "wifi";

function HistoryIcon({ name, size = 18 }: { name: HistoryIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<HistoryIconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    close: <><path d="m7 7 10 10M17 7 7 17" /></>,
    printer: <><path d="M6 9V4h12v5M6 17H4V9h16v8h-2" /><path d="M7 14h10v6H7z" /><path d="M17 11h.1" /></>,
    receipt: <><path d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6L8 20.5 6 19z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3.9L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.8 3.9L20 15" /><path d="M20 20v-5h-5" /></>,
    search: <><circle cx="11" cy="11" r="6.8" /><path d="m16 16 4.3 4.3" /></>,
    wifi: <><path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10 16.5a3 3 0 0 1 4 0" /><circle cx="12" cy="20" r=".8" fill="currentColor" stroke="none" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseStatus(value: unknown): OrderStatus {
  return value === "voided" || value === "refunded" ? value : "completed";
}

function normalisePayment(value: unknown): PaymentMethod {
  return value === "gcash" || value === "maya" || value === "card" ? value : "cash";
}

function displayPeso(value: number) {
  return formatPeso(Number(value)).replace(/\.00$/, "");
}

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function paymentLabel(method: PaymentMethod) {
  if (method === "gcash") return "GCash";
  if (method === "maya") return "Maya";
  if (method === "card") return "Card";
  return "Cash";
}

function statusLabel(status: OrderHistoryRecord["status"]) {
  if (status === "pending") return "Pending sync";
  if (status === "voided") return "Voided";
  if (status === "refunded") return "Refunded";
  return "Completed";
}

function statusClass(status: OrderHistoryRecord["status"]) {
  if (status === "pending") return "is-pending";
  if (status === "voided") return "is-voided";
  if (status === "refunded") return "is-refunded";
  return "is-completed";
}

function itemRows(value: unknown): OrderHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const item = raw as Record<string, unknown>;
    const name = readString(item.name_snapshot, "Item");
    return [{
      productId: readString(item.product_id) || null,
      name,
      qty: readNumber(item.qty, 1),
      weightKg: readNullableNumber(item.weight_kg),
      unitPrice: readNumber(item.unit_price_snapshot),
      lineTotal: readNumber(item.line_total),
    }];
  });
}

function pendingOrder(row: PendingOrder, profile: OrderHistoryProfile): OrderHistoryRecord | null {
  const raw = row.p_order;
  const localUuid = readString(raw.local_uuid, row.local_uuid);
  if (!localUuid) return null;
  if (readString(raw.cashier_id) !== profile.id) return null;
  const createdAt = readString(raw.created_at_device, row.created_at);
  const rawStoreId = raw.store_id === null ? null : readString(raw.store_id) || null;
  if (profile.store_id && rawStoreId !== profile.store_id) return null;
  if (!profile.store_id && rawStoreId !== null) return null;
  return {
    id: `pending-${localUuid}`,
    localUuid,
    source: "pending",
    orderNo: readString(raw.order_no, `Pending ${localUuid.slice(0, 8).toUpperCase()}`),
    storeId: rawStoreId,
    cashierId: readString(raw.cashier_id),
    status: "pending",
    subtotal: readNumber(raw.subtotal),
    discountType: readString(raw.discount_type, "none"),
    discountAmount: readNumber(raw.discount_amount),
    discountRef: readString(raw.discount_ref) || null,
    vatableSale: readNumber(raw.vatable_sale),
    vatAmount: readNumber(raw.vat_amount),
    vatExemptSale: readNumber(raw.vat_exempt_sale),
    total: readNumber(raw.total),
    paymentMethod: normalisePayment(raw.payment_method),
    paymentRef: readString(raw.payment_ref) || null,
    amountTendered: readNullableNumber(raw.amount_tendered),
    changeDue: readNullableNumber(raw.change_due),
    note: readString(raw.note) || null,
    createdAtDevice: createdAt,
    createdAt,
    reversalOf: null,
    items: itemRows(row.p_items),
  };
}

function serverOrder(row: ServerOrderRow, items: OrderHistoryItem[]): OrderHistoryRecord {
  return {
    id: row.id,
    localUuid: row.local_uuid,
    source: "server",
    orderNo: row.order_no,
    storeId: row.store_id,
    cashierId: row.cashier_id,
    status: normaliseStatus(row.status),
    subtotal: readNumber(row.subtotal),
    discountType: row.discount_type,
    discountAmount: readNumber(row.discount_amount),
    discountRef: row.discount_ref,
    vatableSale: readNumber(row.vatable_sale),
    vatAmount: readNumber(row.vat_amount),
    vatExemptSale: readNumber(row.vat_exempt_sale),
    total: readNumber(row.total),
    paymentMethod: normalisePayment(row.payment_method),
    paymentRef: row.payment_ref,
    amountTendered: readNullableNumber(row.amount_tendered),
    changeDue: readNullableNumber(row.change_due),
    note: row.note,
    createdAtDevice: row.created_at_device,
    createdAt: row.created_at,
    reversalOf: row.reversal_of,
    items,
  };
}

function serverItems(rows: ServerItemRow[]) {
  return rows.reduce<Map<string, OrderHistoryItem[]>>((map, row) => {
    const items = map.get(row.order_id) ?? [];
    items.push({
      productId: row.product_id,
      name: row.name_snapshot,
      qty: readNumber(row.qty, 1),
      weightKg: readNullableNumber(row.weight_kg),
      unitPrice: readNumber(row.unit_price_snapshot),
      lineTotal: readNumber(row.line_total),
    });
    map.set(row.order_id, items);
    return map;
  }, new Map());
}

function receiptForOrder(order: OrderHistoryRecord, profile: OrderHistoryProfile, storeName: string, settings: OrderHistoryProps["receiptSettings"]) {
  return buildReceipt({
    storeName,
    storeAddress: settings.storeAddress,
    storeTin: settings.storeTin,
    orderNo: order.orderNo,
    cashier: order.cashierId === profile.id ? profile.full_name ?? "Cashier" : "Branch cashier",
    createdAt: new Date(order.createdAtDevice),
    items: order.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      weightKg: item.weightKg,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    discountRef: order.discountRef,
    vatableSale: order.vatableSale,
    vatAmount: order.vatAmount,
    vatExemptSale: order.vatExemptSale,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentRef: order.paymentRef,
    amountTendered: order.amountTendered,
    changeDue: order.changeDue,
    isReprint: true,
    paperWidth: settings.paperWidth,
    vatRate: settings.vatRate,
    showVat: settings.showVat,
    receiptHeader: settings.receiptHeader,
    receiptFooter: settings.receiptFooter,
    showCashier: settings.showCashier,
  });
}

export default function OrderHistory({
  profile,
  storeName,
  offline,
  pendingCount,
  receiptSettings,
  onClose,
  onPrint,
  onToast,
}: OrderHistoryProps) {
  const supabase = useMemo(() => createClient(), []);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [orders, setOrders] = useState<OrderHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidPin, setVoidPin] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    let localRows: OrderHistoryRecord[] = [];
    try {
      const pendingRows = await listPendingOrders({
        userId: profile.id,
        orgId: profile.org_id,
        storeId: profile.store_id,
      });
      localRows = pendingRows
        .map((row) => pendingOrder(row, profile))
        .filter((row): row is OrderHistoryRecord => row !== null);
    } catch {
      setNotice("This device history is unavailable right now.");
    }

    const serverRows: OrderHistoryRecord[] = [];
    let serverNotice: string | null = null;
    const canReadBranch = Boolean(profile.store_id) && typeof navigator !== "undefined" && navigator.onLine && !offline;

    if (canReadBranch) {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, local_uuid, order_no, store_id, cashier_id, status, subtotal, discount_type, discount_amount, discount_ref, vatable_sale, vat_amount, vat_exempt_sale, total, payment_method, payment_ref, amount_tendered, change_due, note, created_at_device, created_at, reversal_of")
          .eq("store_id", profile.store_id)
          .order("created_at_device", { ascending: false })
          .limit(50);
        if (error) throw error;

        const rows = (data ?? []) as unknown as ServerOrderRow[];
        const orderIds = rows.map((row) => row.id).filter(Boolean);
        let itemsByOrder = new Map<string, OrderHistoryItem[]>();
        if (orderIds.length > 0) {
          const itemResult = await supabase
            .from("order_items")
            .select("order_id, product_id, name_snapshot, qty, weight_kg, unit_price_snapshot, line_total")
            .in("order_id", orderIds);
          if (itemResult.error) {
            serverNotice = "Branch orders loaded, but some item details are unavailable.";
          } else {
            itemsByOrder = serverItems((itemResult.data ?? []) as unknown as ServerItemRow[]);
          }
        }
        for (const row of rows) serverRows.push(serverOrder(row, itemsByOrder.get(row.id) ?? []));
      } catch {
        serverNotice = "Couldn’t reach branch history — showing orders saved on this device.";
      }
    } else if (!profile.store_id) {
      serverNotice = "This terminal is not bound to a branch yet.";
    } else {
      serverNotice = "Offline — showing orders saved on this device. Branch history returns when you’re online.";
    }

    const syncedLocalUuids = new Set(serverRows.map((row) => row.localUuid));
    const merged = [...serverRows, ...localRows.filter((row) => !syncedLocalUuids.has(row.localUuid))]
      .sort((left, right) => new Date(right.createdAtDevice).getTime() - new Date(left.createdAtDevice).getTime());
    setOrders(merged);
    setSelectedId((current) => current && merged.some((row) => row.id === current) ? current : merged[0]?.id ?? null);
    if (serverNotice) setNotice(serverNotice);
    setLoading(false);
  }, [offline, profile, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- history hydration is the external Dexie/Supabase boundary.
    void loadOrders();
  }, [loadOrders, pendingCount]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === "pending" && order.status !== "pending") return false;
      if (filter === "completed" && order.status !== "completed") return false;
      if (!query) return true;
      return [
        order.orderNo,
        order.paymentMethod,
        order.paymentRef ?? "",
        ...order.items.map((item) => item.name),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [filter, orders, search]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;
  const selectedReversal = selectedOrder
    ? orders.find((order) => order.reversalOf === selectedOrder.id) ?? null
    : null;
  const canVoidSelected = Boolean(
    selectedOrder &&
      selectedOrder.source === "server" &&
      selectedOrder.status === "completed" &&
      !selectedReversal &&
      !offline,
  );

  const openVoidDialog = () => {
    if (!canVoidSelected) return;
    setVoidReason("");
    setVoidPin("");
    setVoidError("");
    setVoidDialogOpen(true);
  };

  const closeVoidDialog = () => {
    if (voidingId) return;
    setVoidDialogOpen(false);
    setVoidReason("");
    setVoidPin("");
    setVoidError("");
  };

  const submitVoid = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrder || !canVoidSelected || voidingId) return;

    setVoidingId(selectedOrder.id);
    setVoidError("");
    let result: Awaited<ReturnType<typeof recordPosOrderVoid>>;
    try {
      result = await recordPosOrderVoid(selectedOrder.id, voidReason, voidPin);
    } catch {
      setVoidError("The void could not be completed. Check the till connection and try again.");
      setVoidingId(null);
      return;
    }
    if (!result.ok) {
      setVoidError(result.message);
      setVoidingId(null);
      return;
    }

    const message = `${selectedOrder.orderNo} voided and audit logged.`;
    setVoidDialogOpen(false);
    setVoidReason("");
    setVoidPin("");
    onToast(message);
    await loadOrders();
    setNotice(message);
    setVoidingId(null);
  };

  const reprintSelected = async () => {
    if (!selectedOrder || printingId) return;
    setPrintingId(selectedOrder.id);
    const receipt = receiptForOrder(selectedOrder, profile, storeName, receiptSettings);
    try {
      const printed = await onPrint(receipt, "reprint");
      if (!printed) return;

      const auditPayload: Record<string, unknown> = {
        org_id: profile.org_id,
        store_id: profile.store_id,
        actor_id: profile.id,
        action: "order.reprint",
        entity: "orders",
        entity_id: selectedOrder.source === "server" ? selectedOrder.id : null,
        after: {
          order_no: selectedOrder.orderNo,
          local_uuid: selectedOrder.localUuid,
          source: selectedOrder.source,
        },
      };
      let auditLogged = false;
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const { error } = await supabase.from("audit_logs").insert(auditPayload);
          auditLogged = !error;
        } catch {
          auditLogged = false;
        }
      }
      if (!auditLogged) {
        await enqueueAuditLog(auditPayload);
      }
      const message = auditLogged
        ? `${selectedOrder.orderNo} reprinted and audit logged.`
        : `${selectedOrder.orderNo} reprinted. Audit entry queued for sync.`;
      setNotice(message);
      onToast(message);
    } catch {
      setNotice("The receipt printed, but the reprint audit could not be saved.");
    } finally {
      setPrintingId(null);
    }
  };

  const pendingVisible = orders.filter((order) => order.status === "pending").length;

  return (
    <div
      className="order-history-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-history-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="order-history-shell">
        <header className="order-history-header">
          <div className="order-history-header__brand">
            <div className="order-history-header__mark"><HistoryIcon name="receipt" size={20} /></div>
            <div>
              <p>Orders / Receipts</p>
              <h1 id="order-history-title">Recent branch orders</h1>
            </div>
          </div>
          <div className="order-history-header__context">
            <span className={offline ? "is-offline" : ""}>
              <span className="order-history-status-dot" />
              {offline ? "Offline history" : "Branch history"}
            </span>
            <span>{storeName}</span>
            {(pendingCount > 0 || pendingVisible > 0) && <b>{Math.max(pendingCount, pendingVisible)} pending</b>}
          </div>
          <div className="order-history-header__actions">
            <button type="button" className="order-history-button order-history-button--soft" onClick={() => void loadOrders()} disabled={loading}>
              <HistoryIcon name="refresh" size={16} />
              Refresh
            </button>
            <button type="button" ref={closeButtonRef} className="order-history-button order-history-button--close" onClick={onClose}>
              Back to POS
              <HistoryIcon name="arrow" size={16} />
            </button>
          </div>
        </header>

        <div className="order-history-toolbar">
          <div className="order-history-filter" role="tablist" aria-label="Order history filter">
            {([
              ["all", "All orders"],
              ["pending", `Pending${pendingVisible ? ` · ${pendingVisible}` : ""}`],
              ["completed", "Completed"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? "is-active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="order-history-search">
            <HistoryIcon name="search" size={17} />
            <span className="sr-only">Search orders</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order no. or item" />
          </label>
        </div>

        {notice && (
          <div className="order-history-notice" role="status">
            <HistoryIcon name={offline ? "wifi" : "receipt"} size={16} />
            <span>{notice}</span>
          </div>
        )}

        <div className="order-history-content">
          <section className="order-history-list-panel" aria-label="Recent orders">
            <div className="order-history-list-panel__heading">
              <div>
                <p>Transaction register</p>
                <strong>{loading ? "Loading orders…" : `${filteredOrders.length} order${filteredOrders.length === 1 ? "" : "s"}`}</strong>
              </div>
              <span>Newest first</span>
            </div>
            <div className="order-history-list" aria-busy={loading}>
              {loading ? (
                <div className="order-history-empty"><span className="order-history-empty__mark"><HistoryIcon name="refresh" size={22} /></span><strong>Loading branch history</strong><span>Checking this device and the branch register.</span></div>
              ) : filteredOrders.length === 0 ? (
                <div className="order-history-empty"><span className="order-history-empty__mark"><HistoryIcon name="receipt" size={22} /></span><strong>{orders.length === 0 ? "No orders to show" : "No matching orders"}</strong><span>{orders.length === 0 ? "Completed sales will appear here, including orders waiting to sync." : "Try another order number or item."}</span></div>
              ) : (
                filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className={`order-history-row${selectedId === order.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(order.id)}
                  >
                    <span className="order-history-row__main">
                      <span className="order-history-row__topline">
                        <strong className="tnums">{order.orderNo}</strong>
                        <span className={`order-history-status ${statusClass(order.status)}`}>{statusLabel(order.status)}</span>
                      </span>
                      <span className="order-history-row__summary">{order.items.length > 0 ? order.items.map((item) => `${formatQuantity(item.qty)} × ${item.name}`).join(", ") : "Items saved with this order"}</span>
                      <span className="order-history-row__meta">{formatShortTime(order.createdAtDevice)} · {paymentLabel(order.paymentMethod)}{order.source === "pending" ? " · This device" : ""}</span>
                    </span>
                    <strong className="order-history-row__total tnums">{displayPeso(order.total)}</strong>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="order-history-detail" aria-label="Selected order detail">
            {selectedOrder ? (
              <>
                <header className="order-history-detail__header">
                  <div>
                    <p>Selected order</p>
                    <h2 className="tnums">{selectedOrder.orderNo}</h2>
                    <span>{formatDateTime(selectedOrder.createdAtDevice)} · {selectedOrder.source === "pending" ? "Saved on this device" : "Saved to branch register"}</span>
                  </div>
                  <span className={`order-history-status order-history-status--large ${statusClass(selectedOrder.status)}`}>{statusLabel(selectedOrder.status)}</span>
                </header>

                {selectedOrder.status === "pending" && (
                  <div className="order-history-pending-note"><HistoryIcon name="wifi" size={17} /><span>This order is safe on this device and will sync automatically when the branch connection returns.</span></div>
                )}

                {selectedReversal && (
                  <div className="order-history-action-note" role="status">
                    <HistoryIcon name="receipt" size={17} />
                    <span>This order already has a {statusLabel(selectedReversal.status).toLowerCase()} action. The original sale stays here for audit history.</span>
                  </div>
                )}

                {selectedOrder.status === "completed" && selectedOrder.source === "server" && !selectedReversal && offline && (
                  <div className="order-history-action-note order-history-action-note--warning" role="status">
                    <HistoryIcon name="wifi" size={17} />
                    <span>Voids require a live connection so the manager approval and audit record are verified on the server.</span>
                  </div>
                )}

                <div className="order-history-detail__scroll">
                  <div className="order-history-ticket">
                    <div className="order-history-ticket__columns" aria-hidden="true"><span>QTY</span><span>ITEM</span><span>AMOUNT</span></div>
                    <ul className="order-history-ticket__items">
                      {selectedOrder.items.length === 0 ? (
                        <li className="order-history-ticket__empty">Item details are not available yet.</li>
                      ) : selectedOrder.items.map((item, index) => (
                        <li key={`${item.productId ?? item.name}-${index}`}>
                          <span className="tnums">{item.weightKg !== null ? `${item.weightKg.toFixed(2)} kg` : `×${formatQuantity(item.qty)}`}</span>
                          <span><strong>{item.name}</strong><small>{item.weightKg !== null ? `${item.unitPrice ? `${displayPeso(item.unitPrice)} / kg` : "Weighted item"}` : `${displayPeso(item.unitPrice)} each`}</small></span>
                          <strong className="tnums">{displayPeso(item.lineTotal)}</strong>
                        </li>
                      ))}
                    </ul>
                    <div className="order-history-ticket__summary">
                      <div><span>Subtotal</span><strong className="tnums">{displayPeso(selectedOrder.subtotal)}</strong></div>
                      <div><span>Discount{selectedOrder.discountType !== "none" ? ` · ${selectedOrder.discountType}` : ""}</span><strong className="tnums">{selectedOrder.discountAmount > 0 ? "−" : ""}{displayPeso(selectedOrder.discountAmount)}</strong></div>
                      {selectedOrder.vatExemptSale > 0 && <div><span>VAT-exempt sale</span><strong className="tnums">{displayPeso(selectedOrder.vatExemptSale)}</strong></div>}
                      <div className="order-history-ticket__total"><span>Total</span><strong className="tnums">{displayPeso(selectedOrder.total)}</strong></div>
                    </div>
                  </div>

                  <div className="order-history-meta-grid">
                    <div><span>Payment</span><strong>{paymentLabel(selectedOrder.paymentMethod)}</strong></div>
                    {selectedOrder.paymentRef && <div><span>Reference</span><strong className="tnums">{selectedOrder.paymentRef}</strong></div>}
                    {selectedOrder.amountTendered !== null && <div><span>Tendered</span><strong className="tnums">{displayPeso(selectedOrder.amountTendered)}</strong></div>}
                    {selectedOrder.changeDue !== null && <div><span>Change</span><strong className="tnums text-success">{displayPeso(selectedOrder.changeDue)}</strong></div>}
                    <div><span>Cashier</span><strong>{selectedOrder.cashierId === profile.id ? profile.full_name ?? "Current cashier" : "Branch cashier"}</strong></div>
                    {selectedOrder.discountRef && <div><span>Discount reference</span><strong>{selectedOrder.discountRef}</strong></div>}
                  </div>
                  {selectedOrder.note && <div className="order-history-note"><span>Order note</span><p>{selectedOrder.note}</p></div>}
                </div>

                {voidDialogOpen && selectedOrder && (
                  <form className="order-history-void-panel" onSubmit={(event) => void submitVoid(event)}>
                    <div>
                      <p className="order-history-void-panel__eyebrow">Manager approval required</p>
                      <h3>Void {selectedOrder.orderNo}?</h3>
                      <p>This creates a permanent audited reversal, returns tracked stock, and removes the sale from net totals.</p>
                    </div>
                    <label>
                      <span>Reason</span>
                      <textarea
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                        maxLength={180}
                        rows={2}
                        placeholder="Example: Customer payment reversed at the counter"
                        required
                      />
                    </label>
                    <label>
                      <span>Manager or admin PIN</span>
                      <input
                        type="password"
                        value={voidPin}
                        onChange={(event) => setVoidPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="off"
                        pattern="[0-9]{4,6}"
                        minLength={4}
                        maxLength={6}
                        placeholder="4–6 digits"
                        required
                      />
                      <small>The PIN is checked server-side and never stored in the browser or audit log.</small>
                    </label>
                    {voidError && <p className="order-history-void-panel__error" role="alert">{voidError}</p>}
                    <div className="order-history-void-panel__actions">
                      <button type="button" className="order-history-button order-history-button--soft" onClick={closeVoidDialog} disabled={Boolean(voidingId)}>Cancel</button>
                      <button type="submit" className="order-history-button order-history-button--void" disabled={Boolean(voidingId) || voidReason.trim().length === 0 || !/^\d{4,6}$/.test(voidPin)}>
                        {voidingId ? "Voiding…" : "Approve & void"}
                      </button>
                    </div>
                  </form>
                )}

                <footer className="order-history-detail__footer">
                  <div><span>Receipt slip</span><small>Reprints are marked and logged for this order.</small></div>
                  <div className="order-history-detail__footer-actions">
                    {canVoidSelected && !voidDialogOpen && (
                      <button type="button" className="order-history-button order-history-button--void" onClick={openVoidDialog} disabled={voidingId !== null}>
                        Void order
                      </button>
                    )}
                    <button type="button" className="order-history-button order-history-button--reprint" onClick={() => void reprintSelected()} disabled={printingId !== null || selectedOrder.items.length === 0}>
                      <HistoryIcon name="printer" size={18} />
                      {printingId === selectedOrder.id ? "Printing…" : "Reprint receipt"}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <div className="order-history-detail__empty"><span className="order-history-empty__mark"><HistoryIcon name="receipt" size={26} /></span><strong>Select an order</strong><span>Choose a recent sale to review its items or reprint the receipt.</span></div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
