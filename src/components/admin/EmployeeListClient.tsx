"use client";

import { useMemo } from "react";
import { provisionEmployeeLogin } from "@/app/admin/employees/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { AdminLink as Link } from "@/components/admin/AdminLink";
import { useAdminUrlQuery } from "@/components/admin/AdminUrlQuery";
import type { AdminEmployeeRecord } from "@/components/admin/EmployeeDialogController";

type AccessRole = "admin" | "manager" | "cashier";
type BranchRecord = { id: string; name: string; is_active: boolean };
type RoleRecord = { id: string; name: string; color?: string };
const PAGE_SIZE = 10;
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;

function employeeHref(values: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) search.set(key, value); });
  const query = search.toString();
  return `/admin/employees${query ? `?${query}` : ""}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const parts = value.slice(0, 5).split(":").map(Number);
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) return value;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Singapore" }).format(new Date(Date.UTC(2020, 0, 1, parts[0], parts[1])));
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
  if (status === "active") return "employee-status--green";
  if (status === "on_leave") return "employee-status--amber";
  return "employee-status--red";
}

function statusLabel(status: string) {
  return status === "on_leave" ? "On Leave" : status.charAt(0).toUpperCase() + status.slice(1);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

function scheduleLabel(employee: AdminEmployeeRecord) {
  const days = employee.schedule_days ?? [];
  const dayText = days.length === 7 ? "Mon – Sun" : days.map((day) => DAYS.find(([key]) => key === day)?.[1] ?? day).join(" – ");
  return `${dayText} · ${formatTime(employee.schedule_start)} – ${formatTime(employee.schedule_end)}`;
}

export function EmployeeListClient({ employees, branches, roles, approvedLeaveIds, initialQuery, initialRole, initialStatus, initialBranch, initialPage, filtersOpen, range, today, canWrite }: {
  employees: AdminEmployeeRecord[];
  branches: BranchRecord[];
  roles: RoleRecord[];
  approvedLeaveIds: string[];
  initialQuery: string;
  initialRole: string;
  initialStatus: string;
  initialBranch: string;
  initialPage: number;
  filtersOpen: boolean;
  range: { start: string; end: string };
  today: string;
  canWrite: boolean;
}) {
  const [query, updateQuery] = useAdminUrlQuery({ q: initialQuery, role: initialRole, status: initialStatus, branch: initialBranch, page: String(initialPage) });
  const searchQuery = query.q ?? "";
  const requestedRole = query.role ?? "";
  const requestedStatus = query.status ?? "";
  const branchFilter = query.branch ?? "";
  const currentPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const approvedLeave = useMemo(() => new Set(approvedLeaveIds), [approvedLeaveIds]);
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const status = approvedLeave.has(employee.id) ? "on_leave" : employee.is_active ? "active" : "inactive";
    if (requestedRole && requestedRole !== "all" && employee.role_id !== requestedRole && employee.role !== requestedRole) return false;
    if (requestedStatus && requestedStatus !== "all" && status !== requestedStatus) return false;
    if (branchFilter === "unassigned" && employee.store_id) return false;
    if (branchFilter && branchFilter !== "unassigned" && employee.store_id !== branchFilter) return false;
    const normalized = searchQuery.trim().toLowerCase();
    return !normalized || [employee.full_name, employee.email ?? "", employee.phone ?? "", employee.employee_code].some((value) => value.toLowerCase().includes(normalized));
  }), [approvedLeave, branchFilter, employees, requestedRole, requestedStatus, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleEmployees = filteredEmployees.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const listState = { q: searchQuery, role: requestedRole, status: requestedStatus, branch: branchFilter, start: range.start, end: range.end, filters: filtersOpen ? "1" : undefined };
  const exportHref = `/admin/employees/export?${new URLSearchParams({ ...(searchQuery ? { q: searchQuery } : {}), ...(requestedRole ? { role: requestedRole } : {}), ...(requestedStatus ? { status: requestedStatus } : {}), ...(branchFilter ? { branch: branchFilter } : {}) }).toString()}`;

  const setFilter = (key: "q" | "role" | "status" | "branch", value: string) => updateQuery({ [key]: value, page: "1" });
  const goToPage = (page: number) => updateQuery({ page: String(Math.min(Math.max(page, 1), totalPages)) }, "push");

  return <div className="employee-tab-content">
    <div className="employee-filter-bar"><div className="employee-filter-form"><label className="employee-search-field"><AdminIcon name="search" size={17} /><span className="sr-only">Search employees</span><input value={searchQuery} onChange={(event) => setFilter("q", event.target.value)} placeholder="Search by name, email or phone..." /></label><label><span className="sr-only">Role</span><select value={requestedRole || "all"} onChange={(event) => setFilter("role", event.target.value)}><option value="all">All Roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label><span className="sr-only">Status</span><select value={requestedStatus || "all"} onChange={(event) => setFilter("status", event.target.value)}><option value="all">All Status</option><option value="active">Active</option><option value="on_leave">On Leave</option><option value="inactive">Inactive</option></select></label>{(filtersOpen || branchFilter) && <label><span className="sr-only">Branch</span><select value={branchFilter} onChange={(event) => setFilter("branch", event.target.value)}><option value="">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}<option value="unassigned">Unassigned</option></select></label>}<button type="button" onClick={() => updateQuery({ q: "", role: "", status: "", branch: "", page: "1" })} className="employee-filter-apply">Clear</button></div><a href={exportHref} className="employee-export-button"><AdminIcon name="upload" size={16} /> Export</a></div>
    <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Employee</th><th>Role</th><th>Schedule</th><th>Status</th><th>Contact</th><th>Date Hired</th><th>Actions</th></tr></thead><tbody>{visibleEmployees.length === 0 ? <tr><td colSpan={7}><div className="employee-empty-state"><span><AdminIcon name="employees" size={23} /></span><strong>No employees found</strong><p>Add an employee record or clear the filters to see your team.</p></div></td></tr> : visibleEmployees.map((employee) => { const role = employee.role_id ? roleById.get(employee.role_id) : null; const status = approvedLeave.has(employee.id) ? "on_leave" : employee.is_active ? "active" : "inactive"; return <tr key={employee.id}><td><div className="employee-person-cell"><span className="employee-avatar">{initials(employee.full_name)}</span><div><strong>{employee.full_name}</strong><small>{employee.employee_code}{employee.job_title ? ` · ${employee.job_title}` : ""}</small></div></div></td><td><span className={`employee-role ${roleTone(role?.name ?? employee.role)}`}>{role?.name ?? roleLabel(employee.role)}</span></td><td><span className="employee-schedule">{scheduleLabel(employee)}</span></td><td><span className={`employee-status ${statusTone(status)}`}>{statusLabel(status)}</span></td><td><div className="employee-contact"><strong>{employee.phone || "No phone"}</strong><small>{employee.email || "No email"}</small></div></td><td className="tnums whitespace-nowrap">{formatDate(employee.hired_on)}</td><td><div className="employee-row-actions"><Link data-employee-trigger={employee.id} href={employeeHref({ ...listState, tab: "list", edit: employee.id })} className="employee-icon-button" aria-label={`Edit ${employee.full_name}`}><AdminIcon name="edit" size={15} /></Link><Link href={employeeHref({ ...listState, tab: "attendance", employee: employee.id, date: today })} className="employee-icon-button" aria-label={`Open attendance for ${employee.full_name}`}><AdminIcon name="more" size={16} /></Link>{canWrite && <form action={provisionEmployeeLogin} className="employee-login-action"><input type="hidden" name="employee_id" value={employee.id} />{Object.entries(listState).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}<button type="submit" className={`employee-login-button ${employee.profile_id ? "employee-login-button--ready" : ""}`}>{employee.profile_id ? "Reset login" : "Set up login"}</button></form>}</div></td></tr>; })}</tbody></table></div>
    <div className="employee-table-footer"><span>Showing {filteredEmployees.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length} employees <small>({employees.length} total)</small></span><div className="employee-pagination">{safePage > 1 && <button type="button" onClick={() => goToPage(safePage - 1)} aria-label="Previous page">‹</button>}{Array.from({ length: totalPages }, (_, index) => index + 1).slice(Math.max(0, safePage - 2), Math.min(totalPages, safePage + 1)).map((page) => <button type="button" key={page} onClick={() => goToPage(page)} className={page === safePage ? "is-active" : ""}>{page}</button>)}{safePage < totalPages && <button type="button" onClick={() => goToPage(safePage + 1)} aria-label="Next page">›</button>}</div></div>
  </div>;
}
