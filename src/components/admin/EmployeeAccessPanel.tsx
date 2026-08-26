import {
  provisionEmployeeAccess,
  provisionEmployeeLogin,
  setEmployeePin,
} from "@/app/admin/employees/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";

type AccessRole = "admin" | "manager" | "cashier";
type ReturnState = Record<string, string | undefined>;

export type EmployeeAccessRecord = {
  id: string;
  profile_id: string | null;
  employee_code: string;
  full_name: string;
  role: AccessRole | null;
  store_id: string | null;
  is_active: boolean;
};

function ReturnFields({ values }: { values: ReturnState }) {
  return <>{Object.entries(values).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}</>;
}

export function EmployeeAccessPanel({ employee, canWrite, returnState = {} }: { employee: EmployeeAccessRecord; canWrite: boolean; returnState?: ReturnState }) {
  const hasSystemAccess = employee.role !== null;
  const canApproveVoids = employee.role === "admin" || employee.role === "manager";
  const approvalLabel = employee.role === "manager" ? "Manager void PIN" : "Admin void PIN";
  const accountButtonLabel = canApproveVoids ? "Create account & PIN" : "Create employee account";

  return <section className="employee-access-panel" aria-labelledby={`employee-access-heading-${employee.id}`}>
    <header className="employee-access-panel__header">
      <div className="employee-access-panel__title">
        <span className="employee-access-panel__icon" aria-hidden="true"><AdminIcon name="lock" size={17} /></span>
        <div>
          <p className="employee-dialog__section-kicker">Account &amp; approvals</p>
          <h3 id={`employee-access-heading-${employee.id}`}>Sign-in and POS access</h3>
        </div>
      </div>
      <span className="employee-access-panel__status">{employee.role === null ? (employee.profile_id ? "Access disabled" : "No system access") : employee.profile_id ? "Account linked" : "Not set up"}</span>
    </header>
    <p className="employee-access-panel__intro">Login access and the void approval PIN are separate. Choose None for attendance and payroll-only employees. The PIN is used by an admin or manager to approve completed-order voids.</p>

    {!employee.is_active && <p className="employee-access-panel__notice"><AdminIcon name="alert" size={15} /> Activate this employee before setting up access.</p>}

    <div className="employee-access-panel__stack">
      {!hasSystemAccess ? <div className="employee-access-card employee-access-card--account">
        <div className="employee-access-card__heading">
          <div><strong>No system access</strong><p>This employee stays available for attendance and payroll without an admin dashboard or POS login.</p></div>
          <span>Directory only</span>
        </div>
        {employee.profile_id && <p className="employee-access-panel__notice employee-access-panel__notice--muted">Any linked login is disabled while System access is set to None.</p>}
      </div> : !employee.profile_id ? <form action={provisionEmployeeAccess} className="employee-access-card">
        <input type="hidden" name="employee_id" value={employee.id} />
        <ReturnFields values={returnState} />
        <div className="employee-access-card__heading">
          <div><strong>Create employee login</strong><p>They will sign in with their Employee ID and a temporary password.</p></div>
          <span>Step 1</span>
        </div>
        {canApproveVoids && <fieldset className="employee-void-pin-fields">
          <legend>Void approval PIN</legend>
          <p className="employee-void-pin-fields__help">Use 4–6 digits. This PIN authorizes completed-order voids.</p>
          <div className="employee-pin-field-grid">
            <label className="employee-pin-field"><span>New void PIN</span><input id={`employee-new-pin-${employee.id}`} className="employee-pin-input" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
            <label className="employee-pin-field"><span>Confirm void PIN</span><input id={`employee-confirm-pin-${employee.id}`} className="employee-pin-input" name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
          </div>
        </fieldset>}
        <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-primary-button">{accountButtonLabel}</button>
      </form> : <div className="employee-access-card employee-access-card--account">
        <div className="employee-access-card__heading">
          <div><strong>Employee account is linked</strong><p><span className="employee-access-card__employee-id">{employee.employee_code}</span> can sign in. Resetting login requires a password change.</p></div>
          <span className="employee-access-card__check" aria-hidden="true"><AdminIcon name="check" size={15} /></span>
        </div>
        <form action={provisionEmployeeLogin}>
          <input type="hidden" name="employee_id" value={employee.id} />
          <ReturnFields values={returnState} />
          <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-outline-button">Reset login password</button>
        </form>
      </div>}

      {hasSystemAccess && canApproveVoids && employee.profile_id ? <form action={setEmployeePin} className="employee-access-card employee-access-card--pin">
        <input type="hidden" name="employee_id" value={employee.id} />
        <ReturnFields values={returnState} />
        <div className="employee-access-card__heading employee-access-card__heading--pin">
          <div className="employee-access-card__title"><span className="employee-access-card__icon" aria-hidden="true"><AdminIcon name="lock" size={16} /></span><div><strong>{approvalLabel}</strong><p>Required to approve completed-order voids.</p></div></div>
          <span className="employee-access-card__required">For voids</span>
        </div>
        <fieldset className="employee-void-pin-fields">
          <legend>Change void PIN</legend>
          <p className="employee-void-pin-fields__help">Enter a new 4–6 digit PIN. It is never stored in the browser or audit log.</p>
          <div className="employee-pin-field-grid">
            <label className="employee-pin-field"><span>New void PIN</span><input id={`employee-update-pin-${employee.id}`} className="employee-pin-input" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
            <label className="employee-pin-field"><span>Confirm void PIN</span><input id={`employee-update-confirm-pin-${employee.id}`} className="employee-pin-input" name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
          </div>
        </fieldset>
        <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-primary-button">Save void PIN</button>
      </form> : !hasSystemAccess ? null : !canApproveVoids ? <p className="employee-access-panel__notice employee-access-panel__notice--muted">This access level does not hold a void PIN. An active manager or admin can approve completed-order voids.</p> : <p className="employee-access-panel__notice employee-access-panel__notice--muted">Create the employee account above first. The combined setup action creates the login and void PIN.</p>}
    </div>
  </section>;
}
