"use client";

import "./SellScreen.css";

/**
 * POS Sell Screen (P1+P2). Catalog grid + cart + weight keypad + discounts +
 * charge flow + park/hold tray. Money is integer centavos (money.ts).
 * Orders are written to the local outbox FIRST (offline.ts), then synced via
 * the idempotent `place_order` RPC — the UI never awaits the network.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatPeso, weightLineTotal } from "@/lib/money";
import { formatStockQuantity, stockMovementDelta, stockStatus } from "@/lib/inventory";
import { resolveProductImage } from "@/lib/product-images";
import { readAdminBranding } from "@/lib/admin/branding";
import { DEFAULT_ADMIN_DISCOUNT_SETTINGS, readAdminDiscountSettings } from "@/lib/admin/discount-settings";
import { AdminBrandLogo } from "@/components/admin/AdminBrandLogo";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { SignOutButton } from "@/components/SignOutButton";
import OfflinePinSetup from "@/components/OfflinePinSetup";
import OfflinePinUnlock from "@/components/OfflinePinUnlock";
import ChargeModal from "@/components/pos/ChargeModal";
import PrinterSettingsModal from "@/components/pos/PrinterSettings";
import CustomerDisplaySettings from "@/components/pos/CustomerDisplaySettings";
import OrderHistory from "@/components/pos/OrderHistory";
import ShiftPanel, { useActiveShift } from "@/components/pos/ShiftPanel";
import { OverlayDialog } from "@/components/ui/OverlayLayer";
import PosHealthPanel from "@/components/pos/PosHealthPanel";
import { useCartState } from "@/components/pos/useCartState";
import { usePosHardwareStatus } from "@/components/pos/usePosHardwareStatus";
import { usePosPrinting } from "@/components/pos/usePosPrinting";
import { usePosSync } from "@/components/pos/usePosSync";
import {
  buildOrderNo,
  enqueueAuditLog,
  enqueueOrder,
  getDeviceId,
  getOfflineCredential,
  loadCachedCatalog,
  saveCatalogCache,
  type OfflineCredential,
  type OfflineProfileSnapshot,
} from "@/lib/offline";
import { POS_DEVICE_BINDING_KEY, type PosDeviceBinding } from "@/lib/device-binding";
import {
  loadPrinterSettings,
  openCashDrawer,
  savePrinterSettings,
  type PrinterSettings,
} from "@/lib/printer";
import { buildReceipt } from "@/lib/receipt";
import { normalizePaperWidth, type PaperWidth } from "@/lib/paper-width";
import { getPosTheme, isPosThemeId, type PosThemeId } from "@/lib/pos-theme";
import { getPosPalette, isPosPaletteId, type PosPaletteId } from "@/lib/pos-palette";
import { getPosFont, isPosFontId, readPosFontColorWithFallback, type PosFontId } from "@/lib/pos-font";
import { readPosRadiusWithFallback, resolvePosRadius } from "@/lib/pos-shape";
import {
  createDisplayLink,
  loadDisplayPairingToken,
  normalizeDisplayPairingToken,
  saveDisplayPairingToken,
  type DisplayLink,
  type DisplayGalleryItem,
  type DisplayPromotion,
  type DisplaySettings,
  type DisplayState,
} from "@/lib/display";
import { DEFAULT_DISPLAY_SETTINGS, normalizeDisplayGalleryRows, normalizeDisplayPromotionRows, normalizeDisplaySettings } from "@/lib/display-config";
import { buildDisplayMenuItems, displayMenuItemsToGalleryItems } from "@/lib/display-gallery";
import { applySaleToStock } from "@/lib/pos/inventory-movements";
import { paymentPreview as buildPaymentPreview } from "@/lib/pos/payment";
import { discountRequiresApproval, saleTotals } from "@/lib/pos/pricing";
import { orderReducer } from "@/lib/pos/state-machines";
import { NO_DISCOUNT, type DiscountState, type PaymentPreview, type PosProduct, type RuntimePaymentMethod } from "@/lib/pos/types";

type Product = PosProduct;
type Category = { id: string; name: string; icon: string | null };
type StockRow = { store_id: string; product_id: string; qty: number };

function withCatalogGallery<T extends { display_gallery?: DisplayGalleryItem[] }>(profile: T, products: Product[], categories: Category[]): T {
  const marketingItems = Array.isArray(profile.display_gallery)
    ? profile.display_gallery.filter((item) => item.kind === "marketing")
    : [];
  const menuItems = buildDisplayMenuItems(products, categories);
  return {
    ...profile,
    display_gallery: [...marketingItems, ...displayMenuItemsToGalleryItems(menuItems)],
  };
}
const DEFAULT_STORE_NAME = "Your Store";

/** Backstop interval for customer-display settings. See the poll effect below. */
const DISPLAY_SETTINGS_POLL_MS = 60_000;

const displayPeso = (cents: number) => formatPeso(cents).replace(/\.00$/, "");

type PosRuntimeConfig = {
  palette: PosPaletteId;
  customColor: string;
  uiStyle: PosThemeId;
  fontFamily: PosFontId;
  fontColor: string | null;
  cardRadius: number | null;
  buttonRadius: number | null;
  defaultOrderType: string;
  orderTypes: string[];
  paymentMethods: Record<RuntimePaymentMethod, boolean>;
  vatRate: number;
  showVat: boolean;
  showStockStatus: boolean;
  enableOrderNotes: boolean;
  receiptHeader: string;
  receiptFooter: string;
  showCashier: boolean;
  paperWidth: PaperWidth;
};

type ProfileData = Omit<OfflineProfileSnapshot, "pos_config"> & {
  pos_config?: PosRuntimeConfig;
};

