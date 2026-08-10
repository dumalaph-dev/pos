import { redirect } from "next/navigation";
import { AdminIcon, type AdminIconName } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import StaffLinkCopy from "@/components/admin/StaffLinkCopy";
import { SignOutButton } from "@/components/SignOutButton";
import { readAdminBranding } from "@/lib/admin/branding";
import { formatPeso } from "@/lib/money";
import { getAdminProfile } from "@/lib/admin/profile";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { legacyStaffLoginPath, staffLoginPath } from "@/lib/store-access";
import {
  createEmployee,
  createLeaveRequest,
  provisionEmployeeLogin,
  setEmployeePin,
  saveAttendance,
  savePayroll,
  saveRole,
  updateEmployee,
  updateLeaveStatus,
} from "./actions";

type AccessRole = "admin" | "manager" | "cashier";
type WorkspaceTab = "list" | "roles" | "attendance" | "payroll" | "leave";
type EmployeeRecord = {
  id: string;
  profile_id: string | null;
  role_id: string | null;
  store_id: string | null;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: AccessRole;
  job_title: string | null;
  hired_on: string;
  schedule_days: string[];
  schedule_start: string;
  schedule_end: string;
  is_active: boolean;
  created_at: string;
};
type BranchRecord = { id: string; name: string; is_active: boolean; staff_login_key?: string | null; staff_login_slug?: string | null };
type RoleRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  permissions: string[];
  is_active: boolean;
};
type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  status: "present" | "absent" | "late" | "on_leave";
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
};
type PayrollRecord = {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  regular_pay: number;
  overtime_pay: number;
  allowances: number;
  deductions: number;
  status: "draft" | "processed" | "paid";
  notes: string | null;
};
type LeaveRecord = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};
type CurrentProfile = { full_name: string | null; role: AccessRole | null; org_id: string; store_id: string | null; password_change_required: boolean; organizations: { settings?: unknown } | null };
type SearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_STORE_NAME = "Your Store";
const PAGE_SIZE = 10;
const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;
const PERMISSIONS = [
  ["dashboard.view", "View dashboard"],
  ["sales.view", "View sales"],
  ["pos.use", "Use POS"],
  ["orders.manage", "Manage orders"],
  ["orders.create", "Create orders"],
  ["inventory.manage", "Manage inventory"],
  ["products.manage", "Manage products"],
  ["products.view", "View products"],
  ["employees.manage", "Manage employees"],
  ["employees.view", "View employees"],
  ["reports.view", "View reports"],
  ["settings.manage", "Manage settings"],
] as const;
const TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "list", label: "Employee List" },
  { key: "roles", label: "Roles & Permissions" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "leave", label: "Leave Requests" },
];

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function readTab(value: string): WorkspaceTab {
  return TABS.some((tab) => tab.key === value) ? value as WorkspaceTab : "list";
}

function dateIsValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function todayInSingapore() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekRange(today: string) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = addDays(today, weekday === 0 ? -6 : 1 - weekday);
  return { start, end: addDays(start, 6) };
}

function rangeScopeLabel(range: { start: string; end: string }) {
  const current = weekRange(todayInSingapore());
  return range.start === current.start && range.end === current.end ? "This week" : "Selected period";
}

function selectedRange(params: SearchParams, fallback: { start: string; end: string }) {
  const start = readParam(params, "start");
  const end = readParam(params, "end");
  return dateIsValid(start) && dateIsValid(end) && end >= start ? { start, end } : fallback;
}

function employeeHref(values: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return `/admin/employees${query ? `?${query}` : ""}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
  return `${formatter.format(new Date(`${start}T12:00:00Z`))} – ${formatter.format(new Date(`${end}T12:00:00Z`))}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const parts = value.slice(0, 5).split(":").map(Number);
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) return value;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" }).format(new Date(Date.UTC(2020, 0, 1, parts[0], parts[1])));
}

function formatTimestampInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" }).format(date);
}

function formatCentsInput(value: number | null | undefined) {
  return (Number(value ?? 0) / 100).toFixed(2);
}

