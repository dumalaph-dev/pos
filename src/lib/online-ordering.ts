import { resolveProductImage } from "@/lib/product-images";

export const ONLINE_ORDER_STATUSES = ["new", "confirmed", "preparing", "ready", "picked_up", "cancelled"] as const;

export type OnlineOrderStatus = (typeof ONLINE_ORDER_STATUSES)[number];

export type OnlineOrderingSettings = {
  enabled: boolean;
  averagePrepMinutes: number;
  orderLeadMinutes: number;
  pickupNote: string;
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
};

const DEFAULT_ONLINE_ORDERING_SETTINGS: OnlineOrderingSettings = {
  enabled: false,
  averagePrepMinutes: 20,
  orderLeadMinutes: 15,
  pickupNote: "We will have your order ready at the counter. Show your order number when you arrive.",
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

export function readOnlineOrderingSettings(settings: unknown): OnlineOrderingSettings {
  const online = asRecord(asRecord(settings).online_ordering);
  return {
    enabled: online.enabled === undefined ? DEFAULT_ONLINE_ORDERING_SETTINGS.enabled : online.enabled === true,
    averagePrepMinutes: readNumber(online.average_prep_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.averagePrepMinutes, 5, 180),
    orderLeadMinutes: readNumber(online.order_lead_minutes, DEFAULT_ONLINE_ORDERING_SETTINGS.orderLeadMinutes, 0, 180),
    pickupNote: readText(online.pickup_note, DEFAULT_ONLINE_ORDERING_SETTINGS.pickupNote, 240),
  };
}

export function mergeOnlineOrderingSettings(settings: unknown, next: Partial<OnlineOrderingSettings>) {
  const existing = asRecord(settings);
  const current = readOnlineOrderingSettings(settings);
  const merged = {
    ...current,
    ...next,
  };

  return {
    ...existing,
    online_ordering: {
      enabled: merged.enabled,
      average_prep_minutes: merged.averagePrepMinutes,
      order_lead_minutes: merged.orderLeadMinutes,
      pickup_note: merged.pickupNote,
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
