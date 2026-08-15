"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { createClient } from "@/lib/supabase/client";
import { getPosTheme, getPosThemeDisplayColors, type PosThemeId } from "@/lib/pos-theme";
import {
  createDisplayLink,
  isDisplayState,
  normalizeDisplayPairingToken,
  type DisplayCartLine,
  type DisplayGalleryItem,
  type DisplaySettings,
  type DisplayState,
} from "@/lib/display";
import { DEFAULT_DISPLAY_SETTINGS, resolveDisplayCopy } from "@/lib/display-config";
import { formatPeso } from "@/lib/money";
import styles from "./CustomerDisplay.module.css";

const DEFAULT_BRANDING = { storeName: "Dumala", logoUrl: "/logo.png" };
const DEFAULT_STATE: DisplayState = { kind: "idle", branding: DEFAULT_BRANDING, theme: "modern" };

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
    imageUrl: "/food/whole-lechon-medium.webp",
  },
  {
    id: "coffee-pairing",
    eyebrow: "Your perfect pair",
    title: "Make it a little sweeter.",
    detail: "Add a fresh latte or pastry while we prepare your order.",
    tagline: "Ask our team for a pairing.",
    imageUrl: "/food/cafe-matcha-latte.webp",
  },
  {
    id: "meal-combo",
    eyebrow: "Complete the spread",
    title: "Rice, sauce, and something cold.",
    detail: "Build a meal around your favorite Dumala main.",
    tagline: "Small add-ons, big comfort.",
    imageUrl: "/food/lechon-meal-combo.webp",
  },
] satisfies DisplayPromotion[];

const PRODUCT_MARQUEE_PRODUCTS = [
  { id: "marquee-cafe-latte", title: "Cafe latte", imageUrl: "/food/cafe-latte.webp" },
  { id: "marquee-croissant", title: "Butter croissant", imageUrl: "/food/bakery-croissant.webp" },
  { id: "marquee-lechon-belly", title: "Lechon belly", imageUrl: "/food/lechon-belly-one.webp" },
  { id: "marquee-matcha", title: "Matcha latte", imageUrl: "/food/cafe-matcha-latte.webp" },
  { id: "marquee-lechon-kawali", title: "Lechon kawali", imageUrl: "/food/lechon-kawali.webp" },
  { id: "marquee-blueberry-muffin", title: "Blueberry muffin", imageUrl: "/food/cafe-blueberry-muffin.webp" },
] as const;

const EMPTY_GALLERY: DisplayGalleryItem[] = [];
const GALLERY_TRANSITION_MS = 1800;

function displayPeso(value: number) {
  return formatPeso(Math.max(0, Math.round(value))).replace(/\.00$/, "");
}

function lineQuantity(line: DisplayCartLine) {
  if (line.weightKg !== null) return `${line.weightKg.toFixed(2)} kg`;
  return `× ${line.qty}`;
}

function displayThemeStyle(themeId: PosThemeId) {
  const theme = getPosTheme(themeId).variables;
  const displayColors = getPosThemeDisplayColors(themeId);
  return {
    "--display-bg": theme["--pos-theme-bg"],
    "--display-surface": theme["--pos-theme-surface"],
    "--display-surface-panel": theme["--pos-theme-surface-panel"],
    "--display-surface-raised": theme["--pos-theme-surface-raised"],
    "--display-ink": theme["--pos-theme-text"],
    "--display-heading": displayColors.heading,
    "--display-muted": theme["--pos-theme-text-muted"],
    "--display-subtle": theme["--pos-theme-text-subtle"],
    "--display-primary": theme["--pos-theme-topbar"],
    "--display-topbar-text": theme["--pos-theme-topbar-text"],
    "--display-accent": theme["--pos-theme-highlight"],
    "--display-accent-ink": displayColors.accentInk,
    "--display-accent-soft": theme["--pos-theme-highlight-soft"],
    "--display-border": theme["--pos-theme-border"],
    "--display-border-strong": theme["--pos-theme-border-strong"],
    "--display-radius": theme["--pos-theme-radius-card"],
    "--display-shadow": theme["--pos-theme-shadow-card"],
    "--display-shadow-pop": theme["--pos-theme-shadow-pop"],
    "--display-font": theme["--pos-theme-font"],
    "--display-weight": theme["--pos-theme-weight"],
    "--display-letter-spacing": theme["--pos-theme-letter-spacing"],
    "--display-pattern": theme["--pos-theme-app-pattern"],
    "--display-panel-gradient": theme["--pos-theme-panel-gradient"],
    "--display-card-gradient": theme["--pos-theme-card-gradient"],
    "--display-control-gradient": theme["--pos-theme-control-gradient"],
  } as CSSProperties;
}

