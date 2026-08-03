import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export type EmployeeAccessRole = "admin" | "manager" | "cashier";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
export function configuredEmployeeInitialPassword() {
  const password = process.env.EMPLOYEE_INITIAL_PASSWORD?.trim() ?? "";
  return password.length >= 8 ? password : null;
}

export function normalizeEmployeeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isEmployeeCode(value: string) {
  return /^EMP-[0-9]{4,}$/.test(value);
}

/**
 * New employee records need an Auth email even though staff never type it.
 * The address is internal, confirmed at creation, and never shown in the UI.
 */
export function employeeInternalAuthEmail(employeeCode: string, orgId: string) {
  const code = normalizeEmployeeCode(employeeCode).toLowerCase();
  const organization = orgId.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `${code}-${organization}@staff.internal`;
}
