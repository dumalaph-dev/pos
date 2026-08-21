import { isProductImageUrl, resolveProductImage } from "@/lib/product-images";
import { isPosThemeId, type PosThemeId } from "@/lib/pos-theme";

export const ONLINE_ORDER_STATUSES = ["new", "confirmed", "preparing", "ready", "picked_up", "cancelled"] as const;

export type OnlineOrderStatus = (typeof ONLINE_ORDER_STATUSES)[number];

export type OnlineOrderingBrandColorMode = "theme" | "brand";

export type OnlineOrderingBranding = {
  useOrganizationBranding: boolean;
  brandName: string;
  brandTagline: string;
  logoUrl: string | null;
  colorMode: OnlineOrderingBrandColorMode;
  primaryColor: string;
  accentColor: string;
};

export type OnlineOrderingBrandDefaults = {
  brandName?: string;
  brandTagline?: string;
  logoUrl?: string | null;
};

export type OnlineOrderingFulfillmentMethod = "pickup" | "delivery";

export type OnlineOrderingScheduleSettings = {
  slotIntervalMinutes: number;
  maxDaysAhead: number;
  openingTime: string;
  closingTime: string;
};

export type OnlineOrderingDeliverySettings = {
  enabled: boolean;
  feeCentavos: number;
  etaMinutes: number;
  note: string;
  serviceArea: string;
};

export type OnlineOrderingSettings = {
  enabled: boolean;
  averagePrepMinutes: number;
  orderLeadMinutes: number;
  minimumOrderCentavos: number;
  maxItemQuantity: number;
  pickupNote: string;
  cancellationPolicy: string;
  schedule: OnlineOrderingScheduleSettings;
  delivery: OnlineOrderingDeliverySettings;
  theme: PosThemeId;
  branding: OnlineOrderingBranding;
  copy: OnlineOrderingCopy;
};

export type OnlineOrderingCopy = {
  headerTagline: string;
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  pickupTitle: string;
  menuEyebrow: string;
  menuHeading: string;
  searchPlaceholder: string;
};

export type PublicMenuProduct = {
  id: string;
  name: string;
  price: number;
  pricingMode: "fixed" | "per_kg";
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string;
  isAvailable: boolean;
  availabilityReason: "available" | "sold_out" | "product_paused" | "category_paused";
  availableQty: number | null;
  trackStock: boolean;
  onlineAvailable: boolean;
};

export type PublicMenuCategory = {
  id: string;
  name: string;
  isAvailable: boolean;
};

export type PublicMenuStore = {
  id: string;
  name: string;
  address: string | null;
  slug: string;
  publicMenuSubdomain: string | null;
  vatRegistered: boolean;
  vatRate: number;
  settings: OnlineOrderingSettings;
  categories: PublicMenuCategory[];
  products: PublicMenuProduct[];
};

export type PublicOnlineOrderResult = {
  ok: boolean;
  message?: string;
  orderId?: string;
  orderNo?: string;
  queuePosition?: number;
  etaAt?: string;
  total?: number;
  subtotal?: number;
  taxAmount?: number;
  deliveryFee?: number;
  scheduledFor?: string;
  fulfillmentMethod?: OnlineOrderingFulfillmentMethod;
  phoneVerificationRequired?: boolean;
  phoneVerificationStatus?: "not_required" | "pending" | "verified" | "manual";
  verificationId?: string;
  verificationSent?: boolean;
  deduplicated?: boolean;
};

export function getOnlineOrderStoreCode(storeName: string) {
  const initials = storeName
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z\d]/gi, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .replace(/[^A-Z\d]/g, "")
    .slice(0, 4);
  return initials || "STORE";
}

export function getDemoOnlineOrderNo(storeName: string, requestId: string) {
  const numericPart = Number.parseInt(requestId.replaceAll("-", "").slice(-8), 16) % 10000;
  return `${getOnlineOrderStoreCode(storeName)}-${String(numericPart || 1).padStart(4, "0")}`;
}

export const DEFAULT_ONLINE_ORDERING_COPY: OnlineOrderingCopy = {
  headerTagline: "Order ahead · pickup at the counter",
  heroEyebrow: "Made for your morning run",
  heroTitle: "Order now.",
  heroAccent: "Pick up when it’s ready.",
  heroDescription: "Skip the line and keep your morning moving. Choose your favorites, pick a time, and we’ll give you a live estimate before you head over.",
  pickupTitle: "Pickup details",
  menuEyebrow: "Today’s menu",
  menuHeading: "Choose something good.",
  searchPlaceholder: "Search menu",
};

