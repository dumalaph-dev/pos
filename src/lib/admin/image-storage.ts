import { PRODUCT_IMAGE_BUCKET, PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MIME_TYPES } from "@/lib/product-images";
import { createClient } from "@/lib/supabase/server";

type StorageClient = Awaited<ReturnType<typeof createClient>>;

function imageFileExtension(contentType: string) {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

function safePathPrefix(prefix: string) {
  const segments = prefix
    .split("/")
    .map((segment) => segment.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean);
  return segments.length ? segments.join("/") : "image";
}

export function readOrganizationImageFile(formData: FormData, fieldName: string): File | null | undefined {
  const value = formData.get(fieldName);
  if (value === null || value === "") return null;
  if (typeof File === "undefined" || !(value instanceof File)) return undefined;
  if (value.size === 0) return null;
  if (value.size > PRODUCT_IMAGE_MAX_BYTES) return undefined;
  if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(value.type)) return undefined;
  return value;
}

export async function uploadOrganizationImage(
  supabase: StorageClient,
  orgId: string,
  prefix: string,
  imageFile: File,
) {
  const path = `${orgId}/${safePathPrefix(prefix)}-${crypto.randomUUID()}.${imageFileExtension(imageFile.type)}`;
  try {
    const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, imageFile, {
      cacheControl: "31536000",
      contentType: imageFile.type,
      upsert: false,
    });
    if (error) return { path, url: null, error: error.message || "The image could not be uploaded." };
    const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl, error: null };
  } catch {
    return { path, url: null, error: "The image could not be uploaded." };
  }
}

export async function removeOrganizationImage(supabase: StorageClient, path: string | null) {
  if (!path) return;
  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
}

export function organizationImageStoragePath(value: string | null, orgId: string) {
  if (!value) return null;
  try {
    const imageUrl = new URL(value);
    const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!configuredSupabaseUrl || imageUrl.origin !== new URL(configuredSupabaseUrl).origin) return null;
    const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
    if (!imageUrl.pathname.startsWith(marker)) return null;
    const path = decodeURIComponent(imageUrl.pathname.slice(marker.length));
    return path.startsWith(`${orgId}/`) ? path : null;
  } catch {
    return null;
  }
}
