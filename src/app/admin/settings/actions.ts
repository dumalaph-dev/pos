"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  organizationImageStoragePath,
  readOrganizationImageFile,
  removeOrganizationImage,
  uploadOrganizationImage,
} from "@/lib/admin/image-storage";
import { invalidateAdminProfile } from "@/lib/admin/profile";
import { isAdminThemeId, mergeAdminBrandingSettings, readAdminBranding } from "@/lib/admin/branding";
import { mergeAdminInventorySettings, readAdminInventorySettings } from "@/lib/admin/inventory-settings";
import { DEFAULT_ADMIN_DISCOUNT_SETTINGS, mergeAdminDiscountSettings, readAdminDiscountSettings } from "@/lib/admin/discount-settings";
import { createClient } from "@/lib/supabase/server";

function settingsRedirect(message: string): never {
  redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validateRequiredText(value: string, label: string, maxLength: number) {
  if (!value || value.length > maxLength) settingsRedirect(`${label} is required and must be at most ${maxLength} characters.`);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") settingsRedirect("Only organization admins can change organization settings.");
  return { supabase, orgId: profile.org_id, userId: user.id };
}

function refreshSettings() {
  // The admin shell owns the persisted branding. Revalidate its layout too;
  // page-only invalidation leaves the shared shell in the client cache until
  // the stale-time window expires.
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/pos");
  revalidatePath("/products");
  revalidatePath("/pos");
}

export async function updateOrganizationSettings(formData: FormData) {
  const { supabase, orgId, userId } = await requireAdmin();
  const name = readText(formData, "name");
  const currency = readText(formData, "currency").toUpperCase();
  const brandName = readText(formData, "brand_name");
  const brandTagline = readText(formData, "brand_tagline");
  const theme = readText(formData, "admin_theme");
  const brandLogoFile = readOrganizationImageFile(formData, "brand_logo_file");
  const lowStockAlertsEnabled = formData.get("low_stock_alerts_enabled") === "on";
  const defaultLowStockThreshold = Number(readText(formData, "default_low_stock_threshold"));
  const discountThresholdInput = readText(formData, "discount_admin_pin_threshold");
  const discountAdminPinThreshold = discountThresholdInput
    ? Number(discountThresholdInput)
    : DEFAULT_ADMIN_DISCOUNT_SETTINGS.adminPinThresholdPercent;
  validateRequiredText(name, "Organization name", 120);
  validateRequiredText(brandName, "Brand name", 48);
  if (brandTagline.length > 48) settingsRedirect("Brand tagline must be at most 48 characters.");
  if (!/^[A-Z]{3}$/.test(currency)) settingsRedirect("Currency must be a three-letter code such as PHP.");
  if (!isAdminThemeId(theme)) settingsRedirect("Choose a valid dashboard theme.");
  if (brandLogoFile === undefined) settingsRedirect("Choose a JPG, PNG, or WebP brand logo under 900 KB.");
  if (!Number.isFinite(defaultLowStockThreshold) || defaultLowStockThreshold < 0 || defaultLowStockThreshold > 100000) {
    settingsRedirect("The default low-stock threshold must be a number from 0 to 100,000.");
  }
  if (!Number.isFinite(discountAdminPinThreshold) || discountAdminPinThreshold < 0 || discountAdminPinThreshold > 100) {
    settingsRedirect("The custom discount Admin PIN threshold must be a percentage from 0 to 100.");
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (organizationError) settingsRedirect(organizationError.message || "Organization settings could not be read.");
  if (!organization) settingsRedirect("Organization settings could not be found.");

  const currentBranding = readAdminBranding(organization.settings);
  const uploadedLogo = brandLogoFile
    ? await uploadOrganizationImage(supabase, orgId, "branding/logo", brandLogoFile)
    : null;
  if (uploadedLogo?.error || (uploadedLogo && !uploadedLogo.url)) {
    await removeOrganizationImage(supabase, uploadedLogo?.path ?? null);
    settingsRedirect("Brand logo upload failed. Check that image storage is configured, then try again.");
  }

  const brandingSettings = mergeAdminBrandingSettings(organization?.settings, {
    brandName,
    brandTagline,
    theme,
    logoUrl: uploadedLogo?.url ?? currentBranding.logoUrl,
  });
  const currentInventorySettings = readAdminInventorySettings(organization?.settings);
  const settings = mergeAdminInventorySettings(brandingSettings, {
    lowStockAlertsEnabled,
    defaultLowStockThreshold: Number.isFinite(defaultLowStockThreshold)
      ? defaultLowStockThreshold
      : currentInventorySettings.defaultLowStockThreshold,
  });
  const currentDiscountSettings = readAdminDiscountSettings(organization.settings);
  const settingsWithDiscount = mergeAdminDiscountSettings(settings, {
    adminPinThresholdPercent: Number.isFinite(discountAdminPinThreshold)
      ? discountAdminPinThreshold
      : currentDiscountSettings.adminPinThresholdPercent,
  });

  const { error } = await supabase.from("organizations").update({ name, currency, settings: settingsWithDiscount }).eq("id", orgId);
  if (error) {
    await removeOrganizationImage(supabase, uploadedLogo?.path ?? null);
    settingsRedirect(error.message || "Organization settings could not be saved.");
  }

  if (uploadedLogo?.url) {
    await removeOrganizationImage(supabase, organizationImageStoragePath(currentBranding.logoUrl, orgId));
  }

  invalidateAdminProfile(userId);
  refreshSettings();
  // The Admin shell is a persistent client layout. Revalidation refreshes the
  // server-side cache, while refresh() clears the current client router tree
  // so the new theme is visible on the next soft navigation without F5.
  refresh();
  redirect("/admin/settings?saved=organization");
}