export const DEFAULT_ONLINE_ORDERING_BRANDING: OnlineOrderingBranding = {
  useOrganizationBranding: true,
  brandName: "",
  brandTagline: "",
  logoUrl: null,
  colorMode: "theme",
  primaryColor: "#173a2b",
  accentColor: "#e4b34f",
};

export const DEFAULT_ONLINE_ORDERING_SETTINGS: OnlineOrderingSettings = {
  enabled: false,
  averagePrepMinutes: 20,
  orderLeadMinutes: 15,
  minimumOrderCentavos: 0,
  maxItemQuantity: 20,
  pickupNote: "We will have your order ready at the counter. Show your order number when you arrive.",
  cancellationPolicy: "You can request a cancellation before preparation begins. Once preparation has started, cancellation may not be possible.",
  schedule: {
    slotIntervalMinutes: 30,
    maxDaysAhead: 2,
    openingTime: "09:00",
    closingTime: "18:00",
  },
  delivery: {
    enabled: false,
    feeCentavos: 0,
    etaMinutes: 45,
    note: "Delivery is available within our service area. We’ll confirm the address and total by phone.",
    serviceArea: "",
  },
  theme: "modern",
  branding: DEFAULT_ONLINE_ORDERING_BRANDING,
  copy: DEFAULT_ONLINE_ORDERING_COPY,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function readText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function readOptionalText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function readTime(value: unknown, fallback: string) {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value.trim()) ? value.trim() : fallback;
}

export function isOnlineOrderingHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

function readOnlineOrderingBranding(value: unknown): OnlineOrderingBranding {
  const branding = asRecord(value);
  return {
    useOrganizationBranding: branding.use_organization_branding !== false,
    brandName: readOptionalText(branding.brand_name, DEFAULT_ONLINE_ORDERING_BRANDING.brandName, 80),
    brandTagline: readOptionalText(branding.brand_tagline, DEFAULT_ONLINE_ORDERING_BRANDING.brandTagline, 80),
    logoUrl: isProductImageUrl(branding.logo_url) ? branding.logo_url : null,
    colorMode: branding.color_mode === "brand" ? "brand" : DEFAULT_ONLINE_ORDERING_BRANDING.colorMode,
    primaryColor: isOnlineOrderingHexColor(branding.primary_color) ? branding.primary_color.toLowerCase() : DEFAULT_ONLINE_ORDERING_BRANDING.primaryColor,
    accentColor: isOnlineOrderingHexColor(branding.accent_color) ? branding.accent_color.toLowerCase() : DEFAULT_ONLINE_ORDERING_BRANDING.accentColor,
  };
}

function readOnlineOrderingDelivery(value: unknown): OnlineOrderingDeliverySettings {
  const delivery = asRecord(value);
  return {
    enabled: delivery.enabled === true,
    feeCentavos: readNumber(delivery.fee_centavos, DEFAULT_ONLINE_ORDERING_SETTINGS.delivery.feeCentavos, 0, 1000000),
    etaMinutes: readNumber(delivery.eta_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.delivery.etaMinutes, 15, 180),
    note: readText(delivery.note, DEFAULT_ONLINE_ORDERING_SETTINGS.delivery.note, 240),
    serviceArea: readOptionalText(delivery.service_area, DEFAULT_ONLINE_ORDERING_SETTINGS.delivery.serviceArea, 240),
  };
}

function readOnlineOrderingSchedule(value: unknown): OnlineOrderingScheduleSettings {
  const schedule = asRecord(value);
  return {
    slotIntervalMinutes: readNumber(schedule.slot_interval_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.schedule.slotIntervalMinutes, 5, 120),
    maxDaysAhead: readNumber(schedule.max_days_ahead, DEFAULT_ONLINE_ORDERING_SETTINGS.schedule.maxDaysAhead, 0, 14),
    openingTime: readTime(schedule.opening_time, DEFAULT_ONLINE_ORDERING_SETTINGS.schedule.openingTime),
    closingTime: readTime(schedule.closing_time, DEFAULT_ONLINE_ORDERING_SETTINGS.schedule.closingTime),
  };
}

