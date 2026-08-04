"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  return { supabase, orgId: profile.org_id };
}

function refreshSettings() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/pos");
  revalidatePath("/pos");
}

export async function updateOrganizationSettings(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const name = readText(formData, "name");
  const currency = readText(formData, "currency").toUpperCase();
  validateRequiredText(name, "Organization name", 120);
  if (!/^[A-Z]{3}$/.test(currency)) settingsRedirect("Currency must be a three-letter code such as PHP.");

  const { error } = await supabase.from("organizations").update({ name, currency }).eq("id", orgId);
  if (error) settingsRedirect(error.message || "Organization settings could not be saved.");

  refreshSettings();
  redirect("/admin/settings?saved=organization");
}
