"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { createClient } from "@/lib/supabase/client";
import {
  createDisplayLink,
  isDisplayState,
  normalizeDisplayPairingToken,
  type DisplayCartLine,
  type DisplayConnectionStatus,
  type DisplayLinkTransport,
  type DisplaySettings,
  type DisplayState,
} from "@/lib/display";
import { DEFAULT_DISPLAY_SETTINGS } from "@/lib/display-config";
import { formatPeso } from "@/lib/money";
import styles from "./CustomerDisplay.module.css";

const DEFAULT_BRANDING = { storeName: "Dumala", logoUrl: "/logo.png" };
const DEFAULT_STATE: DisplayState = { kind: "idle", branding: DEFAULT_BRANDING };

type DisplayPromotion = {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  tagline: string;
  imageUrl: string | null;
};

const DISPLAY_PROMOTIONS = [
  {
    id: "shareable-lechon",
    eyebrow: "Made for the table",
    title: "Bring home the good stuff.",
    detail: "Our lechon cuts are crisp, savory, and ready to share.",
    tagline: "Ask us about today’s cuts.",
    imageUrl: "/food/whole-lechon-medium.png",
  },
  {
    id: "coffee-pairing",
    eyebrow: "Your perfect pair",
    title: "Make it a little sweeter.",
    detail: "Add a fresh latte or pastry while we prepare your order.",
    tagline: "Ask our team for a pairing.",
    imageUrl: "/food/cafe-matcha-latte.png",
  },
  {
    id: "meal-combo",
    eyebrow: "Complete the spread",
    title: "Rice, sauce, and something cold.",
    detail: "Build a meal around your favorite Dumala main.",
    tagline: "Small add-ons, big comfort.",
    imageUrl: "/food/lechon-meal-combo.png",
  },
] satisfies DisplayPromotion[];

function displayPeso(value: number) {
  return formatPeso(Math.max(0, Math.round(value))).replace(/\.00$/, "");
}

function lineQuantity(line: DisplayCartLine) {
  if (line.weightKg !== null) return `${line.weightKg.toFixed(2)} kg`;
  return `× ${line.qty}`;
}

function BrandBar({ state, status, transport }: { state: DisplayState; status: DisplayConnectionStatus; transport: DisplayLinkTransport }) {
  return (
    <header className={styles.brandBar}>
      <div className={styles.brand}>
        <AdminBrandLogo logoUrl={state.branding.logoUrl} className={styles.brandMark} iconSize={30} label={`${state.branding.storeName} logo`} />
        <div className={styles.brandCopy}>
          <strong>{state.branding.storeName}</strong>
          <span>Customer display</span>
        </div>
      </div>
      <span className={styles.status} data-status={status}>
        {status === "disconnected" ? "Waiting for POS" : status === "connecting" ? "Connecting" : transport === "webrtc" ? "LAN display" : "Display ready"}
      </span>
    </header>
  );
}

function PromotionCard({ promotion, storeName, compact = false }: { promotion: DisplayPromotion; storeName: string; compact?: boolean }) {
  return (
    <aside className={`${styles.promoCard}${compact ? ` ${styles.promoCardCompact}` : ""}`} data-promotion-id={promotion.id} aria-label={`${storeName} featured offer`}>
      <div className={styles.promoImage}>
        <Image src={promotion.imageUrl ?? "/food/whole-lechon-small.png"} alt="" fill sizes={compact ? "(max-width: 760px) 100vw, 30vw" : "(max-width: 760px) 100vw, 42vw"} className={styles.promoImageAsset} />
      </div>
      <div className={styles.promoBody}>
        <span className={styles.promoEyebrow}>{promotion.eyebrow}</span>
        <h2 className={styles.promoTitle}>{promotion.title}</h2>
        <p className={styles.promoDetail}>{promotion.detail}</p>
        <span className={styles.promoTag}>{promotion.tagline}</span>
      </div>
    </aside>
  );
}

function IdleState({ state, promotion }: { state: Extract<DisplayState, { kind: "idle" }>; promotion: DisplayPromotion | null }) {
  return (
    <section className={styles.idleLayout} aria-labelledby="display-idle-title">
      <div className={styles.idle}>
        <AdminBrandLogo logoUrl={state.branding.logoUrl} className={styles.idleMark} iconSize={64} label={`${state.branding.storeName} logo`} />
        <h1 id="display-idle-title" className={styles.idleTitle}>Freshly made for you.</h1>
        <p className={styles.idleSubtitle}>Salamat for supporting {state.branding.storeName}</p>
      </div>
      {promotion ? <PromotionCard promotion={promotion} storeName={state.branding.storeName} /> : null}
    </section>
  );
}