export function resolveOnlineOrderingBranding(branding: OnlineOrderingBranding, defaults: OnlineOrderingBrandDefaults = {}) {
  if (!branding.useOrganizationBranding) return branding;
  return {
    ...branding,
    brandName: defaults.brandName?.trim() || branding.brandName,
    brandTagline: defaults.brandTagline?.trim() || branding.brandTagline,
    logoUrl: defaults.logoUrl !== undefined ? defaults.logoUrl : branding.logoUrl,
  };
}

export function readOnlineOrderingBrandDefaults(settings: unknown, fallbackBrandName: string): OnlineOrderingBrandDefaults {
  const root = asRecord(settings);
  const dashboard = asRecord(root.admin_dashboard);
  const brandTagline = readOptionalText(dashboard.brand_tagline, "Order ahead · pickup at the counter", 80);
  return {
    brandName: readText(dashboard.brand_name, fallbackBrandName, 80),
    brandTagline: brandTagline || "Order ahead · pickup at the counter",
    logoUrl: isProductImageUrl(dashboard.logo_url) ? dashboard.logo_url : null,
  };
}

function readOnlineOrderingCopy(value: unknown): OnlineOrderingCopy {
  const copy = asRecord(value);
  return {
    headerTagline: readText(copy.header_tagline, DEFAULT_ONLINE_ORDERING_COPY.headerTagline, 80),
    heroEyebrow: readText(copy.hero_eyebrow, DEFAULT_ONLINE_ORDERING_COPY.heroEyebrow, 80),
    heroTitle: readText(copy.hero_title, DEFAULT_ONLINE_ORDERING_COPY.heroTitle, 80),
    heroAccent: readText(copy.hero_accent, DEFAULT_ONLINE_ORDERING_COPY.heroAccent, 100),
    heroDescription: readText(copy.hero_description, DEFAULT_ONLINE_ORDERING_COPY.heroDescription, 240),
    pickupTitle: readText(copy.pickup_title, DEFAULT_ONLINE_ORDERING_COPY.pickupTitle, 80),
    menuEyebrow: readText(copy.menu_eyebrow, DEFAULT_ONLINE_ORDERING_COPY.menuEyebrow, 80),
    menuHeading: readText(copy.menu_heading, DEFAULT_ONLINE_ORDERING_COPY.menuHeading, 100),
    searchPlaceholder: readText(copy.search_placeholder, DEFAULT_ONLINE_ORDERING_COPY.searchPlaceholder, 60),
  };
}

export function readOnlineOrderingSettings(settings: unknown): OnlineOrderingSettings {
  const root = asRecord(settings);
  const online = asRecord(root.online_ordering);
  const posConfig = asRecord(root.pos_config);
  const fallbackTheme = isPosThemeId(posConfig.uiStyle) ? posConfig.uiStyle : DEFAULT_ONLINE_ORDERING_SETTINGS.theme;
  return {
    enabled: online.enabled === undefined ? DEFAULT_ONLINE_ORDERING_SETTINGS.enabled : online.enabled === true,
    averagePrepMinutes: readNumber(online.average_prep_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.averagePrepMinutes, 5, 180),
    orderLeadMinutes: readNumber(online.order_lead_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.orderLeadMinutes, 0, 180),
    minimumOrderCentavos: readNumber(online.minimum_order_centavos, DEFAULT_ONLINE_ORDERING_SETTINGS.minimumOrderCentavos, 0, 100000000),
    maxItemQuantity: readNumber(online.max_item_quantity, DEFAULT_ONLINE_ORDERING_SETTINGS.maxItemQuantity, 1, 100),
    pickupNote: readText(online.pickup_note, DEFAULT_ONLINE_ORDERING_SETTINGS.pickupNote, 240),
    cancellationPolicy: readText(online.cancellation_policy, DEFAULT_ONLINE_ORDERING_SETTINGS.cancellationPolicy, 360),
    schedule: readOnlineOrderingSchedule(online.schedule),
    delivery: readOnlineOrderingDelivery(online.delivery),
    theme: isPosThemeId(online.theme) ? online.theme : fallbackTheme,
    branding: readOnlineOrderingBranding(online.branding),
    copy: readOnlineOrderingCopy(online.copy),
  };
}

