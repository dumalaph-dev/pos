"use server";

import { redirect } from "next/navigation";
import {
  createAdminClient,
  isEmployeeCode,
  normalizeEmployeeCode,
} from "@/lib/employee-auth";
import { createClient } from "@/lib/supabase/server";
import { getStoreByStaffKey, isStaffAccessValue, normalizeStaffAccessValue } from "@/lib/store-access";
import {
  checkEmployeeLoginLock,
  clearEmployeeLoginAttempts,
  recordFailedEmployeeLogin,
} from "@/lib/auth/login-throttle";

export type LoginState = { message: string };

type EmployeeLoginRecord = {
  org_id: string;
  profile_id: string | null;
  employee_code: string;
  is_active: boolean;
};

type EmployeeLoginProfile = {
  role: "admin" | "manager" | "cashier";
  store_id: string | null;
  is_active: boolean;
  password_change_required: boolean;
};

const INVALID_LOGIN_MESSAGE = "Employee ID or password is incorrect.";

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
    .select("org_id, profile_id, employee_code, is_active")
    .eq("employee_code", employeeCode)
    .eq("org_id", store.org_id)
    .eq("store_id", store.id)
    .eq("is_active", true)
    .limit(2);
  const employees = (employeeRows ?? []) as EmployeeLoginRecord[];

  // Employee codes are unique inside an organization. Refuse an ambiguous
  // cross-organization match instead of signing into the wrong business.
  if (employeeError || employees.length !== 1) return { message: INVALID_LOGIN_MESSAGE };
  const employee = employees[0];
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
  if (authUserError || authEmail === undefined || profileError || !profile || !profile.is_active || profile.store_id !== store.id) {
    return { message: INVALID_LOGIN_MESSAGE };
  }

  // Organization owners use the owner login. A store link is only for
  // branch-assigned managers and cashiers, so it cannot become an alternate
  // path into organization-wide admin access.
  if (profile.role === "admin") return { message: "Use the owner login for administrator access." };

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
  redirect(profile.role === "cashier" ? "/pos" : "/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Cache Storage lives on the client and outlives the session, so the server
  // cannot clear it here. Flag the landing so the login page wipes the
  // app-shell caches even when sign-out did not come from SignOutButton
  // (expired session, a redirect, JS-disabled fallback). See
  // src/lib/offline-cache.ts.
  redirect("/login?signed-out=1");
}
