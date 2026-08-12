import { resolveProductImage } from "@/lib/product-images";

export const DISPLAY_GALLERY_BUCKET = "display-gallery";
export const DISPLAY_GALLERY_MAX_BYTES = 1_800_000;
export const DISPLAY_GALLERY_MAX_IMAGE_SIDE = 1920;
export const DISPLAY_GALLERY_FALLBACK_IMAGE_SIDE = 1440;
export const DISPLAY_GALLERY_RECOMMENDED_SIZE = "1920 × 1080 px (16:9)";
export const DISPLAY_GALLERY_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const DISPLAY_GALLERY_KIND_OPTIONS = [
  { value: "marketing", label: "Marketing poster" },
  { value: "menu", label: "Menu showcase" },
] as const;

export const DISPLAY_GALLERY_OVERLAY_OPTIONS = [
  { value: "left", label: "Bottom left" },
  { value: "right", label: "Bottom right" },
] as const;

export type DisplayGalleryKind = (typeof DISPLAY_GALLERY_KIND_OPTIONS)[number]["value"];
export type DisplayGalleryOverlayPosition = (typeof DISPLAY_GALLERY_OVERLAY_OPTIONS)[number]["value"];

export type DisplayGalleryItem = {
  id: string;
  kind: DisplayGalleryKind;
  title: string;
  imageUrl: string;
  overlayPosition: DisplayGalleryOverlayPosition;
};

export type DisplayGalleryRecord = DisplayGalleryItem & {
  storeId: string;
  imagePath: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type DisplayMenuItem = {
  id: string;
  productId: string;
  title: string;
  imageUrl: string;
  categoryName: string | null;
  sortOrder: number;
};

type DisplayMenuProduct = {
  id: string;
  name: string;
  image_url?: string | null;
  category_id?: string | null;
};

type DisplayMenuCategory = {
  id: string;
  name: string;
};

export function buildDisplayMenuItems(products: DisplayMenuProduct[], categories: DisplayMenuCategory[] = []): DisplayMenuItem[] {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return products
    .filter((product) => product.id.trim() && product.name.trim())
    .map((product, index) => ({
      id: `product-${product.id}`,
      productId: product.id,
      title: product.name.trim().slice(0, 120),
      imageUrl: resolveProductImage(product.name, product.image_url),
      categoryName: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
      sortOrder: index,
    }));
}

export function displayMenuItemsToGalleryItems(items: DisplayMenuItem[]): DisplayGalleryItem[] {
  return items.map((item, index) => ({
    id: item.id,
    kind: "menu",
    title: item.title,
    imageUrl: item.imageUrl,
    overlayPosition: index % 2 === 0 ? "left" : "right",
  }));
}

export function isDisplayGalleryKind(value: unknown): value is DisplayGalleryKind {
  return value === "marketing" || value === "menu";
}

export function isDisplayGalleryOverlayPosition(value: unknown): value is DisplayGalleryOverlayPosition {
  return value === "left" || value === "right";
}

export function isDisplayGalleryImageUrl(value: unknown): value is string {
  const imageUrl = typeof value === "string" ? value.trim() : "";
  return Boolean(imageUrl && (imageUrl.startsWith("/") || imageUrl.startsWith("https://") || imageUrl.startsWith("http://")));
}