const DEFAULT_POS_RUNTIME_CONFIG: PosRuntimeConfig = {
  palette: "green",
  customColor: "#173a2b",
  uiStyle: "modern",
  fontFamily: "theme",
  fontColor: null,
  cardRadius: null,
  buttonRadius: null,
  defaultOrderType: "Dine In",
  orderTypes: ["Dine In", "Takeout"],
  paymentMethods: { cash: true, gcash: true, maya: false, card: true },
  vatRate: 0.12,
  showVat: false,
  showStockStatus: false,
  enableOrderNotes: true,
  receiptHeader: "",
  receiptFooter: "",
  showCashier: true,
  paperWidth: 58,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAdminDiscountThreshold(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : DEFAULT_ADMIN_DISCOUNT_SETTINGS.adminPinThresholdPercent;
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max ? numberValue : fallback;
}

function normalizePosRuntimeConfig(value: unknown, vatRateFallback = DEFAULT_POS_RUNTIME_CONFIG.vatRate, showVatFallback = DEFAULT_POS_RUNTIME_CONFIG.showVat): PosRuntimeConfig {
  const source = isRecord(value) ? value : {};
  const paymentSource = isRecord(source.paymentMethods) ? source.paymentMethods : {};
  const allOrderTypes = ["Dine In", "Takeout", "Delivery"];
  const orderTypes = Array.isArray(source.orderTypes)
    ? source.orderTypes.filter((item): item is string => typeof item === "string" && allOrderTypes.includes(item)).slice(0, 3)
    : [];
  const enabledOrderTypes = orderTypes.length ? orderTypes : DEFAULT_POS_RUNTIME_CONFIG.orderTypes;
  const configuredDefault = typeof source.defaultOrderType === "string" && allOrderTypes.includes(source.defaultOrderType)
    ? source.defaultOrderType
    : DEFAULT_POS_RUNTIME_CONFIG.defaultOrderType;
  const palette = isPosPaletteId(source.palette) ? source.palette : "green";
  const uiStyle = isPosThemeId(source.uiStyle) ? source.uiStyle : "modern";
  const fontFamily = isPosFontId(source.fontFamily) ? source.fontFamily : "theme";
  const fontColor = readPosFontColorWithFallback(source.fontColor, DEFAULT_POS_RUNTIME_CONFIG.fontColor);
  const cardRadius = readPosRadiusWithFallback(source.cardRadius, DEFAULT_POS_RUNTIME_CONFIG.cardRadius);
  const buttonRadius = readPosRadiusWithFallback(source.buttonRadius, DEFAULT_POS_RUNTIME_CONFIG.buttonRadius);
  const paymentMethods = {
    cash: readBoolean(paymentSource.cash, DEFAULT_POS_RUNTIME_CONFIG.paymentMethods.cash),
    gcash: readBoolean(paymentSource.gcash, DEFAULT_POS_RUNTIME_CONFIG.paymentMethods.gcash),
    maya: readBoolean(paymentSource.maya, DEFAULT_POS_RUNTIME_CONFIG.paymentMethods.maya),
    card: readBoolean(paymentSource.card, DEFAULT_POS_RUNTIME_CONFIG.paymentMethods.card),
  };
  if (!Object.values(paymentMethods).some(Boolean)) paymentMethods.cash = true;

  return {
    palette,
    customColor: typeof source.customColor === "string" && /^#[0-9a-f]{6}$/i.test(source.customColor) ? source.customColor : DEFAULT_POS_RUNTIME_CONFIG.customColor,
    uiStyle,
    fontFamily,
    fontColor,
    cardRadius,
    buttonRadius,
    defaultOrderType: enabledOrderTypes.includes(configuredDefault) ? configuredDefault : enabledOrderTypes[0],
    orderTypes: enabledOrderTypes,
    paymentMethods,
    vatRate: readNumber(source.vatRate, vatRateFallback, 0, 1),
    showVat: readBoolean(source.showVat, showVatFallback),
    showStockStatus: readBoolean(source.showStockStatus, DEFAULT_POS_RUNTIME_CONFIG.showStockStatus),
    enableOrderNotes: readBoolean(source.enableOrderNotes, DEFAULT_POS_RUNTIME_CONFIG.enableOrderNotes),
    receiptHeader: typeof source.receiptHeader === "string" ? source.receiptHeader.slice(0, 200) : "",
    receiptFooter: typeof source.receiptFooter === "string" ? source.receiptFooter.slice(0, 200) : "",
    showCashier: readBoolean(source.showCashier, DEFAULT_POS_RUNTIME_CONFIG.showCashier),
    paperWidth: normalizePaperWidth(source.paperWidth),
  };
}

function readStorePosConfig(value: unknown): { name: string | null; address: string | null; tin: string | null; posConfig: PosRuntimeConfig; displaySettings: DisplaySettings } {
  const store = isRecord(value) ? value : {};
  const settings = isRecord(store.settings) ? store.settings : {};
  const storeVatRate = readNumber(store.vat_rate, DEFAULT_POS_RUNTIME_CONFIG.vatRate, 0, 1);
  return {
    name: typeof store.name === "string" ? store.name : null,
    address: typeof store.address === "string" ? store.address : null,
    tin: typeof store.tin === "string" ? store.tin : null,
    posConfig: normalizePosRuntimeConfig(settings.pos_config, storeVatRate, Boolean(store.vat_registered)),
    displaySettings: normalizeDisplaySettings(settings.customer_display),
  };
}

function readDevicePrinterSettings(value: unknown): PrinterSettings | null {
  if (!isRecord(value)) return null;
  const config = isRecord(value.printer_config) ? value.printer_config : {};
  const transport = value.printer_transport === "bluetooth" || value.printer_transport === "usb" ? value.printer_transport : "network";
  return {
    transport,
    bridgeHost: typeof config.bridge_host === "string" && config.bridge_host.trim() ? config.bridge_host.trim() : "127.0.0.1",
    bridgePort: readNumber(config.bridge_port, 8787, 1, 65535),
    ip: typeof config.ip === "string" ? config.ip.trim() : "",
    port: readNumber(config.port, 9100, 1, 65535),
    paperWidth: normalizePaperWidth(config.paper_width),
  };
}

function branchPrefix(storeName: string | null): string {
  const words = (storeName ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3);
  return letters || "POS";
}

function readDeviceBinding(): PosDeviceBinding | null {
  try {
    const raw = localStorage.getItem(POS_DEVICE_BINDING_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const binding = value as Partial<PosDeviceBinding>;
    if (typeof binding.deviceId !== "string" || typeof binding.storeId !== "string" || typeof binding.devicePrefix !== "string") return null;
    return { deviceId: binding.deviceId, storeId: binding.storeId, devicePrefix: binding.devicePrefix, boundAt: typeof binding.boundAt === "string" ? binding.boundAt : "" };
  } catch {
    return null;
  }
}

type IconName =
  | "search"
  | "hold"
  | "receipt"
  | "more"
  | "chevron"
  | "grid"
  | "list"
  | "trash"
  | "person"
  | "arrow"
  | "pig"
  | "belly"
  | "bowl"
  | "kawali"
  | "rice"
  | "drink"
  | "extras"
  | "package"
  | "sauce"
  | "sparkle"
  | "heart"
  | "close"
  | "printer"
  | "display"
  | "cash"
  | "settings"
  | "empty-order";

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="6.8" /><path d="m16 16 4.3 4.3" /></>,
    hold: <><path d="M7 4v16M17 4v16" /><path d="M9 7h6M9 17h6" /></>,
    receipt: <><path d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6L8 20.5 6 19z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    "empty-order": <><path d="M5 8.5h14l-1.4 11H6.4L5 8.5Z" /><path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" /><path d="M9 12.5h6M12 11v3" /></>,
    more: <><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
    chevron: <path d="m7 9 5 5 5-5" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    trash: <><path d="M4 7h16M10 11v5M14 11v5" /><path d="M6.5 7 8 20h8l1.5-13M9 7V4h6v3" /></>,
    person: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.5 3-5.3 7-5.3s6.2 1.8 7 5.3" /><path d="M19 5v4M17 7h4" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    pig: <><path d="M5.2 13.6c0-3.5 3.1-6.2 7.6-6.2 2 0 3.8.6 5.1 1.7l2.1-.7.5 2.1-1.6 1.1c.1.5.2 1 .2 1.6 0 3.5-3.2 5.8-7.5 5.8H8.2l-2.2 1.1.3-2.8c-.7-.7-1.1-1.6-1.1-2.7Z" /><circle cx="15.8" cy="11.2" r=".7" fill="currentColor" stroke="none" /><path d="M7.1 12.3H5.4a1.6 1.6 0 1 1 .5-3" /></>,
    belly: <><ellipse cx="12" cy="12" rx="8" ry="7" /><path d="M8 9.5c1.2-1.2 2.8-1.2 4 0s2.8 1.2 4 0M8 14.5c1.2-1.2 2.8-1.2 4 0s2.8 1.2 4 0" /></>,
    bowl: <><path d="M4 10.5h16c-.5 5-3.2 8-8 8s-7.5-3-8-8Z" /><path d="M7 7.5c1.4-1.7 3.2-2.5 5-2.5s3.6.8 5 2.5M3 10.5h18" /></>,
    kawali: <><path d="M5 9h14l-1 9H6z" /><path d="M8 9V6h8v3M4 20h16" /><circle cx="9" cy="13" r=".6" fill="currentColor" stroke="none" /><circle cx="13" cy="15" r=".6" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r=".6" fill="currentColor" stroke="none" /></>,
    rice: <><path d="M5 11h14c-.4 5.2-3 8-7 8s-6.6-2.8-7-8Z" /><path d="M8 8c.6-1.8 1.9-3 4-3s3.4 1.2 4 3" /><path d="M4 11h16" /></>,
    drink: <><path d="M8 5h8l-1 15H9L8 5Z" /><path d="M9 9h6M10 2h4" /><path d="M10 2v3" /></>,
    extras: <><path d="M12 4c1.5 1.7 3.2 2.8 3.2 5.1A3.2 3.2 0 1 1 8.8 9.1C8.8 7 10.5 5.7 12 4Z" /><path d="M5 15c1-1.2 2.1-1.5 3.3-.7M19 15c-1-1.2-2.1-1.5-3.3-.7" /></>,
    package: <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /><path d="m8 6 8 4" /></>,
    sauce: <><path d="M10 4h4v3h-4zM9 7h6l1 13H8L9 7Z" /><path d="M9 12h6" /></>,
    sparkle: <><path d="m12 3 1.2 5.8L19 10l-5.8 1.2L12 17l-1.2-5.8L5 10l5.8-1.2L12 3ZM19 16l.5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5L19 16Z" /></>,
    heart: <path d="M20.8 8.6c0 4.8-8.8 10.3-8.8 10.3S3.2 13.4 3.2 8.6A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.1Z" />,
    close: <><path d="m7 7 10 10M17 7 7 17" /></>,
    printer: <><path d="M6 9V4h12v5M6 17H4V9h16v8h-2" /><path d="M7 14h10v6H7z" /><path d="M17 11h.1" /></>,
    display: <><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" /><path d="M8 20h8M12 16.5V20" /></>,
    cash: <><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 10v4M17.5 10v4" /></>,
    settings: <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="3.5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function productImage(product: Product) {
  return resolveProductImage(product.name, product.image_url);
}

function categoryIcon(name: string): IconName {
  const value = name.toLowerCase();
  if (value.includes("whole") || value.includes("lechon")) return value.includes("belly") ? "belly" : value.includes("paksiw") ? "bowl" : value.includes("kawali") ? "kawali" : "pig";
  if (value.includes("rice") || value.includes("side")) return "rice";
  if (value.includes("drink")) return "drink";
  if (value.includes("extra")) return "extras";
  if (value.includes("package")) return "package";
  if (value.includes("sauce")) return "sauce";
  return "grid";
}

export default function SellScreen({ offlineProfile: initialOfflineProfile }: { offlineProfile?: OfflineProfileSnapshot } = {}) {
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProductId, setStockByProductId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const storeName = profile?.store_name ?? DEFAULT_STORE_NAME;

  const [activeCat, setActiveCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [posConfig, setPosConfig] = useState<PosRuntimeConfig>(DEFAULT_POS_RUNTIME_CONFIG);
  const [orderType, setOrderType] = useState(DEFAULT_POS_RUNTIME_CONFIG.defaultOrderType);
  const [discountOpen, setDiscountOpen] = useState(false);

  const [keypad, setKeypad] = useState<{ product: Product; lineKey?: string } | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<PaymentPreview | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [displayOverride, setDisplayOverride] = useState<DisplayState | null>(null);
  const [toast, setToast] = useState<{ msg: string; retry?: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [requiresOfflineUnlock, setRequiresOfflineUnlock] = useState(false);
  const [unlockedOfflineProfile, setUnlockedOfflineProfile] = useState<OfflineProfileSnapshot | null>(null);
  const [offlineCredential, setOfflineCredential] = useState<OfflineCredential | null>(null);
  const [offlineCatalogReady, setOfflineCatalogReady] = useState(false);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(() =>
    loadPrinterSettings(),
  );
  const printing = usePosPrinting(printerSettings, (message, label) => {
    setToast({ msg: `Couldn't print ${label} — ${message}`, retry: true });
  });
  const { doPrint, lastReceipt, hasReceipt, failedCount: failedPrintCount, state: printState } = printing;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [displayPairingToken, setDisplayPairingToken] = useState<string | null>(() => loadDisplayPairingToken());
  const [shiftOpen, setShiftOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [categoryRailOpen, setCategoryRailOpen] = useState(false);
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collapsedNavRef = useRef<HTMLButtonElement>(null);
  const collapseNavRef = useRef<HTMLButtonElement>(null);
  const navWasOpen = useRef(false);
  const displayLinkRef = useRef<DisplayLink | null>(null);
  const [displayLink, setDisplayLink] = useState<DisplayLink | null>(null);
  const [orderState, dispatchOrder] = useReducer(orderReducer, { status: "empty" } as const);
  const payOpen = orderState.status === "paying";
  const success = useMemo(
    () => orderState.status === "saved" ? { orderNo: orderState.orderNo, change: orderState.change } : null,
    [orderState],
  );
  const orderTypeScope = useRef<string | null>(null);
  const offlineProfile = initialOfflineProfile ?? unlockedOfflineProfile;
  const syncProfile = offlineProfile ?? profile;
  const syncUserId = syncProfile?.id ?? null;
  const syncOrgId = syncProfile?.org_id ?? null;
  const syncStoreId = syncProfile?.store_id ?? null;

  const stockNotice = useCallback((product: Product, available: number | undefined) => {
    const status = stockStatus(available, product.min_stock);
    if (status === "out") {
      setToast({ msg: `${product.name} is out of recorded stock. The sale can still continue.` });
    } else if (status === "low") {
      setToast({ msg: `${product.name} is low: ${formatStockQuantity(available ?? 0)} ${product.unit} recorded.` });
    }
  }, []);
  const cartState = useCartState({ stockByProductId, onStockNotice: stockNotice });
  const {
    cart,
    note,
    setNote,
    discount,
    setDiscount,
    parked,
    maxParked: MAX_PARKED,
    chooseProduct: chooseProductFromCart,
    bump,
    applyWeight,
    removeLine,
    clearCart,
    holdOrder: holdCart,
    resumeOrder: resumeCart,
    removeParked,
  } = cartState;

  // P8: the till this terminal is ringing into. Cached on the device so an
  // offline sale still carries its shift through the outbox.
  const { shift: activeShift, setShift: setActiveShift } = useActiveShift(profile, offline);
  const shiftButtonLabel = activeShift ? "Shift active" : "Start shift";
  const shiftButtonAriaLabel = activeShift ? "View active shift" : "Start a shift";

  const applyProfile = useCallback((nextProfile: ProfileData | OfflineProfileSnapshot, nextPrinterSettings?: PrinterSettings) => {
    const nextConfig = normalizePosRuntimeConfig(nextProfile.pos_config);
    const normalizedProfile: ProfileData = {
      id: nextProfile.id,
      org_id: nextProfile.org_id,
      store_id: nextProfile.store_id,
      store_name: nextProfile.store_name,
      store_address: nextProfile.store_address ?? null,
      store_tin: nextProfile.store_tin ?? null,
      brand_logo_url: nextProfile.brand_logo_url ?? null,
      full_name: nextProfile.full_name,
      role: nextProfile.role,
      discount_threshold: normalizeAdminDiscountThreshold(nextProfile.discount_threshold),
      device_id: nextProfile.device_id ?? null,
      display_pairing_token: normalizeDisplayPairingToken(nextProfile.display_pairing_token) ?? loadDisplayPairingToken(),
      display_promotions: Array.isArray(nextProfile.display_promotions) ? nextProfile.display_promotions : nextProfile.display_promotions,
      display_gallery: Array.isArray(nextProfile.display_gallery) ? nextProfile.display_gallery : nextProfile.display_gallery,
      display_settings: nextProfile.display_settings ? normalizeDisplaySettings(nextProfile.display_settings) : undefined,
      pos_config: nextConfig,
    };
    setProfile(normalizedProfile);
    setDisplayPairingToken(normalizedProfile.display_pairing_token ?? null);
    if (normalizedProfile.display_pairing_token) saveDisplayPairingToken(normalizedProfile.display_pairing_token);
    setPosConfig(nextConfig);
    const scope = nextProfile.store_id ?? nextProfile.org_id;
    setOrderType((current) => {
      if (orderTypeScope.current !== scope) {
        orderTypeScope.current = scope;
        return nextConfig.defaultOrderType;
      }
      return nextConfig.orderTypes.includes(current) ? current : nextConfig.defaultOrderType;
    });
    if (nextPrinterSettings) {
      setPrinterSettings(nextPrinterSettings);
      savePrinterSettings(nextPrinterSettings);
    } else {
      setPrinterSettings((current) => current.paperWidth === nextConfig.paperWidth ? current : { ...current, paperWidth: nextConfig.paperWidth });
    }
  }, []);

  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get("quickAction");
    if (!action) return;
    window.history.replaceState({}, "", window.location.pathname);

    const timer = window.setTimeout(() => {
      if (action === "park") {
        setNavOpen(true);
        setTrayOpen(true);
        return;
      }

      if (action === "drawer") {
        setNavOpen(true);
        void openCashDrawer(printerSettings)
          .then(() => setToast({ msg: "Cash drawer opened." }))
          .catch((error: unknown) => setToast({ msg: error instanceof Error ? error.message : "Cash drawer could not be opened." }));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [printerSettings]);

  // ── Catalog: network first, cached fallback (P2) ─────────────────────
  // NOTE: postgrest-js THROWS on network failures (fetch rejects) and only
  // resolves `{error}` for HTTP errors — both must be treated as offline.
  const refreshCatalog = useCallback(async () => {
    if (offlineProfile) {
      const cached = await loadCachedCatalog(offlineProfile.store_id ?? offlineProfile.org_id, offlineProfile.id).catch(() => null);
      if (cached) {
        const cachedCategories = cached.categories as Category[];
        const cachedProducts = cached.products as Product[];
        applyProfile(withCatalogGallery(cached.profile, cachedProducts, cachedCategories));
        setCategories(cachedCategories);
        setProducts(cachedProducts);
        setStockByProductId(cached.stock ?? {});
      } else {
        applyProfile(withCatalogGallery(offlineProfile, [], []));
        setCategories([]);
        setProducts([]);
        setStockByProductId({});
      }
      setRequiresOfflineUnlock(false);
      setOffline(true);
      setLoading(false);
      return;
    }

    if (!navigator.onLine) {
      const credential = await getOfflineCredential();
      const cached = credential
        ? await loadCachedCatalog(credential.profile.store_id ?? credential.profile.org_id, credential.user_id).catch(() => null)
        : null;
      setOfflineCredential(credential);
      setOfflineCatalogReady(Boolean(cached));
      setRequiresOfflineUnlock(true);
      setOffline(true);
      setLoading(false);
      return;
    }

    let profileData: ProfileData | null = null;
    let sessionUserId: string | null = null;
    let databasePrinterSettings: PrinterSettings | undefined;
    let databaseDeviceId: string | null = null;
    let databaseDisplayPairingToken: string | null = null;
    let databaseDisplayPromotions: DisplayPromotion[] | undefined;
    let databaseDisplayGallery: DisplayGalleryItem[] | undefined;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      sessionUserId = session?.user.id ?? null;
      if (session) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, org_id, store_id, organizations!profiles_org_id_fkey(settings), stores(name, address, tin, vat_registered, vat_rate, settings), full_name, role")
          .eq("id", session.user.id)
          .single();
        if (prof) {
          const binding = readDeviceBinding();
          let effectiveStoreId = prof.store_id as string | null;
          let effectiveStore = prof.stores;
          if (binding) {
            const { data: boundDevice } = await supabase
              .from("devices")
              .select("id, store_id, paired_display_id, printer_transport, printer_config, stores(name, address, tin, vat_registered, vat_rate, settings)")
              .eq("id", binding.deviceId)
              .eq("org_id", prof.org_id)
              .eq("is_active", true)
              .maybeSingle();
            if (boundDevice && (prof.role === "admin" || !prof.store_id || prof.store_id === boundDevice.store_id)) {
              effectiveStoreId = boundDevice.store_id;
              effectiveStore = boundDevice.stores;
              databaseDeviceId = boundDevice.id;
              databasePrinterSettings = readDevicePrinterSettings(boundDevice) ?? undefined;
              databaseDisplayPairingToken = normalizeDisplayPairingToken(boundDevice.paired_display_id);
            } else {
              localStorage.removeItem(POS_DEVICE_BINDING_KEY);
            }
          }
          const store = readStorePosConfig(effectiveStore);
          const organizationRelation = Array.isArray(prof.organizations) ? prof.organizations[0] : prof.organizations;
          const branding = readAdminBranding(isRecord(organizationRelation) ? organizationRelation.settings : undefined);
          const discountSettings = readAdminDiscountSettings(isRecord(organizationRelation) ? organizationRelation.settings : undefined);
          if (effectiveStoreId && (!databasePrinterSettings || !databaseDisplayPairingToken)) {
            const { data: terminal } = await supabase
              .from("devices")
              .select("id, paired_display_id, printer_transport, printer_config")
              .eq("store_id", effectiveStoreId)
              .eq("is_active", true)
              .order("last_seen_at", { ascending: false })
              .order("name")
              .limit(1)
              .maybeSingle();
            databasePrinterSettings = readDevicePrinterSettings(terminal) ?? undefined;
            databaseDeviceId = terminal?.id ?? databaseDeviceId;
            databaseDisplayPairingToken = normalizeDisplayPairingToken(terminal?.paired_display_id);
          }
          if (effectiveStoreId) {
            const { data: displayPromotionRows } = await supabase
              .from("display_promotions")
              .select("id, store_id, eyebrow, title, detail, tagline, image_url, is_active, sort_order, starts_at, ends_at")
              .eq("store_id", effectiveStoreId)
              .eq("is_active", true)
              .order("sort_order")
              .order("created_at");
            databaseDisplayPromotions = normalizeDisplayPromotionRows(displayPromotionRows ?? []);
            const { data: displayGalleryRows } = await supabase
              .from("display_gallery_items")
              .select("id, store_id, kind, title, image_url, image_path, is_active, sort_order, overlay_position")
              .eq("store_id", effectiveStoreId)
              .eq("kind", "marketing")
              .eq("is_active", true)
              .order("kind")
              .order("sort_order")
              .order("created_at");
            databaseDisplayGallery = normalizeDisplayGalleryRows(displayGalleryRows ?? []);
          }
          profileData = {
            id: prof.id,
            org_id: prof.org_id,
            store_id: effectiveStoreId,
            store_name: store.name,
            store_address: store.address,
            store_tin: store.tin,
            brand_logo_url: branding.logoUrl,
            full_name: (prof.full_name as string | null) ?? null,
            role: (prof.role as ProfileData["role"]) ?? null,
            discount_threshold: discountSettings.adminPinThresholdPercent,
            device_id: databaseDeviceId,
            display_pairing_token: databaseDisplayPairingToken,
            display_promotions: databaseDisplayPromotions?.length ? databaseDisplayPromotions : undefined,
            display_gallery: databaseDisplayGallery,
            display_settings: store.displaySettings,
            pos_config: store.posConfig,
          };
        }
      }
    } catch {
      /* offline — fall through to the cache */
    }

    // Offline (session refresh or profile fetch failed): serve the cache.
    if (!profileData) {
      const cached = await loadCachedCatalog(readDeviceBinding()?.storeId, sessionUserId ?? undefined);
      if (cached) {
        setOfflineCredential(await getOfflineCredential());
        setOfflineCatalogReady(true);
      } else {
        setOfflineCredential(null);
        setOfflineCatalogReady(false);
      }
      setRequiresOfflineUnlock(true);
      setOffline(true);
      setLoading(false);
      return;
    }
    if (profileData.device_id && profileData.store_id) {
      void supabase
        .from("devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", profileData.device_id)
        .eq("org_id", profileData.org_id)
        .eq("store_id", profileData.store_id);
    }

    try {
      const scope = profileData.store_id
        ? { column: "store_id", value: profileData.store_id }
        : { column: "org_id", value: profileData.org_id };
      const [catRes, prodRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, icon")
          .eq(scope.column, scope.value)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id, name, pricing_mode, price, unit, category_id, image_url, track_stock, min_stock")
          .eq(scope.column, scope.value)
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      if (catRes.error || prodRes.error) throw catRes.error || prodRes.error;
      const nextStock: Record<string, number> = {};
      let stockError = false;
      if (profileData.store_id) {
        const stockRes = await supabase.rpc("current_stock", { p_org_id: profileData.org_id });
        if (!stockRes.error) {
          for (const stock of (stockRes.data ?? []) as StockRow[]) {
            if (stock.store_id === profileData.store_id) nextStock[stock.product_id] = Number(stock.qty);
          }
        } else {
          const fallbackStockRes = await supabase
            .from("stock_movements")
            .select("product_id, type, qty")
            .eq("store_id", profileData.store_id)
            .limit(5000);
          stockError = Boolean(fallbackStockRes.error);
          for (const movement of fallbackStockRes.data ?? []) {
            nextStock[movement.product_id] =
              (nextStock[movement.product_id] ?? 0) +
              stockMovementDelta(movement.type, Number(movement.qty));
          }
        }
      }
      const nextCategories = (catRes.data ?? []) as Category[];
      const nextProducts = (prodRes.data ?? []) as Product[];
      const catalogProfile = withCatalogGallery(profileData, nextProducts, nextCategories);
      applyProfile(catalogProfile, databasePrinterSettings);
      setCategories(nextCategories);
      setProducts(nextProducts);
      if (stockError) {
        // A catalog can still be useful when the ledger query is unavailable;
        // keep tracked tiles in the unknown state instead of falsely showing 0.
        setStockByProductId({});
      } else {
        setStockByProductId(nextStock);
      }
      try {
        await saveCatalogCache(
          prodRes.data ?? [],
          catRes.data ?? [],
          catalogProfile,
          stockError ? undefined : nextStock,
        );
      } catch {
        // IndexedDB is an offline enhancement. Keep the online catalog usable
        // when browser storage is blocked or temporarily out of space.
      }
      setRequiresOfflineUnlock(false);
      setOffline(false);
    } catch {
      // A successful profile read does not prove that the catalog is safe to
      // use offline. Require the same device PIN before serving cached menu
      // data after a catalog/API failure, including a stale browser session.
      const cached = await loadCachedCatalog(profileData.store_id ?? readDeviceBinding()?.storeId, profileData.id).catch(() => null);
      setOfflineCredential(cached ? await getOfflineCredential() : null);
      setOfflineCatalogReady(Boolean(cached));
      setRequiresOfflineUnlock(true);
      setOffline(true);
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [applyProfile, offlineProfile, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- catalog hydration is the external cache/network boundary.
    void refreshCatalog();
  }, [refreshCatalog]);

  const refreshDisplaySettings = useCallback(async () => {
    const storeId = profile?.store_id;
    if (offlineProfile || !storeId || !navigator.onLine) return;

    const { data, error } = await supabase
      .from("stores")
      .select("settings")
      .eq("id", storeId)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) return;

    const storeSettings = isRecord(data.settings) ? data.settings : {};
    const nextDisplaySettings = normalizeDisplaySettings(storeSettings.customer_display);
    setProfile((current) => {
      if (!current || current.store_id !== storeId) return current;
      const currentDisplaySettings = current.display_settings ?? DEFAULT_DISPLAY_SETTINGS;
      if (JSON.stringify(currentDisplaySettings) === JSON.stringify(nextDisplaySettings)) return current;
      return { ...current, display_settings: nextDisplaySettings };
    });
  }, [offlineProfile, profile?.store_id, supabase]);

  /**
   * Customer-display settings are owner-edited perhaps monthly, so the poll
   * exists only to catch a change made on another device. At the original 4s
   * that was ~10,800 requests per terminal per trading day — roughly 1.3 GB of
   * egress a month across two terminals, about a quarter of the Supabase free
   * tier's budget, re-reading a row that almost never changes. It also kept the
   * tablet radio awake for a full shift.
   *
   * 60s is the backstop, not the mechanism: `focus` and `visibilitychange` both
   * refresh immediately, so an owner who changes a setting and picks the
   * terminal back up sees it at once rather than waiting out the interval.
   */
  useEffect(() => {
    if (offlineProfile || !profile?.store_id) return;
    const refresh = () => { void refreshDisplaySettings(); };
    const refreshIfVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    const timer = window.setInterval(refresh, DISPLAY_SETTINGS_POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [offlineProfile, profile?.store_id, refreshDisplaySettings]);

  // P5: the customer display is a passive side effect. It keeps the latest
  // snapshot internally and never participates in the sale's critical path.
  useEffect(() => {
    const token = normalizeDisplayPairingToken(displayPairingToken);
    if (!token) return;

    const link = createDisplayLink({ token, role: "publisher", supabase });
    displayLinkRef.current = link;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- expose the external display subscription to the hardware-status hook.
    setDisplayLink(link);
    return () => {
      if (displayLinkRef.current === link) {
        displayLinkRef.current = null;
        setDisplayLink(null);
      }
      void link.disconnect();
    };
  }, [displayPairingToken, supabase]);

  const syncScope = useMemo(() => (
    syncUserId && syncOrgId
      ? { userId: syncUserId, orgId: syncOrgId, storeId: syncStoreId }
      : null
  ), [syncOrgId, syncStoreId, syncUserId]);
  const handleSyncRecovered = useCallback(() => {
    if (!offlineProfile) setOffline(false);
  }, [offlineProfile]);
  const handleSyncOffline = useCallback(() => setOffline(true), []);
  const sync = usePosSync({
    supabase,
    offlineProfile,
    requiresOfflineUnlock,
    scope: syncScope,
    refreshCatalog,
    onRecovered: handleSyncRecovered,
    onOffline: handleSyncOffline,
  });
  const { pending, oldestQueuedSaleAt, syncFailure, flush, state: syncState } = sync;
  const hardware = usePosHardwareStatus({ displayLink, offline, printState, syncState });

  useEffect(() => {
    if (!toast) return;
    // Retry toasts need time to act on; plain notices can go quickly.
    const t = setTimeout(() => setToast(null), toast.retry ? 15000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Derived totals (centavos) ─────────────────────────────────────────
  const vatExemptByDiscount = discount.type === "senior" || discount.type === "pwd";
  const { subtotal, discountAmount, total, vatAmount, vatableSale, vatExemptSale } = saleTotals(cart, discount, {
    showVat: posConfig.showVat,
    vatRate: posConfig.vatRate,
    vatExempt: vatExemptByDiscount,
  });
  const adminPinThreshold = normalizeAdminDiscountThreshold(profile?.discount_threshold);
  const availablePaymentMethods = (['cash', 'gcash', 'maya', 'card'] as RuntimePaymentMethod[]).filter((method) => posConfig.paymentMethods[method]);
  const displayBranding = useMemo(() => ({
    storeName,
    logoUrl: profile?.brand_logo_url ?? null,
  }), [profile?.brand_logo_url, storeName]);
  const displaySettings = profile?.display_settings ?? DEFAULT_DISPLAY_SETTINGS;
  const displayPresentation = useMemo(() => ({
    settings: displaySettings,
    theme: posConfig.uiStyle,
    ...(profile?.display_promotions === undefined ? {} : { promotions: profile.display_promotions }),
    ...(profile?.display_gallery === undefined ? {} : { gallery: profile.display_gallery }),
  }), [displaySettings, posConfig.uiStyle, profile]);

  useEffect(() => {
    const link = displayLinkRef.current;
    if (!link || !profile) return;
    if (displayOverride) {
      link.push(displayOverride);
      return;
    }
    if (payOpen) {
      const preview = paymentPreview ?? { method: "cash" as RuntimePaymentMethod, tendered: null, changeDue: null };
      link.push({
        kind: "payment",
        branding: displayBranding,
        ...displayPresentation,
        total,
        tendered: preview.tendered,
        changeDue: preview.changeDue,
        paymentMethod: preview.method,
      });
      return;
    }
    if (cart.length === 0) {
      link.push({ kind: "idle", branding: displayBranding, ...displayPresentation });
      return;
    }
    link.push({
      kind: "active",
      branding: displayBranding,
      ...displayPresentation,
      lines: cart.map((line) => ({
        id: line.key,
        name: line.product.name,
        qty: line.qty,
        weightKg: line.weightKg,
        lineTotal: line.lineTotal,
      })),
      subtotal,
      discount: discountAmount,
      total,
    });
  }, [cart, discountAmount, displayBranding, displayOverride, displayPresentation, payOpen, paymentPreview, profile, subtotal, total]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (activeCat === "all" || p.category_id === activeCat) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products, activeCat, search]);

  // ── Cart and hold actions are owned by useCartState ────────────────────
  const chooseProduct = useCallback((product: Product) => {
    chooseProductFromCart(product);
    if (product.pricing_mode === "per_kg") setKeypad({ product });
  }, [chooseProductFromCart]);
  const holdOrder = useCallback(() => {
    if (cart.length > 0 && parked.length >= MAX_PARKED) {
      setToast({ msg: `Hold tray full (${MAX_PARKED}) — resume or clear one first.` });
      return;
    }
    if (holdCart()) setTrayOpen(false);
  }, [MAX_PARKED, cart.length, holdCart, parked.length]);
  const resumeOrder = useCallback((index: number) => {
    if (resumeCart(index)) setTrayOpen(false);
  }, [resumeCart]);
  const startPayment = useCallback(() => {
    const preview = buildPaymentPreview(total, availablePaymentMethods[0] ?? "cash", null);
    setPaymentPreview(preview);
    dispatchOrder({ type: "start_payment", preview });
  }, [availablePaymentMethods, total]);
  const closePayment = useCallback(() => {
    dispatchOrder({ type: "cancel_payment" });
    setPaymentPreview(null);
  }, []);
  const updatePaymentPreview = useCallback((preview: PaymentPreview) => {
    setPaymentPreview(preview);
    dispatchOrder({ type: "update_payment", preview });
  }, []);

  // ── Order placement: local-first, sync in background (P2) ────────────
  const placeOrder = async (method: RuntimePaymentMethod, tendered: number | null, payRef: string) => {
    if (!profile || cart.length === 0) return;
    const now = new Date();
    const orderNo = buildOrderNo(branchPrefix(profile.store_name));
    const isScPwd = discount.type === "senior" || discount.type === "pwd";
    const requiresApproval = discountRequiresApproval(discount, adminPinThreshold);

    // VAT split (P3): prices are VAT-inclusive; SC/PWD sales are VAT-exempt.
    const orderVatAmount = vatAmount;
    const changeDue = buildPaymentPreview(total, method, tendered).changeDue;

    displayLinkRef.current?.push({
      kind: "payment",
      branding: displayBranding,
      ...displayPresentation,
      total,
      tendered: method === "cash" ? tendered : null,
      changeDue,
      paymentMethod: method,
    });

    const p_items = cart.map((l) => ({
      product_id: l.product.id,
      name_snapshot: l.product.name,
      pricing_mode_snapshot: l.product.pricing_mode,
      unit_price_snapshot: l.product.price,
      qty: l.qty,
      weight_kg: l.weightKg ?? null,
      line_total: l.lineTotal,
    }));
    const localUuid = crypto.randomUUID();
    const p_order = {
      local_uuid: localUuid,
      org_id: profile.org_id,
      store_id: profile.store_id,
      device_id: profile.device_id ?? "",
      order_no: orderNo,
      shift_id: activeShift?.id ?? null,
      cashier_id: profile.id,
      status: "completed",
      subtotal,
      discount_type: discount.type,
      discount_amount: discountAmount,
      discount_approval_id: discount.approval_id ?? null,
      discount_ref: isScPwd ? `${discount.name} — ${discount.id}` : null,
      vatable_sale: vatableSale,
      vat_amount: orderVatAmount,
      vat_exempt_sale: vatExemptSale,
      total,
      payment_method: method,
      payment_ref: payRef || null,
      amount_tendered: method === "cash" ? tendered : null,
      change_due: method === "cash" && tendered !== null ? tendered - total : null,
      note: note.trim() || null,
      created_at_device: now.toISOString(),
    };

    const outOfRecordedStock = cart.filter(
      (line) => line.product.track_stock && stockStatus(stockByProductId[line.product.id], line.product.min_stock) === "out",
    );
    if (outOfRecordedStock.length > 0) {
      setToast({ msg: `${outOfRecordedStock.map((line) => line.product.name).join(", ")} has no recorded stock. The sale will still be saved.` });
    }

    try {
      await enqueueOrder(p_order, p_items);
    } catch {
      setToast({ msg: "Couldn't save order on this device — please try again." });
      return;
    }
    if (discount.type !== "none") {
      try {
        await enqueueAuditLog({
          org_id: profile.org_id,
          store_id: profile.store_id,
          actor_id: profile.id,
          action: "discount.applied",
          entity: "orders",
          after: {
            local_uuid: localUuid,
            discount_type: discount.type,
            discount_amount: discountAmount,
            discount_percent: discount.pct,
            admin_pin_required: requiresApproval,
          },
        });
      } catch {
        setToast({ msg: "Sale saved; the discount audit could not be queued for sync." });
      }
    }
    setStockByProductId((previous) => applySaleToStock(previous, cart));
    dispatchOrder({ type: "saved", orderNo, change: changeDue });
    setPaymentPreview(null);
    setDisplayOverride({ kind: "thankyou", branding: displayBranding, ...displayPresentation, orderNo, changeDue });
    clearCart();
    void flush();

    // Print the receipt (fire-and-forget; failure shows a retry toast).
    const receipt = buildReceipt({
       storeName: profile.store_name ?? DEFAULT_STORE_NAME,
       storeAddress: profile.store_address,
       storeTin: profile.store_tin,
      orderNo,
      cashier: profile.full_name ?? "",
      createdAt: now,
      items: cart.map((l) => ({
        name: l.product.name,
        qty: l.qty,
        weightKg: l.weightKg,
        lineTotal: l.lineTotal,
      })),
      subtotal,
      discountAmount,
      discountRef: isScPwd ? `${discount.name} — ${discount.id}` : null,
      vatableSale,
      vatAmount: orderVatAmount,
      vatExemptSale: vatExemptSale,
      total,
      paymentMethod: method,
      paymentRef: payRef || null,
      amountTendered: method === "cash" ? tendered : null,
      changeDue: method === "cash" && tendered !== null ? tendered - total : null,
      paperWidth: posConfig.paperWidth,
      vatRate: posConfig.vatRate,
      showVat: posConfig.showVat,
      receiptHeader: posConfig.receiptHeader,
      receiptFooter: posConfig.receiptFooter,
      showCashier: posConfig.showCashier,
    });
    void doPrint(receipt);
  };

  const saveDisplayPairing = async (value: string | null) => {
    const token = normalizeDisplayPairingToken(value);
    if (!token) throw new Error("Create a valid customer display pairing token first.");

    if (profile?.device_id && profile.store_id) {
      const { error } = await supabase
        .from("devices")
        .update({ paired_display_id: token, last_seen_at: new Date().toISOString() })
        .eq("id", profile.device_id)
        .eq("org_id", profile.org_id)
        .eq("store_id", profile.store_id);
      if (error) throw error;
    } else {
      setToast({ msg: "Pairing is saved on this browser. Finish tablet setup to persist it to the terminal." });
    }

    saveDisplayPairingToken(token);
    setDisplayPairingToken(token);
    setProfile((current) => current ? { ...current, display_pairing_token: token } : current);
  };

  const savePrinter = async (s: PrinterSettings) => {
    savePrinterSettings(s);
    setPrinterSettings(s);
    // Admins also persist the row to the devices table (follows the tablet).
    if (profile?.role === "admin" && profile.store_id) {
      const binding = readDeviceBinding();
      const printerConfig = {
        ip: s.ip,
        port: s.port,
        paper_width: s.paperWidth,
        bridge_host: s.bridgeHost,
        bridge_port: s.bridgePort,
      };
      const { error } = binding && profile.device_id === binding.deviceId
        ? await supabase.from("devices").update({ printer_transport: s.transport, printer_config: printerConfig, last_seen_at: new Date().toISOString() }).eq("id", binding.deviceId).eq("org_id", profile.org_id).eq("store_id", profile.store_id)
        : await supabase.from("devices").upsert(
            {
              org_id: profile.org_id,
              store_id: profile.store_id,
              name: `Tablet ${getDeviceId()}`,
              device_prefix: getDeviceId(),
              printer_transport: s.transport,
              printer_config: printerConfig,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "store_id,device_prefix" },
          );
      if (error) throw error;
    }
  };

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      dispatchOrder({ type: "dismiss_saved" });
      setDisplayOverride(null);
    }, 3000);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (navOpen) collapseNavRef.current?.focus();
      else if (navWasOpen.current) collapsedNavRef.current?.focus();
      navWasOpen.current = navOpen;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  async function openCachedOfflineProfile(credential: OfflineCredential) {
    const cached = await loadCachedCatalog(credential.profile.store_id ?? credential.profile.org_id, credential.user_id).catch(() => null);
    if (!cached) throw new Error("Offline POS is not ready yet. Sign in online and open POS once to cache this branch menu.");
    setLoading(true);
    setUnlockedOfflineProfile(cached.profile);
  }

  if (!loading && !offlineProfile && requiresOfflineUnlock) {
    return (
      <main className="min-h-full flex items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Dumala POS</p>
          <h1 className="mt-1 text-2xl font-extrabold text-ink">Offline POS</h1>
          {offlineCredential && offlineCatalogReady ? (
            <OfflinePinUnlock credential={offlineCredential} onUnlock={openCachedOfflineProfile} />
          ) : (
            <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-sm font-semibold text-ink">
              Offline access is not set up on this tablet. Sign in online, open POS, and create an offline PIN first.
            </p>
          )}
        </div>
      </main>
    );
  }

  if (!loading) {
    const displayName = profile?.full_name?.split(/\s+/)[0] ?? "Admin";
    const initials = displayName.slice(0, 1).toUpperCase();
    const discountLabel =
      discount.type === "none"
        ? "Discount"
        : discount.type === "custom"
          ? discount.pct + "%"
          : discount.type === "senior"
            ? "Senior"
            : "PWD";
    const categoryOptions = categories.some((category) => category.id === "all")
      ? categories
      : [{ id: "all", name: "All Items", icon: "grid" }, ...categories];
    const activeCategoryName = categoryOptions.find((category) => category.id === activeCat)?.name ?? "All Items";
    const palette = getPosPalette(posConfig.palette, posConfig.customColor);
    const primary = palette.primary;
    const theme = getPosTheme(posConfig.uiStyle);
    const themeVars = theme.variables;
    const font = getPosFont(posConfig.fontFamily, themeVars["--pos-theme-font"]);
    const fontColor = posConfig.fontColor ?? themeVars["--pos-theme-text"];
    const cardRadius = resolvePosRadius(posConfig.cardRadius, themeVars["--pos-theme-radius-card"], 12);
    const buttonRadius = resolvePosRadius(posConfig.buttonRadius, themeVars["--pos-theme-radius-btn"], 10);
    const posAppStyle = {
      ...themeVars,
      "--pos-theme-font": font.family,
      "--pos-theme-text": fontColor,
      "--text": fontColor,
      "--pos-theme-radius-card": cardRadius,
      "--pos-theme-radius-btn": buttonRadius,
      "--bg": themeVars["--pos-theme-bg"],
      "--surface": themeVars["--pos-theme-surface"],
      "--surface-panel": themeVars["--pos-theme-surface-panel"],
      "--surface-raised": themeVars["--pos-theme-surface-raised"],
      "--sidebar": themeVars["--pos-theme-sidebar"],
      "--border": themeVars["--pos-theme-border"],
      "--border-strong": themeVars["--pos-theme-border-strong"],
      "--text-muted": themeVars["--pos-theme-text-muted"],
      "--text-subtle": themeVars["--pos-theme-text-subtle"],
      "--primary": primary,
      "--primary-hover": palette.hover,
      "--primary-deep": palette.deep,
      "--primary-tint": palette.tint,
      "--primary-glow": palette.glow,
      "--primary-fg": palette.contrast,
      "--primary-soft": palette.soft,
      "--accent": primary,
      "--accent-hover": palette.hover,
      "--accent-deep": palette.deep,
      "--accent-tint": palette.tint,
      "--accent-glow": palette.glow,
      "--accent-gradient": palette.gradient,
      "--accent-fg": palette.contrast,
      "--pos-theme-highlight": primary,
      "--pos-theme-highlight-soft": palette.tint,
      "--pos-theme-primary-soft": palette.soft,
      "--secondary-btn": themeVars["--pos-theme-secondary"],
      "--secondary-btn-hover": themeVars["--pos-theme-secondary-hover"],
      "--radius-card": cardRadius,
      "--radius-btn": buttonRadius,
      "--shadow-card": themeVars["--pos-theme-shadow-card"],
      "--shadow-pop": themeVars["--pos-theme-shadow-pop"],
    } as CSSProperties;

    return (
      <main className={`pos-app pos-app--${posConfig.uiStyle}`} style={posAppStyle}>
        {profile && !offline && (
          <OfflinePinSetup profile={profile} />
        )}
        <header className={"pos-topbar" + (navOpen ? " is-open" : "")}>
          {!navOpen ? (
            <button
              type="button"
              className="pos-topbar__collapsed"
              ref={collapsedNavRef}
              aria-controls="pos-header-nav"
              aria-expanded={false}
              onClick={() => setNavOpen(true)}
            >
              <span className="pos-topbar__collapsed-brand">
                <AdminBrandLogo logoUrl={profile?.brand_logo_url} className="pos-topbar__collapsed-mark" iconSize={22} label="Brand logo" />
                <span className="pos-topbar__collapsed-copy">
                  <strong>{storeName}</strong>
                  <small>POS TERMINAL</small>
                </span>
              </span>
              <span className="pos-topbar__collapsed-state">
                <span className={"pos-topbar__collapsed-dot" + (offline || syncFailure ? " is-offline" : "")} />
                {syncFailure ? "Sync issue" : offline ? "Offline" : "Ready to sell"}
                {pending > 0 && <span> · {pending} pending</span>}
              </span>
              <span className="pos-topbar__collapsed-action">
                <span>Open navigation</span>
                <Icon name="chevron" size={17} />
              </span>
            </button>
          ) : (
            <nav className="pos-topbar__expanded" id="pos-header-nav" aria-label="POS navigation">
              <div className="pos-topbar__identity">
                <div className="pos-topbar__brand">
                  <div className="brand-lockup" aria-label={storeName}>
                    <AdminBrandLogo logoUrl={profile?.brand_logo_url} className="brand-lockup__mark" iconSize={30} label="Brand logo" />
                    <span className="brand-lockup__copy">
                      <strong>{storeName}</strong>
                      <small>POS TERMINAL</small>
                    </span>
                  </div>
                </div>

                <div className="pos-mode-tabs" role="tablist" aria-label="Main navigation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!orderHistoryOpen}
                    className={"pos-mode-tab" + (!orderHistoryOpen ? " is-active" : "")}
                    onClick={() => setOrderHistoryOpen(false)}
                  >
                    POS
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={orderHistoryOpen}
                    className={"pos-mode-tab" + (orderHistoryOpen ? " is-active" : "")}
                    onClick={() => setOrderHistoryOpen(true)}
                  >
                    ORDERS
                  </button>
                </div>
              </div>

              <div className="pos-toolbar" role="group" aria-label="POS tools">
                <button
                  type="button"
                  className={"pos-tool pos-tool--shift" + (activeShift ? " is-active" : "")}
                  onClick={() => setShiftOpen(true)}
                  aria-label={shiftButtonAriaLabel}
                  title={shiftButtonAriaLabel}
                >
                  <Icon name="cash" size={24} />
                  <span>{shiftButtonLabel}</span>
                </button>
                <AdminMenu
                  triggerLabel="Open more POS tools"
                  triggerClassName="pos-tool pos-tool--more"
                  panelTitle="More tools"
                  panelClassName="pos-more-menu__panel"
                  trigger={
                    <>
                      <Icon name="more" size={24} />
                      <span>More</span>
                    </>
                  }
                >
                  <button
                    type="button"
                    className={`admin-menu__item pos-more-menu__item${trayOpen ? " is-active" : ""}`}
                    onClick={() => setTrayOpen((value) => !value)}
                    aria-label={parked.length > 0 ? `View ${parked.length} held orders` : "View held orders"}
                  >
                    <Icon name="hold" size={18} />
                    <span className="pos-more-menu__item-label">Hold</span>
                    {parked.length > 0 && <b className="pos-more-menu__item-count">{parked.length}</b>}
                  </button>
                  <button
                    type="button"
                    className="admin-menu__item pos-more-menu__item"
                    onClick={() => setOrderHistoryOpen(true)}
                    aria-label="View receipts"
                  >
                    <Icon name="receipt" size={18} />
                    <span className="pos-more-menu__item-label">Receipts</span>
                  </button>
                  <button
                    type="button"
                    className={`admin-menu__item pos-more-menu__item${displayPairingToken ? " is-active" : ""}`}
                    onClick={() => setDisplaySettingsOpen(true)}
                    aria-label="Customer display settings"
                  >
                    <Icon name="display" size={18} />
                    <span className="pos-more-menu__item-label">Display</span>
                  </button>
                  <button
                    type="button"
                    className="admin-menu__item pos-more-menu__item"
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Printer settings"
                  >
                    <Icon name="printer" size={18} />
                    <span className="pos-more-menu__item-label">Printer Settings</span>
                  </button>
                </AdminMenu>
                {trayOpen && (
                  <div className="hold-popover">
                    <div className="hold-popover__header">
                      <strong>Held orders</strong>
                      <span>{parked.length}/{MAX_PARKED}</span>
                    </div>
                    {parked.length === 0 && <p className="hold-popover__empty">No parked orders yet.</p>}
                    {parked.map((parkedOrder, index) => (
                      <div key={parkedOrder.at} className="hold-popover__row">
                        <div>
                          <strong>{parkedOrder.lines.length} item{parkedOrder.lines.length === 1 ? "" : "s"} · {displayPeso(parkedOrder.lines.reduce((sum, line) => sum + line.lineTotal, 0))}</strong>
                          <span>{new Date(parkedOrder.at).toLocaleTimeString()}</span>
                        </div>
                        <button type="button" onClick={() => resumeOrder(index)} className="button button--primary button--small">Resume</button>
                        <button type="button" onClick={() => removeParked(index)} className="icon-button icon-button--danger" aria-label="Remove held order">
                          <Icon name="close" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <PosHealthPanel
                pending={pending}
                oldestQueuedSaleAt={oldestQueuedSaleAt}
                failedPrintCount={failedPrintCount}
                displayStatus={hardware.displayStatus}
                terminalStatus={hardware.terminalStatus}
                syncState={syncState}
                onSync={() => void flush()}
              />

              <AdminMenu
                triggerLabel="Open account menu"
                triggerClassName="pos-account-trigger"
                panelTitle={displayName}
                panelClassName="pos-account-menu__panel"
                portal
                trigger={
                  <>
                    <span className="profile-avatar" aria-hidden="true">{initials}</span>
                    <span className="profile-name">{displayName}</span>
                    <Icon name="chevron" size={16} />
                  </>
                }
              >
                <div className="pos-account-menu__meta">
                  <span>{profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "POS user"}</span>
                  <small>{storeName}</small>
                </div>
                <a className="admin-menu__item pos-account-menu__item" href="/account">
                  <Icon name="settings" size={16} />
                  <span>Account settings</span>
                </a>
                <SignOutButton variant="menu" className="pos-account-menu__signout" />
              </AdminMenu>
              <button
                type="button"
                className="pos-topbar__collapse"
                ref={collapseNavRef}
                onClick={() => {
                  setNavOpen(false);
                  setTrayOpen(false);
                }}
                aria-label="Hide navigation"
              >
                <span>Hide</span>
                <Icon name="chevron" size={16} />
              </button>

              {(offline || pending > 0 || syncFailure) && (
                <div className={"sync-pill" + (offline ? " is-offline" : "") + (syncFailure ? " is-warning" : "")} role={syncFailure ? "status" : undefined}>
                  <span className="sync-pill__dot" />
                  {syncFailure ? "Sync issue" : offline ? "Offline" : "Online"}{pending > 0 ? " · " + pending + " pending" : ""}
                  {pending > 0 && (
                    <button type="button" onClick={() => void flush()} className="sync-pill__action">Sync</button>
                  )}
                </div>
              )}

            </nav>
          )}
        </header>

        <div className={"pos-body " + (categoryRailOpen ? "category-rail-open" : "category-rail-collapsed")}>
          <nav
            id="pos-category-rail"
            className="category-rail"
            aria-label="Product categories"
            aria-hidden={!categoryRailOpen}
          >
            <div className="category-rail__items">
              {categoryOptions.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => setActiveCat(category.id)}
                  className={"category-item" + (activeCat === category.id ? " is-active" : "")}
                  aria-pressed={activeCat === category.id}
                >
                  <Icon name={category.id === "all" ? "grid" : categoryIcon(category.name)} size={22} />
                  <span>{category.name}</span>
                </button>
              ))}
            </div>
          </nav>

          <section className="catalog-panel" aria-label="Product catalog">
            <div className="catalog-toolbar">
              <div className="catalog-search">
                <Icon name="search" size={25} />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products…"
                  aria-label="Search products"
                />
                {search && (
                  <button type="button" className="catalog-search__clear" onClick={() => setSearch("")} aria-label="Clear search">
                    <Icon name="close" size={18} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className={"category-toggle" + (categoryRailOpen ? " is-active" : "")}
                aria-expanded={categoryRailOpen}
                aria-controls="pos-category-rail"
                onClick={() => setCategoryRailOpen((value) => !value)}
                aria-label={categoryRailOpen ? "Hide product categories" : "Show product categories"}
              >
                <Icon name="grid" size={18} />
                <span className="category-toggle__copy">
                  <strong>{categoryRailOpen ? "Hide categories" : "Categories"}</strong>
                  <small>{activeCategoryName}</small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            </div>

            <div className="catalog-scroll">
              {visibleProducts.length === 0 ? (
                <div className="catalog-empty">
                  <div className="catalog-empty__icon"><Icon name="search" size={28} /></div>
                  <strong>{products.length === 0 ? "No products yet" : "No items found"}</strong>
                  <p>{products.length === 0 ? "Seed the menu or connect a catalog to get started." : "Try another search or category."}</p>
                </div>
              ) : (
                <div className={"product-grid" + (viewMode === "list" ? " product-grid--list" : "")}>
                  {visibleProducts.map((product, index) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => chooseProduct(product)}
                      className="product-card"
                      aria-label={"Add " + product.name}
                    >
                      <div className="product-card__image">
                        <Image
                          src={productImage(product)}
                          alt=""
                          fill
                          loading="eager"
                          unoptimized={productImage(product).startsWith("/food/")}
                          sizes="(max-width: 640px) 50vw, (max-width: 980px) 24vw, 18vw"
                          className="product-card__image-media"
                        />
                        <span className="product-card__badge">
                          <Icon name={index === 1 ? "sparkle" : "heart"} size={15} />
                        </span>
                        {product.pricing_mode === "per_kg" && <span className="product-card__weight">/kg</span>}
                      </div>
                      <div className="product-card__body">
                        <strong>{product.name}</strong>
                        <span className="tnums">{displayPeso(product.price)}{product.pricing_mode === "per_kg" ? " / kg" : ""}</span>
                        {posConfig.showStockStatus && product.track_stock && (() => {
                          const available = stockByProductId[product.id];
                          const status = stockStatus(available, product.min_stock);
                          return <small className={`product-card__stock product-card__stock--${status}`}>{status === "unknown" ? "Stock pending" : status === "out" ? "Out of stock" : `${formatStockQuantity(available ?? 0)} ${product.unit} left`}</small>;
                        })()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="catalog-footer">
              <div className="view-toggle" role="group" aria-label="Catalog view">
                <button type="button" onClick={() => setViewMode("grid")} className={viewMode === "grid" ? "is-active" : ""} aria-pressed={viewMode === "grid"}>
                  <Icon name="grid" size={19} /> Grid
                </button>
                <button type="button" onClick={() => setViewMode("list")} className={viewMode === "list" ? "is-active" : ""} aria-pressed={viewMode === "list"}>
                  <Icon name="list" size={19} /> List
                </button>
              </div>
            </div>
          </section>

          <aside className="order-panel" aria-label="Current order">
            <div className="order-panel__inner">
              <div className="order-header">
                <div>
                  <h1>Current Order</h1>
                  <p>{cart.length === 0 ? "Ready for a new sale" : cart.length + " line" + (cart.length === 1 ? "" : "s")}</p>
                </div>
                <div className="order-header__actions">
                  <select value={orderType} onChange={(event) => setOrderType(event.target.value)} className="order-type-select" aria-label="Order type">
                    {posConfig.orderTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                  <button
                    type="button"
                    className={"order-discount-button" + (discount.type !== "none" ? " is-active" : "")}
                    onClick={() => setDiscountOpen(true)}
                    aria-label={discount.type === "none" ? "Add discount" : "Edit discount"}
                  >
                    <Icon name="sparkle" size={15} />
                    <span>Discount</span>
                    {discount.type !== "none" && <small>{discountLabel}</small>}
                  </button>
                  <button type="button" className="icon-button icon-button--soft" onClick={clearCart} disabled={cart.length === 0} aria-label="Clear current order">
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </div>

              <div className="order-divider" />

              <div className="receipt-columns" aria-hidden="true">
                <span>QTY</span>
                <span>ITEM</span>
                <span>AMOUNT</span>
                <span />
              </div>

              <div className="order-items">
                {cart.length === 0 ? (
                  <div className="order-empty">
                    <div className="order-empty__mark"><Icon name="empty-order" size={30} /></div>
                    <strong>Your order is waiting</strong>
                    <span>Tap a menu item to add it here.</span>
                  </div>
                ) : (
                  <ul>
                    {cart.map((line) => (
                      <li key={line.key} className="order-line">
                        <div className="stepper" aria-label={"Quantity for " + line.product.name}>
                          <button type="button" onClick={() => line.weightKg === null ? bump(line.key, -1) : setKeypad({ product: line.product, lineKey: line.key })} aria-label="Decrease quantity">−</button>
                          <button type="button" className="stepper__value" onClick={() => line.weightKg !== null && setKeypad({ product: line.product, lineKey: line.key })} aria-label={line.weightKg !== null ? "Edit weight" : "Quantity"}>
                            {line.weightKg !== null ? line.weightKg.toFixed(2) : line.qty}
                          </button>
                          <button type="button" onClick={() => line.weightKg === null ? bump(line.key, 1) : setKeypad({ product: line.product, lineKey: line.key })} aria-label="Increase quantity">+</button>
                        </div>
                        <div className="order-line__detail">
                          <strong>{line.product.name}</strong>
                          <span>{line.weightKg !== null ? line.weightKg.toFixed(2) + " kg" : "x" + line.qty}</span>
                        </div>
                        <strong className="order-line__total tnums">{displayPeso(line.lineTotal)}</strong>
                        <button type="button" className="order-line__remove" onClick={() => removeLine(line.key)} aria-label={"Remove " + line.product.name}>
                          <Icon name="close" size={17} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="order-summary">
                <div><span>Subtotal</span><strong className="tnums">{displayPeso(subtotal)}</strong></div>
                <div><span>Discount</span><strong className="tnums">{discountAmount > 0 ? "−" : ""}{displayPeso(discountAmount)}</strong></div>
                {posConfig.showVat && <div><span>VAT ({Math.round(posConfig.vatRate * 100)}%)</span><strong className="tnums">{displayPeso(vatAmount)}</strong></div>}
                <div className="order-summary__total"><span>TOTAL</span><strong className="tnums">{displayPeso(total)}</strong></div>
              </div>

              <div className="order-actions">
                <button type="button" className="button button--save" onClick={holdOrder} disabled={cart.length === 0 || parked.length >= MAX_PARKED}>SAVE</button>
                <button type="button" className="button button--charge" onClick={startPayment} disabled={cart.length === 0 || total <= 0}>CHARGE</button>
              </div>
            </div>
          </aside>
        </div>

        {orderHistoryOpen && profile && (
          <OrderHistory
            profile={profile}
            storeName={storeName}
            offline={offline}
            pendingCount={pending}
            receiptSettings={{
              paperWidth: posConfig.paperWidth,
              vatRate: posConfig.vatRate,
              showVat: posConfig.showVat,
              receiptHeader: posConfig.receiptHeader,
              receiptFooter: posConfig.receiptFooter,
              showCashier: posConfig.showCashier,
               storeAddress: profile.store_address,
              storeTin: profile.store_tin,
            }}
            onClose={() => setOrderHistoryOpen(false)}
            onPrint={doPrint}
            onToast={(msg) => setToast({ msg })}
          />
        )}

        {keypad && (
          <KeypadModal
            product={keypad.product}
            initialKg={cart.find((line) => line.key === keypad.lineKey)?.weightKg ?? null}
            onConfirm={(kg) => {
              applyWeight(keypad.product, kg, keypad.lineKey);
              setKeypad(null);
            }}
            onClose={() => setKeypad(null)}
          />
        )}

        {discountOpen && (
          <DiscountModal
            value={discount}
            onChange={setDiscount}
            supabase={supabase}
            offline={offline}
            adminPinThreshold={adminPinThreshold}
            note={note}
            onNoteChange={setNote}
            enableOrderNotes={posConfig.enableOrderNotes}
            onClose={() => setDiscountOpen(false)}
          />
        )}

        {payOpen && (
          <ChargeModal
            total={total}
            availablePaymentMethods={availablePaymentMethods}
            onConfirm={placeOrder}
            onPaymentState={updatePaymentPreview}
            onClose={closePayment}
          />
        )}

        {settingsOpen && (
          <PrinterSettingsModal
            initial={printerSettings}
            storeName={storeName}
            onSave={savePrinter}
            onClose={() => setSettingsOpen(false)}
            onToast={(msg) => setToast({ msg })}
          />
        )}

        {displaySettingsOpen && (
          <CustomerDisplaySettings
            initialToken={displayPairingToken}
            onSave={saveDisplayPairing}
            onClose={() => setDisplaySettingsOpen(false)}
            onToast={(msg) => setToast({ msg })}
          />
        )}

        {shiftOpen && profile && (
          <ShiftPanel
            profile={profile}
            offline={offline}
            shift={activeShift}
            onShiftChange={setActiveShift}
            receiptSettings={{ paperWidth: posConfig.paperWidth, vatRate: posConfig.vatRate, showVat: posConfig.showVat }}
            onPrint={doPrint}
            onToast={(msg) => setToast({ msg })}
            onClose={() => setShiftOpen(false)}
          />
        )}

        {success && (
          <div className="pos-success-overlay">
            <div className="pos-success-card">
              <div className="pos-success-card__check">✓</div>
              <p className="pos-success-card__eyebrow">Order saved</p>
              <strong className="tnums">{success.orderNo}</strong>
              <span>Saved on this device · syncs automatically</span>
              {success.change !== null && (
                <>
                  <strong className="pos-success-card__change tnums">{displayPeso(success.change)}</strong>
                  <span>Change due</span>
                </>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="pos-toast" role="status">
            <span>{toast.msg}</span>
            {toast.retry && hasReceipt && (
              <button type="button" onClick={() => void doPrint(lastReceipt.current!)} className="pos-toast__action">
                Retry print
              </button>
            )}
          </div>
        )}
      </main>
    );
  }


  // The block above returns for every non-loading state, so reaching here means
  // the catalog is still loading. This is the component's only other exit.
  return (
    <main className="min-h-full p-6">
      <p className="text-ink-muted">Loading catalog…</p>
    </main>
  );
}

/* ── Weight keypad ─────────────────────────────────────────────────────── */
function KeypadModal({
  product,
  initialKg,
  onConfirm,
  onClose,
}: {
  product: Product;
  initialKg: number | null;
  onConfirm: (kg: number) => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(
    initialKg !== null ? String(Math.round(initialKg * 100)) : "0",
  );
  // Digits are integer centikilos ("135" = 1.35 kg) UNLESS the user typed a
  // decimal point, in which case the string is already in kg ("1.35").
  const kg = digits.includes(".") ? Number(digits) : Number(digits) / 100;
  const lineTotal = weightLineTotal(product.price, kg);

  const press = (k: string) => {
    setDigits((d) => {
      if (k === "⌫") return d.length > 1 ? d.slice(0, -1) : "0";
      if (k === ".") return d.includes(".") ? d : d === "0" ? "0." : d + ".";
      const next = d === "0" && k !== "." ? k : d + k;
      if (next.replace(".", "").length > 5) return d; // max 999.99 kg
      return next;
    });
  };

  const display = kg === 0 ? "0.00" : kg.toFixed(2);

  return (
    <OverlayDialog
      onClose={onClose}
      titleId="pos-weight-dialog-title"
      backdropClassName="fixed inset-0 flex items-center justify-center bg-ink/40 p-4"
      dialogClassName="w-full max-w-xs rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]"
    >
        <p id="pos-weight-dialog-title" className="text-center text-sm font-bold text-ink">{product.name}</p>
        <p className="tnums mt-1 text-center text-xs text-ink-muted">{formatPeso(product.price)} / kg</p>
        <p className="tnums mt-3 text-center text-5xl font-extrabold text-ink">{display}</p>
        <p className="tnums mt-1 text-center text-lg font-bold text-accent">{formatPeso(lineTotal)}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-btn bg-secondary text-xl font-bold text-ink active:scale-95"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onClose} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(kg)}
            disabled={kg <= 0}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
    </OverlayDialog>
  );
}

/* ── Discount sheet ────────────────────────────────────────────────────── */
function DiscountModal({
  value,
  onChange,
  supabase,
  offline,
  adminPinThreshold,
  note,
  onNoteChange,
  enableOrderNotes,
  onClose,
}: {
  value: DiscountState;
  onChange: (d: DiscountState) => void;
  supabase: ReturnType<typeof createClient>;
  offline: boolean;
  adminPinThreshold: number;
  note: string;
  onNoteChange: (note: string) => void;
  enableOrderNotes: boolean;
  onClose: () => void;
}) {
  const [selType, setSelType] = useState(value.type);
  const [name, setName] = useState(value.name);
  const [id, setId] = useState(value.id);
  const [pct, setPct] = useState(value.pct > 0 ? String(value.pct) : "");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const isScPwd = selType === "senior" || selType === "pwd";
  const normalizedThreshold = normalizeAdminDiscountThreshold(adminPinThreshold);
  const customPct = Math.min(100, Math.max(0, Number(pct) || 0));
  const nextDiscount: DiscountState = {
    type: selType,
    pct: selType === "custom" ? customPct : isScPwd ? 20 : 0,
    name: name.trim(),
    id: id.trim(),
  };

  const commit = async () => {
    if (isScPwd && (!name.trim() || !id.trim())) return;
    if (selType === "custom" && customPct > normalizedThreshold) {
      setApprovalError(offline ? "Admin approval is unavailable while the till is offline." : "");
      setApprovalOpen(true);
      return;
    }
    onChange(nextDiscount);
    onClose();
  };

  const approveCustomDiscount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[0-9]{4,6}$/.test(adminPin)) {
      setApprovalError("Enter the active 4–6 digit Admin PIN.");
      return;
    }
    setApprovalBusy(true);
    setApprovalError("");
    try {
      const { data, error } = await supabase.rpc("verify_admin_pin", { p_pin: adminPin });
      if (error) {
        setApprovalError("Admin PIN approval could not be checked. Try again when the till is online.");
        return;
      }
      if (typeof data !== "string" || !data) {
        setApprovalError("That Admin PIN was not approved.");
        return;
      }
      onChange({ ...nextDiscount, approval_id: data });
      onClose();
    } catch {
      setApprovalError("Admin PIN approval could not be checked. Try again when the till is online.");
    } finally {
      setAdminPin("");
      setApprovalBusy(false);
    }
  };

  const selectType = (type: DiscountState["type"]) => {
    setSelType(type);
    setApprovalOpen(false);
    setApprovalError("");
    setAdminPin("");
  };

  return (
    <OverlayDialog
      onClose={onClose}
      titleId="pos-discount-dialog-title"
      backdropClassName="fixed inset-0 flex items-center justify-center bg-ink/40 p-4"
      dialogClassName="w-full max-w-sm rounded-card bg-raised p-4 shadow-[var(--shadow-pop)]"
    >
        <p id="pos-discount-dialog-title" className="text-sm font-bold uppercase tracking-wide text-ink-muted">Discount</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["none", "None"],
              ["senior", "Senior"],
              ["pwd", "PWD"],
              ["custom", "Custom %"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => selectType(t)}
              className={`rounded-btn py-3 text-sm font-bold ${selType === t ? "bg-primary text-primary-fg" : "bg-secondary text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {isScPwd && (
          <div className="mt-3 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name (required)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ID / OSCA number (required)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <p className="text-xs text-ink-muted">Applies 20% discount.</p>
          </div>
        )}

        {selType === "custom" && (
          <div className="mt-3">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              inputMode="decimal"
              placeholder="Percent (0–100)"
              className="w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-ink-muted">Custom discounts above {normalizedThreshold}% require an active Admin PIN; above-threshold approval is unavailable offline.</p>
          </div>
        )}

        {approvalOpen && selType === "custom" && (
          <div className="mt-3 rounded-btn border border-primary/30 bg-primary-soft p-3">
            <p className="text-sm font-extrabold text-ink">Admin approval required</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">This {customPct}% custom discount is above the {normalizedThreshold}% organization threshold.</p>
            {offline ? (
              <>
                <p className="mt-2 text-xs font-semibold text-danger">{approvalError || "Reconnect the till to request an Admin PIN approval."}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setApprovalOpen(false); setApprovalError(""); }} className="rounded-btn bg-secondary py-3 font-bold text-ink">Back</button>
                  <button type="button" onClick={onClose} className="rounded-btn bg-accent py-3 font-bold text-accent-fg">Close</button>
                </div>
              </>
            ) : (
              <form onSubmit={approveCustomDiscount} className="mt-3 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Active Admin PIN
                  <input
                    value={adminPin}
                    onChange={(event) => { setAdminPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 6)); setApprovalError(""); }}
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{4,6}"
                    minLength={4}
                    maxLength={6}
                    autoFocus
                    className="mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2 text-base tracking-[0.3em] text-ink outline-none focus:border-primary"
                    aria-describedby="discount-admin-pin-help"
                  />
                </label>
                <p id="discount-admin-pin-help" className="text-xs leading-5 text-ink-muted">The PIN is checked server-side and is never stored in the browser or audit log.</p>
                {approvalError && <p className="text-xs font-semibold text-danger" role="alert">{approvalError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setApprovalOpen(false); setApprovalError(""); setAdminPin(""); }} className="rounded-btn bg-secondary py-3 font-bold text-ink">Back</button>
                  <button type="submit" disabled={approvalBusy || !/^[0-9]{4,6}$/.test(adminPin)} className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40">{approvalBusy ? "Checking…" : "Approve & apply"}</button>
                </div>
              </form>
            )}
          </div>
        )}

        {enableOrderNotes && <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-muted">
          Order note
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Add an order note (optional)"
            rows={3}
            className="mt-1 w-full resize-none rounded-btn border border-line-strong bg-raised px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-primary"
          />
        </label>}

        {!approvalOpen && <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { onChange(NO_DISCOUNT); onClose(); }} className="rounded-btn bg-secondary py-3 font-bold text-ink">
            Remove
          </button>
          <button
            type="button"
            onClick={() => { void commit(); }}
            disabled={isScPwd && (!name.trim() || !id.trim())}
            className="rounded-btn bg-accent py-3 font-bold text-accent-fg disabled:opacity-40"
          >
            Apply
          </button>
        </div>}
    </OverlayDialog>
  );
}
