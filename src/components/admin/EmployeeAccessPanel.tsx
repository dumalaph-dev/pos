import {
  provisionEmployeeAccess,
  provisionEmployeeLogin,
  setEmployeePin,
} from "@/app/admin/employees/actions";

type AccessRole = "admin" | "manager" | "cashier";
type ReturnState = Record<string, string | undefined>;

export type EmployeeAccessRecord = {
  id: string;
  profile_id: string | null;
  employee_code: string;
  full_name: string;
  role: AccessRole;
  store_id: string | null;
  is_active: boolean;
};

function ReturnFields({ values }: { values: ReturnState }) {
  return <>{Object.entries(values).map(([key, value]) => value ? <input key={key} type="hidden" name={`return_${key}`} value={value} /> : null)}</>;
}

export function EmployeeAccessPanel({ employee, canWrite, returnState = {} }: { employee: EmployeeAccessRecord; canWrite: boolean; returnState?: ReturnState }) {
  const canApproveVoids = employee.role === "admin" || employee.role === "manager";
  const approvalLabel = employee.role === "manager" ? "Manager approval PIN" : "Admin approval PIN";
  const accountButtonLabel = canApproveVoids ? "Set up account + approval PIN" : "Set up employee account";

  return <section className="employee-entry-form mt-4 border-t border-line pt-5" aria-labelledby={`employee-access-heading-${employee.id}`}>
    <div className="employee-entry-form__heading">
      <div>
        <p className="employee-section-kicker">Account &amp; POS approvals</p>
        <h3 id={`employee-access-heading-${employee.id}`}>Make this employee ready to sign in</h3>
        <p>Login access and approval PINs are separate. The employee signs in with their Employee ID and password; an admin or manager approval PIN authorizes completed-order voids.</p>
      </div>
      <span className="employee-data-badge">{employee.profile_id ? "Account linked" : "Account not set up"}</span>
    </div>

    {!employee.is_active && <p className="employee-muted mt-3 rounded-btn border border-warning/30 bg-warning/10 px-3 py-2">Activate this employee before setting up an account or approval PIN.</p>}

    {!employee.profile_id ? <form action={provisionEmployeeAccess} className="mt-4 rounded-btn border border-line bg-surface-raised p-4">
      <input type="hidden" name="employee_id" value={employee.id} />
      <ReturnFields values={returnState} />
      <div className="grid gap-2">
        <strong className="text-sm text-ink">Create the login account</strong>
        <p className="text-xs leading-5 text-ink-muted">The server will create the account and reset it to the configured temporary password. Give that temporary password to the employee privately; they must change it on first sign-in.</p>
      </div>
      {canApproveVoids && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span>New void approval PIN</span><input name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
        <label><span>Confirm approval PIN</span><input name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
      </div>}
      <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-primary-button mt-4">{accountButtonLabel}</button>
    </form> : <div className="mt-4 grid gap-3 rounded-btn border border-line bg-surface-raised p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div>
        <strong className="block text-sm text-ink">Employee account is linked</strong>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Employee ID <span className="font-extrabold text-ink">{employee.employee_code}</span> is ready. Resetting login gives the employee the configured temporary password again and requires a password change.</p>
      </div>
      <form action={provisionEmployeeLogin}>
        <input type="hidden" name="employee_id" value={employee.id} />
        <ReturnFields values={returnState} />
        <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-outline-button">Reset login password</button>
      </form>
    </div>}

    {canApproveVoids && employee.profile_id ? <form action={setEmployeePin} className="mt-4 rounded-btn border border-line bg-surface-raised p-4">
      <input type="hidden" name="employee_id" value={employee.id} />
      <ReturnFields values={returnState} />
      <div>
        <strong className="block text-sm text-ink">{approvalLabel}</strong>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Used online to approve completed-order voids. Admin approval PINs also approve custom discounts above the configured threshold. The raw PIN is never stored in the browser or audit log.</p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span>New approval PIN</span><input name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
        <label><span>Confirm approval PIN</span><input name="pin_confirmation" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required disabled={!canWrite || !employee.is_active} /></label>
      </div>
      <button type="submit" disabled={!canWrite || !employee.is_active} className="employee-primary-button mt-4">Save approval PIN</button>
    </form> : !canApproveVoids ? <p className="employee-muted mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs">This access level does not hold an approval PIN. Use an active manager or admin account to approve completed-order voids.</p> : <p className="employee-muted mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2 text-xs">Set up the employee account above first. The combined setup action creates both the login and approval PIN.</p>}
  </section>;
}
