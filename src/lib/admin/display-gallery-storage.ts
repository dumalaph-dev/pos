import {
  DISPLAY_GALLERY_ALLOWED_MIME_TYPES,
  DISPLAY_GALLERY_BUCKET,
  DISPLAY_GALLERY_MAX_BYTES,
} from "@/lib/display-gallery";
import { createClient } from "@/lib/supabase/server";

type StorageClient = Awaited<ReturnType<typeof createClient>>;

function imageFileExtension(contentType: string) {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

function safePathPrefix(prefix: string) {
  const normalized = prefix.replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized || "gallery";
}

export function readDisplayGalleryImageFile(formData: FormData, fieldName: string): File | null | undefined {
  const value = formData.get(fieldName);
  if (value === null || value === "") return null;
  if (typeof File === "undefined" || !(value instanceof File)) return undefined;
  if (value.size === 0) return null;
  if (value.size > DISPLAY_GALLERY_MAX_BYTES) return undefined;
  if (!(DISPLAY_GALLERY_ALLOWED_MIME_TYPES as readonly string[]).includes(value.type)) return undefined;
  return value;
}

export async function uploadDisplayGalleryImage(
  supabase: StorageClient,
  orgId: string,
  prefix: string,
  imageFile: File,
) {
  const path = `${orgId}/${safePathPrefix(prefix)}-${crypto.randomUUID()}.${imageFileExtension(imageFile.type)}`;
  try {
    const { error } = await supabase.storage.from(DISPLAY_GALLERY_BUCKET).upload(path, imageFile, {
      cacheControl: "31536000",
      contentType: imageFile.type,
      upsert: false,
    });
    if (error) return { path, url: null, error: error.message || "The gallery image could not be uploaded." };
    const { data } = supabase.storage.from(DISPLAY_GALLERY_BUCKET).getPublicUrl(path);
    return { path, url: data.publicUrl, error: null };
  } catch {
    return { path, url: null, error: "The gallery image could not be uploaded." };
  }
}

export async function removeDisplayGalleryImage(supabase: StorageClient, path: string | null) {
  if (!path) return;
  await supabase.storage.from(DISPLAY_GALLERY_BUCKET).remove([path]);
}
