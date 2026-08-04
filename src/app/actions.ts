"use server";

import { redirect } from "next/navigation";
import {
  createAdminClient,
  isEmployeeCode,
  normalizeEmployeeCode,
} from "@/lib/employee-auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { message: string };

type EmployeeLoginRecord = {
  org_id: string;
  profile_id: string | null;
  employee_code: string;
  is_active: boolean;
};

type EmployeeLoginProfile = {
  role: "admin" | "manager" | "cashier";
  is_active: boolean;
  password_change_required: boolean;
};

const INVALID_LOGIN_MESSAGE = "Employee ID or password is incorrect.";

export async function loginWithEmployeeId(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const employeeCode = normalizeEmployeeCode(String(formData.get("employee_code") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isEmployeeCode(employeeCode) || !password) return { message: INVALID_LOGIN_MESSAGE };

  const admin = createAdminClient();
  if (!admin) {
    return { message: "Employee login is not configured on the server yet. Ask an administrator to finish the setup." };
  }

  const { data: employeeRows, error: employeeError } = await admin
    .from("employee_records")
    .select("org_id, profile_id, employee_code, is_active")
    .eq("employee_code", employeeCode)
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
      .select("role, is_active, password_change_required")
      .eq("id", employee.profile_id)
      .eq("org_id", employee.org_id)
      .maybeSingle(),
  ]);
  const profile = profileData as EmployeeLoginProfile | null;
  const authEmail = authUserData?.user?.email;
  if (authUserError || authEmail === undefined || profileError || !profile || !profile.is_active) {
    return { message: INVALID_LOGIN_MESSAGE };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  if (signInError) return { message: INVALID_LOGIN_MESSAGE };

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
  redirect("/?signed-out=1");
}
