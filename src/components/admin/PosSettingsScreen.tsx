"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type SVGProps } from "react";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { SignOutButton } from "@/components/SignOutButton";
import { savePosSettings } from "@/app/admin/pos/actions";
import { buildReceipt } from "@/lib/receipt";
import { getPrinter, type PrinterSettings } from "@/lib/printer";

export type AdminPosProduct = {
  id: string;
  name: string;
  pricing_mode: "fixed" | "per_kg";
  price: number;
  unit: string;
  category_id: string | null;
  image_url: string | null;
  track_stock?: boolean;
  min_stock?: number | null;
  stock_quantity?: number | null;
};

export type AdminPosCategory = {
  id: string;
  name: string;
  icon: string | null;
};

export type AdminPosDevice = {
  id: string;
  name: string;
  printer_transport: "bluetooth" | "network" | "usb" | null;
  printer_config: Record<string, unknown>;
  is_active: boolean;
  last_seen_at: string | null;
};

export type PaletteId = "brown" | "blue" | "green" | "purple" | "custom";
export type UiStyleId = "modern" | "classic" | "soft" | "dark" | "bold";
export type PaymentMethodId = "cash" | "card" | "gcash" | "maya" | "more";

export type PosConfig = {
  palette: PaletteId;
  customColor?: string;
  uiStyle: UiStyleId;
  defaultOrderType: string;
  orderTypes: string[];
  paymentMethods: Record<PaymentMethodId, boolean>;
  vatRate: number;
  showVat: boolean;
  showStockStatus: boolean;
  enableOrderNotes: boolean;
  receiptHeader: string;
  receiptFooter: string;
  showCashier: boolean;
  paperWidth: "58" | "80";
};

type TabId = "preview" | "settings" | "payments" | "receipts" | "hardware";
type PreviewDevice = "desktop" | "tablet";
type UtilityPanel = "notifications" | "help" | "profile" | "";
type CartLine = { product: AdminPosProduct; qty: number };

const DEFAULT_CATEGORY_NAMES = ["Lechon", "Rice Meals", "Drinks", "Sides", "Merchandise", "Combos"];
const PREVIEW_PRODUCTS: AdminPosProduct[] = [
  { id: "preview-regular", name: "Lechon Regular", pricing_mode: "per_kg", price: 65000, unit: "kg", category_id: "preview-lechon", image_url: "/food/whole-lechon-small.png" },
  { id: "preview-belly", name: "Lechon Belly", pricing_mode: "per_kg", price: 70000, unit: "kg", category_id: "preview-lechon", image_url: "/food/lechon-belly-one.png" },
  { id: "preview-paa", name: "Lechon Paa", pricing_mode: "fixed", price: 35000, unit: "pc", category_id: "preview-lechon", image_url: "/food/lechon-kawali.png" },
  { id: "preview-paksiw", name: "Lechon Paksiw", pricing_mode: "fixed", price: 18000, unit: "bowl", category_id: "preview-lechon", image_url: "/food/lechon-paksiw.png" },
  { id: "preview-sisig", name: "Lechon Sisig", pricing_mode: "fixed", price: 22000, unit: "bowl", category_id: "preview-lechon", image_url: "/food/lechon-kawali.png" },
  { id: "preview-garlic-rice", name: "Garlic Rice", pricing_mode: "fixed", price: 4000, unit: "cup", category_id: "preview-rice", image_url: "/food/rice-sides.png" },
  { id: "preview-java-rice", name: "Java Rice", pricing_mode: "fixed", price: 4500, unit: "cup", category_id: "preview-rice", image_url: "/food/java-rice.png" },
  { id: "preview-plain-rice", name: "Plain Rice", pricing_mode: "fixed", price: 3500, unit: "cup", category_id: "preview-rice", image_url: "/food/rice-sides.png" },
  { id: "preview-iced-tea", name: "Iced Tea", pricing_mode: "fixed", price: 5000, unit: "glass", category_id: "preview-drinks", image_url: "/food/rice-sides.png" },
  { id: "preview-softdrinks", name: "Softdrinks (Can)", pricing_mode: "fixed", price: 6000, unit: "can", category_id: "preview-drinks", image_url: "/food/rice-sides.png" },
  { id: "preview-sauce", name: "Lechon Sauce", pricing_mode: "fixed", price: 2500, unit: "cup", category_id: "preview-extras", image_url: "/food/mang-tomas.png" },
  { id: "preview-gravy", name: "Extra Gravy", pricing_mode: "fixed", price: 2000, unit: "cup", category_id: "preview-extras", image_url: "/food/mang-tomas.png" },
];

const PALETTE_OPTIONS: Array<{ id: PaletteId; label: string; color?: string }> = [
  { id: "brown", label: "Brown", color: "#5b2a0a" },
  { id: "blue", label: "Blue", color: "#2f6fb3" },
  { id: "green", label: "Green", color: "#2f7344" },
  { id: "purple", label: "Purple", color: "#7450b5" },
  { id: "custom", label: "Custom" },
];

const STYLE_OPTIONS: Array<{ id: UiStyleId; label: string; description: string }> = [
  { id: "modern", label: "Modern (Default)", description: "Clean, minimal and easy to use." },
  { id: "classic", label: "Classic", description: "Timeless look with more depth." },
  { id: "soft", label: "Soft", description: "Light, soft and friendly feel." },
  { id: "dark", label: "Dark", description: "Sleek and high contrast." },
  { id: "bold", label: "Bold", description: "High energy and vibrant." },
];

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "preview", label: "POS Preview" },
  { id: "settings", label: "POS Settings" },
  { id: "payments", label: "Payment Methods" },
  { id: "receipts", label: "Receipt Settings" },
  { id: "hardware", label: "Hardware" },
];

