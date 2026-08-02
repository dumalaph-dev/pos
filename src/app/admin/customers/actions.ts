"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function customersRedirect(message: string): never {
  redirect(`/admin/customers?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function validateLength(value: string, label: string, max: number, min = 0) {
  if (value.length < min || value.length > max) customersRedirect(`${label} must be between ${min} and ${max} characters.`);
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

  if (!profile || profile.role !== "admin") customersRedirect("Only organization admins can manage customers.");
  return { supabase, orgId: profile.org_id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!storeId) return true;
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return Boolean(data);
}

function refreshCustomers() {
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
}

export async function createCustomer(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const phone = readText(formData, "phone");
  const email = readText(formData, "email");
  const address = readText(formData, "address");
  const notes = readText(formData, "notes");

  if (!(await validStore(supabase, orgId, storeId))) customersRedirect("Choose a branch from your organization.");
  validateLength(name, "Customer name", 120, 2);
  validateLength(phone, "Phone", 40);
  validateLength(email, "Email", 160);
  validateLength(address, "Address", 240);
  validateLength(notes, "Notes", 500);

  const { error } = await supabase.from("customers").insert({
    org_id: orgId,
    store_id: storeId || null,
    name,
    phone: phone || null,
    email: email || null,
    address: address || null,
    notes: notes || null,
    is_active: true,
  });

  if (error) customersRedirect(error.message || "The customer could not be created.");
  refreshCustomers();
  redirect("/admin/customers?saved=created");
}

export async function updateCustomer(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const customerId = readText(formData, "customer_id");
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const phone = readText(formData, "phone");
  const email = readText(formData, "email");
  const address = readText(formData, "address");
  const notes = readText(formData, "notes");

  if (!customerId) customersRedirect("The customer identifier is missing.");
  const { data: existing } = await supabase.from("customers").select("id").eq("id", customerId).eq("org_id", orgId).maybeSingle();
  if (!existing) customersRedirect("That customer is not available in your organization.");
  if (!(await validStore(supabase, orgId, storeId))) customersRedirect("Choose a branch from your organization.");
  validateLength(name, "Customer name", 120, 2);
  validateLength(phone, "Phone", 40);
  validateLength(email, "Email", 160);
  validateLength(address, "Address", 240);
  validateLength(notes, "Notes", 500);

  const { error } = await supabase
    .from("customers")
    .update({
      store_id: storeId || null,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
      is_active: readBoolean(formData, "is_active"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("org_id", orgId);

  if (error) customersRedirect(error.message || "The customer could not be updated.");
  refreshCustomers();
  redirect("/admin/customers?saved=updated");
}
