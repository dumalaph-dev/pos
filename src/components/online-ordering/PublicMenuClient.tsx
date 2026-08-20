"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  formatOnlineEta,
  formatOrderStatusLabel,
  pickupSlotLabel,
  type OnlineOrderStatus,
  type PublicMenuProduct,
  type PublicMenuStore,
  type PublicOnlineOrderResult,
} from "@/lib/online-ordering";
import { formatPeso } from "@/lib/money";
import { getPublicMenuThemeVariables } from "@/lib/online-ordering-theme";
import { placeOnlineOrder } from "@/app/menu/[storeSlug]/actions";

type CartLine = {
  product: PublicMenuProduct;
  qty: number;
};

type TrackState = {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  orderNo: string;
  orderStatus: OnlineOrderStatus | null;
  etaAt: string | null;
  queuePosition: number | null;
};

const INITIAL_ORDER_STATE: PublicOnlineOrderResult = { ok: false, message: "" };
const PICKUP_SLOTS = ["asap", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];
const TRACKED_STATUSES: OnlineOrderStatus[] = ["new", "confirmed", "preparing", "ready", "picked_up", "cancelled"];
const INITIAL_TRACK_STATE: TrackState = { status: "idle", message: "", orderNo: "", orderStatus: null, etaAt: null, queuePosition: null };