function roleLabel(role: AccessRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function roleTone(value: string) {
  if (value === "green" || value === "cashier") return "employee-role--green";
  if (value === "amber" || value === "manager") return "employee-role--amber";
  if (value === "blue") return "employee-role--blue";
  return "employee-role--brown";
}

function statusTone(status: string) {
  if (status === "active" || status === "present" || status === "approved" || status === "paid") return "employee-status--green";
  if (status === "on_leave" || status === "late" || status === "pending" || status === "processed") return "employee-status--amber";
  if (status === "rejected" || status === "inactive" || status === "absent") return "employee-status--red";
  return "employee-status--muted";
}

function statusLabel(status: string) {
  if (status === "on_leave") return "On Leave";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function scheduleLabel(employee: EmployeeRecord) {
  const days = employee.schedule_days ?? [];
  const dayText = days.length === 7 ? "Mon – Sun" : days.map((day) => DAYS.find(([key]) => key === day)?.[1] ?? day).join(" – ");
  return `${dayText} · ${formatTime(employee.schedule_start)} – ${formatTime(employee.schedule_end)}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

function payrollTotal(record: Pick<PayrollRecord, "regular_pay" | "overtime_pay" | "allowances" | "deductions">) {
  return Number(record.regular_pay ?? 0) + Number(record.overtime_pay ?? 0) + Number(record.allowances ?? 0) - Number(record.deductions ?? 0);
}

function permissionLabel(value: string) {
  return PERMISSIONS.find(([key]) => key === value)?.[1] ?? value.replace(/[._]/g, " ");
}

function savedMessage(value: string) {
  const messages: Record<string, string> = {
    "1": "Employee access updated.",
    "employee-created": "Employee record created.",
    "employee-updated": "Employee record updated.",
    "role-created": "Role created.",
    "role-updated": "Role permissions updated.",
    "attendance-saved": "Attendance log saved.",
    "payroll-saved": "Payroll record saved.",
    "leave-created": "Leave request created.",
    "leave-approved": "Leave request approved.",
    "leave-rejected": "Leave request rejected.",
    "login-provisioned": "Employee login is ready. Give the employee the common initial password; they will be required to create a new one on first sign-in.",
    "pin-updated": "Approval PIN saved. The raw PIN was not stored in the browser or audit log.",
  };
  return messages[value] ?? "Changes saved.";
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/");

  const profile = await getAdminProfile(user.id) as CurrentProfile | null;
  if (profile?.password_change_required) redirect("/account/password?required=1");
  if (profile?.role === "cashier") redirect("/pos");
  if (!profile) return <EmployeesProfileMissing />;
  const branding = readAdminBranding(profile.organizations?.settings);

  const today = todayInSingapore();
  const fallbackRange = weekRange(today);
  const range = selectedRange(params, fallbackRange);
  const tab = readTab(readParam(params, "tab"));
  const employeeFormOpen = readParam(params, "create") === "employee" || Boolean(readParam(params, "edit"));
  const attendanceDate = dateIsValid(readParam(params, "date")) ? readParam(params, "date") : today;
  const attendanceFetchStart = attendanceDate < range.start ? attendanceDate : range.start;
  const attendanceFetchEnd = attendanceDate > range.end ? attendanceDate : range.end;
  const attendanceSelect = tab === "attendance"
    ? "id, employee_id, work_date, status, check_in, check_out, notes"
    : "work_date, status";
  const payrollSelect = tab === "payroll"
    ? "id, employee_id, period_start, period_end, regular_pay, overtime_pay, allowances, deductions, status, notes"
    : "regular_pay, overtime_pay, allowances, deductions";
  const emptyResult = Promise.resolve({ data: null, error: null });
  const attendanceQuery = employeeFormOpen
    ? null
    : supabase.from("attendance_logs").select(attendanceSelect).eq("org_id", profile.org_id).gte("work_date", attendanceFetchStart).lte("work_date", attendanceFetchEnd).order("work_date", { ascending: false }).limit(5000);
  const payrollQuery = employeeFormOpen
    ? null
    : supabase.from("payroll_records").select(payrollSelect).eq("org_id", profile.org_id).lte("period_start", range.end).gte("period_end", range.start).order("period_start", { ascending: false }).limit(1000);
  const fullLeaveQuery = tab === "leave"
    ? supabase.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, reason, status, created_at").eq("org_id", profile.org_id).order("created_at", { ascending: false }).limit(1000)
    : null;
  const activeLeaveQuery = tab === "leave"
    ? null
    : supabase.from("leave_requests").select("employee_id, start_date, end_date").eq("org_id", profile.org_id).eq("status", "approved").lte("start_date", today).gte("end_date", today).limit(1000);
  const recentLeaveQuery = tab === "leave" || employeeFormOpen
    ? null
    : supabase.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, reason, status, created_at").eq("org_id", profile.org_id).order("created_at", { ascending: false }).limit(3);
  const staffLinksQuery = profile.role === "admin"
    ? supabase.from("stores").select("id, name, is_active, staff_login_slug").eq("org_id", profile.org_id).order("name")
    : null;
  const [
    branchesResult,
    staffLinksResult,
    employeesResult,
    rolesResult,
    attendanceResult,
    payrollResult,
    fullLeaveResult,
    activeLeaveResult,
    recentLeaveResult,
  ] = await Promise.all([
    supabase.from("stores").select("id, name, is_active, staff_login_key").eq("org_id", profile.org_id).order("name"),
    staffLinksQuery ?? emptyResult,
    supabase.from("employee_records").select("id, profile_id, role_id, store_id, employee_code, full_name, email, phone, role, job_title, hired_on, schedule_days, schedule_start, schedule_end, is_active, created_at").eq("org_id", profile.org_id).order("is_active", { ascending: false }).order("full_name").limit(1000),
    supabase.from("employee_roles").select("id, name, slug, description, color, permissions, is_active").eq("org_id", profile.org_id).order("is_active", { ascending: false }).order("name"),
    attendanceQuery ?? emptyResult,
    payrollQuery ?? emptyResult,
    fullLeaveQuery ?? emptyResult,
    activeLeaveQuery ?? emptyResult,
    recentLeaveQuery ?? emptyResult,
  ]);

  const branches = (branchesResult.data ?? []) as BranchRecord[];
  const employees = (employeesResult.data ?? []) as EmployeeRecord[];
  const roles = (rolesResult.data ?? []) as RoleRecord[];
  const attendanceLogs = (attendanceResult.data ?? []) as unknown as AttendanceRecord[];
  const payrollRecords = (payrollResult.data ?? []) as unknown as PayrollRecord[];
  const fullLeaveRequests = (fullLeaveResult.data ?? []) as LeaveRecord[];
  const recentLeaveRequests = (recentLeaveResult.data ?? []) as LeaveRecord[];
  const activeLeaveRequests = (activeLeaveResult.data ?? []) as Array<Pick<LeaveRecord, "employee_id" | "start_date" | "end_date">>;
  const leaveRequests = tab === "leave" ? fullLeaveRequests : recentLeaveRequests;
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const selectedAttendanceEmployeeId = employeeById.has(readParam(params, "employee")) ? readParam(params, "employee") : "";
  const approvedLeaveToday = new Set(
    (tab === "leave" ? fullLeaveRequests.filter((request) => request.status === "approved" && request.start_date <= today && request.end_date >= today) : activeLeaveRequests)
      .map((request) => request.employee_id),
  );
  const requestedRole = readParam(params, "role");
  const requestedStatus = readParam(params, "status");
  const branchFilter = readParam(params, "branch");
  const searchQuery = readParam(params, "q").trim().toLowerCase();
  const filteredEmployees = employees.filter((employee) => {
    const status = approvedLeaveToday.has(employee.id) ? "on_leave" : employee.is_active ? "active" : "inactive";
    if (requestedRole && requestedRole !== "all" && employee.role_id !== requestedRole && employee.role !== requestedRole) return false;
    if (requestedStatus && requestedStatus !== "all" && status !== requestedStatus) return false;
    if (branchFilter === "unassigned" && employee.store_id) return false;
    if (branchFilter && branchFilter !== "unassigned" && employee.store_id !== branchFilter) return false;
    if (searchQuery && ![employee.full_name, employee.email ?? "", employee.phone ?? "", employee.employee_code].some((value) => value.toLowerCase().includes(searchQuery))) return false;
    return true;
  });
  const activeCount = employees.filter((employee) => employee.is_active && !approvedLeaveToday.has(employee.id)).length;
  const onLeaveCount = employees.filter((employee) => approvedLeaveToday.has(employee.id)).length;
  const inactiveCount = employees.filter((employee) => !employee.is_active).length;
  const payrollTotalThisWeek = payrollRecords.reduce((total, record) => total + payrollTotal(record), 0);
  const payrollBreakdown = { regular: 0, overtime: 0, allowances: 0, deductions: 0 };
  for (const record of payrollRecords) {
    payrollBreakdown.regular += Number(record.regular_pay ?? 0);
    payrollBreakdown.overtime += Number(record.overtime_pay ?? 0);
    payrollBreakdown.allowances += Number(record.allowances ?? 0);
    payrollBreakdown.deductions += Number(record.deductions ?? 0);
  }
  const attendanceSummaryLogs = attendanceLogs.filter((log) => log.work_date >= range.start && log.work_date <= range.end);
  const attendanceBreakdown = { present: 0, absent: 0, late: 0, on_leave: 0 };
  for (const log of attendanceSummaryLogs) attendanceBreakdown[log.status] += 1;
  const attendanceTotal = Object.values(attendanceBreakdown).reduce((total, value) => total + value, 0);
  const attendanceForDate = new Map(attendanceLogs.filter((log) => log.work_date === attendanceDate).map((log) => [log.employee_id, log]));
  const selectedAttendanceBreakdown = { present: 0, absent: 0, late: 0, on_leave: 0 };
  for (const log of attendanceForDate.values()) {
    if (!selectedAttendanceEmployeeId || log.employee_id === selectedAttendanceEmployeeId) selectedAttendanceBreakdown[log.status] += 1;
  }
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(readParam(params, "page") || "1", 10);
  const currentPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
  const visibleEmployees = filteredEmployees.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const canWrite = profile.role === "admin";
  const currentBranchName = profile.store_id ? branchById.get(profile.store_id)?.name ?? DEFAULT_STORE_NAME : "All branches";
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "Admin";
  const editingEmployee = employeeById.get(readParam(params, "edit"));
  const editingPayroll = payrollRecords.find((record) => record.id === readParam(params, "edit_payroll"));
  const filtersOpen = readParam(params, "filters") === "1";
  const queryWarning = Boolean(
    branchesResult.error
      || employeesResult.error
      || rolesResult.error
      || attendanceResult.error
      || payrollResult.error
      || fullLeaveResult.error
      || activeLeaveResult.error
      || recentLeaveResult.error,
  );
  const periodLabel = rangeScopeLabel(range);
  const employeeListState = { q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined };
  const staffLinkBranches = (staffLinksResult.error ? branches : (staffLinksResult.data ?? [])) as BranchRecord[];
  const staffLinksUnavailable = canWrite && Boolean(staffLinksResult.error);

  return (
    <main data-admin-theme={branding.theme} className="admin-page employee-page text-ink">
      <div className="min-w-0 px-4 pb-10 sm:px-6 lg:px-8">
          <header className="employee-topbar">
            <div className="employee-topbar__tools">
              <DateRangeMenu tab={tab} range={range} searchQuery={searchQuery} requestedRole={requestedRole} requestedStatus={requestedStatus} branchFilter={branchFilter} filtersOpen={filtersOpen} />
              <Link href={employeeHref({ tab, q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? undefined : "1" })} className="employee-tool-button"><AdminIcon name="filter" size={16} /> Filters</Link>
              <details className="employee-add-menu">
                <summary className="employee-primary-button"><AdminIcon name="plus" size={17} /> Add Employee <AdminIcon name="chevron" size={14} /></summary>
                <div className="employee-add-menu__items">
                  <Link href={employeeHref({ ...employeeListState, tab: "list", create: "employee" })}>New employee record</Link>
                  <Link href={employeeHref({ tab: "roles", create: "role" })}>Add role</Link>
                  <Link href={employeeHref({ tab: "attendance", date: today })}>Attendance log</Link>
                  <Link href={employeeHref({ tab: "payroll", start: range.start, end: range.end })}>Process payroll</Link>
                  <Link href={employeeHref({ tab: "leave", create: "leave" })}>Leave request</Link>
                </div>
              </details>
              <div className="employee-user-menu"><span className="employee-user-menu__avatar">{initials(profile.full_name ?? firstName)}</span><span className="hidden sm:block">{firstName}</span><AdminIcon name="chevron" size={13} /></div>
              <SignOutButton className="employee-signout" />
            </div>
          </header>

          <div className="employee-heading">
            <div>
              <p className="employee-eyebrow">People operations · {currentBranchName}</p>
              <h1>Employees</h1>
              <p>Manage your team, roles, attendance, and payroll in one place.</p>
            </div>
            <span className={`employee-access-note ${canWrite ? "employee-access-note--enabled" : ""}`}>{canWrite ? "Admin editing enabled" : "Manager view only"}</span>
          </div>

          {readParam(params, "saved") && <div role="status" className="employee-notice employee-notice--success"><AdminIcon name="check" size={17} /> {savedMessage(readParam(params, "saved"))}</div>}
          {readParam(params, "error") && <div role="alert" className="employee-notice employee-notice--error"><AdminIcon name="alert" size={17} /> {readParam(params, "error")}</div>}
          {queryWarning && <div role="status" className="employee-notice employee-notice--warning"><AdminIcon name="alert" size={17} /> Some employee workspace data could not refresh. Apply migration 0011 to enable all tabs.</div>}
          {!canWrite && <div role="status" className="employee-notice employee-notice--info">This workspace is read-only for your role. Ask an organization admin to change staff access.</div>}

          <div className={`employee-body-grid ${employeeFormOpen ? "employee-body-grid--focused" : ""}`}>
            <div className="min-w-0">
              <section className="employee-kpi-grid" aria-label="Employee overview">
                <EmployeeMetric label="Total Employees" value={String(employees.length)} detail="All branches" icon="employees" tone="employee-kpi-icon--brown" />
                <EmployeeMetric label="Active" value={String(activeCount)} detail="Currently working" icon="employees" tone="employee-kpi-icon--green" />
                <EmployeeMetric label="On Leave" value={String(onLeaveCount)} detail="On approved leave" icon="calendar" tone="employee-kpi-icon--orange" />
                <EmployeeMetric label="Inactive" value={String(inactiveCount)} detail="Not active" icon="employees" tone="employee-kpi-icon--gray" />
                {!employeeFormOpen && <EmployeeMetric label={`Total Payroll (${periodLabel})`} value={formatPeso(payrollTotalThisWeek)} detail={formatDateRange(range.start, range.end)} icon="wallet" tone="employee-kpi-icon--blue" />}
              </section>

              {(readParam(params, "create") === "employee" || editingEmployee) && <EmployeeEditor employee={editingEmployee} branches={branches} roles={roles} today={today} canWrite={canWrite} returnState={employeeListState} />}

              <section className="employee-workspace-panel" aria-labelledby="employee-workspace-heading">
                <div className="sr-only" id="employee-workspace-heading">Employee workspace</div>
                <nav className="employee-tabs" aria-label="Employee workspace tabs">
                  {TABS.map((item) => <Link key={item.key} href={employeeHref({ tab: item.key, q: readParam(params, "q"), role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end })} aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? "is-active" : ""}>{item.label}</Link>)}
                </nav>

                {tab === "list" && <EmployeeListTab employees={visibleEmployees} filteredCount={filteredEmployees.length} totalCount={employees.length} currentPage={currentPage} totalPages={totalPages} branches={branches} roleById={roleById} approvedLeaveToday={approvedLeaveToday} requestedRole={requestedRole} requestedStatus={requestedStatus} branchFilter={branchFilter} searchQuery={searchQuery} filtersOpen={filtersOpen} range={range} today={today} canWrite={canWrite} />}
                {tab === "roles" && <RolesTab roles={roles} employees={employees} roleById={roleById} canWrite={canWrite} showCreate={readParam(params, "create") === "role"} />}
                 {tab === "attendance" && <AttendanceTab employees={employees} logs={attendanceForDate} date={attendanceDate} selectedEmployeeId={selectedAttendanceEmployeeId} range={range} breakdown={selectedAttendanceBreakdown} canWrite={canWrite} />}
                {tab === "payroll" && <PayrollTab employees={employees} records={payrollRecords} range={range} editing={editingPayroll} canWrite={canWrite} />}
                {tab === "leave" && <LeaveTab employees={employees} requests={leaveRequests} canWrite={canWrite} showCreate={readParam(params, "create") === "leave"} />}
              </section>
            </div>

            {!employeeFormOpen && <aside className="employee-side-rail" aria-label="Employee summaries">
              <PayrollOverview breakdown={payrollBreakdown} total={payrollTotalThisWeek} range={range} />
              <AttendanceOverview breakdown={attendanceBreakdown} total={attendanceTotal} range={range} />
              <RecentLeaveRequests requests={leaveRequests.slice(0, 3)} employeeById={employeeById} />
              <Link href={employeeHref({ tab: "leave" })} className="employee-leave-cta"><AdminIcon name="calendar" size={17} /> Go to Leave Requests <AdminIcon name="arrow" size={16} /></Link>
            </aside>}
          </div>

          {canWrite && <StaffAccessPanel branches={staffLinkBranches} migrationMissing={staffLinksUnavailable} />}
      </div>
    </main>
  );
}

function StaffAccessPanel({ branches, migrationMissing }: { branches: BranchRecord[]; migrationMissing: boolean }) {
  return <section id="staff-access" className="employee-workspace-panel mt-6 scroll-mt-6" aria-labelledby="staff-access-heading">
    <div className="employee-tab-content">
      <div className="employee-tab-heading">
        <div>
          <p className="employee-section-kicker">Owner-only access tools</p>
          <h2 id="staff-access-heading">Store login links</h2>
          <p>Give each branch its own entry link. Employees still need their individual Employee ID and password, so the link identifies the store but never replaces authentication.</p>
        </div>
        <span className="employee-data-badge"><AdminIcon name="employees" size={14} /> Staff access</span>
      </div>

      {migrationMissing && <div role="status" className="employee-notice employee-notice--warning"><AdminIcon name="alert" size={16} /> Human-readable staff links could not be loaded. Existing UUID links remain available below; apply migration 0033 if this is the first rollout.</div>}
      {branches.length === 0
        ? <div className="employee-empty-state"><span><AdminIcon name="branches" size={23} /></span><strong>Create a branch first</strong><p>Each active branch receives its own staff login link.</p></div>
        : <div className="grid gap-3 md:grid-cols-2">{branches.map((branch) => <article key={branch.id} className="rounded-[9px] border border-line bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="employee-section-kicker">{branch.is_active ? "Active branch" : "Inactive branch"}</p>
              <h3 className="mt-1 text-sm font-extrabold text-ink">{branch.name}</h3>
            </div>
            <span className="employee-data-badge">{branch.is_active ? "Ready to share" : "Disabled"}</span>
          </div>
          {branch.staff_login_slug || branch.staff_login_key
            ? <StaffLinkCopy path={branch.staff_login_slug ? staffLoginPath(branch.staff_login_slug) : legacyStaffLoginPath(branch.staff_login_key ?? "")} disabled={!branch.is_active} />
            : <p className="mt-4 rounded-btn border border-line bg-raised px-4 py-3 text-xs font-semibold text-ink-muted">This branch needs migration 0033 before a staff link can be generated.</p>}
        </article>)}</div>}
    </div>
  </section>;
}

function EmployeeMetric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: AdminIconName; tone: string }) {
  return <article className="employee-kpi"><div className={`employee-kpi__icon ${tone}`}><AdminIcon name={icon} size={18} /></div><p className="employee-kpi__label">{label}</p><strong className="employee-kpi__value tnums">{value}</strong><span>{detail}</span></article>;
}

function DateRangeMenu({ tab, range, searchQuery, requestedRole, requestedStatus, branchFilter, filtersOpen }: { tab: WorkspaceTab; range: { start: string; end: string }; searchQuery: string; requestedRole: string; requestedStatus: string; branchFilter: string; filtersOpen: boolean }) {
  return <details className="employee-date-menu">
    <summary className="employee-date-control"><AdminIcon name="calendar" size={16} /><span>{formatDateRange(range.start, range.end)}</span><AdminIcon name="chevron" size={14} /></summary>
    <form action="/admin/employees" method="get" className="employee-date-menu__form">
      <input type="hidden" name="tab" value={tab} />
      {searchQuery && <input type="hidden" name="q" value={searchQuery} />}
      {requestedRole && <input type="hidden" name="role" value={requestedRole} />}
      {requestedStatus && <input type="hidden" name="status" value={requestedStatus} />}
      {branchFilter && <input type="hidden" name="branch" value={branchFilter} />}
      {filtersOpen && <input type="hidden" name="filters" value="1" />}
      <label><span>Start</span><input name="start" type="date" defaultValue={range.start} required /></label>
      <label><span>End</span><input name="end" type="date" defaultValue={range.end} required /></label>
      <button type="submit" className="employee-primary-button">Apply dates</button>
    </form>
  </details>;
}

function EmployeeListTab({ employees, filteredCount, totalCount, currentPage, totalPages, branches, roleById, approvedLeaveToday, requestedRole, requestedStatus, branchFilter, searchQuery, filtersOpen, range, today, canWrite }: { employees: EmployeeRecord[]; filteredCount: number; totalCount: number; currentPage: number; totalPages: number; branches: BranchRecord[]; roleById: Map<string, RoleRecord>; approvedLeaveToday: Set<string>; requestedRole: string; requestedStatus: string; branchFilter: string; searchQuery: string; filtersOpen: boolean; range: { start: string; end: string }; today: string; canWrite: boolean }) {
  const exportHref = `/admin/employees/export?${new URLSearchParams({ ...(searchQuery ? { q: searchQuery } : {}), ...(requestedRole ? { role: requestedRole } : {}), ...(requestedStatus ? { status: requestedStatus } : {}), ...(branchFilter ? { branch: branchFilter } : {}) }).toString()}`;
  const listState = { q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined };
  return <div className="employee-tab-content">
    <div className="employee-filter-bar">
      <form action="/admin/employees" method="get" className="employee-filter-form">
        <input type="hidden" name="tab" value="list" />
        <input type="hidden" name="start" value={range.start} />
        <input type="hidden" name="end" value={range.end} />
        {filtersOpen && <input type="hidden" name="filters" value="1" />}
        {!filtersOpen && branchFilter && <input type="hidden" name="branch" value={branchFilter} />}
        <label className="employee-search-field"><AdminIcon name="search" size={17} /><span className="sr-only">Search employees</span><input name="q" defaultValue={searchQuery} placeholder="Search by name, email or phone..." /></label>
        <label><span className="sr-only">Role</span><select name="role" defaultValue={requestedRole || "all"}><option value="all">All Roles</option>{[...roleById.values()].map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label><span className="sr-only">Status</span><select name="status" defaultValue={requestedStatus || "all"}><option value="all">All Status</option><option value="active">Active</option><option value="on_leave">On Leave</option><option value="inactive">Inactive</option></select></label>
        {filtersOpen && <label><span className="sr-only">Branch</span><select name="branch" defaultValue={branchFilter}><option value="">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}<option value="unassigned">Unassigned</option></select></label>}
        <button type="submit" className="employee-filter-apply">Apply</button>
      </form>
      <a href={exportHref} className="employee-export-button"><AdminIcon name="upload" size={16} /> Export</a>
    </div>
    <div className="employee-table-wrap">
      <table className="employee-table">
        <thead><tr><th>Employee</th><th>Role</th><th>Schedule</th><th>Status</th><th>Contact</th><th>Date Hired</th><th>Actions</th></tr></thead>
        <tbody>
          {employees.length === 0 ? <tr><td colSpan={7}><EmptyState icon="employees" title="No employees found" detail="Add an employee record or clear the filters to see your team." /></td></tr> : employees.map((employee) => {
            const role = employee.role_id ? roleById.get(employee.role_id) : null;
            const onLeave = approvedLeaveToday.has(employee.id);
            const status = onLeave ? "on_leave" : employee.is_active ? "active" : "inactive";
            return <tr key={employee.id}>
              <td><div className="employee-person-cell"><span className="employee-avatar">{initials(employee.full_name)}</span><div><strong>{employee.full_name}</strong><small>{employee.employee_code}{employee.job_title ? ` · ${employee.job_title}` : ""}</small></div></div></td>
              <td><span className={`employee-role ${roleTone(role?.color ?? employee.role)}`}>{role?.name ?? roleLabel(employee.role)}</span></td>
              <td><span className="employee-schedule">{scheduleLabel(employee)}</span></td>
              <td><span className={`employee-status ${statusTone(status)}`}>{statusLabel(status)}</span></td>
              <td><div className="employee-contact"><strong>{employee.phone || "No phone"}</strong><small>{employee.email || "No email"}</small></div></td>
              <td className="tnums whitespace-nowrap">{formatDate(employee.hired_on)}</td>
               <td><div className="employee-row-actions"><Link href={employeeHref({ ...listState, tab: "list", edit: employee.id })} className="employee-icon-button" aria-label={`Edit ${employee.full_name}`}><AdminIcon name="edit" size={15} /></Link><Link href={employeeHref({ ...listState, tab: "attendance", employee: employee.id, date: today })} className="employee-icon-button" aria-label={`Open attendance for ${employee.full_name}`}><AdminIcon name="more" size={16} /></Link>{canWrite && <form action={provisionEmployeeLogin} className="employee-login-action"><input type="hidden" name="employee_id" value={employee.id} />{Object.entries(listState).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}<button type="submit" className={`employee-login-button ${employee.profile_id ? "employee-login-button--ready" : ""}`}>{employee.profile_id ? "Reset login" : "Set up login"}</button></form>}</div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className="employee-table-footer"><span>Showing {filteredCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, filteredCount)} of {filteredCount} employees <small>({totalCount} total)</small></span><div className="employee-pagination">{currentPage > 1 && <Link href={employeeHref({ tab: "list", page: String(currentPage - 1), q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined })} aria-label="Previous page">‹</Link>}{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, currentPage - 2), Math.min(totalPages, currentPage + 1)).map((page) => <Link key={page} href={employeeHref({ tab: "list", page: String(page), q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined })} className={page === currentPage ? "is-active" : ""}>{page}</Link>)}{currentPage < totalPages && <Link href={employeeHref({ tab: "list", page: String(currentPage + 1), q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined })} aria-label="Next page">›</Link>}</div></div>
  </div>;
}

function RolesTab({ roles, employees, roleById, canWrite, showCreate }: { roles: RoleRecord[]; employees: EmployeeRecord[]; roleById: Map<string, RoleRecord>; canWrite: boolean; showCreate: boolean }) {
  return <div className="employee-tab-content">
    <div className="employee-tab-heading"><div><p className="employee-section-kicker">Access control</p><h2>Roles & Permissions</h2><p>Control which areas each role can access. These permissions are stored per organization.</p></div><Link href={employeeHref({ tab: "roles", create: showCreate ? undefined : "role" })} className="employee-outline-button"><AdminIcon name="plus" size={15} /> {showCreate ? "Close" : "Add Role"}</Link></div>
    {showCreate && <RoleEditor canWrite={canWrite} />}
    <div className="employee-role-grid">{roles.length === 0 ? <EmptyState icon="settings" title="No roles configured" detail="Create a role to define employee permissions." /> : roles.map((role) => <RoleEditor key={role.id} role={role} employeeCount={employees.filter((employee) => employee.role_id === role.id).length} canWrite={canWrite} />)}</div>
    <section className="employee-assignment-panel"><div className="employee-tab-heading"><div><p className="employee-section-kicker">Current assignments</p><h2>Who has each role</h2></div></div><div className="employee-assignment-list">{employees.length === 0 ? <p className="employee-muted">No employee records yet.</p> : employees.map((employee) => { const role = employee.role_id ? roleById.get(employee.role_id) : null; return <div key={employee.id} className="employee-assignment-row"><span className="employee-avatar employee-avatar--small">{initials(employee.full_name)}</span><span><strong>{employee.full_name}</strong><small>{employee.employee_code}</small></span><span className={`employee-role ${roleTone(role?.color ?? employee.role)}`}>{role?.name ?? roleLabel(employee.role)}</span></div>; })}</div></section>
  </div>;
}

function RoleEditor({ role, employeeCount = 0, canWrite }: { role?: RoleRecord; employeeCount?: number; canWrite: boolean }) {
  const selected = new Set(role?.permissions ?? []);
  const permissionOptions = Array.from(new Set([...PERMISSIONS.map(([key]) => key), ...selected]));
  return <form action={saveRole} className="employee-role-card">
    {role && <input type="hidden" name="role_id" value={role.id} />}
    <div className="employee-role-card__head"><span className={`employee-role-mark ${roleTone(role?.color ?? "brown")}`}>{(role?.name ?? "New role").charAt(0).toUpperCase()}</span><div><strong>{role?.name ?? "New role"}</strong><small>{role ? `${employeeCount} employee${employeeCount === 1 ? "" : "s"} assigned` : "Create a reusable access profile"}</small></div></div>
    <label><span>Name</span><input name="name" defaultValue={role?.name ?? ""} placeholder="e.g. Kitchen Staff" required disabled={!canWrite} /></label>
    <label><span>Description</span><textarea name="description" defaultValue={role?.description ?? ""} rows={2} placeholder="What this role is responsible for" disabled={!canWrite} /></label>
    <label><span>Accent</span><select name="color" defaultValue={role?.color ?? "brown"} disabled={!canWrite}><option value="brown">Brown</option><option value="amber">Amber</option><option value="green">Green</option><option value="blue">Blue</option></select></label>
    <fieldset className="employee-permission-fieldset"><legend>Permissions</legend><div className="employee-permissions">{permissionOptions.map((permission) => <label key={permission}><input type="checkbox" name="permissions" value={permission} defaultChecked={selected.has(permission)} disabled={!canWrite} /><span>{permissionLabel(permission)}</span></label>)}</div></fieldset>
    <label className="employee-checkbox"><input type="checkbox" name="is_active" defaultChecked={role?.is_active ?? true} disabled={!canWrite} /><span>Role is active</span></label>
    <button type="submit" disabled={!canWrite} className="employee-primary-button employee-primary-button--full">{role ? "Save permissions" : "Create role"}</button>
  </form>;
}

function AttendanceTab({ employees, logs, date, selectedEmployeeId, range, breakdown, canWrite }: { employees: EmployeeRecord[]; logs: Map<string, AttendanceRecord>; date: string; selectedEmployeeId: string; range: { start: string; end: string }; breakdown: Record<"present" | "absent" | "late" | "on_leave", number>; canWrite: boolean }) {
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const attendanceEmployees = selectedEmployee ? [selectedEmployee] : employees;
  return <div className="employee-tab-content">
    <div className="employee-tab-heading"><div><p className="employee-section-kicker">Daily time log</p><h2>Attendance</h2><p>{selectedEmployee ? `Showing ${selectedEmployee.full_name}. Record the actual attendance status and timestamps.` : "Record the actual attendance status and timestamps for each employee."}</p></div><form method="get" action="/admin/employees" className="employee-date-form"><input type="hidden" name="tab" value="attendance" /><input type="hidden" name="range_start" value={range.start} /><input type="hidden" name="range_end" value={range.end} />{selectedEmployeeId && <input type="hidden" name="employee" value={selectedEmployeeId} />}<label><span>Date</span><input type="date" name="date" defaultValue={date} /></label><button type="submit" className="employee-outline-button">View date</button></form></div>
    <div className="employee-mini-stats">{(["present", "absent", "late", "on_leave"] as const).map((status) => <div key={status}><span className={`employee-status-dot ${statusTone(status)}`} /><strong>{breakdown[status]}</strong><small>{statusLabel(status)}</small></div>)}</div>
    <div className="employee-table-wrap"><table className="employee-table employee-table--attendance"><thead><tr><th>Employee</th><th>Status</th><th>Check in</th><th>Check out</th><th>Notes</th><th>Action</th></tr></thead><tbody>{attendanceEmployees.length === 0 ? <tr><td colSpan={6}><EmptyState icon="employees" title="No employees to log" detail="Create an employee record first." /></td></tr> : attendanceEmployees.map((employee) => <AttendanceRow key={employee.id} employee={employee} log={logs.get(employee.id)} date={date} range={range} canWrite={canWrite} />)}</tbody></table></div>
  </div>;
}

function AttendanceRow({ employee, log, date, range, canWrite }: { employee: EmployeeRecord; log?: AttendanceRecord; date: string; range: { start: string; end: string }; canWrite: boolean }) {
  const formId = `attendance-save-${employee.id}`;
  return <tr><td><div className="employee-person-cell"><span className="employee-avatar employee-avatar--small">{initials(employee.full_name)}</span><div><strong>{employee.full_name}</strong><small>{employee.employee_code}</small></div></div></td><td><select form={formId} name="status" defaultValue={log?.status ?? "present"} disabled={!canWrite}><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="on_leave">On Leave</option></select></td><td><input form={formId} name="check_in" type="time" defaultValue={formatTimestampInput(log?.check_in ?? null)} disabled={!canWrite} /></td><td><input form={formId} name="check_out" type="time" defaultValue={formatTimestampInput(log?.check_out ?? null)} disabled={!canWrite} /></td><td><input form={formId} name="notes" defaultValue={log?.notes ?? ""} placeholder="Optional note" disabled={!canWrite} /></td><td><form id={formId} action={saveAttendance}><input type="hidden" name="employee_id" value={employee.id} /><input type="hidden" name="work_date" value={date} /><input type="hidden" name="range_start" value={range.start} /><input type="hidden" name="range_end" value={range.end} /><button type="submit" disabled={!canWrite} className="employee-save-button">Save</button></form></td></tr>;
}

function PayrollTab({ employees, records, range, editing, canWrite }: { employees: EmployeeRecord[]; records: PayrollRecord[]; range: { start: string; end: string }; editing?: PayrollRecord; canWrite: boolean }) {
  return <div className="employee-tab-content">
    <div className="employee-tab-heading"><div><p className="employee-section-kicker">{rangeScopeLabel(range)} pay run</p><h2>Payroll</h2><p>Save gross components and deductions in centavos for the selected period.</p></div><span className="employee-data-badge"><AdminIcon name="wallet" size={14} /> {formatDateRange(range.start, range.end)}</span></div>
    <PayrollEditor employees={employees} range={range} record={editing} canWrite={canWrite} />
    <div className="employee-table-wrap"><table className="employee-table employee-table--payroll"><thead><tr><th>Employee</th><th>Period</th><th>Regular pay</th><th>Overtime</th><th>Allowances</th><th>Deductions</th><th>Net pay</th><th>Status</th><th /></tr></thead><tbody>{records.length === 0 ? <tr><td colSpan={9}><EmptyState icon="wallet" title="No payroll records for this period" detail="Use the payroll form above to record the first pay run." /></td></tr> : records.map((record) => { const employee = employees.find((item) => item.id === record.employee_id); return <tr key={record.id}><td><strong>{employee?.full_name ?? "Unknown employee"}</strong><small className="block">{employee?.employee_code ?? record.employee_id.slice(0, 8)}</small></td><td className="whitespace-nowrap">{formatDate(record.period_start)} – {formatDate(record.period_end)}</td><td className="tnums">{formatPeso(Number(record.regular_pay))}</td><td className="tnums">{formatPeso(Number(record.overtime_pay))}</td><td className="tnums">{formatPeso(Number(record.allowances))}</td><td className="tnums">{formatPeso(Number(record.deductions))}</td><td className="tnums font-extrabold">{formatPeso(payrollTotal(record))}</td><td><span className={`employee-status ${statusTone(record.status)}`}>{statusLabel(record.status)}</span></td><td><Link href={employeeHref({ tab: "payroll", edit_payroll: record.id, start: range.start, end: range.end })} className="employee-text-link">Edit</Link></td></tr>; })}</tbody></table></div>
  </div>;
}

function PayrollEditor({ employees, range, record, canWrite }: { employees: EmployeeRecord[]; range: { start: string; end: string }; record?: PayrollRecord; canWrite: boolean }) {
  const defaultEmployee = record?.employee_id ?? employees[0]?.id ?? "";
  return <form action={savePayroll} className="employee-entry-form"><div className="employee-entry-form__heading"><div><p className="employee-section-kicker">{record ? "Edit payroll record" : "Record payroll"}</p><h3>{record ? "Update pay run" : "Add a pay run"}</h3></div><span>All values are actual database entries</span></div><div className="employee-entry-grid employee-entry-grid--payroll"><label><span>Employee</span><select name="employee_id" defaultValue={defaultEmployee} required disabled={!canWrite}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}</select></label><label><span>Period start</span><input name="period_start" type="date" defaultValue={record?.period_start ?? range.start} required disabled={!canWrite} /></label><label><span>Period end</span><input name="period_end" type="date" defaultValue={record?.period_end ?? range.end} required disabled={!canWrite} /></label><label><span>Regular pay (₱)</span><input name="regular_pay" type="number" min="0" step="0.01" defaultValue={formatCentsInput(record?.regular_pay)} disabled={!canWrite} /></label><label><span>Overtime (₱)</span><input name="overtime_pay" type="number" min="0" step="0.01" defaultValue={formatCentsInput(record?.overtime_pay)} disabled={!canWrite} /></label><label><span>Allowances (₱)</span><input name="allowances" type="number" min="0" step="0.01" defaultValue={formatCentsInput(record?.allowances)} disabled={!canWrite} /></label><label><span>Deductions (₱)</span><input name="deductions" type="number" min="0" step="0.01" defaultValue={formatCentsInput(record?.deductions)} disabled={!canWrite} /></label><label><span>Status</span><select name="status" defaultValue={record?.status ?? "draft"} disabled={!canWrite}><option value="draft">Draft</option><option value="processed">Processed</option><option value="paid">Paid</option></select></label></div><label className="employee-wide-field"><span>Notes</span><input name="notes" defaultValue={record?.notes ?? ""} placeholder="Optional pay run note" disabled={!canWrite} /></label><button type="submit" disabled={!canWrite || employees.length === 0} className="employee-primary-button">{record ? "Save payroll" : "Record payroll"}</button></form>;
}

function LeaveTab({ employees, requests, canWrite, showCreate }: { employees: EmployeeRecord[]; requests: LeaveRecord[]; canWrite: boolean; showCreate: boolean }) {
  return <div className="employee-tab-content"><div className="employee-tab-heading"><div><p className="employee-section-kicker">Time off workflow</p><h2>Leave Requests</h2><p>Review pending requests and keep approved leave reflected in the employee status.</p></div><Link href={employeeHref({ tab: "leave", create: showCreate ? undefined : "leave" })} className="employee-outline-button"><AdminIcon name="plus" size={15} /> {showCreate ? "Close" : "New request"}</Link></div>{showCreate && <LeaveEditor employees={employees} canWrite={canWrite} />}{requests.length === 0 ? <EmptyState icon="calendar" title="No leave requests yet" detail="New requests will appear here for review." /> : <div className="employee-leave-list">{requests.map((request) => { const employee = employees.find((item) => item.id === request.employee_id); return <div key={request.id} className="employee-leave-row"><span className={`employee-leave-icon ${statusTone(request.status)}`}><AdminIcon name="calendar" size={17} /></span><div className="employee-leave-copy"><strong>{employee?.full_name ?? "Unknown employee"}</strong><small>{request.leave_type} · {formatDate(request.start_date)} – {formatDate(request.end_date)}</small>{request.reason && <p>{request.reason}</p>}</div><span className={`employee-status ${statusTone(request.status)}`}>{statusLabel(request.status)}</span>{canWrite && request.status === "pending" && <div className="employee-leave-actions"><form action={updateLeaveStatus}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="status" value="approved" /><button type="submit" className="employee-save-button">Approve</button></form><form action={updateLeaveStatus}><input type="hidden" name="request_id" value={request.id} /><input type="hidden" name="status" value="rejected" /><button type="submit" className="employee-reject-button">Reject</button></form></div>}</div>; })}</div>}</div>;
}

function LeaveEditor({ employees, canWrite }: { employees: EmployeeRecord[]; canWrite: boolean }) {
  const today = todayInSingapore();
  return <form action={createLeaveRequest} className="employee-entry-form"><div className="employee-entry-form__heading"><div><p className="employee-section-kicker">New request</p><h3>Submit leave request</h3></div></div><div className="employee-entry-grid"><label><span>Employee</span><select name="employee_id" defaultValue={employees[0]?.id ?? ""} required disabled={!canWrite}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><label><span>Leave type</span><select name="leave_type" defaultValue="Personal Leave" disabled={!canWrite}><option>Personal Leave</option><option>Vacation Leave</option><option>Sick Leave</option><option>Emergency Leave</option></select></label><label><span>Start date</span><input type="date" name="start_date" defaultValue={today} required disabled={!canWrite} /></label><label><span>End date</span><input type="date" name="end_date" defaultValue={today} required disabled={!canWrite} /></label></div><label className="employee-wide-field"><span>Reason</span><textarea name="reason" rows={2} placeholder="Add context for the reviewer" disabled={!canWrite} /></label><button type="submit" disabled={!canWrite || employees.length === 0} className="employee-primary-button">Create request</button></form>;
}

function EmployeeEditor({ employee, branches, roles, today, canWrite, returnState }: { employee?: EmployeeRecord; branches: BranchRecord[]; roles: RoleRecord[]; today: string; canWrite: boolean; returnState: Record<string, string | undefined> }) {
  const defaultRoleId = employee?.role_id ?? roles.find((role) => role.slug === "cashier")?.id ?? roles[0]?.id ?? "";
  const returnHref = employeeHref({ tab: "list", ...returnState });
  return <section className="employee-editor-panel">
    <div className="employee-tab-heading">
      <div>
        <p className="employee-section-kicker">{employee ? "Edit record" : "Directory action"}</p>
        <h2>{employee ? `Edit ${employee.full_name}` : "Add employee"}</h2>
        <p>{employee ? "Update the employee directory and linked sign-in access." : "Create a staff record now; login access can be linked separately."}</p>
      </div>
      <Link href={returnHref} className="employee-icon-button" aria-label="Close employee form">×</Link>
    </div>
    <form action={employee ? updateEmployee : createEmployee} className="employee-entry-form">
      <input type="hidden" name="employee_id" value={employee?.id ?? ""} />
      {Object.entries(returnState).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}
      <div className="employee-entry-grid">
        <label><span>Full name</span><input name="full_name" defaultValue={employee?.full_name ?? ""} placeholder="Juan Dela Cruz" required maxLength={120} disabled={!canWrite} /></label>
        <label><span>Email</span><input name="email" type="email" defaultValue={employee?.email ?? ""} placeholder="employee@email.com" disabled={!canWrite} /></label>
        <label><span>Phone</span><input name="phone" defaultValue={employee?.phone ?? ""} placeholder="0917 123 4567" disabled={!canWrite} /></label>
        <label><span>Job title</span><input name="job_title" defaultValue={employee?.job_title ?? ""} placeholder="Cashier" disabled={!canWrite} /></label>
        <label><span>Workspace role</span><select name="role_id" defaultValue={defaultRoleId} disabled={!canWrite}><option value="">No role selected</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <label><span>Sign-in access</span><select name="access_role" defaultValue={employee?.role ?? "cashier"} disabled={!canWrite}><option value="admin">Admin</option><option value="manager">Manager</option><option value="cashier">Cashier</option></select></label>
        <label><span>Home branch</span><select name="store_id" defaultValue={employee?.store_id ?? ""} disabled={!canWrite}><option value="">All branches / unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}</select></label>
        <label><span>Date hired</span><input name="hired_on" type="date" defaultValue={employee?.hired_on ?? today} required disabled={!canWrite} /></label>
        <label><span>Schedule start</span><input name="schedule_start" type="time" defaultValue={employee?.schedule_start?.slice(0, 5) ?? "09:00"} required disabled={!canWrite} /></label>
        <label><span>Schedule end</span><input name="schedule_end" type="time" defaultValue={employee?.schedule_end?.slice(0, 5) ?? "17:00"} required disabled={!canWrite} /></label>
      </div>
      <fieldset className="employee-schedule-fieldset">
        <legend>Working days</legend>
        <div className="employee-day-checkboxes">{DAYS.map(([key, label]) => <label key={key}><input type="checkbox" name="schedule_days" value={key} defaultChecked={employee ? employee.schedule_days.includes(key) : true} disabled={!canWrite} /><span>{label}</span></label>)}</div>
      </fieldset>
      {employee && <label className="employee-checkbox"><input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={!canWrite} /><span>Employee is active</span></label>}
      <button type="submit" disabled={!canWrite} className="employee-primary-button">{employee ? "Save employee" : "Add employee"}</button>
    </form>
    {employee?.profile_id && (employee.role === "admin" || employee.role === "manager") && (
      <form action={setEmployeePin} className="employee-entry-form mt-4 border-t border-line pt-5">
        <input type="hidden" name="employee_id" value={employee.id} />
        {Object.entries(returnState).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}
        <div className="employee-entry-form__heading"><div><p className="employee-section-kicker">Sensitive approval</p><h3>{employee.role === "manager" ? "Manager approval PIN" : "Admin approval PIN"}</h3><p>Used for sensitive POS actions such as completed-order voids. Store a 4–6 digit PIN for this {employee.role} profile.</p></div></div>
        <div className="employee-entry-grid">
          <label><span>New PIN</span><input name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite} /></label>
          <label><span>Confirm PIN</span><input name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite} /></label>
        </div>
        <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-primary-button">Save Approval PIN</button>
      </form>
    )}
    {employee && (employee.role === "admin" || employee.role === "manager") && !employee.profile_id && <p className="employee-muted mt-4 border-t border-line pt-4">Set up this employee&apos;s login before assigning an approval PIN.</p>}
  </section>;
}

function PayrollOverview({ breakdown, total, range }: { breakdown: { regular: number; overtime: number; allowances: number; deductions: number }; total: number; range: { start: string; end: string } }) {
  return <section className="employee-side-card"><div className="employee-side-card__heading"><div><p className="employee-section-kicker">Payroll Overview</p><h2>{formatDateRange(range.start, range.end)}</h2></div><Link href={employeeHref({ tab: "payroll", start: range.start, end: range.end })} className="employee-side-select">{rangeScopeLabel(range)} <AdminIcon name="chevron" size={12} /></Link></div><strong className="employee-side-total tnums">{formatPeso(total)}</strong><div className="employee-breakdown"><span>Regular Pay <strong>{formatPeso(breakdown.regular)}</strong></span><span>Overtime Pay <strong>{formatPeso(breakdown.overtime)}</strong></span><span>Allowances <strong>{formatPeso(breakdown.allowances)}</strong></span>{breakdown.deductions > 0 && <span>Deductions <strong>-{formatPeso(breakdown.deductions)}</strong></span>}</div><Link href={employeeHref({ tab: "payroll", start: range.start, end: range.end })} className="employee-side-link">View payroll records <AdminIcon name="arrow" size={14} /></Link></section>;
}

function AttendanceOverview({ breakdown, total, range }: { breakdown: Record<"present" | "absent" | "late" | "on_leave", number>; total: number; range: { start: string; end: string } }) {
  const presentEnd = total ? breakdown.present / total * 100 : 0;
  const absentEnd = presentEnd + (total ? breakdown.absent / total * 100 : 0);
  const lateEnd = absentEnd + (total ? breakdown.late / total * 100 : 0);
  const gradient = total ? `conic-gradient(var(--success) 0 ${presentEnd}%, var(--danger) ${presentEnd}% ${absentEnd}%, var(--warning) ${absentEnd}% ${lateEnd}%, var(--text-subtle) ${lateEnd}% 100%)` : "conic-gradient(var(--border) 0 100%)";
  return <section className="employee-side-card"><div className="employee-side-card__heading"><div><p className="employee-section-kicker">Attendance Summary</p><h2>{formatDateRange(range.start, range.end)}</h2></div><span className="employee-side-select">Live data</span></div><div className="employee-attendance-chart"><div className="employee-donut" style={{ background: gradient }}><div>{total}</div></div><div className="employee-legend">{(["present", "absent", "late", "on_leave"] as const).map((status) => <span key={status}><i className={`employee-legend-dot employee-legend-dot--${status}`} /> <b>{statusLabel(status)}</b> <small>{breakdown[status]} ({total ? Math.round(breakdown[status] / total * 100) : 0}%)</small></span>)}</div></div><div className="employee-total-logs"><span>Total Logs</span><strong>{total}</strong></div></section>;
}

function RecentLeaveRequests({ requests, employeeById }: { requests: LeaveRecord[]; employeeById: Map<string, EmployeeRecord> }) {
  return <section className="employee-side-card"><div className="employee-side-card__heading"><div><p className="employee-section-kicker">Recent Leave Requests</p></div><Link href={employeeHref({ tab: "leave" })} className="employee-text-link">View all</Link></div>{requests.length === 0 ? <p className="employee-muted">No leave requests yet.</p> : <div className="employee-recent-leaves">{requests.map((request) => { const employee = employeeById.get(request.employee_id); return <div key={request.id}><span className={`employee-leave-icon ${statusTone(request.status)}`}><AdminIcon name="calendar" size={14} /></span><div><strong>{employee?.full_name ?? "Unknown employee"}</strong><small>{request.leave_type}</small><small>{formatDate(request.start_date)} – {formatDate(request.end_date)}</small></div><span className={`employee-status ${statusTone(request.status)}`}>{statusLabel(request.status)}</span></div>; })}</div>}</section>;
}

function EmptyState({ icon, title, detail }: { icon: AdminIconName; title: string; detail: string }) {
  return <div className="employee-empty-state"><span><AdminIcon name={icon} size={23} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function EmployeesProfileMissing() {
  return <main className="grid min-h-screen place-items-center bg-bg p-6 text-center text-ink"><div className="max-w-md rounded-card border border-line bg-surface p-8 shadow-[var(--shadow-pop)]"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">Backoffice setup</p><h1 className="mt-2 text-2xl font-extrabold">Your admin profile is not ready.</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Ask an organization admin to finish the profile and branch assignment, then sign in again.</p><div className="mt-6 flex justify-center gap-2"><Link href="/admin" className="rounded-btn bg-secondary px-4 py-3 text-sm font-extrabold uppercase text-primary">Back to dashboard</Link><SignOutButton className="px-4 py-3" /></div></div></main>;
}
