"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, createClient } from "@/lib/supabase/server";
import {
  organizationImageStoragePath,
  readOrganizationImageFile,
  removeOrganizationImage,
  uploadOrganizationImage,
} from "@/lib/admin/image-storage";
import { isProductImageUrl } from "@/lib/product-images";
import { toCentavos } from "@/lib/money";
import { isPosThemeId } from "@/lib/pos-theme";
import { formatOrderStatusLabel, isOnlineOrderingHexColor, mergeOnlineOrderingSettings, ONLINE_ORDER_STATUSES, publicMenuPath, readOnlineOrderingSettings, type OnlineOrderStatus } from "@/lib/online-ordering";
import { isValidPublicMenuSubdomain, normalizePublicMenuSubdomain } from "@/lib/public-menu-domain";

type OwnerProfile = {
  org_id: string;
  role: "admin" | "manager" | "cashier";
};

const POS_ONLINE_ORDER_STATUSES = ["confirmed", "preparing", "ready"] as const;

export type PosOnlineOrderStatusResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readPresentationText(formData: FormData, name: string, maxLength: number) {
  const value = readText(formData, name);
  if (!value) actionRedirect(`Add text for ${name.replaceAll("_", " ")}.`);
  if (value.length > maxLength) actionRedirect(`${name.replaceAll("_", " ")} must be ${maxLength} characters or fewer.`);
  return value.slice(0, maxLength);
}

function actionRedirect(message: string): never {
  redirect(`/admin/online-ordering?error=${encodeURIComponent(message)}`);
}

async function requireOnlineOrderingUser() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) actionRedirect("Your admin profile is not available. Sign in again and try once more.");
  const typedProfile = profile as OwnerProfile;
  if (typedProfile.role !== "admin" && typedProfile.role !== "manager") {
    actionRedirect("Only owners and managers can manage the online pickup queue.");
  }

  return { supabase, profile: typedProfile };
}

async function readStoreContext(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!storeId) actionRedirect("Choose a branch before changing online ordering.");

  const { data: store, error } = await supabase
    .from("stores")
    .select("id, name, settings, staff_login_slug, public_menu_subdomain, is_active")
    .eq("id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !store || !store.is_active) actionRedirect("That branch is not available for online ordering.");
  return store as { id: string; name: string; settings: unknown; staff_login_slug: string; public_menu_subdomain: string | null };
}

export async function updateOnlineMenuSubdomain(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  const subdomain = normalizePublicMenuSubdomain(readText(formData, "public_menu_subdomain"));

  if (!isValidPublicMenuSubdomain(subdomain)) {
    actionRedirect("Use 1–63 lowercase letters, numbers, or hyphens. Avoid reserved platform names.");
  }

  const conflict = await supabase
    .from("stores")
    .select("id")
    .eq("public_menu_subdomain", subdomain)
    .neq("id", store.id)
    .maybeSingle();
  if (conflict.error) actionRedirect("The custom menu link could not be checked. Try again.");
  if (conflict.data) actionRedirect("That menu name is already in use. Choose another one.");

  const { error } = await supabase
    .from("stores")
    .update({ public_menu_subdomain: subdomain })
    .eq("id", store.id)
    .eq("org_id", profile.org_id);
  if (error) actionRedirect(error.message || "The custom menu link could not be saved.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=domain");
}

