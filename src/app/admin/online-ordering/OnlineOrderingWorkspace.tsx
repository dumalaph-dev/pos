"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import * as QRCode from "qrcode";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { OnlineOrderAlertBanner } from "@/components/online-ordering/OnlineOrderAlertBanner";
import { useOnlineOrderAttention } from "@/components/online-ordering/useOnlineOrderAttention";
import { OnlineMenuEditor } from "./OnlineMenuEditor";
import {
  formatOnlineEta,
  formatOrderStatusLabel,
  getOnlineOrderNextAction,
  pickupSlotLabel,
  type OnlineOrderingBrandDefaults,
  type OnlineOrderingFulfillmentMethod,
  type OnlineOrderStatus,
  type OnlineOrderingSettings,
} from "@/lib/online-ordering";
import { ONLINE_ORDER_ALERT_POLL_MS } from "@/lib/online-order-alerts";
import { formatPeso } from "@/lib/money";
import { updateOnlineOrderStatus, updateOnlineOrderingSettings } from "./actions";

type QueueOrder = {
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
  total: number;
  etaAt: string;
  createdAt: string;
  itemSummary: string;
};

type QueueFilter = "attention" | "preparing" | "ready" | "all";
type WorkspaceTab = "queue" | "appearance";

const ACTIVE_QUEUE_STATUSES: OnlineOrderStatus[] = ["new", "confirmed", "preparing"];