export function mergeOnlineOrderingSettings(settings: unknown, next: Partial<OnlineOrderingSettings>) {
  const existing = asRecord(settings);
  const current = readOnlineOrderingSettings(settings);
  const merged = {
    ...current,
    ...next,
  };
  const existingOnline = asRecord(existing.online_ordering);

  return {
    ...existing,
    online_ordering: {
      ...existingOnline,
      enabled: merged.enabled,
      average_prep_minutes: merged.averagePrepMinutes,
      order_lead_minutes: merged.orderLeadMinutes,
      minimum_order_centavos: merged.minimumOrderCentavos,
      max_item_quantity: merged.maxItemQuantity,
      pickup_note: merged.pickupNote,
      cancellation_policy: merged.cancellationPolicy,
      schedule: {
        slot_interval_minutes: merged.schedule.slotIntervalMinutes,
        max_days_ahead: merged.schedule.maxDaysAhead,
        opening_time: merged.schedule.openingTime,
        closing_time: merged.schedule.closingTime,
      },
      delivery: {
        enabled: merged.delivery.enabled,
        fee_centavos: merged.delivery.feeCentavos,
        eta_minutes: merged.delivery.etaMinutes,
        note: merged.delivery.note,
        service_area: merged.delivery.serviceArea,
      },
      theme: merged.theme,
      branding: {
        use_organization_branding: merged.branding.useOrganizationBranding,
        brand_name: merged.branding.brandName,
        brand_tagline: merged.branding.brandTagline,
        logo_url: merged.branding.logoUrl,
        color_mode: merged.branding.colorMode,
        primary_color: merged.branding.primaryColor,
        accent_color: merged.branding.accentColor,
      },
      copy: {
        header_tagline: merged.copy.headerTagline,
        hero_eyebrow: merged.copy.heroEyebrow,
        hero_title: merged.copy.heroTitle,
        hero_accent: merged.copy.heroAccent,
        hero_description: merged.copy.heroDescription,
        pickup_title: merged.copy.pickupTitle,
        menu_eyebrow: merged.copy.menuEyebrow,
        menu_heading: merged.copy.menuHeading,
        search_placeholder: merged.copy.searchPlaceholder,
      },
    },
  };
}

export function publicMenuPath(slug: string) {
  return `/menu/${encodeURIComponent(slug)}`;
}

export function normalizePublicMenuSlug(value: string) {
  return value.trim().toLowerCase();
}

export function buildPublicMenuProduct(product: {
  id: string;
  name: string;
  price: number;
  pricing_mode: "fixed" | "per_kg";
  unit: string;
  category_id: string | null;
  image_url?: string | null;
  track_stock?: boolean;
  online_available?: boolean;
  category_available?: boolean;
  available_qty?: number | null;
  is_available?: boolean;
  availability_reason?: PublicMenuProduct["availabilityReason"];
}, categoryNames: Map<string, string>): PublicMenuProduct {
  const onlineAvailable = product.online_available !== false;
  const categoryAvailable = product.category_available !== false;
  const trackStock = product.track_stock === true;
  const availableQty = typeof product.available_qty === "number" && Number.isFinite(product.available_qty) ? product.available_qty : null;
  const stockAvailable = !trackStock || availableQty === null || availableQty > 0;
  const isAvailable = product.is_available ?? (onlineAvailable && categoryAvailable && stockAvailable);
  const availabilityReason = product.availability_reason ?? (
    !onlineAvailable ? "product_paused" : !categoryAvailable ? "category_paused" : !stockAvailable ? "sold_out" : "available"
  );
  return {
    id: product.id,
    name: product.name.trim(),
    price: Number(product.price),
    pricingMode: product.pricing_mode,
    unit: product.unit.trim() || "item",
    categoryId: product.category_id,
    categoryName: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
    imageUrl: resolveProductImage(product.name, product.image_url),
    isAvailable,
    availabilityReason,
    availableQty,
    trackStock,
    onlineAvailable,
  };
}

export type OnlineOrderTotals = {
  subtotal: number;
  deliveryFee: number;
  taxAmount: number;
  total: number;
  minimumOrderCentavos: number;
  minimumOrderMet: boolean;
};

/** Menu prices are VAT-inclusive, matching the POS pricing model. */
export function vatFromInclusiveTotal(total: number, vatRate: number) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(vatRate) || vatRate <= 0) return 0;
  const rate = Math.min(1, Math.max(0, vatRate));
  return Math.min(total, Math.round(total * rate / (1 + rate)));
}

