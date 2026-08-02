"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type EmployeeRole = "admin" | "manager" | "cashier";

function employeesRedirect(message: string): never {
  redirect(`/admin/employees?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readRole(value: string): EmployeeRole | null {
  return value === "admin" || value === "manager" || value === "cashier" ? value : null;
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

export async function updateEmployee(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: actor } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!actor || actor.role !== "admin") {
    employeesRedirect("Only organization admins can update staff access.");
  }

  const employeeId = readText(formData, "employee_id");
  const role = readRole(readText(formData, "role"));
  const storeId = readText(formData, "store_id");
  const isActive = readBoolean(formData, "is_active");

  if (!employeeId || !role) employeesRedirect("Choose a valid staff role.");

  const { data: employee } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", employeeId)
    .eq("org_id", actor.org_id)
    .maybeSingle();

  if (!employee) employeesRedirect("That staff profile is not available in your organization.");

  if (storeId) {
    const { data: branch } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("org_id", actor.org_id)
      .maybeSingle();
    if (!branch) employeesRedirect("Choose a valid branch from your organization.");
  }

  if (employeeId === user.id && (role !== "admin" || !isActive)) {
    employeesRedirect("You cannot remove your own admin access or deactivate your signed-in profile.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      store_id: storeId || null,
      is_active: isActive,
    })
    .eq("id", employeeId)
    .eq("org_id", actor.org_id);

  if (error) employeesRedirect(error.message || "The staff profile could not be updated.");

  revalidatePath("/admin/employees");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/pos");
  redirect("/admin/employees?saved=1");
}
