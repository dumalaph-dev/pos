export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 900 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const PRODUCT_IMAGE_FALLBACKS: Record<string, string> = {
  "whole lechon": "/food/whole-lechon-medium.png",
  "whole lechon (small)": "/food/whole-lechon-small.png",
  "whole lechon (medium)": "/food/whole-lechon-medium.png",
  "whole lechon (large)": "/food/whole-lechon-medium.png",
  "lechon per kilo": "/food/whole-lechon-small.png",
  "lechon regular": "/food/whole-lechon-small.png",
  "lechon belly": "/food/lechon-belly-one.png",
  "lechon belly (1/2kg)": "/food/lechon-belly-half.png",
  "lechon belly (1kg)": "/food/lechon-belly-one.png",
  "lechon paksiw": "/food/lechon-paksiw.png",
  "lechon paksiw (1/2kg)": "/food/lechon-paksiw.png",
  "lechon kawali": "/food/lechon-kawali.png",
  "lechon kawali (1/2kg)": "/food/lechon-kawali.png",
  rice: "/food/java-rice.png",
  "java rice": "/food/java-rice.png",
  "mang tomas": "/food/mang-tomas.png",
  "mang tomas (small)": "/food/mang-tomas.png",
};

export function isProductImageUrl(value: unknown): value is string {
  const imageUrl = typeof value === "string" ? value.trim() : "";
  return Boolean(
    imageUrl
      && (imageUrl.startsWith("/") || imageUrl.startsWith("https://") || imageUrl.startsWith("http://")),
  );
}

export function resolveProductImage(name: string, imageUrl: string | null | undefined) {
  if (isProductImageUrl(imageUrl)) return imageUrl;
  return PRODUCT_IMAGE_FALLBACKS[name.trim().toLowerCase()] ?? "/food/whole-lechon-small.png";
}