export function PublicMenuClient({ menu }: { menu: PublicMenuStore }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState("");
  const [orderState, formAction, pending] = useActionState(placeOnlineOrder, INITIAL_ORDER_STATE);
  const [trackedStatus, setTrackedStatus] = useState<OnlineOrderStatus>("new");
  const [trackedEta, setTrackedEta] = useState<string | null>(null);
  const [trackedQueuePosition, setTrackedQueuePosition] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackOrderNo, setTrackOrderNo] = useState("");
  const [trackPhone, setTrackPhone] = useState("");
  const [trackState, setTrackState] = useState<TrackState>(INITIAL_TRACK_STATE);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return menu.products.filter((product) => {
      const matchesCategory = category === "all" || product.categoryId === category;
      const matchesSearch = !normalizedSearch || product.name.toLowerCase().includes(normalizedSearch) || product.categoryName?.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [category, menu.products, search]);
  const cartTotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const copy = menu.settings.copy;
  const branding = menu.settings.branding;
  const brandName = branding.brandName || menu.name;
  const themeStyle = getPublicMenuThemeVariables(menu.settings.theme, branding) as CSSProperties;

  useEffect(() => {
    if (!orderState.ok || !orderState.orderId || orderState.orderId.startsWith("demo-")) return;
    let cancelled = false;
    const endpoint = `/api/menu/${encodeURIComponent(menu.slug)}/orders/${encodeURIComponent(orderState.orderId)}`;

    async function readStatus() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { status?: OnlineOrderStatus; etaAt?: string; queuePosition?: number };
        if (cancelled) return;
        if (data.status && TRACKED_STATUSES.includes(data.status)) setTrackedStatus(data.status);
        if (data.etaAt) setTrackedEta(data.etaAt);
        if (typeof data.queuePosition === "number") setTrackedQueuePosition(data.queuePosition);
      } catch {
        // The confirmation remains useful even when a status refresh is offline.
      }
    }

    const interval = window.setInterval(readStatus, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [menu.slug, orderState]);

  function openCheckout() {
    setCheckoutRequestId((current) => current || crypto.randomUUID());
    setDrawerOpen(true);
  }

  function addToCart(product: PublicMenuProduct) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, qty: Math.min(20, line.qty + 1) } : line);
      return [...current, { product, qty: 1 }];
    });
  }

  function updateQuantity(productId: string, direction: -1 | 1) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const qty = line.qty + direction;
      return qty > 0 ? [{ ...line, qty: Math.min(20, qty) }] : [];
    }));
  }

  async function copyOrderNumber() {
    if (!orderState.orderNo) return;
    try {
      await navigator.clipboard.writeText(orderState.orderNo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  async function findOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const orderNo = trackOrderNo.trim().toUpperCase();
    const phone = trackPhone.trim();
    if (!orderNo || !phone) {
      setTrackState({ ...INITIAL_TRACK_STATE, status: "error", message: "Enter your order number and mobile number to continue." });
      return;
    }

    setTrackState({ ...INITIAL_TRACK_STATE, status: "loading", orderNo });
    try {
      const query = new URLSearchParams({ order: orderNo, phone });
      const response = await fetch(`/api/menu/${encodeURIComponent(menu.slug)}/track?${query.toString()}`, { cache: "no-store" });
      const data = await response.json() as { ok?: boolean; message?: string; orderNo?: string; status?: OnlineOrderStatus; etaAt?: string | null; queuePosition?: number | null };
      if (!response.ok || !data.ok || !data.status) throw new Error(data.message || "Order not found");
      setTrackState({
        status: "success",
        message: "",
        orderNo: data.orderNo ?? orderNo,
        orderStatus: data.status,
        etaAt: data.etaAt ?? null,
        queuePosition: typeof data.queuePosition === "number" ? data.queuePosition : null,
      });
    } catch {
      setTrackState({ ...INITIAL_TRACK_STATE, status: "error", message: "We couldn’t find that order. Check the number and mobile number, then try again." });
    }
  }

  const orderingPaused = !menu.settings.enabled;

  return (
    <main className="public-menu min-h-[100svh] overflow-x-hidden" data-public-menu-theme={menu.settings.theme} style={themeStyle}>
      <header className="public-menu__safe-top sticky top-0 z-30 border-b border-[var(--public-menu-border)]/90 bg-[var(--public-menu-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-6 sm:py-3 lg:px-8">
          <div className="flex min-w-0 max-w-[42vw] items-center gap-2.5 sm:max-w-none sm:gap-3">
            <PublicBrandMark branding={branding} name={brandName} />
            <div className="min-w-0"><p className="truncate text-[13px] font-extrabold tracking-[-0.02em] sm:text-sm">{brandName}</p><p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--public-menu-subtle)] sm:text-[10px] sm:tracking-[0.12em]">{branding.brandTagline || copy.headerTagline}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[9px] font-extrabold sm:px-3 sm:text-[10px] ${orderingPaused ? "bg-[var(--public-menu-danger-soft)] text-[var(--public-menu-danger)]" : "bg-[var(--public-menu-primary-soft)] text-[var(--public-menu-primary)]"}`}><i className={`h-1.5 w-1.5 rounded-full ${orderingPaused ? "bg-[var(--public-menu-danger)]" : "bg-[var(--public-menu-success)]"}`} /><span className="sm:hidden">{orderingPaused ? "Paused" : "Open"}</span><span className="hidden sm:inline">{orderingPaused ? "Ordering paused" : "Open for pickup"}</span></span>
            <button type="button" onClick={() => setTrackOpen(true)} aria-label="Track an order" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-2.5 text-xs font-extrabold text-[var(--public-menu-primary)] transition hover:bg-[var(--public-menu-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-menu-primary)] sm:px-3"><span className="sm:hidden">Track</span><span className="hidden sm:inline">Track order</span></button>
            <button type="button" onClick={openCheckout} disabled={!cartCount && !orderState.ok} aria-label={`Open cart${cartCount > 0 ? `, ${cartCount} item${cartCount === 1 ? "" : "s"}` : ""}`} className="relative inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--public-menu-primary)] px-3 py-2.5 text-xs font-extrabold text-[var(--public-menu-primary-text)] transition hover:bg-[var(--public-menu-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--public-menu-border-strong)] disabled:text-[var(--public-menu-subtle)] sm:gap-2 sm:px-4"><AdminIcon name="bag" size={15} />Cart{cartCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--public-menu-accent)] px-1 text-[10px] text-[var(--public-menu-primary)]">{cartCount}</span>}</button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[var(--public-menu-border)] bg-[var(--public-menu-panel)]">
        <div className="pointer-events-none absolute -right-28 -top-24 h-64 w-64 rounded-full border-[20px] border-[var(--public-menu-accent)]/15 sm:-right-24 sm:-top-32 sm:h-80 sm:w-80 sm:border-[28px]" />
        <div className="pointer-events-none absolute -bottom-32 left-[45%] h-56 w-56 rounded-full bg-[var(--public-menu-accent)]/10 blur-3xl sm:-bottom-40 sm:h-72 sm:w-72" />
        <div className="relative mx-auto grid max-w-[1240px] gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-14 lg:grid-cols-3 lg:items-end lg:px-8 lg:py-[76px]">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full bg-[var(--public-menu-primary)] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--public-menu-primary-text)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--public-menu-accent)]" />{copy.heroEyebrow}</span><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-extrabold sm:hidden ${orderingPaused ? "bg-[var(--public-menu-danger-soft)] text-[var(--public-menu-danger)]" : "bg-[var(--public-menu-primary-soft)] text-[var(--public-menu-primary)]"}`}><i className={`h-1.5 w-1.5 rounded-full ${orderingPaused ? "bg-[var(--public-menu-danger)]" : "bg-[var(--public-menu-success)]"}`} />{orderingPaused ? "Ordering paused" : "Open for pickup"}</span></div>
            <h1 className="mt-4 max-w-3xl text-[2.8rem] font-black leading-[0.95] tracking-[-0.07em] text-[var(--public-menu-primary)] sm:mt-5 sm:text-6xl">{copy.heroTitle}<br /><span className="text-[var(--public-menu-accent-dark)]">{copy.heroAccent}</span></h1>
            <p className="mt-4 max-w-xl text-[13px] leading-6 text-[var(--public-menu-muted)] sm:mt-5 sm:text-base sm:leading-7">{copy.heroDescription}</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[var(--public-menu-muted)] sm:mt-6 sm:gap-x-5"><span className="inline-flex items-center gap-2"><AdminIcon name="clock" size={15} />Usually ready in {menu.settings.averagePrepMinutes} min</span><span className="inline-flex items-center gap-2"><AdminIcon name="bag" size={15} />Pay at pickup</span></div>
          </div>
          <div className="rounded-[var(--public-menu-radius-card)] border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-primary-text)]/80 p-4 shadow-[var(--public-menu-shadow-card)] backdrop-blur-sm sm:rounded-[var(--public-menu-radius-card)] sm:p-5 lg:col-span-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--public-menu-accent-dark)]">{copy.pickupTitle}</p><p className="mt-2 text-base font-extrabold tracking-[-0.025em] text-[var(--public-menu-primary)] sm:text-lg">{menu.address || "Pickup at the counter"}</p><p className="mt-2 text-xs leading-5 text-[var(--public-menu-muted)]">{menu.settings.pickupNote}</p><div className="mt-4 flex items-center gap-2 border-t border-[var(--public-menu-border)] pt-4 text-xs font-bold text-[var(--public-menu-success)]"><span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--public-menu-primary-soft)]"><AdminIcon name="check" size={13} /></span>Freshly confirmed before you arrive</div></div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-3 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-24 sm:pt-7 lg:px-8">
        {orderingPaused && <div className="mb-5 rounded-2xl border border-[var(--public-menu-danger-soft)] bg-[var(--public-menu-danger-soft)] px-3.5 py-3 text-[13px] leading-6 text-[var(--public-menu-danger)] sm:mb-6 sm:px-4 sm:text-sm">Online ordering is paused for now. You can still browse the menu, then check back when the store opens ordering again.</div>}

        <div className="grid min-w-0 gap-6 lg:grid-cols-3 lg:items-start lg:gap-8">
          <section className="min-w-0 lg:col-span-2" aria-labelledby="menu-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--public-menu-accent-dark)]">{copy.menuEyebrow}</p><h2 id="menu-heading" className="mt-1 text-[1.65rem] font-black tracking-[-0.045em] text-[var(--public-menu-primary)] sm:text-3xl">{copy.menuHeading}</h2></div><label className="relative block w-full sm:w-56" htmlFor="menu-search"><span className="sr-only">{copy.searchPlaceholder}</span><input id="menu-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} className="h-12 w-full rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-3.5 text-sm font-semibold text-[var(--public-menu-primary)] outline-none transition placeholder:text-[var(--public-menu-subtle)] focus:border-[var(--public-menu-primary)] focus:ring-2 focus:ring-[var(--public-menu-primary)]/10" /></label></div>
            <div className="public-menu__scrollbar-hidden -mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:mt-5 sm:px-0" role="tablist" aria-label="Menu categories"><CategoryButton label="All items" active={category === "all"} onClick={() => setCategory("all")} />{menu.categories.map((item) => <CategoryButton key={item.id} label={item.name} active={category === item.id} onClick={() => setCategory(item.id)} />)}</div>
            {filteredProducts.length === 0 ? <div className="mt-4 rounded-[var(--public-menu-radius-card)] border border-dashed border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-5 py-12 text-center sm:mt-5 sm:rounded-[var(--public-menu-radius-card)] sm:px-6 sm:py-14"><p className="text-sm font-extrabold">No menu items match that search.</p><p className="mt-1 text-xs text-[var(--public-menu-muted)]">Try a different category or clear the search.</p></div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-4 xl:grid-cols-3">{filteredProducts.map((product) => <ProductCard key={product.id} product={product} disabled={orderingPaused} onAdd={() => addToCart(product)} />)}</div>}
          </section>

          <aside className="sticky top-[78px] hidden lg:block"><CartSummary cart={cart} cartCount={cartCount} cartTotal={cartTotal} onUpdateQuantity={updateQuantity} onCheckout={openCheckout} disabled={orderingPaused} /></aside>
        </div>
      </div>

      {cartCount > 0 && <div className="fixed inset-x-2 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden sm:inset-x-3"><button type="button" onClick={openCheckout} disabled={orderingPaused} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-[var(--public-menu-radius-card)] bg-[var(--public-menu-primary)] px-4 py-3.5 text-left text-[var(--public-menu-primary-text)] shadow-[var(--public-menu-shadow-pop)] disabled:cursor-not-allowed disabled:opacity-60"><span><strong className="block text-sm font-extrabold">{cartCount} item{cartCount === 1 ? "" : "s"} in your cart</strong><small className="mt-0.5 block text-xs text-[var(--public-menu-primary-text)]/65">Review pickup details</small></span><span className="inline-flex items-center gap-2 text-sm font-extrabold">{formatPeso(cartTotal)} <AdminIcon name="arrow" size={15} /></span></button></div>}

      {trackOpen && <TrackOrderDialog orderNo={trackOrderNo} phone={trackPhone} state={trackState} onOrderNoChange={setTrackOrderNo} onPhoneChange={setTrackPhone} onSubmit={findOrder} onClose={() => setTrackOpen(false)} />}

      {drawerOpen && <div className="fixed inset-0 z-40 flex items-end justify-center overscroll-contain bg-[var(--public-menu-primary)]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="checkout-heading"><div className="public-menu__sheet max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[24px] bg-[var(--public-menu-raised)] p-4 shadow-[var(--public-menu-shadow-pop)] sm:rounded-[var(--public-menu-radius-card)] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--public-menu-accent-dark)]">{orderState.ok ? "Order received" : "Almost there"}</p><h2 id="checkout-heading" className="mt-1 text-[1.4rem] font-black leading-tight tracking-[-0.045em] text-[var(--public-menu-primary)] sm:text-2xl">{orderState.ok ? "Your pickup is in the queue." : "Set your pickup details."}</h2></div><button type="button" onClick={() => setDrawerOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--public-menu-muted)] transition hover:bg-[var(--public-menu-sidebar)] hover:text-[var(--public-menu-primary)]" aria-label="Close checkout"><AdminIcon name="close" size={18} /></button></div>{orderState.ok ? <OrderConfirmation orderState={orderState} status={trackedStatus} etaAt={trackedEta ?? orderState.etaAt ?? null} queuePosition={trackedQueuePosition ?? orderState.queuePosition ?? null} copied={copied} onCopy={copyOrderNumber} /> : <CheckoutForm menu={menu} cart={cart} cartTotal={cartTotal} requestId={checkoutRequestId} action={formAction} pending={pending} orderState={orderState} />}</div></div>}

      <footer className="border-t border-[var(--public-menu-border)] bg-[var(--public-menu-surface)] px-4 py-7 text-center text-[11px] font-semibold text-[var(--public-menu-subtle)] sm:px-6"><span className="font-extrabold text-[var(--public-menu-primary)]">{brandName}</span> · order ahead with Dumala POS</footer>
    </main>
  );
}

function CategoryButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-11 shrink-0 rounded-full px-3.5 py-2 text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-menu-primary)] ${active ? "bg-[var(--public-menu-primary)] text-[var(--public-menu-primary-text)]" : "bg-[var(--public-menu-raised)] text-[var(--public-menu-muted)] hover:bg-[var(--public-menu-primary-soft)] hover:text-[var(--public-menu-primary)]"}`}>{label}</button>;
}

function TrackOrderDialog({ orderNo, phone, state, onOrderNoChange, onPhoneChange, onSubmit, onClose }: { orderNo: string; phone: string; state: TrackState; onOrderNoChange: (value: string) => void; onPhoneChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const trackedOrderStatus = state.orderStatus ?? "new";
  const progress = trackedOrderStatus === "ready" || trackedOrderStatus === "picked_up" ? 3 : trackedOrderStatus === "preparing" ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-[var(--public-menu-primary)]/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="track-order-heading">
      <div className="public-menu__sheet max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-[var(--public-menu-raised)] p-4 shadow-[var(--public-menu-shadow-pop)] sm:rounded-[var(--public-menu-radius-card)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--public-menu-accent-dark)]">Pickup tracker</p>
            <h2 id="track-order-heading" className="mt-1 text-[1.4rem] font-black leading-tight tracking-[-0.045em] text-[var(--public-menu-primary)] sm:text-2xl">Where&apos;s my order?</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[var(--public-menu-muted)] transition hover:bg-[var(--public-menu-sidebar)] hover:text-[var(--public-menu-primary)]" aria-label="Close order tracker"><AdminIcon name="close" size={18} /></button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--public-menu-muted)]">Use the order number from your confirmation and the mobile number you gave the store.</p>
        <form onSubmit={onSubmit} className="mt-5 grid gap-4">
          <CheckoutField label="Order number" name="track-order-number" placeholder="e.g. WEB-1234" value={orderNo} onChange={onOrderNoChange} />
          <CheckoutField label="Mobile number" name="track-phone" placeholder="09XX XXX XXXX" type="tel" value={phone} onChange={onPhoneChange} />
          {state.status === "error" && <p role="alert" className="rounded-xl border border-[var(--public-menu-danger-soft)] bg-[var(--public-menu-danger-soft)] px-3 py-2.5 text-xs font-semibold leading-5 text-[var(--public-menu-danger)]">{state.message}</p>}
          {state.status === "success" && (
            <div className="rounded-2xl border border-[var(--public-menu-border)] bg-[var(--public-menu-surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--public-menu-accent-dark)]">{formatOrderStatusLabel(trackedOrderStatus)}</p>
                  <p className="mt-1 text-sm font-extrabold text-[var(--public-menu-primary)]">Order {state.orderNo}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--public-menu-primary-soft)] text-[var(--public-menu-primary)]"><AdminIcon name={trackedOrderStatus === "ready" ? "check" : "clock"} size={16} /></span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2"><TrackMetric label="Queue" value={state.queuePosition ? `#${state.queuePosition}` : "—"} /><TrackMetric label="ETA" value={formatOnlineEta(state.etaAt)} /></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{["Received", "Preparing", "Ready"].map((label, index) => <div key={label}><div className={`h-2 rounded-full ${index < progress ? "bg-[var(--public-menu-success)]" : "bg-[var(--public-menu-border)]"}`} /><p className={`mt-2 text-[10px] font-extrabold ${index < progress ? "text-[var(--public-menu-primary)]" : "text-[var(--public-menu-subtle)]"}`}>{label}</p></div>)}</div>
              <p className="mt-4 text-xs leading-5 text-[var(--public-menu-muted)]">{trackedOrderStatus === "picked_up" ? "This order has already been picked up." : trackedOrderStatus === "cancelled" ? "This order was cancelled. Please contact the store if you need help." : trackedOrderStatus === "ready" ? "Your order is ready. Head to the pickup counter when you are nearby." : `We're using the current queue to keep your ETA around ${formatOnlineEta(state.etaAt)}.`}</p>
            </div>
          )}
          <button type="submit" disabled={state.status === "loading"} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--public-menu-primary)] px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-[var(--public-menu-primary-text)] transition hover:bg-[var(--public-menu-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55">{state.status === "loading" ? "Checking status…" : state.status === "success" ? "Refresh status" : "Check order status"}<AdminIcon name="arrow" size={14} /></button>
        </form>
      </div>
    </div>
  );
}