function ActiveState({ state, promotion, settings }: { state: Extract<DisplayState, { kind: "active" }>; promotion: DisplayPromotion | null; settings: DisplaySettings }) {
  return (
    <section className={styles.activeLayout} aria-labelledby="display-order-title">
      <div className={styles.orderCard}>
        <div className={styles.orderHeading}>
          <h1 id="display-order-title">Your order</h1>
          <span>{state.lines.length} item{state.lines.length === 1 ? "" : "s"}</span>
        </div>
        <ul className={styles.lines} aria-label="Current order items">
          {state.lines.map((line) => (
            <li key={line.id} className={styles.line}>
              <span className={styles.lineName}>{line.name}</span>
              {settings.showQuantity ? <span className={styles.lineQuantity}>{lineQuantity(line)}</span> : null}
              <span className={styles.lineTotal}>{displayPeso(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.summary}>
          {settings.showSubtotal ? <div className={styles.summaryRow}><span>Subtotal</span><span>{displayPeso(state.subtotal)}</span></div> : null}
          {settings.showDiscount && state.discount > 0 && <div className={`${styles.summaryRow} ${styles.summaryDiscount}`}><span>Discount</span><span>−{displayPeso(state.discount)}</span></div>}
        </div>
      </div>
      <div className={styles.totalStack}>
        <div className={styles.totalCard} aria-label={`Total ${displayPeso(state.total)}`}>
          <span className={styles.totalLabel}>Total</span>
          <strong className={styles.totalValue}>{displayPeso(state.total)}</strong>
          <span className={styles.totalHint}>Please review your order before paying.</span>
        </div>
        {promotion ? <PromotionCard promotion={promotion} storeName={state.branding.storeName} compact /> : null}
      </div>
    </section>
  );
}

function PaymentState({ state }: { state: Extract<DisplayState, { kind: "payment" }> }) {
  const hasChange = state.changeDue !== null && state.changeDue >= 0;
  return (
    <section className={styles.payment} aria-labelledby="display-payment-title">
      <span className={styles.paymentLabel}>{state.paymentMethod === "cash" ? "Cash payment" : "Payment"}</span>
      <strong id="display-payment-title" className={styles.paymentTotal}>{displayPeso(state.total)}</strong>
      <span className={styles.paymentChangeLabel}>{hasChange ? "Change due" : "Tendered"}</span>
      <strong className={styles.paymentChange}>{hasChange ? displayPeso(state.changeDue ?? 0) : state.tendered === null ? "—" : displayPeso(state.tendered)}</strong>
      <span className={styles.paymentHint}>{hasChange ? "Thank you." : state.tendered === null ? "Please complete payment at the counter." : "Checking amount…"}</span>
    </section>
  );
}

function ThankYouState({ state, settings }: { state: Extract<DisplayState, { kind: "thankyou" }>; settings: DisplaySettings }) {
  return (
    <section className={styles.thankyou} aria-labelledby="display-thankyou-title">
      <span className={styles.thankyouMark} aria-hidden="true">✓</span>
      <h1 id="display-thankyou-title">Salamat po!</h1>
      <p>{settings.showOrderNumber ? `Order ${state.orderNo} · ` : ""}Your order is being prepared.</p>
    </section>
  );
}

function PairingState() {
  return (
    <section className={styles.pairing} aria-labelledby="display-pairing-title">
      <span className={styles.pairingMark} aria-hidden="true">↔</span>
      <h1 id="display-pairing-title">Customer display</h1>
      <p>Open this screen from the pairing link generated in the POS Display settings. Once paired, the current order will appear here automatically.</p>
    </section>
  );
}

export default function CustomerDisplayScreen({ pairingToken }: { pairingToken: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const token = normalizeDisplayPairingToken(pairingToken);
  const [state, setState] = useState<DisplayState>(DEFAULT_STATE);
  const [status, setStatus] = useState<DisplayConnectionStatus>(token ? "connecting" : "disconnected");
  const [transport, setTransport] = useState<DisplayLinkTransport>("broadcast");
  const [promotionIndex, setPromotionIndex] = useState(0);
  const settings = state.settings ?? DEFAULT_DISPLAY_SETTINGS;
  const promotions = state.promotions ?? DISPLAY_PROMOTIONS;
  const promotion = settings.showPromotions && promotions.length > 0
    ? promotions[promotionIndex % promotions.length]
    : null;

  useEffect(() => {
    if (!token) return;
    const link = createDisplayLink({ token, role: "display", supabase });
    const unsubscribeState = link.subscribe((nextState) => {
      if (isDisplayState(nextState)) setState(nextState);
    });
    const unsubscribeStatus = link.onStatus((nextStatus) => {
      setStatus(nextStatus);
      setTransport(link.transport);
    });
    return () => {
      unsubscribeState();
      unsubscribeStatus();
      void link.disconnect();
    };
  }, [supabase, token]);

  useEffect(() => {
    if (!settings.showPromotions || promotions.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setPromotionIndex((current) => (current + 1) % promotions.length);
    }, settings.rotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [promotions.length, settings.rotationSeconds, settings.showPromotions]);

  useEffect(() => {
    if (state.kind !== "thankyou") return;
    const timer = window.setTimeout(() => setState((current) => current.kind === "thankyou" ? { kind: "idle", branding: current.branding, promotions: current.promotions, settings: current.settings } : current), 5000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!token) {
    return <main className={styles.display}><div className={styles.shell}><PairingState /></div></main>;
  }

  return (
    <main className={styles.display} data-display-state={state.kind}>
      <div className={styles.shell}>
        <BrandBar state={state} status={status} transport={transport} />
        {state.kind === "idle" && <IdleState state={state} promotion={promotion} />}
        {state.kind === "active" && <ActiveState state={state} promotion={promotion} settings={settings} />}
        {state.kind === "payment" && <PaymentState state={state} />}
        {state.kind === "thankyou" && <ThankYouState state={state} settings={settings} />}
      </div>
    </main>
  );
}
