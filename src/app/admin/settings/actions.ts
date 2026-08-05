"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateAdminProfile } from "@/lib/admin/profile";
import { isAdminThemeId, mergeAdminBrandingSettings } from "@/lib/admin/branding";
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
  validateRequiredText(name, "Organization name", 120);
  validateRequiredText(brandName, "Brand name", 48);
  if (brandTagline.length > 48) settingsRedirect("Brand tagline must be at most 48 characters.");
  if (!/^[A-Z]{3}$/.test(currency)) settingsRedirect("Currency must be a three-letter code such as PHP.");
  if (!isAdminThemeId(theme)) settingsRedirect("Choose a valid dashboard theme.");

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (organizationError) settingsRedirect(organizationError.message || "Organization settings could not be read.");
  if (!organization) settingsRedirect("Organization settings could not be found.");

  const settings = mergeAdminBrandingSettings(organization?.settings, {
    brandName,
    brandTagline,
    theme,
  });

  const { error } = await supabase.from("organizations").update({ name, currency, settings }).eq("id", orgId);
  if (error) settingsRedirect(error.message || "Organization settings could not be saved.");

  invalidateAdminProfile(userId);
  refreshSettings();
  redirect("/admin/settings?saved=organization");
}