function PublicBrandMark({ branding, name }: { branding: PublicMenuStore["settings"]["branding"]; name: string }) {
  const hasLogo = Boolean(branding.logoUrl);
  return <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--public-menu-primary)] text-sm font-black text-[var(--public-menu-primary-text)] sm:h-10 sm:w-10 sm:rounded-[var(--public-menu-radius-card)]" role={hasLogo ? "img" : undefined} aria-label={hasLogo ? `${name} logo` : undefined} aria-hidden={hasLogo ? undefined : true} style={hasLogo ? { backgroundColor: "var(--public-menu-primary-soft)", backgroundImage: `url(${JSON.stringify(branding.logoUrl)})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" } : undefined}>{!hasLogo && name.charAt(0).toUpperCase()}</span>;
}

function ProductCard({ product, disabled, onAdd }: { product: PublicMenuProduct; disabled: boolean; onAdd: () => void }) {
  const price = formatPeso(product.price).replace(/\.00$/, "");
  return <article className="group overflow-hidden rounded-[var(--public-menu-radius-card)] border border-[var(--public-menu-border)] bg-[var(--public-menu-raised)] shadow-[var(--public-menu-shadow-card)] transition hover:-translate-y-0.5 hover:border-[var(--public-menu-border-strong)] hover:shadow-[var(--public-menu-shadow-card)] sm:rounded-[var(--public-menu-radius-card)]"><div className="relative aspect-square overflow-hidden bg-[var(--public-menu-sidebar)]"><Image src={product.imageUrl} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 280px" className="object-cover transition duration-500 group-hover:scale-[1.03]" /><span className="absolute left-2 top-2 rounded-full bg-[var(--public-menu-raised)]/90 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.08em] text-[var(--public-menu-primary)] sm:left-3 sm:top-3 sm:px-2.5 sm:text-[9px] sm:tracking-[0.1em]">{product.categoryName || "Menu"}</span></div><div className="p-3 sm:p-4"><div className="flex items-start justify-between gap-2 sm:gap-3"><div className="min-w-0"><h3 className="min-h-10 line-clamp-2 text-[13px] font-extrabold leading-5 text-[var(--public-menu-primary)] sm:min-h-0 sm:truncate sm:text-sm">{product.name}</h3><p className="mt-1 text-[11px] text-[var(--public-menu-subtle)] sm:text-xs">{product.pricingMode === "per_kg" ? `${price} / kg` : `${price} · ${product.unit}`}</p></div><button type="button" onClick={onAdd} disabled={disabled} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--public-menu-primary-soft)] text-[var(--public-menu-primary)] transition hover:bg-[var(--public-menu-primary)] hover:text-[var(--public-menu-primary-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-menu-primary)] disabled:cursor-not-allowed disabled:bg-[var(--public-menu-border)] disabled:text-[var(--public-menu-subtle)]" aria-label={`Add ${product.name} to cart`}><AdminIcon name="plus" size={15} /></button></div></div></article>;
}

