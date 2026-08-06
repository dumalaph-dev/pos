export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 900 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isProductImageUrl(value: unknown): value is string {
  const imageUrl = typeof value === "string" ? value.trim() : "";
  return Boolean(
    imageUrl
      && (imageUrl.startsWith("/") || imageUrl.startsWith("https://") || imageUrl.startsWith("http://")),
  );
}
