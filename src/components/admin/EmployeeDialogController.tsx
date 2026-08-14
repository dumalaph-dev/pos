"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { updateEmployee } from "@/app/admin/employees/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { EmployeeAccessPanel } from "@/components/admin/EmployeeAccessPanel";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";

type AccessRole = "admin" | "manager" | "cashier";
type BranchRecord = { id: string; name: string; is_active: boolean };
type RoleRecord = { id: string; name: string; is_active: boolean };

export type AdminEmployeeRecord = {
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

const DAYS = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
] as const;

export function EmployeeDialogController({
  children,
  employees,
  branches,
  roles,
  initialEmployeeId,
  today,
  canWrite,
  returnState = {},
}: {
  children: ReactNode;
  employees: AdminEmployeeRecord[];
  branches: BranchRecord[];
  roles: RoleRecord[];
  initialEmployeeId: string | null;
  today: string;
  canWrite: boolean;
  returnState?: Record<string, string | undefined>;
}) {
  return <UrlLocalDialogController
    className="employee-dialog-controller"
    records={employees}
    initialId={initialEmployeeId}
    queryKey="edit"
    triggerSelector="[data-employee-trigger]"
    readTriggerId={(trigger) => trigger.dataset.employeeTrigger ?? null}
    getRecordId={(employee) => employee.id}
    performanceSurface="employees"
    renderDialog={(employee, onClose) => <AdminDialog
      key={employee.id}
      onClose={onClose}
      titleId={`employee-dialog-heading-${employee.id}`}
      descriptionId={`employee-dialog-description-${employee.id}`}
      bodyClassName="admin-dialog-open"
      backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
      dialogClassName="relative my-4 w-full max-w-4xl overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-pop)] sm:p-6"
    >
      <EmployeeEditorDialog employee={employee} branches={branches} roles={roles} today={today} canWrite={canWrite} onClose={onClose} returnState={returnState} />
    </AdminDialog>}
  >{children}</UrlLocalDialogController>;
}

function EmployeeEditorDialog({ employee, branches, roles, today, canWrite, onClose, returnState }: { employee: AdminEmployeeRecord; branches: BranchRecord[]; roles: RoleRecord[]; today: string; canWrite: boolean; onClose: () => void; returnState: Record<string, string | undefined> }) {
  const defaultRoleId = employee.role_id ?? roles[0]?.id ?? "";
  return <section aria-labelledby={`employee-dialog-heading-${employee.id}`}>
    <header className="flex items-start justify-between gap-3">
      <div>
        <p className="employee-section-kicker">Edit record · {employee.employee_code}</p>
        <h2 id={`employee-dialog-heading-${employee.id}`} className="text-2xl font-extrabold">Edit {employee.full_name}</h2>
        <p id={`employee-dialog-description-${employee.id}`} className="mt-1 text-sm text-ink-muted">Update the employee directory, account, and POS approval access.</p>
      </div>
      <button type="button" onClick={onClose} className="employee-icon-button" aria-label="Close employee editor">&times;</button>
    </header>

    <form action={updateEmployee} className="employee-entry-form mt-5">
      <input type="hidden" name="employee_id" value={employee.id} />
      <div className="employee-entry-grid">
        <label><span>Full name</span><input name="full_name" defaultValue={employee.full_name} placeholder="Juan Dela Cruz" required maxLength={120} disabled={!canWrite} /></label>
        <label><span>Email</span><input name="email" type="email" defaultValue={employee.email ?? ""} placeholder="employee@email.com" disabled={!canWrite} /></label>
        <label><span>Phone</span><input name="phone" defaultValue={employee.phone ?? ""} placeholder="0917 123 4567" disabled={!canWrite} /></label>
        <label><span>Job title</span><input name="job_title" defaultValue={employee.job_title ?? ""} placeholder="Cashier" disabled={!canWrite} /></label>
        <label><span>Permission preset</span><select name="role_id" defaultValue={defaultRoleId} disabled={!canWrite}><option value="">No preset selected</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><small className="employee-field-help">Admin, Manager, Cashier, and Staff presets are managed in Roles &amp; Permissions.</small></label>
        <label><span>System access</span><select name="access_role" defaultValue={employee.role} disabled={!canWrite}><option value="admin">Admin</option><option value="manager">Manager</option><option value="cashier">Cashier</option></select><small className="employee-field-help">This controls sign-in routing and server authorization.</small></label>
        <label><span>Home branch</span><select name="store_id" defaultValue={employee.store_id ?? ""} disabled={!canWrite}><option value="">All branches / unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}</select></label>
        <label><span>Date hired</span><input name="hired_on" type="date" defaultValue={employee.hired_on || today} required disabled={!canWrite} /></label>
        <label><span>Schedule start</span><input name="schedule_start" type="time" defaultValue={employee.schedule_start?.slice(0, 5) || "09:00"} required disabled={!canWrite} /></label>
        <label><span>Schedule end</span><input name="schedule_end" type="time" defaultValue={employee.schedule_end?.slice(0, 5) || "17:00"} required disabled={!canWrite} /></label>
      </div>
      <fieldset className="employee-schedule-fieldset">
        <legend>Working days</legend>
        <div className="employee-day-checkboxes">{DAYS.map(([key, label]) => <label key={key}><input type="checkbox" name="schedule_days" value={key} defaultChecked={employee.schedule_days.includes(key)} disabled={!canWrite} /><span>{label}</span></label>)}</div>
      </fieldset>
      <label className="employee-checkbox"><input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={!canWrite} /><span>Employee is active</span></label>
      <div className="flex gap-2"><button type="button" onClick={onClose} className="employee-tool-button">Cancel</button><EmployeeSubmitButton canWrite={canWrite}>Save employee</EmployeeSubmitButton></div>
    </form>

    <EmployeeAccessPanel employee={employee} canWrite={canWrite} returnState={returnState} />
  </section>;
}

function EmployeeSubmitButton({ canWrite, children }: { canWrite: boolean; children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!canWrite || pending} className="employee-primary-button">{pending ? "Saving..." : children}</button>;
}