export function OnlineOrderingWorkspace({
  store,
  settings,
  onlineBrandDefaults,
  shareUrl,
  orders,
  queryError,
  savedMessage,
  errorMessage,
  canManage,
  canUploadLogo,
}: {
  store: { id: string; orgId: string; name: string; address: string | null; slug: string };
  settings: OnlineOrderingSettings;
  onlineBrandDefaults: OnlineOrderingBrandDefaults;
  shareUrl: string;
  orders: QueueOrder[];
  queryError: string | null;
  savedMessage: string;
  errorMessage: string;
  canManage: boolean;
  canUploadLogo: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [deliveryEnabled, setDeliveryEnabled] = useState(settings.delivery.enabled);
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => savedMessage.toLowerCase().includes("appearance") ? "appearance" : "queue");
  const tabRefs = useRef<Record<WorkspaceTab, HTMLButtonElement | null>>({ queue: null, appearance: null });
  const {
    pendingOrders: newPickupOrders,
    announcement: attentionAnnouncement,
    attentionPulse,
  } = useOnlineOrderAttention({
    orders,
    scopeKey: `${store.orgId}:${store.id}`,
    enabled: !queryError,
  });

  function refreshQueue() {
    setRefreshing(true);
    setLastUpdatedAt(new Date().toISOString());
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  }

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      setLastUpdatedAt(new Date().toISOString());
      router.refresh();
    };
    const interval = window.setInterval(refreshIfVisible, ONLINE_ORDER_ALERT_POLL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#173a2b", light: "#fffdf8" },
    }).then((dataUrl) => {
      if (!cancelled) setQrCode(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrCode(null);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  const activeOrders = orders.filter((order) => ACTIVE_QUEUE_STATUSES.includes(order.status));
  const readyOrders = orders.filter((order) => order.status === "ready");
  const todaySales = orders
    .filter((order) => order.status !== "cancelled")
    .reduce((sum, order) => sum + order.total, 0);
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "attention") return orders.filter((order) => order.status === "new" || order.status === "confirmed");
    if (filter === "preparing") return orders.filter((order) => order.status === "preparing");
    return orders.filter((order) => order.status === "ready");
  }, [filter, orders]);
  const attentionCount = orders.filter((order) => order.status === "new" || order.status === "confirmed").length;
  const preparingCount = orders.filter((order) => order.status === "preparing").length;

  function handleWorkspaceTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: WorkspaceTab) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = current === "queue" ? "appearance" : "queue";
    setActiveTab(next);
    window.setTimeout(() => tabRefs.current[next]?.focus(), 0);
  }

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  function downloadQrCode() {
    if (!qrCode) return;
    const link = document.createElement("a");
    link.href = qrCode;
    link.download = `${store.slug}-menu-qr.png`;
    link.click();
  }

  return (
    <>
      {(savedMessage || errorMessage || queryError) && (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${errorMessage || queryError ? "border-danger/25 bg-danger-soft text-danger" : "border-success/25 bg-success/10 text-success"}`} role={errorMessage || queryError ? "alert" : "status"}>
          {errorMessage || queryError || savedMessage}
        </div>
      )}

      <OnlineOrderAlertBanner
        surface="admin"
        orders={newPickupOrders}
        announcement={attentionAnnouncement}
        attentionPulse={attentionPulse}
      />

      <div className="mt-6 rounded-[20px] border border-line bg-surface p-1.5 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Online ordering workspace">
          <WorkspaceTabButton
            id="online-ordering-queue-tab"
            panelId="online-ordering-queue-panel"
            label="Order queue"
            detail={`${attentionCount} need attention · ${activeOrders.length} active`}
            icon="bag"
            active={activeTab === "queue"}
            onClick={() => setActiveTab("queue")}
            onKeyDown={(event) => handleWorkspaceTabKeyDown(event, "queue")}
            buttonRef={(node) => { tabRefs.current.queue = node; }}
          />
          <WorkspaceTabButton
            id="online-ordering-appearance-tab"
            panelId="online-ordering-appearance-panel"
            label="Theme & copy"
            detail="Customer-facing menu"
            icon="edit"
            active={activeTab === "appearance"}
            onClick={() => setActiveTab("appearance")}
            onKeyDown={(event) => handleWorkspaceTabKeyDown(event, "appearance")}
            buttonRef={(node) => { tabRefs.current.appearance = node; }}
          />
        </div>
      </div>

      <QueueDashboard
        hidden={activeTab !== "queue"}
        store={store}
        settings={settings}
        shareUrl={shareUrl}
        orders={orders}
        queryError={queryError}
        canManage={canManage}
        enabled={enabled}
        setEnabled={setEnabled}
        deliveryEnabled={deliveryEnabled}
        setDeliveryEnabled={setDeliveryEnabled}
        activeOrders={activeOrders}
        readyOrders={readyOrders}
        attentionCount={attentionCount}
        preparingCount={preparingCount}
        todaySales={todaySales}
        filteredOrders={filteredOrders}
        filter={filter}
        setFilter={setFilter}
        lastUpdatedAt={lastUpdatedAt}
        refreshing={refreshing}
        refreshQueue={refreshQueue}
        copied={copied}
        copyShareUrl={copyShareUrl}
        qrCode={qrCode}
        downloadQrCode={downloadQrCode}
      />

      <section id="online-ordering-appearance-panel" role="tabpanel" aria-labelledby="online-ordering-appearance-tab" tabIndex={0} hidden={activeTab !== "appearance"} className="mt-5 outline-none">
        <div className="flex flex-col gap-4 rounded-[22px] border border-line bg-primary p-5 text-primary-fg shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-fg/60">Customer-facing menu</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em]">Shape what customers see.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-primary-fg/70">Choose a POS-synced theme and tune the welcome copy for the public QR menu. Preview changes on a phone before publishing.</p>
          </div>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg">View live menu <AdminIcon name="arrow" size={14} /></a>
        </div>
        <OnlineMenuEditor store={store} settings={settings} onlineBrandDefaults={onlineBrandDefaults} canManage={canManage} canUploadLogo={canUploadLogo} />
      </section>
    </>
  );
}

function formatQueueLastUpdated(value: string) {
  return new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function WorkspaceTabButton({ id, panelId, label, detail, icon, active, onClick, onKeyDown, buttonRef }: { id: string; panelId: string; label: string; detail: string; icon: AdminIconName; active: boolean; onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void; buttonRef: (node: HTMLButtonElement | null) => void }) {
  return <button ref={buttonRef} type="button" role="tab" id={id} aria-controls={panelId} aria-selected={active} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={onKeyDown} className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4 ${active ? "bg-primary text-primary-fg shadow-sm" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}><span className="flex min-w-0 items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-primary-fg/12" : "bg-raised text-primary"}`}><AdminIcon name={icon} size={16} /></span><span className="min-w-0"><strong className="block truncate text-sm font-extrabold">{label}</strong><small className={`mt-0.5 block truncate text-[10px] font-semibold ${active ? "text-primary-fg/65" : "text-ink-subtle"}`}>{detail}</small></span></span><AdminIcon name="chevron" size={16} /></button>;
}

type QueueDashboardProps = {
  hidden: boolean;
  store: { id: string; orgId: string; name: string; address: string | null; slug: string };
  settings: OnlineOrderingSettings;
  shareUrl: string;
  orders: QueueOrder[];
  queryError: string | null;
  canManage: boolean;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  deliveryEnabled: boolean;
  setDeliveryEnabled: (value: boolean) => void;
  activeOrders: QueueOrder[];
  readyOrders: QueueOrder[];
  attentionCount: number;
  preparingCount: number;
  todaySales: number;
  filteredOrders: QueueOrder[];
  filter: QueueFilter;
  setFilter: (value: QueueFilter) => void;
  lastUpdatedAt: string | null;
  refreshing: boolean;
  refreshQueue: () => void;
  copied: boolean;
  copyShareUrl: () => Promise<void>;
  qrCode: string | null;
  downloadQrCode: () => void;
};

function QueueDashboard({ hidden, store, settings, shareUrl, orders, queryError, canManage, enabled, setEnabled, deliveryEnabled, setDeliveryEnabled, activeOrders, readyOrders, attentionCount, preparingCount, todaySales, filteredOrders, filter, setFilter, lastUpdatedAt, refreshing, refreshQueue, copied, copyShareUrl, qrCode, downloadQrCode }: QueueDashboardProps) {
  return (
    <section id="online-ordering-queue-panel" role="tabpanel" aria-labelledby="online-ordering-queue-tab" tabIndex={0} hidden={hidden} className="mt-5 outline-none">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Order operations</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-extrabold ${enabled ? "bg-success/10 text-success" : "bg-warning/15 text-warning"}`}><i className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-success" : "bg-warning"}`} />{enabled ? "Accepting orders" : "Menu paused"}</span></div>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-ink sm:text-3xl">Order queue</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">Keep the next handoff visible: confirm the order, move it through prep, then complete pickup or delivery.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary-soft px-3 py-2 text-[10px] font-extrabold text-primary" aria-live="polite"><i className="h-1.5 w-1.5 rounded-full bg-success" />{lastUpdatedAt ? `Live · ${formatQueueLastUpdated(lastUpdatedAt)}` : "Live · checking every 15 sec"}</span>
          <button type="button" onClick={refreshQueue} disabled={refreshing} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60" aria-label="Refresh online order queue"><AdminIcon name="refresh" size={12} />{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <QueueMetric label="Needs attention" value={String(attentionCount)} detail="new or confirmed" tone="attention" />
        <QueueMetric label="Preparing" value={String(preparingCount)} detail="in the prep line" tone="preparing" />
        <QueueMetric label="Ready now" value={String(readyOrders.length)} detail="pickup shelf" tone="ready" />
        <QueueMetric label="Today online" value={formatPeso(todaySales).replace(/\.00$/, "")} detail={`${activeOrders.length} active orders`} tone="value" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.8fr)] xl:items-start">
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="pickup-queue-heading">
          <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Live pickup queue</p>
              <h3 id="pickup-queue-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">Orders to prepare</h3>
              <p className="mt-1 text-sm leading-5 text-ink-muted">New online orders land here with their promised pickup or delivery time.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[10px] font-extrabold text-ink-muted"><AdminIcon name="clock" size={12} />{activeOrders.length ? `${activeOrders.length} active` : "Queue is clear"}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3 sm:px-6" role="tablist" aria-label="Filter pickup queue">
            <QueueFilterButton label="Needs attention" count={attentionCount} active={filter === "attention"} onClick={() => setFilter("attention")} />
            <QueueFilterButton label="Preparing" count={preparingCount} active={filter === "preparing"} onClick={() => setFilter("preparing")} />
            <QueueFilterButton label="Ready" count={readyOrders.length} active={filter === "ready"} onClick={() => setFilter("ready")} />
            <QueueFilterButton label="All orders" count={orders.length} active={filter === "all"} onClick={() => setFilter("all")} />
          </div>

          {queryError ? (
            <div className="m-5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm leading-6 text-ink sm:m-6">The online queue table is not available yet. Apply the latest online-ordering migrations, including <code className="font-extrabold">0059_online_order_delivery.sql</code> and <code className="font-extrabold">0060_readable_online_order_numbers.sql</code>, to receive pickup and delivery orders.</div>
          ) : filteredOrders.length === 0 ? (
            <QueueEmptyState filter={filter} />
          ) : (
            <div className="divide-y divide-line">
              {filteredOrders.map((order) => <QueueRow key={order.id} order={order} storeId={store.id} canManage={canManage} />)}
            </div>
          )}
        </section>

        <div className="grid gap-5">
          <QueueShareCard store={store} shareUrl={shareUrl} qrCode={qrCode} copied={copied} copyShareUrl={copyShareUrl} downloadQrCode={downloadQrCode} />

          <form action={updateOnlineOrderingSettings} className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="pickup-settings-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Fulfillment settings</p>
                <h3 id="pickup-settings-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">Set promises your team can keep.</h3>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="clock" size={17} /></span>
            </div>
            <input type="hidden" name="store_id" value={store.id} />
            <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-line bg-raised px-3.5 py-3">
              <span><strong className="block text-sm font-extrabold text-ink">Accept online orders</strong><small className="mt-0.5 block text-xs text-ink-muted">Customers can place pickup or delivery orders now</small></span>
              <span className="relative inline-flex shrink-0">
                <input type="checkbox" name="enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="peer sr-only" />
                <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
                <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
              </span>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SettingField label="Average prep time" name="average_prep_minutes" defaultValue={settings.averagePrepMinutes} suffix="min" min={5} max={180} />
              <SettingField label="Lead time" name="order_lead_minutes" defaultValue={settings.orderLeadMinutes} suffix="min" min={0} max={180} />
            </div>
            <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="pickup-note">Pickup note
              <textarea id="pickup-note" name="pickup_note" defaultValue={settings.pickupNote} rows={3} maxLength={240} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
              <label className="flex items-center justify-between gap-4">
                <span><strong className="block text-sm font-extrabold text-ink">Offer delivery</strong><small className="mt-0.5 block text-xs text-ink-muted">Add a delivery choice to the customer checkout</small></span>
                <span className="relative inline-flex shrink-0">
                  <input type="checkbox" name="delivery_enabled" checked={deliveryEnabled} onChange={(event) => setDeliveryEnabled(event.target.checked)} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
                  <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                </span>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SettingField label="Delivery fee" name="delivery_fee" defaultValue={settings.delivery.feeCentavos / 100} suffix="₱" min={0} max={10000} step={0.01} />
                <SettingField label="Delivery ETA buffer" name="delivery_eta_minutes" defaultValue={settings.delivery.etaMinutes} suffix="min" min={15} max={180} />
              </div>
              <label className="mt-3 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="delivery-note">Delivery note
                <textarea id="delivery-note" name="delivery_note" defaultValue={settings.delivery.note} rows={2} maxLength={240} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
              </label>
              <p className="mt-2 text-[11px] leading-4 text-ink-muted">Delivery uses pay-on-delivery for now. Online payments can be added later.</p>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="max-w-[28ch] text-[11px] leading-4 text-ink-muted">ETAs use active orders, prep time, and the delivery buffer when applicable.</p>
              <SettingsSaveButton />
            </div>
          </form>

          <aside className="rounded-[22px] border border-[#e2d7c5] bg-[#f7efe1] p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="flow-heading">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a77c3f]">How the flow works</p>
            <h3 id="flow-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-primary">A clearer morning for everyone.</h3>
            <div className="mt-5 grid gap-3">
              <FlowStep number="01" title="Customer orders" detail="They choose a pickup time and get a queue number." />
              <FlowStep number="02" title="Team prepares" detail="The order moves from received to preparing in your queue." />
              <FlowStep number="03" title="Customer arrives" detail="Mark it ready, then hand it over when they show the number." />
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function QueueMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "attention" | "preparing" | "ready" | "value" }) {
  const classes = {
    attention: "border-danger/15 bg-danger-soft text-danger",
    preparing: "border-accent/15 bg-accent/10 text-accent-hover",
    ready: "border-success/15 bg-success/10 text-success",
    value: "border-primary/10 bg-primary-soft text-primary",
  }[tone];
  return <article className={`rounded-2xl border px-3.5 py-3.5 ${classes}`}><p className="text-[10px] font-extrabold uppercase tracking-[0.09em] opacity-70">{label}</p><strong className="mt-1 block text-xl font-extrabold tracking-[-0.04em]">{value}</strong><small className="mt-0.5 block text-[10px] font-semibold opacity-70">{detail}</small></article>;
}

