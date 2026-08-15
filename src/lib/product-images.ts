export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 900 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const PRODUCT_IMAGE_FALLBACKS: Record<string, string> = {
  "whole lechon": "/food/whole-lechon-medium.webp",
  "whole lechon (small)": "/food/whole-lechon-small.webp",
  "whole lechon (medium)": "/food/whole-lechon-medium.webp",
  "whole lechon (large)": "/food/whole-lechon-medium.webp",
  "lechon per kilo": "/food/whole-lechon-small.webp",
  "lechon regular": "/food/whole-lechon-small.webp",
  "lechon belly": "/food/lechon-belly-one.webp",
  "lechon belly (1/2kg)": "/food/lechon-belly-half.webp",
  "lechon belly (1kg)": "/food/lechon-belly-one.webp",
  "lechon paksiw": "/food/lechon-paksiw.webp",
  "lechon paksiw (1/2kg)": "/food/lechon-paksiw.webp",
  "lechon kawali": "/food/lechon-kawali.webp",
  "lechon kawali (1/2kg)": "/food/lechon-kawali.webp",
  rice: "/food/java-rice.webp",
  "java rice": "/food/java-rice.webp",
  "mang tomas": "/food/mang-tomas.webp",
  "mang tomas (small)": "/food/mang-tomas.webp",
};

export function isProductImageUrl(value: unknown): value is string {
  const imageUrl = typeof value === "string" ? value.trim() : "";
  return Boolean(
    imageUrl
      && (imageUrl.startsWith("/") || imageUrl.startsWith("https://") || imageUrl.startsWith("http://")),
  );
}

/**
 * Maps the bundled catalog art forward from PNG to WebP.
 *
 * `scripts/optimize-food-images.mjs` converted `public/food`, but rows seeded
 * from a catalog preset before that still hold the old `.png` names in
 * `products.image_url` and `display_promotions.image_url`. Remapping on read
 * fixes those without a data migration.
 *
 * Only the bundled `/food/` art is touched — uploaded images live in Supabase
 * Storage and keep whatever extension they were stored with. `next.config.ts`
 * rewrites the same paths for requests that never reach this helper, such as a
 * Cache Storage entry written by an older service worker.
 */
export function normalizeBundledImageUrl(imageUrl: string): string {
  return imageUrl.startsWith("/food/") ? imageUrl.replace(/\.png$/i, ".webp") : imageUrl;
}

export function resolveProductImage(name: string, imageUrl: string | null | undefined) {
  if (isProductImageUrl(imageUrl)) return normalizeBundledImageUrl(imageUrl);
  return PRODUCT_IMAGE_FALLBACKS[name.trim().toLowerCase()] ?? "/food/whole-lechon-small.webp";
}