const ORDER_TYPE_OPTIONS = ["Dine In", "Takeout", "Delivery"] as const;

const IMAGE_FALLBACK = "/food/whole-lechon-small.png";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatPeso(centavos: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}

function formatStock(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function parsePeso(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
}

function readDeviceNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= 65535 ? numberValue : fallback;
}

function devicePrinterSettings(device: AdminPosDevice): PrinterSettings {
  const config = device.printer_config ?? {};
  return {
    transport: device.printer_transport ?? "network",
    bridgeHost: typeof config.bridge_host === "string" && config.bridge_host.trim() ? config.bridge_host.trim() : "127.0.0.1",
    bridgePort: readDeviceNumber(config.bridge_port, 8787),
    ip: typeof config.ip === "string" ? config.ip.trim() : "",
    port: readDeviceNumber(config.port, 9100),
    paperWidth: config.paper_width === 80 || config.paper_width === "80" ? 80 : 58,
  };
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(value);
}

function categoryIcon(name: string) {
  const value = name.toLowerCase();
  if (value.includes("drink")) return "drink" as const;
  if (value.includes("rice") || value.includes("side")) return "rice" as const;
  if (value.includes("extra") || value.includes("sauce")) return "sauce" as const;
  if (value.includes("combo") || value.includes("package")) return "package" as const;
  if (value.includes("merch")) return "bag" as const;
  if (value.includes("lechon")) return "pig" as const;
  return "grid" as const;
}

function buildCatalog(products: AdminPosProduct[]) {
  const normalized = products.map((product) => ({
    ...product,
    price: Number(product.price),
    image_url: product.image_url?.startsWith("/") ? product.image_url : IMAGE_FALLBACK,
  }));
  if (normalized.length >= PREVIEW_PRODUCTS.length) return normalized.slice(0, 12);

  const names = new Set(normalized.map((product) => product.name.trim().toLowerCase()));
  return [...normalized, ...PREVIEW_PRODUCTS.filter((product) => !names.has(product.name.toLowerCase()))].slice(0, 12);
}

function buildCategories(categories: AdminPosCategory[]) {
  const real = categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon || categoryIcon(category.name),
  }));
  const names = new Set(real.map((category) => category.name.toLowerCase()));
  const preview = DEFAULT_CATEGORY_NAMES
    .filter((name) => !names.has(name.toLowerCase()))
    .map((name) => ({ id: `preview-${slug(name)}`, name, icon: categoryIcon(name) }));
  return [{ id: "all", name: "All Items", icon: "grid" as const }, ...real, ...preview];
}

function initialCart(catalog: AdminPosProduct[]) {
  const quantities = [1, 2, 2, 1];
  return catalog.slice(0, 4).map((product, index) => ({ product, qty: quantities[index] ?? 1 }));
}

function iconPath(name: string) {
  switch (name) {
    case "search": return <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>;
    case "bell": return <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /><path d="M12 3v1" /></>;
    case "help": return <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 4.2 1.6c-1.2 1.1-2 1.5-2 3M12 17h.01" /></>;
    case "chevron": return <path d="m8 10 4 4 4-4" />;
    case "grid": return <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>;
    case "list": return <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>;
    case "scanner": return <><path d="M5 7V5h3M16 5h3v2M5 17v2h3M19 17v2h-3" /><path d="M8 12h8" /><path d="M10 9v6M14 9v6" /></>;
    case "desktop": return <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>;
    case "tablet": return <><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></>;
    case "plus": return <path d="M12 5v14M5 12h14" />;
    case "more": return <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>;
    case "trash": return <><path d="M4 7h16M10 11v5M14 11v5" /><path d="M6.5 7 8 20h8l1.5-13M9 7V4h6v3" /></>;
    case "person": return <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c.8-3.5 3-5.3 7-5.3s6.2 1.8 7 5.3" /></>;
    case "cash": return <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></>;
    case "card": return <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 14h3" /></>;
    case "gcash": return <><circle cx="12" cy="12" r="9" /><path d="M8 12h5M12 9l3 3-3 3" /></>;
    case "info": return <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>;
    case "maximize": return <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" /><path d="m3 8 5-5M21 8l-5-5M3 16l5 5M21 16l-5 5" /></>;
    case "receipt": return <><path d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6L8 20.5 6 19z" /><path d="M9 8h6M9 12h6M9 16h3" /></>;
    case "printer": return <><path d="M6 9V4h12v5M6 17H4V9h16v8h-2" /><path d="M7 14h10v6H7z" /></>;
    case "settings": return <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></>;
    case "note": return <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>;
    case "refresh": return <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.2 9A7 7 0 0 1 18.6 7M17.8 15A7 7 0 0 1 5.4 17" /></>;
    case "close": return <><path d="m7 7 10 10M17 7 7 17" /></>;
    case "check": return <path d="m6 12 4 4 8-9" />;
    case "eye": return <><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.2" /></>;
    case "pig": return <><path d="M5 13c0-4 3-7 8-7 2 0 4 .7 5.3 2.1 1.4 0 2.7.6 3.7 1.9l-1.5 1.4.3 2.6-2 .2c-.8 2.2-2.8 3.8-5.8 3.8H9l-2 2H5l1-3.2c-.7-1-1-2.3-1-3.8Z" /><circle cx="17" cy="10" r=".7" /><path d="M19 14h2M8 12h.01" /></>;
    case "drink": return <><path d="M8 5h8l-1 15H9L8 5Z" /><path d="M9 9h6M10 2h4M10 2v3" /></>;
    case "rice": return <><path d="M5 11h14c-.4 5.2-3 8-7 8s-6.6-2.8-7-8Z" /><path d="M8 8c.6-1.8 1.9-3 4-3s3.4 1.2 4 3M4 11h16" /></>;
    case "sauce": return <><path d="M10 4h4v3h-4zM9 7h6l1 13H8L9 7Z" /><path d="M9 12h6" /></>;
    case "package": return <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></>;
    case "bag": return <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>;
    default: return <circle cx="12" cy="12" r="8" />;
  }
}