function QueueShareCard({ store, shareUrl, qrCode, copied, copyShareUrl, downloadQrCode }: { store: { name: string; slug: string }; shareUrl: string; qrCode: string | null; copied: boolean; copyShareUrl: () => Promise<void>; downloadQrCode: () => void }) {
  return <aside className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="menu-link-heading"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Share the menu</p><h3 id="menu-link-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">One scan to order</h3></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="bag" size={17} /></span></div><p className="mt-2 text-sm leading-5 text-ink-muted">Put this QR code at the counter, in your bio, or on a takeaway bag.</p><div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary">{shareUrl.replace(/^https?:\/\//, "")}</span><button type="button" onClick={copyShareUrl} className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-primary-soft hover:text-primary" aria-label="Copy public menu link">{copied ? <AdminIcon name="check" size={14} /> : <AdminIcon name="edit" size={14} />}</button></div><div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-line bg-[#fffdf8] p-3 sm:flex-row xl:flex-col 2xl:flex-row"><div className="grid min-h-[132px] min-w-[132px] place-items-center rounded-xl border border-line bg-white p-2">{qrCode ? <Image src={qrCode} alt={`QR code for the ${store.name} public menu`} width={128} height={128} unoptimized /> : <span className="text-center text-xs font-semibold text-ink-muted">Generating QR…</span>}</div><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-ink">Print or preview</p><p className="mt-1 text-xs leading-5 text-ink-muted">Test the customer view before sharing it with guests.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={downloadQrCode} disabled={!qrCode} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="download" size={13} /> Download</button><a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft"><AdminIcon name="eye" size={13} /> Preview</a></div></div></div></aside>;
}

function QueueFilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-primary text-primary-fg" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-primary-fg/15 text-primary-fg" : "bg-raised text-ink-muted"}`}>{count}</span></button>;
}

function QueueRow({ order, storeId, canManage }: { order: QueueOrder; storeId: string; canManage: boolean }) {
  const nextAction = getOnlineOrderNextAction(order.status, order.fulfillmentMethod);
  const statusClass = order.status === "ready"
    ? "bg-success/10 text-success"
    : order.status === "preparing"
      ? "bg-accent/15 text-accent-hover"
      : order.status === "cancelled"
        ? "bg-danger-soft text-danger"
        : "bg-primary-soft text-primary";

  return (
    <article className="px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-extrabold text-primary-fg">{order.queuePosition}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm font-extrabold text-ink">{order.orderNo}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${statusClass}`}>{formatOrderStatusLabel(order.status)}</span><span className="rounded-full bg-raised px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-ink-muted">{order.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}</span></div>
            <p className="mt-1 text-sm font-semibold text-ink">{order.customerName} <span className="font-normal text-ink-muted">· {order.customerPhone}</span></p>
            <p className="mt-1 max-w-[48ch] truncate text-xs text-ink-muted">{order.itemSummary}</p>
            {order.fulfillmentMethod === "delivery" && order.deliveryAddress && <p className="mt-1 max-w-[52ch] truncate text-xs font-semibold text-primary">Deliver to: {order.deliveryAddress}{order.deliveryNote ? ` · ${order.deliveryNote}` : ""}{order.deliveryFee > 0 ? ` · ${formatPeso(order.deliveryFee)} delivery` : ""}</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs lg:min-w-[260px] lg:border-t-0 lg:pt-0">
          <div><span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">{order.fulfillmentMethod === "delivery" ? "Delivery" : "Pickup"}</span><strong className="mt-1 block truncate text-xs font-extrabold text-ink">{pickupSlotLabel(order.pickupSlot)}</strong></div>
          <div><span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">ETA</span><strong className="mt-1 block text-xs font-extrabold text-success">{formatOnlineEta(order.etaAt)}</strong></div>
          <div><span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">Total</span><strong className="mt-1 block text-xs font-extrabold text-ink">{formatPeso(order.total)}</strong></div>
        </div>
      </div>
      {canManage && order.status !== "cancelled" && order.status !== "picked_up" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pl-[52px]">
          <a href={`/pos?onlineOrder=${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="bag" size={12} />Open in POS</a>
          {nextAction && <form action={updateOnlineOrderStatus} className="flex items-center gap-2">
            <input type="hidden" name="store_id" value={storeId} />
            <input type="hidden" name="order_id" value={order.id} />
            {order.status === "new" && <button type="submit" name="status" value="cancelled" className="min-h-9 rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-danger transition hover:bg-danger-soft">Cancel</button>}
            <QueueActionButton label={nextAction.label} status={nextAction.status} />
          </form>}
        </div>
      )}
    </article>
  );
}

function QueueActionButton({ label, status }: { label: string; status: OnlineOrderStatus }) {
  const { pending } = useFormStatus();
  return <button type="submit" name="status" value={status} disabled={pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : label}<AdminIcon name="arrow" size={12} /></button>;
}

function QueueEmptyState({ filter }: { filter: QueueFilter }) {
  const title = filter === "ready" ? "Nothing waiting on the pickup shelf" : filter === "preparing" ? "The prep line is clear" : filter === "all" ? "No online orders yet" : "No orders need attention";
  const detail = filter === "all" ? "Once a customer orders from the public menu, their queue number and ETA will appear here." : "You are caught up. New orders will show up in this queue when customers place them.";
  return <div className="px-6 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary"><AdminIcon name="check" size={19} /></span><p className="mt-3 text-sm font-extrabold text-ink">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-muted">{detail}</p></div>;
}

function SettingField({ label, name, defaultValue, suffix, min, max, step = 1 }: { label: string; name: string; defaultValue: number; suffix: string; min: number; max: number; step?: number }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor={name}>{label}<span className="relative mt-1.5 block"><input id={name} name={name} type="number" defaultValue={defaultValue} min={min} max={max} step={step} required className="block w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 pr-12 text-sm font-extrabold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[10px] font-bold normal-case tracking-normal text-ink-muted">{suffix}</span></span></label>;
}

function SettingsSaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save settings"}<AdminIcon name="check" size={14} /></button>;
}

function FlowStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-[#e3d7c3] bg-[#fffaf1]/70 px-3.5 py-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-[10px] font-extrabold text-primary-fg">{number}</span><span><strong className="block text-sm font-extrabold text-primary">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-ink-muted">{detail}</span></span></div>;
}
