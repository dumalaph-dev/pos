"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function suppliersRedirect(message: string): never {
  redirect(`/admin/suppliers?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function validateLength(value: string, label: string, max: number, min = 0) {
  if (value.length < min || value.length > max) suppliersRedirect(`${label} must be between ${min} and ${max} characters.`);
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

  if (!profile || profile.role !== "admin") suppliersRedirect("Only organization admins can manage suppliers.");
  return { supabase, orgId: profile.org_id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!storeId) return true;
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return Boolean(data);
}

function refreshSuppliers() {
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin");
}

export async function createSupplier(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const contactName = readText(formData, "contact_name");
  const phone = readText(formData, "phone");
  const email = readText(formData, "email");
  const address = readText(formData, "address");
  const notes = readText(formData, "notes");

  if (!(await validStore(supabase, orgId, storeId))) suppliersRedirect("Choose a branch from your organization.");
  validateLength(name, "Supplier name", 120, 2);
  validateLength(contactName, "Contact person", 120);
  validateLength(phone, "Phone", 40);
  validateLength(email, "Email", 160);
  validateLength(address, "Address", 240);
  validateLength(notes, "Notes", 500);

  const { error } = await supabase.from("suppliers").insert({
    org_id: orgId,
    store_id: storeId || null,
    name,
    contact_name: contactName || null,
    phone: phone || null,
    email: email || null,
    address: address || null,
    notes: notes || null,
    is_active: true,
  });

  if (error) suppliersRedirect(error.message || "The supplier could not be created.");
  refreshSuppliers();
  redirect("/admin/suppliers?saved=created");
}

export async function updateSupplier(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const supplierId = readText(formData, "supplier_id");
  const storeId = readText(formData, "store_id");
  const name = readText(formData, "name");
  const contactName = readText(formData, "contact_name");
  const phone = readText(formData, "phone");
  const email = readText(formData, "email");
  const address = readText(formData, "address");
  const notes = readText(formData, "notes");

  if (!supplierId) suppliersRedirect("The supplier identifier is missing.");
  const { data: existing } = await supabase.from("suppliers").select("id").eq("id", supplierId).eq("org_id", orgId).maybeSingle();
  if (!existing) suppliersRedirect("That supplier is not available in your organization.");
  if (!(await validStore(supabase, orgId, storeId))) suppliersRedirect("Choose a branch from your organization.");
  validateLength(name, "Supplier name", 120, 2);
  validateLength(contactName, "Contact person", 120);
  validateLength(phone, "Phone", 40);
  validateLength(email, "Email", 160);
  validateLength(address, "Address", 240);
  validateLength(notes, "Notes", 500);

  const { error } = await supabase
    .from("suppliers")
    .update({
      store_id: storeId || null,
      name,
      contact_name: contactName || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
      is_active: readBoolean(formData, "is_active"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplierId)
    .eq("org_id", orgId);

  if (error) suppliersRedirect(error.message || "The supplier could not be updated.");
  refreshSuppliers();
  redirect("/admin/suppliers?saved=updated");
}

export async function deleteSupplier(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const supplierId = readText(formData, "supplier_id");

  if (!supplierId) suppliersRedirect("The supplier identifier is missing.");

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existing) suppliersRedirect("That supplier is not available in your organization.");

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("org_id", orgId);

  if (error) suppliersRedirect(error.message || "The supplier could not be deleted.");

  refreshSuppliers();
  redirect("/admin/suppliers?saved=deleted");
}
