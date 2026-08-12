"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MIME_TYPES } from "@/lib/product-images";

const MAX_IMAGE_SIDE = 1400;
const FALLBACK_IMAGE_SIDE = 1024;
const INITIAL_QUALITY = 0.82;
const QUALITY_STEPS = [0.76, 0.68, 0.6, 0.52];

type ProductImageUploadProps = {
  existingImageUrl?: string | null;
  canWrite: boolean;
  prefix: string;
  fieldName?: string;
  label?: string;
  uploadLabel?: string;
  replaceLabel?: string;
  previewLabel?: string;
  fallbackIcon?: AdminIconName;
  assetLabel?: string;
  maxImageSide?: number;
  fallbackImageSide?: number;
  maxBytes?: number;
  recommendedText?: string;
  required?: boolean;
};

type ImageSource = ImageBitmap | HTMLImageElement;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function readImageSource(file: File): Promise<ImageSource> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => readImageElement(file));
  }
  return readImageElement(file);
}

function readImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected photo could not be read."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function renderImage(source: ImageSource, maxSide: number, quality: number, type: "image/webp" | "image/jpeg") {
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo optimization is not supported in this browser.");

  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, type, quality);
}

async function optimizeImage(file: File, maxImageSide: number, fallbackImageSide: number, maxBytes: number) {
  const source = await readImageSource(file);
  try {
    const webpBlob = await renderImage(source, maxImageSide, INITIAL_QUALITY, "image/webp");
    if (webpBlob && webpBlob.type === "image/webp" && webpBlob.size <= maxBytes) return new File([webpBlob], "product-photo.webp", { type: "image/webp" });

    for (const quality of QUALITY_STEPS) {
      const blob = await renderImage(source, maxImageSide, quality, "image/webp");
      if (blob && blob.type === "image/webp" && blob.size <= maxBytes) return new File([blob], "product-photo.webp", { type: "image/webp" });
    }

    for (const quality of [0.68, 0.58, 0.48]) {
      const blob = await renderImage(source, fallbackImageSide, quality, "image/jpeg");
      if (blob && blob.size <= maxBytes) return new File([blob], "product-photo.jpg", { type: "image/jpeg" });
    }
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }

  throw new Error("That photo is still too large after optimization. Please choose a simpler image.");
}

function isAllowedImageType(file: File) {
  return (PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

export function ProductImageUpload({
  existingImageUrl,
  canWrite,
  prefix,
  fieldName = "image_file",
  label = "Product photo",
  uploadLabel = "Upload product photo",
  replaceLabel = "Replace photo",
  previewLabel = "Product photo preview",
  fallbackIcon = "box",
  assetLabel = "photo",
  maxImageSide = MAX_IMAGE_SIDE,
  fallbackImageSide = FALLBACK_IMAGE_SIDE,
  maxBytes = PRODUCT_IMAGE_MAX_BYTES,
  recommendedText,
  required = false,
}: ProductImageUploadProps) {
  const defaultStatus = recommendedText ?? `JPG, PNG, or WebP · optimized to ${maxImageSide}px and under ${formatBytes(maxBytes)}`;
  const [previewUrl, setPreviewUrl] = useState(existingImageUrl ?? null);
  const [status, setStatus] = useState(defaultStatus);
  const previewObjectUrl = useRef<string | null>(null);
  const optimizationRequest = useRef(0);

  useEffect(() => () => {
    optimizationRequest.current += 1;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  function replacePreview(url: string | null) {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = url?.startsWith("blob:") ? url : null;
    setPreviewUrl(url);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const requestId = optimizationRequest.current + 1;
    optimizationRequest.current = requestId;
    const file = input.files?.[0];
    if (!file) {
      replacePreview(existingImageUrl ?? null);
      setStatus(defaultStatus);
      return;
    }
    if (!isAllowedImageType(file)) {
      input.value = "";
      setStatus("Choose a JPG, PNG, or WebP image.");
      return;
    }

    setStatus(`Optimizing ${assetLabel}…`);
    try {
      const optimized = await optimizeImage(file, maxImageSide, fallbackImageSide, maxBytes);
      if (optimizationRequest.current !== requestId) return;
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      input.files = transfer.files;
      replacePreview(URL.createObjectURL(optimized));
      setStatus(`Optimized ${assetLabel} · ${formatBytes(file.size)} → ${formatBytes(optimized.size)}`);
    } catch (error) {
      if (optimizationRequest.current !== requestId) return;
      input.value = "";
      setStatus(error instanceof Error ? error.message : `The ${assetLabel} could not be optimized.`);
    }
  }

  return (
    <div className="products-form-field products-image-upload sm:col-span-2">
      <span>{label}</span>
      <div className="products-image-upload__body">
        <div
          className="products-image-upload__preview"
          role={previewUrl ? "img" : undefined}
          aria-label={previewUrl ? previewLabel : undefined}
          style={previewUrl ? { backgroundImage: `url(${JSON.stringify(previewUrl)})` } : undefined}
        >
          {!previewUrl && <AdminIcon name={fallbackIcon} size={22} />}
        </div>
        <div className="products-image-upload__controls">
          <label htmlFor={`${prefix}-image-file`} className={`products-secondary-button products-image-upload__button ${!canWrite ? "is-disabled" : ""}`}>
            <AdminIcon name="upload" size={14} />
            {previewUrl ? replaceLabel : uploadLabel}
            <input
              id={`${prefix}-image-file`}
              name={fieldName}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={required}
              disabled={!canWrite}
              aria-describedby={`${prefix}-image-help`}
              onChange={(event) => void handleFileChange(event)}
              className="sr-only"
            />
          </label>
          <small id={`${prefix}-image-help`} className="products-image-upload__help">{status}</small>
          <span id={`${prefix}-image-status`} className="sr-only" aria-live="polite">{status}</span>
        </div>
      </div>
    </div>
  );
}
