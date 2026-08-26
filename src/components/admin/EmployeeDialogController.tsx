"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { updateEmployee } from "@/app/admin/employees/actions";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { EmployeeAccessPanel } from "@/components/admin/EmployeeAccessPanel";
import { UrlLocalDialogController } from "@/components/admin/UrlLocalDialogController";
import type { AdminThemeId } from "@/lib/admin/branding";

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

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "?";
}

export function EmployeeDialogController({
  children,
  employees,
  branches,
  roles,
  initialEmployeeId,
  today,
  canWrite,
  theme,
  returnState = {},
}: {
  children: ReactNode;
  employees: AdminEmployeeRecord[];
  branches: BranchRecord[];
  roles: RoleRecord[];
  initialEmployeeId: string | null;
  today: string;
  canWrite: boolean;
  theme: AdminThemeId;
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
      dataAdminTheme={theme}
      bodyClassName="admin-dialog-open"
      backdropClassName="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:p-8"
      dialogClassName="employee-dialog relative my-4 w-full overflow-y-auto rounded-card border border-line bg-surface shadow-[var(--shadow-pop)] sm:my-8"
    >
      <EmployeeEditorDialog employee={employee} branches={branches} roles={roles} today={today} canWrite={canWrite} onClose={onClose} returnState={returnState} />
    </AdminDialog>}
  >{children}</UrlLocalDialogController>;
}

function EmployeeEditorDialog({ employee, branches, roles, today, canWrite, onClose, returnState }: { employee: AdminEmployeeRecord; branches: BranchRecord[]; roles: RoleRecord[]; today: string; canWrite: boolean; onClose: () => void; returnState: Record<string, string | undefined> }) {
  const defaultRoleId = employee.role_id ?? roles[0]?.id ?? "";
  return <section className="employee-dialog__shell" aria-labelledby={`employee-dialog-heading-${employee.id}`}>
    <header className="employee-dialog__header">
      <div className="employee-dialog__identity">
        <span className="employee-dialog__avatar" aria-hidden="true">{initials(employee.full_name)}</span>
        <div>
          <p className="employee-dialog__eyebrow">Edit employee · {employee.employee_code}</p>
          <h2 id={`employee-dialog-heading-${employee.id}`}>Edit {employee.full_name}</h2>
          <p id={`employee-dialog-description-${employee.id}`}>Update directory details, schedule, and access.</p>
        </div>
      </div>
      <div className="employee-dialog__header-actions">
        <span className={`employee-dialog__status ${employee.is_active ? "is-active" : "is-inactive"}`}>{employee.is_active ? "Active" : "Inactive"}</span>
        <button type="button" onClick={onClose} className="employee-dialog__close" aria-label="Close employee editor"><AdminIcon name="close" size={18} /></button>
      </div>
    </header>

    <div className="employee-dialog__body">
      <form action={updateEmployee} className="employee-record-form">
        <input type="hidden" name="employee_id" value={employee.id} />
        <div className="employee-dialog__section-heading">
          <div>
            <p className="employee-dialog__section-kicker">Employee details</p>
            <h3>Directory information</h3>
          </div>
          <span>Keep staff details current</span>
        </div>
        <div className="employee-dialog__field-grid">
          <label className="employee-dialog__field"><span>Full name</span><input name="full_name" defaultValue={employee.full_name} placeholder="Juan Dela Cruz" required maxLength={120} disabled={!canWrite} /></label>
          <label className="employee-dialog__field"><span>Email</span><input name="email" type="email" defaultValue={employee.email ?? ""} placeholder="employee@email.com" disabled={!canWrite} /></label>
          <label className="employee-dialog__field"><span>Phone</span><input name="phone" defaultValue={employee.phone ?? ""} placeholder="0917 123 4567" disabled={!canWrite} /></label>
          <label className="employee-dialog__field"><span>Job title</span><input name="job_title" defaultValue={employee.job_title ?? ""} placeholder="Cashier" disabled={!canWrite} /></label>
          <label className="employee-dialog__field"><span>Permission preset</span><select name="role_id" defaultValue={defaultRoleId} disabled={!canWrite}><option value="">No preset selected</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><small className="employee-dialog__help">Managed in Roles &amp; Permissions.</small></label>
          <label className="employee-dialog__field"><span>System access</span><select name="access_role" defaultValue={employee.role} disabled={!canWrite}><option value="admin">Admin</option><option value="manager">Manager</option><option value="cashier">Cashier</option></select><small className="employee-dialog__help">Controls sign-in routing and authorization.</small></label>
          <label className="employee-dialog__field"><span>Home branch</span><select name="store_id" defaultValue={employee.store_id ?? ""} disabled={!canWrite}><option value="">All branches / unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.is_active ? "" : " (inactive)"}</option>)}</select></label>
          <label className="employee-dialog__field"><span>Date hired</span><input name="hired_on" type="date" defaultValue={employee.hired_on || today} required disabled={!canWrite} /></label>
        </div>

        <fieldset className="employee-dialog__schedule">
          <legend className="employee-dialog__section-kicker">Working schedule</legend>
          <div className="employee-dialog__schedule-layout">
            <div className="employee-dialog__time-grid">
              <label className="employee-dialog__field"><span>Starts</span><input name="schedule_start" type="time" defaultValue={employee.schedule_start?.slice(0, 5) || "09:00"} required disabled={!canWrite} /></label>
              <label className="employee-dialog__field"><span>Ends</span><input name="schedule_end" type="time" defaultValue={employee.schedule_end?.slice(0, 5) || "17:00"} required disabled={!canWrite} /></label>
            </div>
            <div>
              <span className="employee-dialog__field-label">Working days</span>
              <div className="employee-dialog__day-checkboxes">{DAYS.map(([key, label]) => <label key={key}><input type="checkbox" name="schedule_days" value={key} defaultChecked={employee.schedule_days.includes(key)} disabled={!canWrite} /><span>{label}</span></label>)}</div>
            </div>
          </div>
        </fieldset>

        <div className="employee-dialog__form-footer">
          <label className="employee-dialog__active-toggle"><input type="checkbox" name="is_active" defaultChecked={employee.is_active} disabled={!canWrite} /><span><strong>Employee is active</strong><small>Allow sign-in and POS access</small></span></label>
          <div className="employee-dialog__form-actions"><button type="button" onClick={onClose} className="employee-tool-button">Cancel</button><EmployeeSubmitButton canWrite={canWrite}>Save changes</EmployeeSubmitButton></div>
        </div>
      </form>

      <EmployeeAccessPanel employee={employee} canWrite={canWrite} returnState={returnState} />
    </div>
  </section>;
}

function EmployeeSubmitButton({ canWrite, children }: { canWrite: boolean; children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!canWrite || pending} className="employee-primary-button">{pending ? "Saving…" : children}</button>;
}