function CartSummary({ cart, cartCount, cartTotal, onUpdateQuantity, onCheckout, disabled }: { cart: CartLine[]; cartCount: number; cartTotal: number; onUpdateQuantity: (id: string, direction: -1 | 1) => void; onCheckout: () => void; disabled: boolean }) {
  return <div className="rounded-[var(--public-menu-radius-card)] border border-[var(--public-menu-border)] bg-[var(--public-menu-raised)] p-5 shadow-[var(--public-menu-shadow-card)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--public-menu-accent-dark)]">Your order</p><h2 className="mt-1 text-xl font-black tracking-[-0.035em] text-[var(--public-menu-primary)]">Pickup basket</h2></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--public-menu-sidebar)] text-[var(--public-menu-primary)]"><AdminIcon name="bag" size={16} /></span></div>{cart.length === 0 ? <div className="mt-7 rounded-xl border border-dashed border-[var(--public-menu-border-strong)] px-4 py-7 text-center"><p className="text-xs font-extrabold text-[var(--public-menu-primary)]">Your basket is empty</p><p className="mt-1 text-[11px] leading-5 text-[var(--public-menu-subtle)]">Add something from the menu to start your pickup order.</p></div> : <div className="mt-5 space-y-3">{cart.map((line) => <CartLineRow key={line.product.id} line={line} onUpdateQuantity={onUpdateQuantity} />)}</div>}<div className="mt-5 border-t border-[var(--public-menu-border)] pt-4"><div className="flex items-center justify-between text-xs font-semibold text-[var(--public-menu-muted)]"><span>Subtotal · {cartCount} item{cartCount === 1 ? "" : "s"}</span><strong className="text-sm font-extrabold text-[var(--public-menu-primary)]">{formatPeso(cartTotal)}</strong></div><p className="mt-2 text-[10px] leading-4 text-[var(--public-menu-subtle)]">Pay at pickup · final total is based on your selected items.</p><button type="button" onClick={onCheckout} disabled={disabled || cart.length === 0} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--public-menu-accent)] px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-[var(--public-menu-primary)] transition hover:bg-[var(--public-menu-accent-dark)] disabled:cursor-not-allowed disabled:opacity-45">Continue to pickup details <AdminIcon name="arrow" size={14} /></button></div></div>;
}