export function calculateOnlineOrderTotals(
  subtotal: number,
  fulfillmentMethod: OnlineOrderingFulfillmentMethod,
  settings: OnlineOrderingSettings,
  vatRegistered: boolean,
  vatRate: number,
): OnlineOrderTotals {
  const safeSubtotal = Math.max(0, Math.round(subtotal));
  const deliveryFee = fulfillmentMethod === "delivery" ? settings.delivery.feeCentavos : 0;
  const taxAmount = vatRegistered ? vatFromInclusiveTotal(safeSubtotal, vatRate) : 0;
  const minimumOrderCentavos = settings.minimumOrderCentavos;
  return {
    subtotal: safeSubtotal,
    deliveryFee,
    taxAmount,
    total: safeSubtotal + deliveryFee,
    minimumOrderCentavos,
    minimumOrderMet: safeSubtotal >= minimumOrderCentavos,
  };
}

export function singaporeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatOnlineOrderingDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Singapore" }).format(date);
}

export function generateOnlineOrderingDateOptions(settings: OnlineOrderingSettings, now = new Date()) {
  const today = singaporeDateKey(now);
  return Array.from({ length: settings.schedule.maxDaysAhead + 1 }, (_, index) => {
    const value = addCalendarDays(today, index);
    return { value, label: index === 0 ? `Today · ${formatOnlineOrderingDate(value)}` : formatOnlineOrderingDate(value) };
  });
}

export function generateOnlineOrderingSlots(settings: OnlineOrderingSettings, dateKey: string, now = new Date()) {
  const slots: string[] = [];
  const today = singaporeDateKey(now);
  const [openHour, openMinute] = settings.schedule.openingTime.split(":").map(Number);
  const [closeHour, closeMinute] = settings.schedule.closingTime.split(":").map(Number);
  const start = openHour * 60 + openMinute;
  const end = closeHour * 60 + closeMinute;
  const minimumTime = dateKey === today ? now.getTime() + settings.orderLeadMinutes * 60_000 : 0;
  const closingDate = dateKey === today ? new Date(`${dateKey}T${settings.schedule.closingTime}:00+08:00`) : null;
  if (dateKey === today && closingDate && minimumTime < closingDate.getTime()) slots.push("asap");
  for (let minutes = start; minutes < end; minutes += settings.schedule.slotIntervalMinutes) {
    const hours = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const value = `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const slotDate = new Date(`${dateKey}T${value}:00+08:00`);
    if (slotDate.getTime() > minimumTime) slots.push(value);
  }
  return slots;
}

export function validateOnlineDeliveryAddress(address: string, serviceArea = "") {
  const normalized = address.trim().replace(/\s+/g, " ");
  if (normalized.length < 8) return "Add a complete delivery address.";
  if (!/\s/.test(normalized)) return "Include a street and locality so the rider can find you.";
  const areas = serviceArea.split(",").map((area) => area.trim().toLowerCase()).filter((area) => area.length >= 2);
  if (areas.length > 0 && !areas.some((area) => normalized.toLowerCase().includes(area))) {
    return "That address is outside the store’s delivery area.";
  }
  return null;
}

export function formatOrderStatusLabel(status: OnlineOrderStatus) {
  switch (status) {
    case "new": return "Received";
    case "confirmed": return "Confirmed";
    case "preparing": return "Preparing";
    case "ready": return "Ready for pickup";
    case "picked_up": return "Picked up";
    case "cancelled": return "Cancelled";
  }
}

export function getOnlineOrderNextAction(
  status: OnlineOrderStatus,
  fulfillmentMethod: OnlineOrderingFulfillmentMethod,
) {
  switch (status) {
    case "new":
      return { label: "Acknowledge order", status: "confirmed" as const };
    case "confirmed":
      return { label: "Start preparing", status: "preparing" as const };
    case "preparing":
      return { label: "Mark ready", status: "ready" as const };
    case "ready":
      return {
        label: fulfillmentMethod === "delivery" ? "Mark delivered" : "Mark picked up",
        status: "picked_up" as const,
      };
    case "picked_up":
    case "cancelled":
      return null;
  }
}

export function formatOnlineEta(value: string | null | undefined, now = Date.now()) {
  if (!value) return "We’ll confirm your pickup time shortly";
  const eta = new Date(value);
  if (Number.isNaN(eta.getTime())) return "We’ll confirm your pickup time shortly";
  const minutes = Math.max(0, Math.round((eta.getTime() - now) / 60_000));
  if (minutes < 1) return "Ready soon";
  if (minutes < 60) return `About ${minutes} min`;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(eta);
}

export function pickupSlotLabel(value: string) {
  if (value === "asap") return "As soon as possible";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(date);
}
