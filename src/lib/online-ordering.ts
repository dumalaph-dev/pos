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

export type OnlineOrderingDeliverySettings = {
  enabled: boolean;
  feeCentavos: number;
  etaMinutes: number;
  note: string;
};

export type OnlineOrderingSettings = {
  enabled: boolean;
  averagePrepMinutes: number;
  orderLeadMinutes: number;
  pickupNote: string;
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
};

export type PublicMenuCategory = {
  id: string;
  name: string;
};

export type PublicMenuStore = {
  id: string;
  name: string;
  address: string | null;
  slug: string;
  publicMenuSubdomain: string | null;
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
  fulfillmentMethod?: OnlineOrderingFulfillmentMethod;
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
  pickupNote: "We will have your order ready at the counter. Show your order number when you arrive.",
  delivery: {
    enabled: false,
    feeCentavos: 0,
    etaMinutes: 45,
    note: "Delivery is available within our service area. We’ll confirm the address and total by phone.",
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
    pickupNote: readText(online.pickup_note, DEFAULT_ONLINE_ORDERING_SETTINGS.pickupNote, 240),
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
      pickup_note: merged.pickupNote,
      delivery: {
        enabled: merged.delivery.enabled,
        fee_centavos: merged.delivery.feeCentavos,
        eta_minutes: merged.delivery.etaMinutes,
        note: merged.delivery.note,
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
}, categoryNames: Map<string, string>): PublicMenuProduct {
  return {
    id: product.id,
    name: product.name.trim(),
    price: Number(product.price),
    pricingMode: product.pricing_mode,
    unit: product.unit.trim() || "item",
    categoryId: product.category_id,
    categoryName: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
    imageUrl: resolveProductImage(product.name, product.image_url),
  };
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