function CartLineRow({ line, onUpdateQuantity }: { line: CartLine; onUpdateQuantity: (id: string, direction: -1 | 1) => void }) {
  return <div className="flex items-center gap-2.5"><div className="flex shrink-0 items-center rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-surface)]"><button type="button" onClick={() => onUpdateQuantity(line.product.id, -1)} className="grid h-10 w-10 place-items-center text-[var(--public-menu-muted)] transition hover:bg-[var(--public-menu-primary-soft)] hover:text-[var(--public-menu-primary)]" aria-label={`Remove one ${line.product.name}`}><span aria-hidden="true">−</span></button><span className="w-5 text-center text-xs font-extrabold tabular-nums text-[var(--public-menu-primary)]">{line.qty}</span><button type="button" onClick={() => onUpdateQuantity(line.product.id, 1)} className="grid h-10 w-10 place-items-center text-[var(--public-menu-primary)] transition hover:bg-[var(--public-menu-primary-soft)]" aria-label={`Add one ${line.product.name}`}><span aria-hidden="true">+</span></button></div><p className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--public-menu-primary)]">{line.product.name}</p><strong className="text-xs font-extrabold tabular-nums text-[var(--public-menu-primary)]">{formatPeso(line.product.price * line.qty)}</strong></div>;
}