function ProductMarquee({ promotions }: { promotions: DisplayPromotion[] }) {
  const promotionItems = promotions.map(({ id, title, imageUrl }) => ({ id, title, imageUrl }));
  const marqueeItems = [
    ...promotionItems,
    ...PRODUCT_MARQUEE_PRODUCTS.filter((product) => !promotionItems.some((promotion) => promotion.imageUrl === product.imageUrl)),
  ];
  const loopItems = [...marqueeItems, ...marqueeItems];

  return (
    <div className={styles.productMarquee} aria-hidden="true">
      <div className={styles.productMarqueeTrack}>
        {loopItems.map((product, index) => (
          <span key={`${product.id}-${index}`} className={styles.productMarqueeItem}>
            <span className={styles.productMarqueeImage}>
              <Image src={product.imageUrl ?? "/food/whole-lechon-small.webp"} alt="" fill sizes="2.35rem" className={styles.productMarqueeImageAsset} />
            </span>
            <span>{product.title}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BrandBar({ state, promotions, showMarquee = true }: { state: DisplayState; promotions: DisplayPromotion[]; showMarquee?: boolean }) {
  return (
    <header className={styles.brandBar}>
      <div className={styles.brand}>
        <AdminBrandLogo logoUrl={state.branding.logoUrl} className={styles.brandMark} iconSize={30} label={`${state.branding.storeName} logo`} />
        <div className={styles.brandCopy}>
          <strong>{state.branding.storeName}</strong>
        </div>
      </div>
      {showMarquee ? <ProductMarquee promotions={promotions} /> : null}
    </header>
  );
}

function GalleryState({ state, item, promotions }: { state: Extract<DisplayState, { kind: "idle" }>; item: DisplayGalleryItem; promotions: DisplayPromotion[] }) {
  const displayItemRef = useRef(item);
  const [displayItem, setDisplayItem] = useState(item);
  const [outgoingItem, setOutgoingItem] = useState<DisplayGalleryItem | null>(null);

  useEffect(() => {
    const previousItem = displayItemRef.current;
    if (item.id === previousItem.id && item.imageUrl === previousItem.imageUrl && item.title === previousItem.title) return;

    displayItemRef.current = item;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let outgoingTimer: number | undefined;
    const updateTimer = window.setTimeout(() => {
      if (reduceMotion) {
        setOutgoingItem(null);
        setDisplayItem(item);
        return;
      }
      setOutgoingItem(previousItem);
      setDisplayItem(item);
      outgoingTimer = window.setTimeout(() => setOutgoingItem(null), GALLERY_TRANSITION_MS);
    }, 0);
    return () => {
      window.clearTimeout(updateTimer);
      if (outgoingTimer !== undefined) window.clearTimeout(outgoingTimer);
    };
  }, [item]);

  const isRight = displayItem.overlayPosition === "right";
  return (
    <section className={styles.galleryState} aria-labelledby="display-gallery-title">
      {outgoingItem ? <Image src={outgoingItem.imageUrl} alt="" fill sizes="100vw" className={`${styles.galleryImage} ${styles.galleryImageOutgoing}`} aria-hidden="true" /> : null}
      <Image key={`${displayItem.id}-${displayItem.imageUrl}-${displayItem.title}`} src={displayItem.imageUrl} alt={displayItem.title} fill sizes="100vw" priority className={`${styles.galleryImage} ${styles.galleryImageCurrent}`} />
      <div className={styles.galleryScrim} aria-hidden="true" />
      <div className={styles.galleryBrand}><BrandBar state={state} promotions={promotions} showMarquee={displayItem.kind !== "menu"} /></div>
      <div key={`${displayItem.id}-${displayItem.title}`} className={`${styles.galleryOverlay} ${styles.galleryOverlayEnter}${isRight ? ` ${styles.galleryOverlayRight}` : ""}`}>
        <span>{displayItem.kind === "menu" ? "Menu showcase" : "Featured today"}</span>
        <h1 id="display-gallery-title">{displayItem.title}</h1>
      </div>
    </section>
  );
}

function PromotionCard({ promotion, storeName, compact = false }: { promotion: DisplayPromotion; storeName: string; compact?: boolean }) {
  return (
    <aside className={`${styles.promoCard}${compact ? ` ${styles.promoCardCompact}` : ""}`} data-promotion-id={promotion.id} aria-label={`${storeName} featured offer`}>
      <div className={styles.promoImage}>
        <Image src={promotion.imageUrl ?? "/food/whole-lechon-small.webp"} alt="" fill sizes={compact ? "(max-width: 540px) 100vw, (max-width: 760px) 44vw, 17vw" : "(max-width: 760px) 100vw, 42vw"} className={styles.promoImageAsset} />
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
        <h1 id="display-idle-title" className={styles.idleTitle}>{resolveDisplayCopy(state.settings?.idleTitle ?? DEFAULT_DISPLAY_SETTINGS.idleTitle, state.branding.storeName)}</h1>
        <p className={styles.idleSubtitle}>{resolveDisplayCopy(state.settings?.idleSubtitle ?? DEFAULT_DISPLAY_SETTINGS.idleSubtitle, state.branding.storeName)}</p>
      </div>
      {promotion ? <PromotionCard promotion={promotion} storeName={state.branding.storeName} /> : null}
    </section>
  );
}

function ActiveState({ state, promotions, settings }: { state: Extract<DisplayState, { kind: "active" }>; promotions: DisplayPromotion[]; settings: DisplaySettings }) {
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
        {promotions.length > 0 ? (
          <div className={styles.promoGrid} aria-label="Featured promotions">
            {promotions.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} storeName={state.branding.storeName} compact />)}
          </div>
        ) : null}
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
      <h1 id="display-thankyou-title">{resolveDisplayCopy(settings.completedOrderTitle, state.branding.storeName)}</h1>
      <p className={styles.thankyouMessage}>{settings.showOrderNumber ? `Order ${state.orderNo} / ` : ""}{resolveDisplayCopy(settings.completedOrderMessage, state.branding.storeName)}</p>
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
  const [promotionIndex, setPromotionIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const settings = state.settings ?? DEFAULT_DISPLAY_SETTINGS;
  const promotions = state.promotions?.length ? state.promotions : DISPLAY_PROMOTIONS;
  const galleryItems = settings.showGallery && state.gallery?.length
    ? state.gallery.filter((item) => item.kind === "marketing" ? settings.showMarketingGallery : settings.showMenuGallery)
    : EMPTY_GALLERY;
  const promotionPool = useMemo(() => {
    if (promotions.length >= 2) return promotions;
    return [
      ...promotions,
      ...DISPLAY_PROMOTIONS.filter((fallback) => !promotions.some((promotion) => promotion.id === fallback.id)),
    ];
  }, [promotions]);
  const displayPromotions = settings.showPromotions && promotionPool.length > 0
    ? Array.from({ length: Math.min(2, promotionPool.length) }, (_, offset) => promotionPool[(promotionIndex + offset) % promotionPool.length])
    : [];
  const promotion = displayPromotions[0] ?? null;
  const safeGalleryIndex = galleryItems.length ? galleryIndex % galleryItems.length : 0;
  const galleryItem = state.kind === "idle" && galleryItems.length > 0
    ? galleryItems[safeGalleryIndex]
    : null;
  const themeId = state.theme ?? "modern";
  const themeStyle = useMemo(() => displayThemeStyle(themeId), [themeId]);

  useEffect(() => {
    if (!token) return;
    const link = createDisplayLink({ token, role: "display", supabase });
    const unsubscribeState = link.subscribe((nextState) => {
      if (isDisplayState(nextState)) setState(nextState);
    });
    return () => {
      unsubscribeState();
      void link.disconnect();
    };
  }, [supabase, token]);

  useEffect(() => {
    if (!settings.showPromotions || promotionPool.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setPromotionIndex((current) => (current + 1) % promotionPool.length);
    }, settings.rotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [promotionPool.length, settings.rotationSeconds, settings.showPromotions]);

  useEffect(() => {
    if (!galleryItem || galleryItems.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setGalleryIndex((current) => (current + 1) % galleryItems.length);
    }, settings.rotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [galleryItem, galleryItems.length, settings.rotationSeconds]);

  useEffect(() => {
    if (state.kind !== "thankyou") return;
    const timer = window.setTimeout(() => setState((current) => current.kind === "thankyou" ? { kind: "idle", branding: current.branding, promotions: current.promotions, gallery: current.gallery, settings: current.settings, theme: current.theme } : current), 5000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!token) {
    return <main className={styles.display} data-display-theme="modern" style={displayThemeStyle("modern")}><div className={styles.shell}><PairingState /></div></main>;
  }

  return (
    <main className={`${styles.display}${galleryItem ? ` ${styles.displayGallery}` : ""}`} data-display-state={state.kind} data-display-mode={galleryItem ? "gallery" : state.kind} data-display-theme={themeId} style={themeStyle}>
      {galleryItem && state.kind === "idle" ? <GalleryState state={state} item={galleryItem} promotions={promotions} /> : (
        <div className={styles.shell}>
          <BrandBar state={state} promotions={promotions} />
          {state.kind === "idle" && <IdleState state={state} promotion={promotion} />}
          {state.kind === "active" && <ActiveState state={state} promotions={displayPromotions} settings={settings} />}
          {state.kind === "payment" && <PaymentState state={state} />}
          {state.kind === "thankyou" && <ThankYouState state={state} settings={settings} />}
        </div>
      )}
    </main>
  );
}
