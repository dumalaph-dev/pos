"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateAdminProfile } from "@/lib/admin/profile";
import {
  createAdminClient,
  configuredEmployeeInitialPassword,
  employeeInternalAuthEmail,
} from "@/lib/employee-auth";
import { toCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

type AccessRole = "admin" | "manager" | "cashier";
type AttendanceStatus = "present" | "absent" | "late" | "on_leave";
type PayrollStatus = "draft" | "processed" | "paid";
type LeaveStatus = "pending" | "approved" | "rejected";

type Actor = {
  id: string;
  org_id: string;
  role: AccessRole;
};

function employeesRedirect(message: string, tab = "list"): never {
  redirect(`/admin/employees?tab=${encodeURIComponent(tab)}&error=${encodeURIComponent(message)}`);
}

function employeesSaved(tab: string, message: string, values: Record<string, string> = {}): never {
  const params = new URLSearchParams({ tab, saved: message, ...values });
  redirect(`/admin/employees?${params.toString()}`);
}

function readReturnValues(formData: FormData) {
  const values: Record<string, string> = {};
  for (const key of ["q", "role", "status", "branch", "start", "end", "filters"]) {
    const value = readText(formData, `return_${key}`);
    if (value) values[key] = value;
  }
  return values;
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readRole(value: string): AccessRole | null {
  return value === "admin" || value === "manager" || value === "cashier" ? value : null;
}

function readAttendanceStatus(value: string): AttendanceStatus | null {
  return value === "present" || value === "absent" || value === "late" || value === "on_leave" ? value : null;
}

function readPayrollStatus(value: string): PayrollStatus | null {
  return value === "draft" || value === "processed" || value === "paid" ? value : null;
}

function readLeaveStatus(value: string): LeaveStatus | null {
  return value === "pending" || value === "approved" || value === "rejected" ? value : null;
}

function readBoolean(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function readDate(formData: FormData, name: string) {
  const value = readText(formData, name);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function readTime(formData: FormData, name: string, fallback: string) {
  const value = readText(formData, name);
  return value || fallback;
}

function timeIsValid(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function readMoney(formData: FormData, name: string) {
  const value = readText(formData, name);
  if (!value) return 0;
  const peso = Number(value);
  return Number.isFinite(peso) && peso >= 0 ? toCentavos(peso) : null;
}

function readScheduleDays(formData: FormData, fallbackToAllDays = true) {
  const values = formData.getAll("schedule_days").filter((value): value is string => typeof value === "string");
  const allowed = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const days = values.filter((value) => allowed.has(value));
  return days.length > 0 || !fallbackToAllDays ? days : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || `role-${Date.now()}`;
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function dateIsValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timestampForDateTime(date: string, time: string) {
  if (!dateIsValid(date) || !timeIsValid(time)) return null;
  return `${date}T${time}:00+08:00`;
}

async function getActor(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string; actor: Actor }> {
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

  if (!actor || !readRole(actor.role)) employeesRedirect("Your employee profile is not ready.");

  return { supabase, userId: user.id, actor: { id: user.id, org_id: actor.org_id, role: actor.role } };
}

async function requireBranch(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, storeId: string) {
  if (!storeId) return null;
  const { data: branch } = await supabase.from("stores").select("id").eq("id", storeId).eq("org_id", orgId).maybeSingle();
  return branch ? storeId : null;
}

async function requireRoleRecord(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, roleId: string) {
  if (!roleId) return null;
  const { data: role } = await supabase.from("employee_roles").select("id").eq("id", roleId).eq("org_id", orgId).maybeSingle();
  return role ? roleId : null;
}

async function nextEmployeeCode(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data } = await supabase.from("employee_records").select("employee_code").eq("org_id", orgId).limit(1000);
  const highest = (data ?? []).reduce((max, row) => {
    const match = /^EMP-(\d+)$/.exec(String(row.employee_code ?? ""));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP-${String(highest + 1).padStart(4, "0")}`;
}

function revalidateEmployees() {
  revalidatePath("/admin/employees");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/pos");
}

export async function provisionEmployeeLogin(formData: FormData) {
  const { supabase, userId, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can set up employee logins.");

  const employeeId = readText(formData, "employee_id");
  const initialPassword = configuredEmployeeInitialPassword();
  const admin = createAdminClient();
  if (!employeeId) employeesRedirect("Choose an employee before setting up login access.");
  if (!initialPassword || !admin) employeesRedirect("Employee login is not configured. Add the server-only Supabase service key and EMPLOYEE_INITIAL_PASSWORD first.");

  const { data: employee, error: employeeError } = await supabase
    .from("employee_records")
    .select("id, org_id, profile_id, store_id, employee_code, full_name, role, is_active")
    .eq("id", employeeId)
    .eq("org_id", actor.org_id)
    .maybeSingle();
  if (employeeError || !employee) employeesRedirect("That employee record is not available.");
  if (!employee.is_active) employeesRedirect("Activate the employee before setting up login access.");

  let profileId = employee.profile_id as string | null;
  let createdAuthUserId: string | null = null;
  if (!profileId) {
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: employeeInternalAuthEmail(employee.employee_code, actor.org_id),
      password: initialPassword,
      email_confirm: true,
      user_metadata: { employee_code: employee.employee_code, employee_name: employee.full_name },
    });
    if (createUserError || !createdUser.user) employeesRedirect(createUserError?.message || "The employee Auth account could not be created.");
    profileId = createdUser.user.id;
    createdAuthUserId = profileId;

    const { error: profileInsertError } = await admin.from("profiles").insert({
      id: profileId,
      org_id: actor.org_id,
      store_id: employee.store_id,
      full_name: employee.full_name,
      role: employee.role,
      password_change_required: true,
      is_active: true,
    });
    if (profileInsertError) {
      await admin.auth.admin.deleteUser(profileId);
      employeesRedirect(profileInsertError.message || "The employee profile could not be created.");
    }

    const { error: linkError } = await admin
      .from("employee_records")
      .update({ profile_id: profileId, updated_at: new Date().toISOString() })
      .eq("id", employee.id)
      .eq("org_id", actor.org_id)
      .is("profile_id", null);
    if (linkError) {
      await admin.from("profiles").delete().eq("id", profileId);
      await admin.auth.admin.deleteUser(profileId);
      invalidateAdminProfile(profileId);
      employeesRedirect(linkError.message || "The employee login could not be linked to the directory record.");
    }
  } else {
    const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(profileId);
    if (authLookupError || !authUser.user) employeesRedirect("The linked Auth account could not be found. Ask an administrator to repair this employee record.");
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(profileId, {
    password: initialPassword,
    user_metadata: { employee_code: employee.employee_code, employee_name: employee.full_name },
  });
  if (authUpdateError) {
    if (createdAuthUserId) {
      await admin.from("employee_records").update({ profile_id: null, updated_at: new Date().toISOString() }).eq("id", employee.id).eq("org_id", actor.org_id);
      await admin.from("profiles").delete().eq("id", createdAuthUserId);
      await admin.auth.admin.deleteUser(createdAuthUserId);
      invalidateAdminProfile(createdAuthUserId);
    }
    employeesRedirect(authUpdateError.message || "The employee password could not be initialized.");
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      full_name: employee.full_name,
      store_id: employee.store_id,
      role: employee.role,
      is_active: true,
      password_change_required: true,
    })
    .eq("id", profileId)
    .eq("org_id", actor.org_id);
  if (profileUpdateError) employeesRedirect(profileUpdateError.message || "The employee password-change requirement could not be saved.");

  invalidateAdminProfile(profileId);

  await admin.from("audit_logs").insert({
    org_id: actor.org_id,
    store_id: employee.store_id,
    actor_id: userId,
    action: "auth.employee.login_provisioned",
    entity: "employee_records",
    entity_id: employee.id,
    after: { employee_code: employee.employee_code, profile_id: profileId, reset_to_initial_password: true },
  });

  revalidateEmployees();
  employeesSaved("list", "login-provisioned", readReturnValues(formData));
}

export async function setEmployeePin(formData: FormData) {
  const { supabase, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can set staff PINs.");

  const employeeId = readText(formData, "employee_id");
  const pin = readText(formData, "pin");
  const confirmation = readText(formData, "pin_confirmation");
  if (!employeeId) employeesRedirect("Choose an employee before setting a PIN.");
  if (!/^\d{4,6}$/.test(pin)) employeesRedirect("PIN must be 4 to 6 digits.");
  if (pin !== confirmation) employeesRedirect("The PIN entries do not match.");

  const { data: employee, error: employeeError } = await supabase
    .from("employee_records")
    .select("id, profile_id, store_id, role, is_active")
    .eq("id", employeeId)
    .eq("org_id", actor.org_id)
    .maybeSingle();
  if (employeeError || !employee) employeesRedirect("That employee record is not available.");
  if (!employee.profile_id) employeesRedirect("Set up the employee login before setting a PIN.");
  if (employee.role !== "admin" && employee.role !== "manager") employeesRedirect("Only admin or manager profiles can hold an approval PIN.");
  if (!employee.is_active) employeesRedirect("Activate the employee before setting a PIN.");

  const { error: pinError } = await supabase.rpc("set_profile_pin", {
    p_profile_id: employee.profile_id,
    p_pin: pin,
  });
  if (pinError) employeesRedirect(pinError.message || "The employee PIN could not be saved.");

  revalidateEmployees();
  employeesSaved("list", "pin-updated", readReturnValues(formData));
}

export async function createEmployee(formData: FormData) {
  const { supabase, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can add employee records.");

  const fullName = readText(formData, "full_name");
  const email = readText(formData, "email");
  const phone = readText(formData, "phone");
  const jobTitle = readText(formData, "job_title");
  const accessRole = readRole(readText(formData, "access_role"));
  const storeInput = readText(formData, "store_id");
  const roleInput = readText(formData, "role_id");
  const storeId = await requireBranch(supabase, actor.org_id, storeInput);
  const roleId = await requireRoleRecord(supabase, actor.org_id, roleInput);
  const hiredOn = readDate(formData, "hired_on");
  const scheduleStart = readTime(formData, "schedule_start", "09:00");
  const scheduleEnd = readTime(formData, "schedule_end", "17:00");

  if (!fullName || fullName.length > 120) employeesRedirect("Enter an employee name up to 120 characters.");
  if (!accessRole) employeesRedirect("Choose a valid sign-in access role.");
  if (!isValidEmail(email)) employeesRedirect("Enter a valid employee email address.");
  if (storeInput && !storeId) employeesRedirect("Choose a valid branch from your organization.");
  if (roleInput && !roleId) employeesRedirect("Choose a valid workspace role.");
  if (!dateIsValid(hiredOn)) employeesRedirect("Choose a valid hire date.");
  if (!timeIsValid(scheduleStart) || !timeIsValid(scheduleEnd)) employeesRedirect("Enter valid schedule times.");
  if (scheduleEnd <= scheduleStart) employeesRedirect("The schedule end time must be after the start time.");

  const { error } = await supabase.from("employee_records").insert({
    org_id: actor.org_id,
    store_id: storeId,
    role_id: roleId,
    employee_code: await nextEmployeeCode(supabase, actor.org_id),
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    role: accessRole,
    job_title: jobTitle || null,
    hired_on: hiredOn,
    schedule_days: readScheduleDays(formData),
    schedule_start: scheduleStart,
    schedule_end: scheduleEnd,
    is_active: true,
  });

  if (error) employeesRedirect(error.message || "The employee record could not be created.");
  revalidateEmployees();
  employeesSaved("list", "employee-created", readReturnValues(formData));
}

export async function updateEmployee(formData: FormData) {
  const { supabase, userId, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can update employee records.");

  const employeeId = readText(formData, "employee_id");
  const fullName = readText(formData, "full_name");
  const email = readText(formData, "email");
  const phone = readText(formData, "phone");
  const jobTitle = readText(formData, "job_title");
  const accessRole = readRole(readText(formData, "access_role"));
  const storeInput = readText(formData, "store_id");
  const roleInput = readText(formData, "role_id");
  const storeId = await requireBranch(supabase, actor.org_id, storeInput);
  const roleId = await requireRoleRecord(supabase, actor.org_id, roleInput);
  const hiredOn = readDate(formData, "hired_on");
  const scheduleStart = readTime(formData, "schedule_start", "09:00");
  const scheduleEnd = readTime(formData, "schedule_end", "17:00");
  const isActive = readBoolean(formData, "is_active");

  if (!employeeId || !fullName || fullName.length > 120) employeesRedirect("Enter an employee name up to 120 characters.");
  if (!accessRole) employeesRedirect("Choose a valid sign-in access role.");
  if (!isValidEmail(email)) employeesRedirect("Enter a valid employee email address.");
  if (storeInput && !storeId) employeesRedirect("Choose a valid branch from your organization.");
  if (roleInput && !roleId) employeesRedirect("Choose a valid workspace role.");
  if (!dateIsValid(hiredOn)) employeesRedirect("Choose a valid hire date.");
  if (!timeIsValid(scheduleStart) || !timeIsValid(scheduleEnd)) employeesRedirect("Enter valid schedule times.");
  if (scheduleEnd <= scheduleStart) employeesRedirect("The schedule end time must be after the start time.");

  const { data: employee } = await supabase
    .from("employee_records")
    .select("id, profile_id")
    .eq("id", employeeId)
    .eq("org_id", actor.org_id)
    .maybeSingle();

  if (!employee) employeesRedirect("That employee record is not available in your organization.");
  if (employee.profile_id === userId && (accessRole !== "admin" || !isActive)) {
    employeesRedirect("You cannot remove your own admin access or deactivate your signed-in profile.");
  }

  const { error } = await supabase
    .from("employee_records")
    .update({
      role_id: roleId,
      store_id: storeId,
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      role: accessRole,
      job_title: jobTitle || null,
      hired_on: hiredOn,
      schedule_days: readScheduleDays(formData, false),
      schedule_start: scheduleStart,
      schedule_end: scheduleEnd,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", employeeId)
    .eq("org_id", actor.org_id);

  if (error) employeesRedirect(error.message || "The employee record could not be updated.");

  if (employee.profile_id) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, role: accessRole, store_id: storeId, is_active: isActive })
      .eq("id", employee.profile_id)
      .eq("org_id", actor.org_id);
    if (profileError) employeesRedirect(profileError.message || "The linked sign-in profile could not be synchronized.");
    invalidateAdminProfile(employee.profile_id);
  }

  revalidateEmployees();
  employeesSaved("list", "employee-updated", readReturnValues(formData));
}

export async function saveRole(formData: FormData) {
  const { supabase, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can edit roles and permissions.", "roles");

  const roleId = readText(formData, "role_id");
  const name = readText(formData, "name");
  const description = readText(formData, "description");
  const color = readText(formData, "color");
  const permissions = formData.getAll("permissions").filter((value): value is string => typeof value === "string").slice(0, 50);
  if (!name || name.length > 80) employeesRedirect("Enter a role name up to 80 characters.", "roles");
  if (color && !["brown", "amber", "green", "blue"].includes(color)) employeesRedirect("Choose a valid role accent.", "roles");
  if (roleId && !(await requireRoleRecord(supabase, actor.org_id, roleId))) employeesRedirect("That workspace role is not available.", "roles");

  const payload = {
    org_id: actor.org_id,
    name,
    slug: slugify(name),
    description: description || null,
    color: color || "brown",
    permissions,
    is_active: readBoolean(formData, "is_active"),
    updated_at: new Date().toISOString(),
  };
  const query = roleId
    ? supabase.from("employee_roles").update(payload).eq("id", roleId).eq("org_id", actor.org_id)
    : supabase.from("employee_roles").insert(payload);
  const { error } = await query;
  if (error) employeesRedirect(error.message || "The role could not be saved.", "roles");

  revalidateEmployees();
  employeesSaved("roles", roleId ? "role-updated" : "role-created");
}

export async function saveAttendance(formData: FormData) {
  const { supabase, userId, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can save attendance logs.", "attendance");

  const employeeId = readText(formData, "employee_id");
  const workDate = readDate(formData, "work_date");
  const status = readAttendanceStatus(readText(formData, "status"));
  if (!employeeId || !dateIsValid(workDate) || !status) employeesRedirect("Choose an employee, date, and attendance status.", "attendance");

  const { data: employee } = await supabase.from("employee_records").select("store_id").eq("id", employeeId).eq("org_id", actor.org_id).maybeSingle();
  if (!employee) employeesRedirect("That employee record is not available.", "attendance");

  const checkIn = readText(formData, "check_in");
  const checkOut = readText(formData, "check_out");
  if ((checkIn && !timeIsValid(checkIn)) || (checkOut && !timeIsValid(checkOut))) employeesRedirect("Enter valid check-in and check-out times.", "attendance");
  if (checkIn && checkOut && checkOut <= checkIn) employeesRedirect("Check-out time must be after check-in time.", "attendance");
  const { error } = await supabase.from("attendance_logs").upsert({
    org_id: actor.org_id,
    store_id: employee.store_id,
    employee_id: employeeId,
    work_date: workDate,
    status,
    check_in: checkIn ? timestampForDateTime(workDate, checkIn) : null,
    check_out: checkOut ? timestampForDateTime(workDate, checkOut) : null,
    notes: readText(formData, "notes") || null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "employee_id,work_date" });

  if (error) employeesRedirect(error.message || "The attendance log could not be saved.", "attendance");
  revalidateEmployees();
  const rangeStart = readDate(formData, "range_start");
  const rangeEnd = readDate(formData, "range_end");
  employeesSaved("attendance", "attendance-saved", { date: workDate, employee: employeeId, ...(dateIsValid(rangeStart) && dateIsValid(rangeEnd) && rangeEnd >= rangeStart ? { start: rangeStart, end: rangeEnd } : {}) });
}

export async function savePayroll(formData: FormData) {
  const { supabase, userId, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can save payroll records.", "payroll");

  const employeeId = readText(formData, "employee_id");
  const periodStart = readDate(formData, "period_start");
  const periodEnd = readDate(formData, "period_end");
  const status = readPayrollStatus(readText(formData, "status")) ?? "draft";
  const regularPay = readMoney(formData, "regular_pay");
  const overtimePay = readMoney(formData, "overtime_pay");
  const allowances = readMoney(formData, "allowances");
  const deductions = readMoney(formData, "deductions");

  if (!employeeId || !dateIsValid(periodStart) || !dateIsValid(periodEnd) || periodEnd < periodStart) employeesRedirect("Choose a valid payroll period and employee.", "payroll");
  if ([regularPay, overtimePay, allowances, deductions].some((value) => value === null)) employeesRedirect("Payroll amounts must be valid non-negative peso values.", "payroll");

  const { data: employee } = await supabase.from("employee_records").select("store_id").eq("id", employeeId).eq("org_id", actor.org_id).maybeSingle();
  if (!employee) employeesRedirect("That employee record is not available.", "payroll");

  const { error } = await supabase.from("payroll_records").upsert({
    org_id: actor.org_id,
    store_id: employee.store_id,
    employee_id: employeeId,
    period_start: periodStart,
    period_end: periodEnd,
    regular_pay: regularPay,
    overtime_pay: overtimePay,
    allowances: allowances,
    deductions: deductions,
    status,
    notes: readText(formData, "notes") || null,
    processed_at: status === "draft" ? null : new Date().toISOString(),
    created_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "employee_id,period_start,period_end" });

  if (error) employeesRedirect(error.message || "The payroll record could not be saved.", "payroll");
  revalidateEmployees();
  employeesSaved("payroll", "payroll-saved", { start: periodStart, end: periodEnd });
}

export async function createLeaveRequest(formData: FormData) {
  const { supabase, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can create leave requests.", "leave");

  const employeeId = readText(formData, "employee_id");
  const startDate = readDate(formData, "start_date");
  const endDate = readDate(formData, "end_date");
  const leaveType = readText(formData, "leave_type") || "Personal Leave";
  if (!employeeId || !dateIsValid(startDate) || !dateIsValid(endDate) || endDate < startDate) employeesRedirect("Choose a valid employee and leave date range.", "leave");

  const { data: employee } = await supabase.from("employee_records").select("store_id").eq("id", employeeId).eq("org_id", actor.org_id).maybeSingle();
  if (!employee) employeesRedirect("That employee record is not available.", "leave");

  const { error } = await supabase.from("leave_requests").insert({
    org_id: actor.org_id,
    store_id: employee.store_id,
    employee_id: employeeId,
    leave_type: leaveType.slice(0, 80),
    start_date: startDate,
    end_date: endDate,
    reason: readText(formData, "reason") || null,
    status: "pending",
  });

  if (error) employeesRedirect(error.message || "The leave request could not be created.", "leave");
  revalidateEmployees();
  employeesSaved("leave", "leave-created");
}

export async function updateLeaveStatus(formData: FormData) {
  const { supabase, userId, actor } = await getActor();
  if (actor.role !== "admin") employeesRedirect("Only organization admins can review leave requests.", "leave");

  const requestId = readText(formData, "request_id");
  const status = readLeaveStatus(readText(formData, "status"));
  if (!requestId || !status || status === "pending") employeesRedirect("Choose an approval or rejection status.", "leave");

  const { data: request } = await supabase.from("leave_requests").select("id").eq("id", requestId).eq("org_id", actor.org_id).maybeSingle();
  if (!request) employeesRedirect("That leave request is not available.", "leave");

  const { error } = await supabase.from("leave_requests").update({
    status,
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", requestId).eq("org_id", actor.org_id);

  if (error) employeesRedirect(error.message || "The leave request could not be updated.", "leave");
  revalidateEmployees();
  employeesSaved("leave", status === "approved" ? "leave-approved" : "leave-rejected");
}