function CheckoutForm({ menu, cart, cartTotal, requestId, action, pending, orderState }: { menu: PublicMenuStore; cart: CartLine[]; cartTotal: number; requestId: string; action: (payload: FormData) => void; pending: boolean; orderState: PublicOnlineOrderResult }) {
  return <form action={action} className="mt-6"><input type="hidden" name="store_slug" value={menu.slug} /><input type="hidden" name="request_id" value={requestId} /><input type="hidden" name="items" value={JSON.stringify(cart.map((line) => ({ productId: line.product.id, qty: line.qty })))} /><div className="rounded-2xl border border-[var(--public-menu-border)] bg-[var(--public-menu-surface)] p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--public-menu-muted)]">Order total</span><strong className="text-lg font-black tabular-nums text-[var(--public-menu-primary)]">{formatPeso(cartTotal)}</strong></div><p className="mt-1 text-[11px] text-[var(--public-menu-subtle)]">{cart.length} menu item{cart.length === 1 ? "" : "s"} · payment collected at pickup</p><div className="mt-3 rounded-xl border border-[var(--public-menu-success-soft)] bg-[var(--public-menu-success-soft)] px-3 py-2.5 text-[11px] leading-5 text-[var(--public-menu-success-ink)]"><strong className="font-extrabold text-[var(--public-menu-primary)]">Pay at pickup.</strong> We&apos;ll collect payment at the store counter when your order is ready.</div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><CheckoutField label="Your name" name="customer_name" placeholder="e.g. Mara Santos" required /><CheckoutField label="Mobile number" name="customer_phone" placeholder="09XX XXX XXXX" type="tel" required /></div><label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--public-menu-muted)]" htmlFor="pickup-slot">Pickup time<select id="pickup-slot" name="pickup_slot" defaultValue="asap" className="mt-1.5 block h-11 w-full rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-3 text-sm font-bold normal-case tracking-normal text-[var(--public-menu-primary)] outline-none focus:border-[var(--public-menu-primary)] focus:ring-2 focus:ring-[var(--public-menu-primary)]/10">{PICKUP_SLOTS.map((slot) => <option key={slot} value={slot}>{pickupSlotLabel(slot)}{slot === "asap" ? ` · about ${menu.settings.averagePrepMinutes} min` : ""}</option>)}</select></label><label className="mt-4 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--public-menu-muted)]" htmlFor="order-note">Note for the store <span className="font-medium normal-case tracking-normal text-[var(--public-menu-subtle)]">optional</span><textarea id="order-note" name="note" rows={2} maxLength={240} placeholder="Less ice, extra sauce, etc." className="mt-1.5 block w-full resize-y rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[var(--public-menu-primary)] outline-none placeholder:text-[var(--public-menu-subtle)] focus:border-[var(--public-menu-primary)] focus:ring-2 focus:ring-[var(--public-menu-primary)]/10" /></label>{orderState.message && <p role="alert" className="mt-4 rounded-xl border border-[var(--public-menu-danger-soft)] bg-[var(--public-menu-danger-soft)] px-3 py-2.5 text-xs font-semibold leading-5 text-[var(--public-menu-danger)]">{orderState.message}</p>}<button type="submit" disabled={pending || cart.length === 0 || !requestId} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--public-menu-primary)] px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-[var(--public-menu-primary-text)] transition hover:bg-[var(--public-menu-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55">{pending ? "Placing your order…" : "Place pickup order"}<AdminIcon name="arrow" size={14} /></button><p className="mt-3 text-center text-[10px] leading-4 text-[var(--public-menu-subtle)]">By placing this order, you agree to be contacted about pickup.</p></form>;
}

