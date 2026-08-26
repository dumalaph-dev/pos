"use server";

import { redirect } from "next/navigation";
import {
  createAdminClient,
  isEmployeeCode,
  normalizeEmployeeCode,
} from "@/lib/employee-auth";
import { createClient } from "@/lib/supabase/server";
import {
  getStoreByStaffKey,
  isStaffAccessValue,
  legacyStaffLoginPath,
  normalizeStaffAccessValue,
  staffLoginPath,
} from "@/lib/store-access";
import {
  checkEmployeeLoginLock,
  clearEmployeeLoginAttempts,
  recordFailedEmployeeLogin,
} from "@/lib/auth/login-throttle";

export type LoginState = { message: string };

type EmployeeLoginRecord = {
  org_id: string;
  profile_id: string | null;
  store_id: string | null;
  employee_code: string;
  role: "admin" | "manager" | "cashier" | null;
  is_active: boolean;
};

type EmployeeLoginProfile = {
  role: "admin" | "manager" | "cashier";
  store_id: string | null;
  is_active: boolean;
  password_change_required: boolean;
};

const INVALID_LOGIN_MESSAGE = "Employee ID or password is incorrect.";
const DEFAULT_SIGN_OUT_PATH = "/login?signed-out=1";

export type SignOutDestination = "login" | "staff";
export type SignOutResult = { redirectPath: string };

export async function loginWithEmployeeId(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const employeeCode = normalizeEmployeeCode(String(formData.get("employee_code") ?? ""));
  const storeKey = normalizeStaffAccessValue(String(formData.get("store_key") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isEmployeeCode(employeeCode) || !isStaffAccessValue(storeKey) || !password) return { message: INVALID_LOGIN_MESSAGE };

  const admin = createAdminClient();
  if (!admin) {
    return { message: "Employee login is not configured on the server yet. Ask an administrator to finish the setup." };
  }

  const store = await getStoreByStaffKey(storeKey);
  if (!store) return { message: INVALID_LOGIN_MESSAGE };

  const { data: employeeRows, error: employeeError } = await admin
    .from("employee_records")
    .select("org_id, profile_id, store_id, employee_code, role, is_active")
    .eq("employee_code", employeeCode)
    .eq("org_id", store.org_id)
    .eq("is_active", true)
    .limit(2);
  const employees = (employeeRows ?? []) as EmployeeLoginRecord[];

  // Employee codes are unique inside an organization. Refuse an ambiguous
  // cross-organization match instead of signing into the wrong business.
  if (employeeError || employees.length !== 1) return { message: INVALID_LOGIN_MESSAGE };
  const employee = employees[0];
  if (employee.role === null) return { message: "This employee does not have sign-in access. Ask an administrator if access is needed." };
  if (!employee.profile_id) return { message: "This employee login has not been set up yet. Ask an administrator." };

  const [{ data: authUserData, error: authUserError }, { data: profileData, error: profileError }] = await Promise.all([
    admin.auth.admin.getUserById(employee.profile_id),
    admin
      .from("profiles")
      .select("role, store_id, is_active, password_change_required")
      .eq("id", employee.profile_id)
      .eq("org_id", employee.org_id)
      .maybeSingle(),
  ]);
  const profile = profileData as EmployeeLoginProfile | null;
  const authEmail = authUserData?.user?.email;
  const assignedToBranch = employee.store_id === store.id && profile?.store_id === store.id;
  const unassignedAdmin = profile?.role === "admin" && employee.store_id === null && profile.store_id === null;
  if (authUserError || authEmail === undefined || profileError || !profile || !profile.is_active || (!assignedToBranch && !unassignedAdmin)) {
    return { message: INVALID_LOGIN_MESSAGE };
  }

  // Throttle only once the code resolves to a real active employee, so guessing
  // random codes cannot fill the table. Checked before the password round trip
  // so a locked account costs nothing to reject.
  const lock = await checkEmployeeLoginLock(admin, store.id, employee.employee_code);
  if (lock.locked) {
    return { message: `Too many incorrect attempts. Try again in ${lock.retryAfterSeconds} seconds.` };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (signInError) {
    await recordFailedEmployeeLogin(admin, employee.org_id, store.id, employee.employee_code);
    return { message: INVALID_LOGIN_MESSAGE };
  }

  await clearEmployeeLoginAttempts(admin, store.id, employee.employee_code);

  if (profile.password_change_required) redirect("/account/password?required=1");
  // Admin employees have the same organization-wide dashboard access as the
  // owner. Managers use the same dashboard shell with their existing read-only
  // permissions, while cashiers go straight to the POS.
  redirect(profile.role === "cashier" ? "/pos" : "/admin");
}

async function resolveSignOutPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destination: SignOutDestination,
): Promise<string> {
  if (destination !== "staff") return DEFAULT_SIGN_OUT_PATH;

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return DEFAULT_SIGN_OUT_PATH;

    const { data: profile } = await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", userId)
      .maybeSingle();
    const storeId = typeof profile?.store_id === "string" ? profile.store_id : null;
    if (!storeId) return DEFAULT_SIGN_OUT_PATH;

    const { data: store } = await supabase
      .from("stores")
      .select("staff_login_slug, staff_login_key")
      .eq("id", storeId)
      .maybeSingle();
    const slug = typeof store?.staff_login_slug === "string" ? store.staff_login_slug.trim() : "";
    if (slug) return `${staffLoginPath(slug)}?signed-out=1`;

    const legacyKey = typeof store?.staff_login_key === "string" ? store.staff_login_key.trim() : "";
    return legacyKey ? `${legacyStaffLoginPath(legacyKey)}?signed-out=1` : DEFAULT_SIGN_OUT_PATH;
  } catch {
    // Sign-out must still complete if the branch lookup is unavailable.
    return DEFAULT_SIGN_OUT_PATH;
  }
}

export async function signOut(destination: SignOutDestination = "login"): Promise<SignOutResult> {
  const supabase = await createClient();
  const redirectPath = await resolveSignOutPath(supabase, destination);
  await supabase.auth.signOut();
  // Browser-side cache cleanup happens before this action in SignOutButton.
  // Return the path so the client can navigate after the session is ended
  // without mistaking Next's redirect control flow for an action failure.
  return { redirectPath };
}