export async function updateOnlineOrderingSettings(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  const averagePrepMinutes = Number(readText(formData, "average_prep_minutes"));
  const orderLeadMinutes = Number(readText(formData, "order_lead_minutes"));
  const pickupNote = readText(formData, "pickup_note");
  const deliveryEnabled = formData.get("delivery_enabled") === "on";
  const deliveryFeePeso = Number(readText(formData, "delivery_fee"));
  const deliveryEtaMinutes = Number(readText(formData, "delivery_eta_minutes"));
  const deliveryNote = readText(formData, "delivery_note");
  const serviceArea = readText(formData, "delivery_service_area");
  const minimumOrderPeso = Number(readText(formData, "minimum_order_amount"));
  const maxItemQuantity = Number(readText(formData, "max_item_quantity"));
  const slotIntervalMinutes = Number(readText(formData, "slot_interval_minutes"));
  const maxDaysAhead = Number(readText(formData, "max_days_ahead"));
  const openingTime = readText(formData, "opening_time");
  const closingTime = readText(formData, "closing_time");
  const cancellationPolicy = readText(formData, "cancellation_policy");
  const enabled = formData.get("enabled") === "on";

  if (!Number.isInteger(averagePrepMinutes) || averagePrepMinutes < 5 || averagePrepMinutes > 180) {
    actionRedirect("Average prep time must be a whole number from 5 to 180 minutes.");
  }
  if (!Number.isInteger(orderLeadMinutes) || orderLeadMinutes < 0 || orderLeadMinutes > 180) {
    actionRedirect("Lead time must be a whole number from 0 to 180 minutes.");
  }
  if (!pickupNote || pickupNote.length > 240) actionRedirect("Add a pickup note under 240 characters.");
  if (!Number.isFinite(deliveryFeePeso) || deliveryFeePeso < 0 || deliveryFeePeso > 10000) {
    actionRedirect("Delivery fee must be between ₱0 and ₱10,000.");
  }
  if (!Number.isInteger(deliveryEtaMinutes) || deliveryEtaMinutes < 15 || deliveryEtaMinutes > 180) {
    actionRedirect("Delivery ETA must be a whole number from 15 to 180 minutes.");
  }
  if (!deliveryNote || deliveryNote.length > 240) actionRedirect("Add a delivery note under 240 characters.");
  if (!Number.isFinite(minimumOrderPeso) || minimumOrderPeso < 0 || minimumOrderPeso > 1000000) {
    actionRedirect("Minimum order amount must be between ₱0 and ₱1,000,000.");
  }
  if (!Number.isInteger(maxItemQuantity) || maxItemQuantity < 1 || maxItemQuantity > 100) {
    actionRedirect("The per-item quantity limit must be a whole number from 1 to 100.");
  }
  if (!Number.isInteger(slotIntervalMinutes) || slotIntervalMinutes < 5 || slotIntervalMinutes > 120) {
    actionRedirect("Time-slot intervals must be a whole number from 5 to 120 minutes.");
  }
  if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 0 || maxDaysAhead > 14) {
    actionRedirect("Scheduled orders can be offered from 0 to 14 days ahead.");
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(openingTime) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(closingTime)) {
    actionRedirect("Choose valid opening and closing times.");
  }
  if (openingTime >= closingTime) actionRedirect("Closing time must be later than opening time.");
  if (serviceArea.length > 240) actionRedirect("Delivery service areas must be 240 characters or fewer.");
  if (!cancellationPolicy || cancellationPolicy.length > 360) actionRedirect("Add a cancellation policy under 360 characters.");

  const nextSettings = mergeOnlineOrderingSettings(store.settings, {
    enabled,
    averagePrepMinutes,
    orderLeadMinutes,
    pickupNote,
    delivery: {
      enabled: deliveryEnabled,
      feeCentavos: toCentavos(deliveryFeePeso),
      etaMinutes: deliveryEtaMinutes,
      note: deliveryNote,
      serviceArea,
    },
    minimumOrderCentavos: toCentavos(minimumOrderPeso),
    maxItemQuantity,
    cancellationPolicy,
    schedule: {
      slotIntervalMinutes,
      maxDaysAhead,
      openingTime,
      closingTime,
    },
  });
  const { error } = await supabase.rpc("set_online_ordering_settings", {
    p_store_id: store.id,
    p_settings: nextSettings,
  });

  if (error) actionRedirect(error.message || "Online ordering settings could not be saved.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=settings");
}

export async function updateOnlineOrderingPresentation(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  const theme = readText(formData, "theme");
  const brandLogoFile = readOrganizationImageFile(formData, "brand_logo_file");
  const brandName = readText(formData, "brand_name");
  const brandTagline = readText(formData, "brand_tagline");
  const brandLogoUrl = readText(formData, "brand_logo_url");
  const useOrganizationBranding = formData.get("use_organization_branding") === "on";
  const colorMode = readText(formData, "color_mode");
  const primaryColor = readText(formData, "primary_color").toLowerCase();
  const accentColor = readText(formData, "accent_color").toLowerCase();

  if (!isPosThemeId(theme)) actionRedirect("Choose a valid public menu theme.");
  if (!brandName || brandName.length > 80) actionRedirect("Add a menu brand name under 80 characters.");
  if (brandTagline.length > 80) actionRedirect("Menu brand tagline must be 80 characters or fewer.");
  if (brandLogoUrl && !isProductImageUrl(brandLogoUrl)) actionRedirect("Choose a valid menu logo.");
  if (colorMode !== "theme" && colorMode !== "brand") actionRedirect("Choose a valid menu color direction.");
  if (!isOnlineOrderingHexColor(primaryColor) || !isOnlineOrderingHexColor(accentColor)) actionRedirect("Choose valid six-digit brand colors.");
  if (brandLogoFile === undefined) actionRedirect("Choose a JPG, PNG, or WebP menu logo under 900 KB.");
  if (brandLogoFile && profile.role !== "admin") actionRedirect("Only organization admins can upload a menu logo.");

  const currentSettings = readOnlineOrderingSettings(store.settings);
  const uploadedLogo = brandLogoFile
    ? await uploadOrganizationImage(supabase, profile.org_id, `online-menu/${store.id}/logo`, brandLogoFile)
    : null;
  if (uploadedLogo?.error || (uploadedLogo && !uploadedLogo.url)) {
    await removeOrganizationImage(supabase, uploadedLogo?.path ?? null);
    actionRedirect("Menu logo upload failed. Check that image storage is configured, then try again.");
  }
  const nextLogoUrl = uploadedLogo?.url ?? (brandLogoUrl || null);

  const copy = {
    headerTagline: readPresentationText(formData, "header_tagline", 80),
    heroEyebrow: readPresentationText(formData, "hero_eyebrow", 80),
    heroTitle: readPresentationText(formData, "hero_title", 80),
    heroAccent: readPresentationText(formData, "hero_accent", 100),
    heroDescription: readPresentationText(formData, "hero_description", 240),
    pickupTitle: readPresentationText(formData, "pickup_title", 80),
    menuEyebrow: readPresentationText(formData, "menu_eyebrow", 80),
    menuHeading: readPresentationText(formData, "menu_heading", 100),
    searchPlaceholder: readPresentationText(formData, "search_placeholder", 60),
  };

  const { error } = await supabase
    .from("stores")
    .update({
      settings: mergeOnlineOrderingSettings(store.settings, {
        theme,
        branding: {
          useOrganizationBranding,
          brandName: brandName.slice(0, 80),
          brandTagline: brandTagline.slice(0, 80),
          logoUrl: nextLogoUrl,
          colorMode,
          primaryColor,
          accentColor,
        },
        copy,
      }),
    })
    .eq("id", store.id)
    .eq("org_id", profile.org_id);

  if (error) {
    await removeOrganizationImage(supabase, uploadedLogo?.path ?? null);
    actionRedirect(error.message || "Public menu appearance could not be saved.");
  }

  const previousLogoPath = organizationImageStoragePath(currentSettings.branding.logoUrl, profile.org_id);
  if (previousLogoPath && currentSettings.branding.logoUrl !== nextLogoUrl) {
    await removeOrganizationImage(supabase, previousLogoPath);
  }

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=appearance");
}