function CheckoutField({ label, name, placeholder, type = "text", required = false, value, onChange }: { label: string; name: string; placeholder: string; type?: string; required?: boolean; value?: string; onChange?: (value: string) => void }) {
  return <label className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--public-menu-muted)]" htmlFor={name}>{label}<input id={name} name={name} type={type} placeholder={placeholder} required={required} maxLength={80} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className="mt-1.5 block h-11 w-full rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--public-menu-primary)] outline-none placeholder:text-[var(--public-menu-subtle)] focus:border-[var(--public-menu-primary)] focus:ring-2 focus:ring-[var(--public-menu-primary)]/10" /></label>;
}

function OrderConfirmation({ orderState, status, etaAt, queuePosition, copied, onCopy }: { orderState: PublicOnlineOrderResult; status: OnlineOrderStatus; etaAt: string | null; queuePosition: number | null; copied: boolean; onCopy: () => void }) {
  const progress = status === "ready" || status === "picked_up" ? 3 : status === "preparing" ? 2 : 1;
  const progressLabels = ["Received", "Preparing", "Ready"];

  return (
    <div className="mt-6">
      <div className="rounded-[var(--public-menu-radius-card)] bg-[var(--public-menu-primary)] p-4 text-[var(--public-menu-primary-text)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--public-menu-primary-text)]/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--public-menu-primary-text)]/75">
              <i className="h-1.5 w-1.5 rounded-full bg-[var(--public-menu-success)]" />
              {formatOrderStatusLabel(status)}
            </span>
            <h3 className="mt-4 text-[1.65rem] font-black tracking-[-0.045em] sm:text-2xl">You&apos;re all set.</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--public-menu-primary-text)]/68">
              We&apos;ll prepare your order for pickup. Payment is collected at the counter when you arrive.
            </p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--public-menu-accent)] text-[var(--public-menu-primary)]">
            <AdminIcon name="check" size={21} />
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1"><ConfirmationMetric label="Order" value={orderState.orderNo ?? "—"} /></div>
          <ConfirmationMetric label="Queue" value={queuePosition ? `#${queuePosition}` : "—"} />
          <ConfirmationMetric label="ETA" value={formatOnlineEta(etaAt)} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--public-menu-border)] bg-[var(--public-menu-surface)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-extrabold text-[var(--public-menu-primary)]">Pickup progress</p>
          <span className="text-[10px] font-bold text-[var(--public-menu-muted)]">Updates automatically</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {progressLabels.map((label, index) => (
            <div key={label}>
              <div className={`h-2 rounded-full ${index < progress ? "bg-[var(--public-menu-success)]" : "bg-[var(--public-menu-border)]"}`} />
              <p className={`mt-2 text-[10px] font-extrabold ${index < progress ? "text-[var(--public-menu-primary)]" : "text-[var(--public-menu-subtle)]"}`}>{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--public-menu-muted)]">
          {status === "picked_up"
            ? "This order has been picked up. Thanks for ordering ahead."
            : status === "cancelled"
              ? "This order was cancelled. Please contact the store if you need help."
              : status === "ready"
                ? "Your order is ready. Head to the pickup counter when you are nearby."
                : `We're using the current queue to keep your ETA around ${formatOnlineEta(etaAt)}.`}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onCopy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--public-menu-border-strong)] bg-[var(--public-menu-raised)] px-3.5 py-2.5 text-xs font-extrabold text-[var(--public-menu-primary)] transition hover:bg-[var(--public-menu-primary-soft)]">
          {copied ? "Order number copied" : "Copy order number"}
          <AdminIcon name={copied ? "check" : "arrow"} size={13} />
        </button>
        <span className="text-[10px] font-semibold text-[var(--public-menu-subtle)]">Need help? Show this screen at pickup.</span>
      </div>
    </div>
  );
}
function ConfirmationMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-[var(--public-menu-primary-text)]/10 px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--public-menu-primary-text)]/52">{label}</p><strong className="mt-1 block truncate text-sm font-extrabold tabular-nums">{value}</strong></div>;
}

function TrackMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-[var(--public-menu-border)] bg-[var(--public-menu-raised)] px-3 py-2.5"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--public-menu-subtle)]">{label}</p><strong className="mt-1 block truncate text-sm font-extrabold tabular-nums text-[var(--public-menu-primary)]">{value}</strong></div>;
}
