import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function todayInSingapore() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role === "cashier") return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const roleFilter = url.searchParams.get("role") ?? "";
  const statusFilter = url.searchParams.get("status") ?? "";
  const branchFilter = url.searchParams.get("branch") ?? "";
  const today = todayInSingapore();
  const [employeeResult, rolesResult, leaveResult] = await Promise.all([
    supabase.from("employee_records").select("id, role_id, store_id, employee_code, full_name, email, phone, role, job_title, hired_on, schedule_days, schedule_start, schedule_end, is_active").eq("org_id", profile.org_id).order("full_name").limit(5000),
    supabase.from("employee_roles").select("id, name").eq("org_id", profile.org_id),
    supabase.from("leave_requests").select("employee_id").eq("org_id", profile.org_id).eq("status", "approved").lte("start_date", today).gte("end_date", today),
  ]);
  if (employeeResult.error || rolesResult.error || leaveResult.error) return new Response("Employee export data is unavailable.", { status: 503 });
  const employeeData = employeeResult.data;
  const roles = rolesResult.data;
  const leaveData = leaveResult.data;
  const roleNames = new Map((roles ?? []).map((role) => [role.id, role.name]));
  const onLeave = new Set((leaveData ?? []).map((leave) => leave.employee_id));
  const employees = (employeeData ?? []).filter((employee) => {
    const status = onLeave.has(employee.id) ? "on_leave" : employee.is_active ? "active" : "inactive";
    if (roleFilter && roleFilter !== "all" && employee.role_id !== roleFilter && employee.role !== roleFilter) return false;
    if (statusFilter && statusFilter !== "all" && status !== statusFilter) return false;
    if (branchFilter === "unassigned" && employee.store_id) return false;
    if (branchFilter && branchFilter !== "unassigned" && employee.store_id !== branchFilter) return false;
    if (q && ![employee.full_name, employee.email ?? "", employee.phone ?? "", employee.employee_code].some((value) => value.toLowerCase().includes(q))) return false;
    return true;
  });

  const rows = [
    ["Employee code", "Employee", "Role", "Job title", "Status", "Email", "Phone", "Date hired", "Schedule"],
    ...employees.map((employee) => [
      employee.employee_code,
      employee.full_name,
      roleNames.get(employee.role_id) ?? employee.role,
      employee.job_title ?? "",
      onLeave.has(employee.id) ? "On Leave" : employee.is_active ? "Active" : "Inactive",
      employee.email ?? "",
      employee.phone ?? "",
      employee.hired_on,
      `${(employee.schedule_days ?? []).join(", ")} ${String(employee.schedule_start ?? "").slice(0, 5)}-${String(employee.schedule_end ?? "").slice(0, 5)}`,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\ufeff${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