export async function updateOnlineAvailability(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  const scope = readText(formData, "scope");
  const entityId = readText(formData, "entity_id");
  const availableValue = readText(formData, "available");

  if ((scope !== "product" && scope !== "category") || !entityId || (availableValue !== "true" && availableValue !== "false")) {
    actionRedirect("That online availability change is not valid.");
  }

  const { error } = await supabase.rpc("set_online_availability", {
    p_scope: scope,
    p_entity_id: entityId,
    p_available: availableValue === "true",
  });
  if (error) actionRedirect(error.message || "Online availability could not be changed.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=availability");
}

export async function verifyOnlineOrderPhone(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const orderId = readText(formData, "order_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  if (!orderId) actionRedirect("That online order could not be identified.");

  const { error } = await supabase.rpc("mark_online_order_phone_verified", {
    p_online_order_id: orderId,
  });
  if (error) actionRedirect(error.message || "The customer phone could not be verified.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=phone");
}

export async function updateOnlineOrderStatus(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const orderId = readText(formData, "order_id");
  const requestedStatus = readText(formData, "status") as OnlineOrderStatus;
  const store = await readStoreContext(supabase, profile.org_id, storeId);

  if (!orderId || !ONLINE_ORDER_STATUSES.includes(requestedStatus) || requestedStatus === "new") {
    actionRedirect("That order status change is not valid.");
  }

  const { data: order, error: orderError } = await supabase
    .from("online_orders")
    .select("id, store_id, status")
    .eq("id", orderId)
    .eq("org_id", profile.org_id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (orderError || !order) actionRedirect("That online order is no longer in the pickup queue.");

  const { error } = await supabase.rpc("set_online_order_status", {
    p_online_order_id: orderId,
    p_next_status: requestedStatus,
    p_cancel_reason: readText(formData, "cancel_reason") || null,
  });
  if (error) actionRedirect(error.message || "The online order could not be updated.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=status");
}

/**
 * Advance an online order from the cashier queue without granting the POS
 * client broad UPDATE access to the online_orders table. The database RPC
 * validates branch scope, the allowed transition, and writes the audit row.
 */
export async function updatePosOnlineOrderStatus(
  orderId: string,
  status: OnlineOrderStatus,
): Promise<PosOnlineOrderStatusResult> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return { ok: false, message: "The online order could not be identified." };
  if (!POS_ONLINE_ORDER_STATUSES.some((candidate) => candidate === status)) {
    return { ok: false, message: "That online order transition is not available from the POS." };
  }

  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, message: "Your session has expired. Sign in again before updating the online queue." };

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("org_id, store_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) return { ok: false, message: "Your POS profile is not available. Sign in again and try once more." };

  const role = profile.role as OwnerProfile["role"];
  if (role !== "admin" && role !== "manager" && role !== "cashier") {
    return { ok: false, message: "Your POS role cannot update the online queue." };
  }
  if (role !== "admin" && !profile.store_id) {
    return { ok: false, message: "This POS terminal is not assigned to a branch." };
  }

  const { error } = await supabase.rpc("advance_online_order_status", {
    p_online_order_id: normalizedOrderId,
    p_next_status: status,
  });
  if (error) return { ok: false, message: error.message || "The online order could not be updated." };

  const label = formatOrderStatusLabel(status) ?? "updated";
  return { ok: true, message: `Online order ${label.toLowerCase()}.` };
}