function MiniIcon({ name, size = 16, className = "" }: { name: string; size?: number; className?: string }) {
  const props: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className,
  };
  return <svg {...props}>{iconPath(name)}</svg>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`pos-toggle ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export default function PosSettingsScreen({
  organizationName,
  branchName,
  address,
  storeId,
  cashierName,
  canWrite,
  branchOptions,
  queryWarning,
  initialNow,
  products,
  categories,
  devices,
  initialSettings,
}: {
  organizationName: string;
  branchName: string;
  address: string;
  storeId: string;
  cashierName: string;
  canWrite: boolean;
  branchOptions: Array<{ id: string; name: string }>;
  queryWarning: boolean;
  initialNow: string;
  products: AdminPosProduct[];
  categories: AdminPosCategory[];
  devices: AdminPosDevice[];
  initialSettings: PosConfig;
}) {
  const catalog = useMemo(() => buildCatalog(products), [products]);
  const categoryOptions = useMemo(() => buildCategories(categories), [categories]);
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [config, setConfig] = useState<PosConfig>(initialSettings);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [orderType, setOrderType] = useState(() => initialSettings.orderTypes.includes(initialSettings.defaultOrderType)
    ? initialSettings.defaultOrderType
    : initialSettings.orderTypes[0] || "Dine In");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>(() => {
    const firstEnabled = (Object.keys(initialSettings.paymentMethods) as PaymentMethodId[]).find((method) => initialSettings.paymentMethods[method]);
    return firstEnabled ?? "cash";
  });
  const [cart, setCart] = useState<CartLine[]>(() => initialCart(catalog));
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountRate, setDiscountRate] = useState(0);
  const [amountTendered, setAmountTendered] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>("");
  const [toast, setToast] = useState("");
  const [saleComplete, setSaleComplete] = useState(false);
  const [customPaletteOpen, setCustomPaletteOpen] = useState(false);
  const [deviceTest, setDeviceTest] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => new Date(initialNow));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category_id === activeCategory;
      const matchesSearch = !query || product.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, catalog, search]);

  const terminalOnline = useMemo(() => devices.some((device) => {
    if (!device.is_active || !device.last_seen_at) return false;
    const age = now.getTime() - new Date(device.last_seen_at).getTime();
    return age >= 0 && age <= 5 * 60 * 1000;
  }), [devices, now]);

  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const discountAmount = Math.round(subtotal * discountRate);
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = config.showVat ? Math.round(taxable * config.vatRate) : 0;
  const total = taxable + taxAmount;
  const tendered = amountTendered ? parsePeso(amountTendered) : Math.ceil(total / 100) * 100;
  const changeDue = Math.max(0, tendered - total);
  const availablePaymentMethods = (Object.keys(config.paymentMethods) as PaymentMethodId[]).filter((method) => config.paymentMethods[method]);
  const selectedPaymentMethod = config.paymentMethods[paymentMethod] ? paymentMethod : availablePaymentMethods[0] ?? "cash";
  const paletteColor = config.palette === "custom" ? config.customColor || "#5b2a0a" : PALETTE_OPTIONS.find((option) => option.id === config.palette)?.color || "#5b2a0a";
  const previewStyle = { "--preview-accent": paletteColor } as CSSProperties;

  function updateConfig(patch: Partial<PosConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function addProduct(product: AdminPosProduct) {
    setSaleComplete(false);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { product, qty: 1 }];
    });
  }

  function adjustQty(productId: string, delta: number) {
    setSaleComplete(false);
    setCart((current) => current
      .map((line) => line.product.id === productId ? { ...line, qty: line.qty + delta } : line)
      .filter((line) => line.qty > 0));
  }

  function clearCart() {
    setCart([]);
    setSaleComplete(false);
  }

  function completeSale() {
    if (!cart.length || tendered < total) return;
    setSaleComplete(true);
    setToast("Preview sale completed. No live order was created.");
    window.setTimeout(() => setToast(""), 3200);
  }

  async function testDevice(device: AdminPosDevice) {
    setDeviceTest(device.id);
    try {
      const settings = devicePrinterSettings(device);
      const printer = await getPrinter(settings);
      await printer.print(buildReceipt({
        storeName: organizationName,
        storeAddress: address,
        orderNo: "POS-TEST",
        cashier: cashierName,
        createdAt: new Date(),
        items: [],
        subtotal: 0,
        discountAmount: 0,
        vatableSale: 0,
        vatAmount: 0,
        vatExemptSale: 0,
        total: 0,
        paymentMethod: "test",
        officialReceipt: false,
        paperWidth: settings.paperWidth,
      }));
      setToast(`${device.name} test receipt sent.`);
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : `${device.name} could not be tested.`);
    } finally {
      setDeviceTest(null);
      window.setTimeout(() => setToast(""), 3200);
    }
  }

  function handleSave() {
    if (!canWrite || !storeId) return;
    const formData = new FormData();
    formData.set("store_id", storeId);
    formData.set("settings", JSON.stringify(config));
    startSaving(async () => {
      try {
        const result = await savePosSettings(formData);
        setToast(result.ok ? "POS settings saved." : result.message);
      } catch {
        setToast("POS settings could not be saved. Check your connection and try again.");
      }
      window.setTimeout(() => setToast(""), 3200);
    });
  }

  function choosePalette(palette: PaletteId) {
    if (palette === "custom") {
      setCustomPaletteOpen(true);
      updateConfig({ palette: "custom", customColor: config.customColor || "#5b2a0a" });
      return;
    }
    setCustomPaletteOpen(false);
    updateConfig({ palette });
  }

  function choosePreviewOrderType(value: string) {
    if (config.orderTypes.includes(value)) setOrderType(value);
  }

  function chooseDefaultOrderType(value: string) {
    if (!ORDER_TYPE_OPTIONS.includes(value as typeof ORDER_TYPE_OPTIONS[number])) return;
    setOrderType(value);
    updateConfig({
      defaultOrderType: value,
      orderTypes: config.orderTypes.includes(value) ? config.orderTypes : [...config.orderTypes, value],
    });
  }

  function changeBranch(value: string) {
    if (!value || value === storeId) return;
    window.location.assign(`/admin/pos?store=${encodeURIComponent(value)}`);
  }

  function toggleOrderType(value: string) {
    const enabled = config.orderTypes.includes(value);
    const next = enabled ? config.orderTypes.filter((item) => item !== value) : [...config.orderTypes, value];
    if (!next.length) return;
    const nextOrderType = enabled && value === orderType ? next[0] : orderType;
    const nextDefaultOrderType = enabled && value === config.defaultOrderType ? next[0] : config.defaultOrderType;
    setOrderType(nextOrderType);
    updateConfig({ orderTypes: next, defaultOrderType: nextDefaultOrderType });
  }

  return (
    <main className="pos-settings-page">
      <header className="pos-settings-topbar">
        <div className="pos-settings-topbar__brand">
          <p className="pos-settings-eyebrow">Admin dashboard</p>
          <h1>POS</h1>
          <p>Customize your point of sale experience and manage system settings.</p>
        </div>
        <div className="pos-settings-topbar__actions">
          {branchOptions.length > 1 ? <label className="pos-branch-control"><span>Editing branch</span><select value={storeId} onChange={(event) => changeBranch(event.target.value)} aria-label="Editing branch">{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}
          <div className="pos-settings-utilities">
            <button type="button" className="pos-utility-button" aria-label="Focus product search" onClick={() => { setActiveTab("preview"); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}><MiniIcon name="search" size={20} /></button>
            <button type="button" className="pos-utility-button pos-utility-button--notification" aria-label="View notifications" aria-expanded={utilityPanel === "notifications"} onClick={() => setUtilityPanel(utilityPanel === "notifications" ? "" : "notifications")}><MiniIcon name="bell" size={20} /><span>1</span></button>
            <button type="button" className="pos-utility-button" aria-label="Open help" aria-expanded={utilityPanel === "help"} onClick={() => setUtilityPanel(utilityPanel === "help" ? "" : "help")}><MiniIcon name="help" size={20} /></button>
            <button type="button" className="pos-user-button" aria-label={`Open ${cashierName} account menu`} aria-expanded={utilityPanel === "profile"} onClick={() => setUtilityPanel(utilityPanel === "profile" ? "" : "profile")}><span className="pos-user-avatar">{cashierName.slice(0, 1).toUpperCase()}</span><span>{cashierName}</span><MiniIcon name="chevron" size={13} /></button>
          </div>
          <button type="button" className="pos-outline-button pos-preview-fullscreen" onClick={() => window.open("/pos", "_blank", "noopener,noreferrer")}><MiniIcon name="maximize" size={16} /> Preview Full Screen</button>
          <button type="button" className="pos-save-button" onClick={handleSave} disabled={isSaving || !canWrite || !storeId}><MiniIcon name="plus" size={17} /> {isSaving ? "Saving..." : "Save Changes"}<MiniIcon name="chevron" size={13} /></button>
        </div>
        {utilityPanel ? (
          <div className="pos-utility-popover" role="dialog" aria-label={utilityPanel === "profile" ? "Account menu" : utilityPanel === "help" ? "POS help" : "Notifications"}>
            {utilityPanel === "notifications" ? <><strong>Notifications</strong><p>No new stock or device alerts.</p><Link href="/admin/inventory">Review inventory <MiniIcon name="chevron" size={13} /></Link></> : null}
            {utilityPanel === "help" ? <><strong>Need help?</strong><p>POS changes are saved to the selected branch and appear on the live cashier preview.</p><Link href="/admin/settings#devices">Open terminal settings <MiniIcon name="chevron" size={13} /></Link></> : null}
            {utilityPanel === "profile" ? <><strong>{cashierName}</strong><p>{organizationName} · {branchName}</p><Link href="/account/password">Change password <MiniIcon name="chevron" size={13} /></Link><SignOutButton variant="menu" /></> : null}
          </div>
        ) : null}
      </header>

      <div className="pos-settings-content">
        {queryWarning ? <div className="pos-settings-warning" role="status"><MiniIcon name="info" size={16} /> Some branch data could not be loaded. The preview is showing safe local fallback items; refresh after reconnecting to see the full catalog.</div> : null}
        <div className="pos-settings-layout">
          <section className="pos-editor-card" aria-label="POS configuration workspace">
            <nav className="pos-settings-tabs" aria-label="POS settings sections">
              {TABS.map((tab) => <button type="button" key={tab.id} className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
            </nav>

            {activeTab === "preview" ? (
              <>
                <div className="pos-preview-heading">
                  <div><h2>POS Preview</h2><p>See how your POS looks and works for your cashiers. Changes you make on the right will be reflected here.</p></div>
                  <div className="pos-device-switcher" role="group" aria-label="Preview device">
                    <button type="button" className={previewDevice === "desktop" ? "is-active" : ""} onClick={() => setPreviewDevice("desktop")}><MiniIcon name="desktop" size={17} /> Desktop</button>
                    <button type="button" className={previewDevice === "tablet" ? "is-active" : ""} onClick={() => setPreviewDevice("tablet")}><MiniIcon name="tablet" size={17} /> Tablet</button>
                  </div>
                </div>
                <PreviewWindow
                  organizationName={organizationName}
                  branchName={branchName}
                  address={address}
                  cashierName={cashierName}
                  now={now}
                  config={config}
                  previewStyle={previewStyle}
                  previewDevice={previewDevice}
                  online={terminalOnline}
                  categoryOptions={categoryOptions}
                  activeCategory={activeCategory}
                  setActiveCategory={setActiveCategory}
                  visibleProducts={visibleProducts}
                  search={search}
                  setSearch={setSearch}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  searchInputRef={searchInputRef}
                  cart={cart}
                  addProduct={addProduct}
                  adjustQty={adjustQty}
                  clearCart={clearCart}
                  orderType={orderType}
                  setOrderType={choosePreviewOrderType}
                  note={note}
                  setNote={setNote}
                  noteOpen={noteOpen}
                  setNoteOpen={setNoteOpen}
                  discountOpen={discountOpen}
                  setDiscountOpen={setDiscountOpen}
                  setDiscountRate={setDiscountRate}
                  discountAmount={discountAmount}
                  subtotal={subtotal}
                  taxAmount={taxAmount}
                  total={total}
                  paymentMethod={selectedPaymentMethod}
                  setPaymentMethod={setPaymentMethod}
                  availablePaymentMethods={availablePaymentMethods}
                  amountTendered={amountTendered}
                  setAmountTendered={setAmountTendered}
                  tendered={tendered}
                  changeDue={changeDue}
                  canComplete={Boolean(cart.length) && tendered >= total}
                  completeSale={completeSale}
                  saleComplete={saleComplete}
                  moreOpen={moreOpen}
                  setMoreOpen={setMoreOpen}
                />
              </>
            ) : null}

            {activeTab === "settings" ? <PosSettingsPanel config={config} updateConfig={updateConfig} orderType={orderType} setDefaultOrderType={chooseDefaultOrderType} toggleOrderType={toggleOrderType} /> : null}
            {activeTab === "payments" ? <PaymentMethodsPanel config={config} updateConfig={updateConfig} /> : null}
            {activeTab === "receipts" ? <ReceiptSettingsPanel config={config} updateConfig={updateConfig} branchName={branchName} /> : null}
            {activeTab === "hardware" ? <HardwarePanel devices={devices} deviceTest={deviceTest} onTestDevice={testDevice} /> : null}
          </section>

          <AppearancePanel
            config={config}
            choosePalette={choosePalette}
            updateConfig={updateConfig}
            customPaletteOpen={customPaletteOpen}
            setCustomPaletteOpen={setCustomPaletteOpen}
          />
        </div>
      </div>

      {toast ? <div className="pos-settings-toast" role="status"><MiniIcon name="check" size={15} /> {toast}</div> : null}
    </main>
  );
}

function PreviewWindow({
  organizationName,
  branchName,
  address,
  cashierName,
  now,
  config,
  previewStyle,
  previewDevice,
  online,
  categoryOptions,
  activeCategory,
  setActiveCategory,
  visibleProducts,
  search,
  setSearch,
  viewMode,
  setViewMode,
  searchInputRef,
  cart,
  addProduct,
  adjustQty,
  clearCart,
  orderType,
  setOrderType,
  note,
  setNote,
  noteOpen,
  setNoteOpen,
  discountOpen,
  setDiscountOpen,
  setDiscountRate,
  discountAmount,
  subtotal,
  taxAmount,
  total,
  paymentMethod,
  setPaymentMethod,
  availablePaymentMethods,
  amountTendered,
  setAmountTendered,
  tendered,
  changeDue,
  canComplete,
  completeSale,
  saleComplete,
  moreOpen,
  setMoreOpen,
}: {
  organizationName: string;
  branchName: string;
  address: string;
  cashierName: string;
  now: Date;
  config: PosConfig;
  previewStyle: CSSProperties;
  previewDevice: PreviewDevice;
  online: boolean;
  categoryOptions: Array<{ id: string; name: string; icon: string }>;
  activeCategory: string;
  setActiveCategory: (value: string) => void;
  visibleProducts: AdminPosProduct[];
  search: string;
  setSearch: (value: string) => void;
  viewMode: "grid" | "list";
  setViewMode: (value: "grid" | "list") => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  cart: CartLine[];
  addProduct: (product: AdminPosProduct) => void;
  adjustQty: (productId: string, delta: number) => void;
  clearCart: () => void;
  orderType: string;
  setOrderType: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  noteOpen: boolean;
  setNoteOpen: (value: boolean) => void;
  discountOpen: boolean;
  setDiscountOpen: (value: boolean) => void;
  setDiscountRate: (value: number) => void;
  discountAmount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethodId;
  setPaymentMethod: (value: PaymentMethodId) => void;
  availablePaymentMethods: PaymentMethodId[];
  amountTendered: string;
  setAmountTendered: (value: string) => void;
  tendered: number;
  changeDue: number;
  canComplete: boolean;
  completeSale: () => void;
  saleComplete: boolean;
  moreOpen: boolean;
  setMoreOpen: (value: boolean) => void;
}) {
  return (
    <div className={`pos-preview-window pos-preview-window--${previewDevice} pos-preview-window--${config.uiStyle}`} style={previewStyle}>
      <header className="pos-preview-topbar" title={address || branchName}>
        <div className="pos-preview-brand-mark"><MiniIcon name="pig" size={22} /></div>
        <div className="pos-preview-brand-copy"><strong>{organizationName}</strong><span>{branchName} <MiniIcon name="chevron" size={11} /></span></div>
        <div className="pos-preview-topbar__status"><span><i className={online ? "" : "is-offline"} /> {online ? "Online" : "Offline"}</span><span>{formatDateTime(now)}</span>{config.showCashier ? <span><MiniIcon name="person" size={14} /> Cashier: {cashierName}</span> : null}</div>
      </header>
      <div className="pos-preview-body">
        <aside className="pos-preview-categories" aria-label="Product categories">
          <div className="pos-preview-category-list">
            {categoryOptions.slice(0, 8).map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? "is-active" : ""} onClick={() => setActiveCategory(category.id)}><MiniIcon name={category.icon} size={15} /><span>{category.name}</span></button>)}
          </div>
          <button type="button" className="pos-preview-custom-item" onClick={() => setSearch("")}><MiniIcon name="plus" size={13} /> Add Custom Item</button>
          <button type="button" className="pos-preview-clear-cart" onClick={clearCart}><MiniIcon name="trash" size={14} /> Clear Cart</button>
        </aside>

        <section className="pos-preview-catalog" aria-label="POS product catalog">
          <div className="pos-preview-catalog-toolbar">
            <label className="pos-preview-search"><MiniIcon name="search" size={17} /><span className="sr-only">Search item by name or SKU</span><input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item by name or SKU..." /></label>
            <button type="button" className="pos-preview-scan" onClick={() => setSearch("Scan barcode...")}><MiniIcon name="scanner" size={16} /> <span>Scan Barcode</span></button>
            <div className="pos-preview-view-toggle"><button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-label="Grid view" onClick={() => setViewMode("grid")}><MiniIcon name="grid" size={16} /></button><button type="button" className={viewMode === "list" ? "is-active" : ""} aria-label="List view" onClick={() => setViewMode("list")}><MiniIcon name="list" size={16} /></button></div>
          </div>
          {visibleProducts.length ? <div className={`pos-preview-product-grid ${viewMode === "list" ? "is-list" : ""}`}>
            {visibleProducts.map((product) => <button type="button" className="pos-preview-product" key={product.id} onClick={() => addProduct(product)} aria-label={`Add ${product.name} to order`}>
              <span className="pos-preview-product-image"><Image src={product.image_url || IMAGE_FALLBACK} alt="" fill sizes="(max-width: 1100px) 16vw, 120px" /></span>
              <span className="pos-preview-product-copy"><strong>{product.name}</strong><span>{formatPeso(product.price)}{product.pricing_mode === "per_kg" ? " / kg" : ""}</span>{config.showStockStatus && product.track_stock ? <small>{product.stock_quantity == null ? "Stock unavailable" : `${formatStock(product.stock_quantity)} ${product.unit} available`}</small> : null}</span>
            </button>)}
          </div> : <div className="pos-preview-empty"><MiniIcon name="search" size={22} /><strong>No products found</strong><p>Try another search or category.</p></div>}
          <div className="pos-preview-pagination" aria-hidden="true"><i className="is-active" /><i /><i /></div>
        </section>

        <aside className="pos-preview-order" aria-label="Current order">
          <div className="pos-preview-order-head"><h3>Current Order</h3><div className="pos-preview-order-actions"><select aria-label="Order type" value={orderType} onChange={(event) => setOrderType(event.target.value)}>{config.orderTypes.map((type) => <option key={type}>{type}</option>)}</select><button type="button" className="pos-preview-more" aria-label="More order actions" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><MiniIcon name="more" size={16} /></button>{moreOpen ? <div className="pos-preview-more-menu"><button type="button" onClick={() => { clearCart(); setMoreOpen(false); }}><MiniIcon name="trash" size={13} /> Clear order</button><button type="button" onClick={() => { setNoteOpen(true); setMoreOpen(false); }}><MiniIcon name="note" size={13} /> Add note</button></div> : null}</div></div>
          <div className="pos-preview-lines">
            {cart.length ? cart.map((line) => <div className="pos-preview-order-line" key={line.product.id}>
              <div className="pos-preview-line-copy"><strong>{line.product.name}</strong><span>{line.product.pricing_mode === "per_kg" ? `${line.qty} kg` : `x ${line.qty}`}</span></div>
              <div className="pos-preview-line-controls"><button type="button" aria-label={`Decrease ${line.product.name}`} onClick={() => adjustQty(line.product.id, -1)}>−</button><span>{line.qty}</span><button type="button" aria-label={`Increase ${line.product.name}`} onClick={() => adjustQty(line.product.id, 1)}>+</button></div>
              <strong className="pos-preview-line-total">{formatPeso(line.product.price * line.qty)}</strong><button type="button" className="pos-preview-line-remove" aria-label={`Remove ${line.product.name}`} onClick={() => adjustQty(line.product.id, -line.qty)}><MiniIcon name="trash" size={12} /></button>
            </div>) : <div className="pos-preview-order-empty"><MiniIcon name="receipt" size={22} /><strong>Your order is empty</strong><span>Select an item to preview the checkout.</span></div>}
          </div>
          {config.enableOrderNotes ? <div className="pos-preview-note-area">{noteOpen ? <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note or instructions..." autoFocus /> : <button type="button" onClick={() => setNoteOpen(true)}><MiniIcon name="plus" size={14} /> {note ? "Edit Note" : "Add Note or Instructions"}</button>}</div> : null}
          <div className="pos-preview-summary">
            <div><span>Subtotal</span><strong>{formatPeso(subtotal)}</strong></div>
            <div className="pos-preview-summary-discount"><span>Discount <button type="button" aria-label="Choose discount" onClick={() => setDiscountOpen(!discountOpen)}><MiniIcon name="settings" size={12} /></button></span><strong>{discountAmount ? `−${formatPeso(discountAmount)}` : formatPeso(0)}</strong>{discountOpen ? <div className="pos-discount-menu"><button type="button" onClick={() => { setDiscountRate(0); setDiscountOpen(false); }}>No discount</button><button type="button" onClick={() => { setDiscountRate(0.05); setDiscountOpen(false); }}>5% preview discount</button><button type="button" onClick={() => { setDiscountRate(0.1); setDiscountOpen(false); }}>10% preview discount</button></div> : null}</div>
            {config.showVat ? <div><span>Tax (VAT {Math.round(config.vatRate * 100)}%)</span><strong>{formatPeso(taxAmount)}</strong></div> : null}
            <div className="pos-preview-total"><span>TOTAL</span><strong>{formatPeso(total)}</strong></div>
          </div>
          <div className="pos-preview-payment"><p>PAYMENT</p><div className="pos-preview-payment-options">{availablePaymentMethods.map((method) => <button type="button" key={method} className={paymentMethod === method ? "is-active" : ""} onClick={() => setPaymentMethod(method)}><MiniIcon name={method === "cash" ? "cash" : method === "card" ? "card" : method === "gcash" ? "gcash" : "more"} size={14} /> {method === "gcash" ? "GCash" : method === "maya" ? "Maya" : method === "more" ? "More" : method[0].toUpperCase() + method.slice(1)}</button>)}</div></div>
          <label className="pos-preview-tendered"><span>Amount Tendered</span><span><b>₱</b><input value={amountTendered || (tendered / 100).toFixed(2)} onChange={(event) => setAmountTendered(event.target.value)} inputMode="decimal" aria-label="Amount tendered" /></span></label>
          <div className="pos-preview-change"><span>Change</span><strong>{formatPeso(changeDue)}</strong></div>
          <button type="button" className="pos-preview-complete" disabled={!canComplete} onClick={completeSale}><MiniIcon name="check" size={16} /> {saleComplete ? "Sale Complete" : "Complete Sale"}</button>
        </aside>
      </div>
    </div>
  );
}

function AppearancePanel({ config, choosePalette, updateConfig, customPaletteOpen, setCustomPaletteOpen }: { config: PosConfig; choosePalette: (palette: PaletteId) => void; updateConfig: (patch: Partial<PosConfig>) => void; customPaletteOpen: boolean; setCustomPaletteOpen: (value: boolean) => void }) {
  return (
    <aside className="pos-appearance-card">
      <div className="pos-appearance-card__heading"><h2>POS Appearance</h2><p>Customize the look and feel of your POS.</p></div>
      <div className="pos-appearance-section"><h3>Color Palette</h3><p>Choose a color palette</p><div className="pos-palette-options">{PALETTE_OPTIONS.map((palette) => <button type="button" key={palette.id} className={`pos-palette-option ${config.palette === palette.id ? "is-selected" : ""}`} aria-label={`Use ${palette.label} palette`} onClick={() => choosePalette(palette.id)}>{palette.color ? <span style={{ background: palette.color }} /> : <span className="pos-palette-custom"><MiniIcon name="plus" size={16} /></span>}{config.palette === palette.id ? <b><MiniIcon name="check" size={11} /></b> : null}</button>)}</div>{customPaletteOpen ? <label className="pos-custom-color"><span>Custom accent</span><input type="color" value={config.customColor || "#5b2a0a"} onChange={(event) => updateConfig({ customColor: event.target.value })} /><button type="button" onClick={() => setCustomPaletteOpen(false)}>Done</button></label> : null}</div>
      <div className="pos-appearance-section"><h3>Theme UI Style</h3><p>Choose the overall UI style</p><select className="pos-appearance-select" value={config.uiStyle} onChange={(event) => updateConfig({ uiStyle: event.target.value as UiStyleId })}>{STYLE_OPTIONS.map((style) => <option value={style.id} key={style.id}>{style.label}</option>)}</select><div className="pos-style-options">{STYLE_OPTIONS.map((style) => <button type="button" key={style.id} className={`pos-style-option ${config.uiStyle === style.id ? "is-selected" : ""}`} onClick={() => updateConfig({ uiStyle: style.id })}><span className={`pos-style-thumbnail pos-style-thumbnail--${style.id}`}><i /><i /><i /></span><span><strong>{style.label}</strong><small>{style.description}</small></span><span className="pos-style-radio" /></button>)}</div></div>
      <div className="pos-appearance-note"><MiniIcon name="info" size={16} /><div><strong>Preview updates instantly</strong><p>All changes you make here will be reflected in the POS preview on the left.</p></div></div>
    </aside>
  );
}

function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="pos-config-heading"><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div>;
}

function PosSettingsPanel({ config, updateConfig, orderType, setDefaultOrderType, toggleOrderType }: { config: PosConfig; updateConfig: (patch: Partial<PosConfig>) => void; orderType: string; setDefaultOrderType: (value: string) => void; toggleOrderType: (value: string) => void }) {
  return (
    <div className="pos-config-panel"><PanelHeading eyebrow="Cashier experience" title="POS Settings" description="Control how staff move through the sale flow at this branch." /><div className="pos-config-grid"><label className="pos-config-field"><span>Default order type</span><select value={config.defaultOrderType} onChange={(event) => setDefaultOrderType(event.target.value)}>{ORDER_TYPE_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="pos-config-field"><span>VAT rate (%)</span><input type="number" min="0" max="100" step="0.01" value={(config.vatRate * 100).toFixed(2)} onChange={(event) => updateConfig({ vatRate: Math.max(0, Math.min(1, Number(event.target.value) / 100 || 0)) })} /></label></div><div className="pos-config-list"><ToggleRow title="Show VAT in checkout" description="Keep the VAT line visible in the current order summary." checked={config.showVat} onChange={(checked) => updateConfig({ showVat: checked })} /><ToggleRow title="Show stock status" description="Show on-hand status on product tiles when inventory is tracked." checked={config.showStockStatus} onChange={(checked) => updateConfig({ showStockStatus: checked })} /><ToggleRow title="Enable order notes" description="Let cashiers add preparation instructions to an order." checked={config.enableOrderNotes} onChange={(checked) => updateConfig({ enableOrderNotes: checked })} /></div><div className="pos-order-type-settings"><div><h3>Order types</h3><p>Choose which order types cashiers can use.</p></div>{ORDER_TYPE_OPTIONS.map((type) => <label key={type}><input type="checkbox" checked={config.orderTypes.includes(type)} onChange={() => toggleOrderType(type)} /><span>{type}</span>{orderType === type ? <small>Default</small> : null}</label>)}</div></div>
  );
}

function PaymentMethodsPanel({ config, updateConfig }: { config: PosConfig; updateConfig: (patch: Partial<PosConfig>) => void }) {
  const methods: Array<{ id: PaymentMethodId; label: string; description: string; icon: string }> = [
    { id: "cash", label: "Cash", description: "Accept cash payments and calculate change.", icon: "cash" },
    { id: "card", label: "Card", description: "Show card as an available tender option.", icon: "card" },
    { id: "gcash", label: "GCash", description: "Accept GCash payments at the counter.", icon: "gcash" },
    { id: "maya", label: "Maya", description: "Accept Maya payments at the counter.", icon: "gcash" },
    { id: "more", label: "More", description: "Keep a catch-all tender option available.", icon: "more" },
  ];
  return <div className="pos-config-panel"><PanelHeading eyebrow="Tender configuration" title="Payment Methods" description="Choose which payment methods are available to cashiers at checkout." /><div className="pos-payment-settings-list">{methods.map((method) => <div className={`pos-payment-settings-row ${config.paymentMethods[method.id] ? "is-enabled" : ""}`} key={method.id}><span className="pos-payment-settings-icon"><MiniIcon name={method.icon} size={18} /></span><span><strong>{method.label}</strong><small>{method.description}</small></span><Toggle label={`${method.label} payment method`} checked={config.paymentMethods[method.id]} onChange={(checked) => updateConfig({ paymentMethods: { ...config.paymentMethods, [method.id]: checked } })} /></div>)}</div></div>;
}

function ReceiptSettingsPanel({ config, updateConfig, branchName }: { config: PosConfig; updateConfig: (patch: Partial<PosConfig>) => void; branchName: string }) {
  return <div className="pos-config-panel"><PanelHeading eyebrow="Printed order slip" title="Receipt Settings" description={`Configure what prints for ${branchName}. These values are stored with the branch.`} /><div className="pos-config-grid"><label className="pos-config-field pos-config-field--full"><span>Receipt header</span><textarea maxLength={200} value={config.receiptHeader} onChange={(event) => updateConfig({ receiptHeader: event.target.value })} placeholder="Optional line below the branch name" /></label><label className="pos-config-field pos-config-field--full"><span>Receipt footer</span><textarea maxLength={200} value={config.receiptFooter} onChange={(event) => updateConfig({ receiptFooter: event.target.value })} placeholder="Thank you message or return policy" /></label><label className="pos-config-field"><span>Paper width</span><select value={config.paperWidth} onChange={(event) => updateConfig({ paperWidth: event.target.value === "80" ? "80" : "58" })}><option value="58">58mm</option><option value="80">80mm</option></select></label></div><div className="pos-config-list"><ToggleRow title="Show cashier name" description="Print the active cashier on the order slip." checked={config.showCashier} onChange={(checked) => updateConfig({ showCashier: checked })} /><ToggleRow title="Include VAT summary" description="Print the VAT rate and amount when enabled for the branch." checked={config.showVat} onChange={(checked) => updateConfig({ showVat: checked })} /></div></div>;
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="pos-toggle-row"><span><strong>{title}</strong><small>{description}</small></span><Toggle label={title} checked={checked} onChange={onChange} /></div>;
}

function HardwarePanel({ devices, deviceTest, onTestDevice }: { devices: AdminPosDevice[]; deviceTest: string | null; onTestDevice: (device: AdminPosDevice) => void }) {
  return <div className="pos-config-panel"><PanelHeading eyebrow="Terminal connections" title="Hardware" description="Review the branch terminals that can print orders and open the cash drawer." />{devices.length ? <div className="pos-hardware-list">{devices.map((device) => <div className="pos-hardware-row" key={device.id}><span className={`pos-hardware-status ${device.is_active ? "is-active" : ""}`} /><span className="pos-hardware-icon"><MiniIcon name="desktop" size={18} /></span><span><strong>{device.name}</strong><small>{device.printer_transport ? `${device.printer_transport[0].toUpperCase()}${device.printer_transport.slice(1)} printer` : "Printer not configured"} · {device.is_active ? "Active" : "Disabled"}</small></span><button type="button" className="pos-outline-button" onClick={() => onTestDevice(device)} disabled={deviceTest !== null}>{deviceTest === device.id ? "Testing..." : "Test"}</button></div>)}</div> : <div className="pos-config-empty"><MiniIcon name="printer" size={22} /><strong>No terminals registered</strong><p>Register a device to connect a printer and cash drawer.</p></div>}<Link href="/admin/settings#devices" className="pos-primary-link"><MiniIcon name="settings" size={15} /> Manage terminals in Settings</Link></div>;
}
