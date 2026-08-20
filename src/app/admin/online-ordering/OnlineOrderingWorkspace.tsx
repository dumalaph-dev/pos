"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import * as QRCode from "qrcode";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { OnlineMenuEditor } from "./OnlineMenuEditor";
import {
  formatOnlineEta,
  formatOrderStatusLabel,
  pickupSlotLabel,
  type OnlineOrderStatus,
  type OnlineOrderingSettings,
} from "@/lib/online-ordering";
import { formatPeso } from "@/lib/money";
import { updateOnlineOrderStatus, updateOnlineOrderingSettings } from "./actions";

type QueueOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  pickupSlot: string;
  status: OnlineOrderStatus;
  queuePosition: number;
  total: number;
  etaAt: string;
  createdAt: string;
  itemSummary: string;
};

type QueueFilter = "attention" | "preparing" | "ready" | "all";

const ACTIVE_QUEUE_STATUSES: OnlineOrderStatus[] = ["new", "confirmed", "preparing"];

export function OnlineOrderingWorkspace({
  store,
  settings,
  shareUrl,
  orders,
  queryError,
  savedMessage,
  errorMessage,
  canManage,
}: {
  store: { id: string; name: string; address: string | null; slug: string };
  settings: OnlineOrderingSettings;
  shareUrl: string;
  orders: QueueOrder[];
  queryError: string | null;
  savedMessage: string;
  errorMessage: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [copied, setCopied] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("attention");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    const interval = window.setInterval(refreshIfVisible, 15_000);
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

      <section className="mt-6 grid gap-5 xl:grid-cols-3" aria-label="Online ordering overview">
        <article className="relative overflow-hidden rounded-[24px] bg-primary p-6 text-primary-fg shadow-[var(--shadow-pop)] sm:p-8 xl:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[22px] border-accent/15" />
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-fg/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary-fg/80">
                <i className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-[#9bd1a0]" : "bg-accent"}`} />
                {enabled ? "Public menu live" : "Menu paused"}
              </span>
              <span className="text-xs font-semibold text-primary-fg/55">{store.name}</span>
            </div>
            <h2 className="mt-6 max-w-2xl text-3xl font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-[42px]">Turn your menu into a morning pickup lane.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-primary-fg/72 sm:text-base">Let customers order before the rush, see a realistic pickup ETA, and arrive when the bag is ready. Your team manages every web order from the same queue.</p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-accent-fg transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg">Open public menu <AdminIcon name="arrow" size={14} /></a>
              <button type="button" onClick={copyShareUrl} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-fg/20 bg-primary-fg/10 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-fg/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{copied ? "Link copied" : "Copy menu link"} <AdminIcon name={copied ? "check" : "arrow"} size={14} /></button>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-4">
              <HeroMetric label="In queue" value={String(activeOrders.length)} detail="needs prep" />
              <HeroMetric label="Ready now" value={String(readyOrders.length)} detail="pickup shelf" />
              <HeroMetric label="Prep promise" value={`${settings.averagePrepMinutes} min`} detail="average" />
              <HeroMetric label="Today online" value={formatPeso(todaySales).replace(/\.00$/, "")} detail="gross value" />
            </div>
          </div>
        </article>

        <aside className="rounded-[24px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 xl:col-span-1" aria-labelledby="menu-link-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Share everywhere</p>
              <h2 id="menu-link-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">Your public menu link</h2>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="bag" size={17} /></span>
          </div>
          <p className="mt-2 text-sm leading-5 text-ink-muted">Put the QR code at the counter, in your bio, or on a takeaway bag.</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-primary">{shareUrl.replace(/^https?:\/\//, "")}</span>
            <button type="button" onClick={copyShareUrl} className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-primary-soft hover:text-primary" aria-label="Copy public menu link"><AdminIcon name="check" size={14} /></button>
          </div>
          <div className="mt-4 flex items-end justify-between gap-4 rounded-2xl border border-line bg-[#fffdf8] p-3">
            <div className="grid min-h-[132px] min-w-[132px] place-items-center rounded-xl border border-line bg-white p-2">
              {qrCode ? <Image src={qrCode} alt={`QR code for the ${store.name} public menu`} width={128} height={128} unoptimized /> : <span className="text-center text-xs font-semibold text-ink-muted">Generating QR…</span>}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-extrabold text-ink">One scan to order</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">Download a print-ready PNG or open the menu to test the customer view.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={downloadQrCode} disabled={!qrCode} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="download" size={13} /> Download</button>
                <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft"><AdminIcon name="eye" size={13} /> Preview</a>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <OnlineMenuEditor store={store} settings={settings} canManage={canManage} />

      <section className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)] xl:col-span-2" aria-labelledby="pickup-queue-heading">
          <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Live pickup queue</p>
              <h2 id="pickup-queue-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">Keep the handoff calm.</h2>
              <p className="mt-1 text-sm leading-5 text-ink-muted">New online orders land here with their promised pickup time.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-[10px] font-extrabold text-primary" aria-live="polite"><i className="h-1.5 w-1.5 rounded-full bg-success" />{lastUpdatedAt ? `Live · last checked ${formatQueueLastUpdated(lastUpdatedAt)}` : "Live · checking every 15 sec"}</span>
              <button type="button" onClick={refreshQueue} disabled={refreshing} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60" aria-label="Refresh online order queue"><AdminIcon name="refresh" size={12} />{refreshing ? "Refreshing…" : "Refresh"}</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3 sm:px-6" role="tablist" aria-label="Filter pickup queue">
            <QueueFilterButton label="Needs attention" count={orders.filter((order) => order.status === "new" || order.status === "confirmed").length} active={filter === "attention"} onClick={() => setFilter("attention")} />
            <QueueFilterButton label="Preparing" count={orders.filter((order) => order.status === "preparing").length} active={filter === "preparing"} onClick={() => setFilter("preparing")} />
            <QueueFilterButton label="Ready" count={readyOrders.length} active={filter === "ready"} onClick={() => setFilter("ready")} />
            <QueueFilterButton label="All orders" count={orders.length} active={filter === "all"} onClick={() => setFilter("all")} />
          </div>

          {queryError ? (
            <div className="m-5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm leading-6 text-ink sm:m-6">The online queue table is not available yet. Apply <code className="font-extrabold">0055_online_ordering.sql</code> to start receiving public orders.</div>
          ) : filteredOrders.length === 0 ? (
            <QueueEmptyState filter={filter} />
          ) : (
            <div className="divide-y divide-line">
              {filteredOrders.map((order) => <QueueRow key={order.id} order={order} storeId={store.id} canManage={canManage} />)}
            </div>
          )}
        </section>

        <div className="grid gap-5 xl:col-span-1">
          <form action={updateOnlineOrderingSettings} className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="pickup-settings-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">Pickup settings</p>
                <h2 id="pickup-settings-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-ink">Set a promise your team can keep.</h2>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="clock" size={17} /></span>
            </div>
            <input type="hidden" name="store_id" value={store.id} />
            <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-line bg-raised px-3.5 py-3">
              <span><strong className="block text-sm font-extrabold text-ink">Accept online orders</strong><small className="mt-0.5 block text-xs text-ink-muted">Customers can place pickup orders now</small></span>
              <span className="relative inline-flex shrink-0">
                <input type="checkbox" name="enabled" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="peer sr-only" />
                <span className="h-6 w-11 rounded-full bg-line-strong transition peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
                <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
              </span>
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <SettingField label="Average prep time" name="average_prep_minutes" defaultValue={settings.averagePrepMinutes} suffix="min" min={5} max={180} />
              <SettingField label="Lead time" name="order_lead_minutes" defaultValue={settings.orderLeadMinutes} suffix="min" min={0} max={180} />
            </div>
            <label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor="pickup-note">Pickup note
              <textarea id="pickup-note" name="pickup_note" defaultValue={settings.pickupNote} rows={3} maxLength={240} className="mt-1.5 block w-full resize-y rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
            </label>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <p className="max-w-[24ch] text-[11px] leading-4 text-ink-muted">ETAs use active orders plus this average prep time.</p>
              <SettingsSaveButton />
            </div>
          </form>

          <aside className="rounded-[22px] border border-[#e2d7c5] bg-[#f7efe1] p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="flow-heading">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#a77c3f]">How the flow works</p>
            <h2 id="flow-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-primary">A clearer morning for everyone.</h2>
            <div className="mt-5 grid gap-3">
              <FlowStep number="01" title="Customer orders" detail="They choose a pickup time and get a queue number." />
              <FlowStep number="02" title="Team prepares" detail="The order moves from received to preparing in your queue." />
              <FlowStep number="03" title="Customer arrives" detail="Mark it ready, then hand it over when they show the number." />
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function formatQueueLastUpdated(value: string) {
  return new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function HeroMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-primary-fg/10 bg-primary-fg/10 px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-primary-fg/55">{label}</p><strong className="mt-1 block text-lg font-extrabold tracking-[-0.03em]">{value}</strong><small className="mt-0.5 block text-[10px] text-primary-fg/55">{detail}</small></div>;
}

function QueueFilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-primary text-primary-fg" : "text-ink-muted hover:bg-primary-soft hover:text-primary"}`}>{label}<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-primary-fg/15 text-primary-fg" : "bg-raised text-ink-muted"}`}>{count}</span></button>;
}

function QueueRow({ order, storeId, canManage }: { order: QueueOrder; storeId: string; canManage: boolean }) {
  const nextAction = order.status === "new" || order.status === "confirmed"
    ? { label: "Start preparing", status: "preparing" as OnlineOrderStatus }
    : order.status === "preparing"
      ? { label: "Mark ready", status: "ready" as OnlineOrderStatus }
      : order.status === "ready"
        ? { label: "Mark picked up", status: "picked_up" as OnlineOrderStatus }
        : null;
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm font-extrabold text-ink">{order.orderNo}</strong><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${statusClass}`}>{formatOrderStatusLabel(order.status)}</span></div>
            <p className="mt-1 text-sm font-semibold text-ink">{order.customerName} <span className="font-normal text-ink-muted">· {order.customerPhone}</span></p>
            <p className="mt-1 max-w-[48ch] truncate text-xs text-ink-muted">{order.itemSummary}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs lg:min-w-[260px] lg:border-t-0 lg:pt-0">
          <div><span className="block text-[9px] font-extrabold uppercase tracking-[0.1em] text-ink-subtle">Pickup</span><strong className="mt-1 block truncate text-xs font-extrabold text-ink">{pickupSlotLabel(order.pickupSlot)}</strong></div>
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

function SettingField({ label, name, defaultValue, suffix, min, max }: { label: string; name: string; defaultValue: number; suffix: string; min: number; max: number }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted" htmlFor={name}>{label}<span className="relative mt-1.5 block"><input id={name} name={name} type="number" defaultValue={defaultValue} min={min} max={max} step="1" required className="block w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 pr-12 text-sm font-extrabold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[10px] font-bold normal-case tracking-normal text-ink-muted">{suffix}</span></span></label>;
}

function SettingsSaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save settings"}<AdminIcon name="check" size={14} /></button>;
}

function FlowStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-[#e3d7c3] bg-[#fffaf1]/70 px-3.5 py-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-[10px] font-extrabold text-primary-fg">{number}</span><span><strong className="block text-sm font-extrabold text-primary">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-ink-muted">{detail}</span></span></div>;
}
