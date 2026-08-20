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
import { isPosThemeId } from "@/lib/pos-theme";
import { isOnlineOrderingHexColor, mergeOnlineOrderingSettings, ONLINE_ORDER_STATUSES, publicMenuPath, readOnlineOrderingSettings, type OnlineOrderStatus } from "@/lib/online-ordering";

type OwnerProfile = {
  org_id: string;
  role: "admin" | "manager" | "cashier";
};

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
    .select("id, name, settings, staff_login_slug, is_active")
    .eq("id", storeId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !store || !store.is_active) actionRedirect("That branch is not available for online ordering.");
  return store as { id: string; name: string; settings: unknown; staff_login_slug: string };
}

export async function updateOnlineOrderingSettings(formData: FormData) {
  const { supabase, profile } = await requireOnlineOrderingUser();
  const storeId = readText(formData, "store_id");
  const store = await readStoreContext(supabase, profile.org_id, storeId);
  const averagePrepMinutes = Number(readText(formData, "average_prep_minutes"));
  const orderLeadMinutes = Number(readText(formData, "order_lead_minutes"));
  const pickupNote = readText(formData, "pickup_note");
  const enabled = formData.get("enabled") === "on";

  if (!Number.isInteger(averagePrepMinutes) || averagePrepMinutes < 5 || averagePrepMinutes > 180) {
    actionRedirect("Average prep time must be a whole number from 5 to 180 minutes.");
  }
  if (!Number.isInteger(orderLeadMinutes) || orderLeadMinutes < 0 || orderLeadMinutes > 180) {
    actionRedirect("Lead time must be a whole number from 0 to 180 minutes.");
  }
  if (!pickupNote || pickupNote.length > 240) actionRedirect("Add a pickup note under 240 characters.");

  const { error } = await supabase
    .from("stores")
    .update({
      settings: mergeOnlineOrderingSettings(store.settings, {
        enabled,
        averagePrepMinutes,
        orderLeadMinutes,
        pickupNote,
      }),
    })
    .eq("id", store.id)
    .eq("org_id", profile.org_id);

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
    .eq("store_id", store.id)
    .maybeSingle();
  if (orderError || !order) actionRedirect("That online order is no longer in the pickup queue.");

  const now = new Date().toISOString();
  const update: Record<string, string> = { status: requestedStatus };
  if (requestedStatus === "confirmed" || requestedStatus === "preparing") update.confirmed_at = now;
  if (requestedStatus === "ready") update.ready_at = now;
  if (requestedStatus === "picked_up") update.picked_up_at = now;
  if (requestedStatus === "cancelled") update.cancelled_at = now;

  const { error } = await supabase
    .from("online_orders")
    .update(update)
    .eq("id", orderId)
    .eq("store_id", store.id);
  if (error) actionRedirect(error.message || "The online order could not be updated.");

  revalidatePath("/admin/online-ordering");
  revalidatePath(publicMenuPath(store.staff_login_slug));
  redirect("/admin/online-ordering?saved=status");
}
