"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type ExpensePaymentMethod = "cash" | "gcash" | "maya" | "card" | "other";

function expensesRedirect(message: string): never {
  redirect(`/admin/expenses?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readPaymentMethod(value: string): ExpensePaymentMethod | null {
  return value === "cash" || value === "gcash" || value === "maya" || value === "card" || value === "other" ? value : null;
}

function readDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : value;
}

function readAmount(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000_000) return null;
  return toCentavos(parsed);
}

function validateLength(value: string, label: string, max: number, min = 0) {
  if (value.length < min || value.length > max) expensesRedirect(`${label} must be between ${min} and ${max} characters.`);
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

  if (!profile || profile.role !== "admin") expensesRedirect("Only organization admins can manage expenses.");
  return { supabase, orgId: profile.org_id, userId: user.id };
}

async function validStore(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  const { data } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return Boolean(data);
}

function refreshExpenses() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

function readExpenseFields(formData: FormData) {
  const storeId = readText(formData, "store_id");
  const category = readText(formData, "category");
  const description = readText(formData, "description");
  const amount = readAmount(readText(formData, "amount"));
  const incurredOn = readDate(readText(formData, "incurred_on"));
  const paymentMethod = readPaymentMethod(readText(formData, "payment_method"));
  const reference = readText(formData, "reference");
  const notes = readText(formData, "notes");

  validateLength(category, "Category", 60, 2);
  validateLength(description, "Description", 160, 2);
  validateLength(reference, "Reference", 120);
  validateLength(notes, "Notes", 500);
  if (amount === null) expensesRedirect("Enter an expense amount greater than zero in pesos.");
  if (!incurredOn) expensesRedirect("Choose a valid expense date.");
  if (!paymentMethod) expensesRedirect("Choose a valid payment method.");
  return { storeId, category, description, amount, incurredOn, paymentMethod, reference, notes };
}

export async function createExpense(formData: FormData) {
  const { supabase, orgId, userId } = await requireAdmin();
  const fields = readExpenseFields(formData);
  if (!fields.storeId || !(await validStore(supabase, orgId, fields.storeId))) expensesRedirect("Choose a valid branch for this expense.");

  const { error } = await supabase.from("expenses").insert({
    org_id: orgId,
    store_id: fields.storeId,
    category: fields.category,
    description: fields.description,
    amount: fields.amount,
    incurred_on: fields.incurredOn,
    payment_method: fields.paymentMethod,
    reference: fields.reference || null,
    notes: fields.notes || null,
    created_by: userId,
  });

  if (error) expensesRedirect(error.message || "The expense could not be recorded.");
  refreshExpenses();
  redirect("/admin/expenses?saved=created");
}

export async function updateExpense(formData: FormData) {
  const { supabase, orgId } = await requireAdmin();
  const expenseId = readText(formData, "expense_id");
  const fields = readExpenseFields(formData);

  if (!expenseId) expensesRedirect("The expense identifier is missing.");
  const { data: existing } = await supabase.from("expenses").select("id").eq("id", expenseId).eq("org_id", orgId).maybeSingle();
  if (!existing) expensesRedirect("That expense is not available in your organization.");
  if (!fields.storeId || !(await validStore(supabase, orgId, fields.storeId))) expensesRedirect("Choose a valid branch for this expense.");

  const { error } = await supabase
    .from("expenses")
    .update({
      store_id: fields.storeId,
      category: fields.category,
      description: fields.description,
      amount: fields.amount,
      incurred_on: fields.incurredOn,
      payment_method: fields.paymentMethod,
      reference: fields.reference || null,
      notes: fields.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", expenseId)
    .eq("org_id", orgId);

  if (error) expensesRedirect(error.message || "The expense could not be updated.");
  refreshExpenses();
  redirect("/admin/expenses?saved=updated");
}
