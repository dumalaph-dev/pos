import {
  type DisplayPromotion,
  type DisplaySettings,
} from "@/lib/display";

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showPromotions: true,
  showQuantity: true,
  showDiscount: true,
  showSubtotal: true,
  showOrderNumber: true,
  rotationSeconds: 7,
};

export const DISPLAY_IMAGE_OPTIONS = [
  { value: "/food/whole-lechon-medium.png", label: "Whole lechon" },
  { value: "/food/lechon-belly-one.png", label: "Lechon belly" },
  { value: "/food/lechon-meal-combo.png", label: "Lechon meal combo" },
  { value: "/food/cafe-matcha-latte.png", label: "Matcha latte" },
  { value: "/food/mang-tomas.png", label: "Mang Tomas sauce" },
] as const;

export const DEFAULT_DISPLAY_PROMOTIONS: DisplayPromotion[] = [
  {
    id: "shareable-lechon",
    eyebrow: "Made for the table",
    title: "Bring home the good stuff.",
    detail: "Our lechon cuts are crisp, savory, and ready to share.",
    tagline: "Ask us about today's cuts.",
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
];

export type DisplayPromotionRecord = DisplayPromotion & {
  storeId: string;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max ? numberValue : fallback;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeImageUrl(value: unknown) {
  const imageUrl = readString(value);
  return /^\/[a-z0-9_./-]+$/i.test(imageUrl) ? imageUrl : null;
}

export function normalizeDisplaySettings(value: unknown): DisplaySettings {
  const source = isRecord(value) ? value : {};
  return {
    showPromotions: readBoolean(source.showPromotions, DEFAULT_DISPLAY_SETTINGS.showPromotions),
    showQuantity: readBoolean(source.showQuantity, DEFAULT_DISPLAY_SETTINGS.showQuantity),
    showDiscount: readBoolean(source.showDiscount, DEFAULT_DISPLAY_SETTINGS.showDiscount),
    showSubtotal: readBoolean(source.showSubtotal, DEFAULT_DISPLAY_SETTINGS.showSubtotal),
    showOrderNumber: readBoolean(source.showOrderNumber, DEFAULT_DISPLAY_SETTINGS.showOrderNumber),
    rotationSeconds: Math.round(readNumber(source.rotationSeconds, DEFAULT_DISPLAY_SETTINGS.rotationSeconds, 3, 60)),
  };
}

export function normalizeDisplayPromotionRecord(value: unknown): DisplayPromotionRecord | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const title = readString(value.title);
  if (!id || !title) return null;
  return {
    id,
    storeId: readString(value.store_id) || readString(value.storeId),
    eyebrow: readString(value.eyebrow),
    title,
    detail: readString(value.detail),
    tagline: readString(value.tagline),
    imageUrl: safeImageUrl(value.image_url ?? value.imageUrl),
    isActive: value.is_active === undefined ? true : value.is_active === true,
    sortOrder: Math.round(readNumber(value.sort_order ?? value.sortOrder, 0, -1000, 1000)),
    startsAt: typeof value.starts_at === "string" ? value.starts_at : typeof value.startsAt === "string" ? value.startsAt : null,
    endsAt: typeof value.ends_at === "string" ? value.ends_at : typeof value.endsAt === "string" ? value.endsAt : null,
  };
}

export function normalizeDisplayPromotionRows(rows: unknown[], now = Date.now()): DisplayPromotion[] {
  return rows
    .map(normalizeDisplayPromotionRecord)
    .filter((promotion): promotion is DisplayPromotionRecord => Boolean(promotion))
    .filter((promotion) => promotion.isActive && isDisplayPromotionLive(promotion, now))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ id, eyebrow, title, detail, tagline, imageUrl }) => ({ id, eyebrow, title, detail, tagline, imageUrl }));
}

export function isDisplayPromotionLive(promotion: Pick<DisplayPromotionRecord, "startsAt" | "endsAt">, now = Date.now()) {
  const startsAt = promotion.startsAt ? Date.parse(promotion.startsAt) : Number.NaN;
  const endsAt = promotion.endsAt ? Date.parse(promotion.endsAt) : Number.NaN;
  return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt > now);
}
