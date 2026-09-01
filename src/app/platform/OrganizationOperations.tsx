"use client";

import { useActionState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  openSupportCase,
  restoreOrganization,
  suspendOrganization,
  type OperationsActionState,
} from "./operations-actions";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

type OrganizationOperationsProps = {
  orgId: string;
  orgName: string;
  accountStatus: "active" | "suspended" | null;
  suspensionReason: string | null;
  policyGateOpen: boolean;
  schemaAvailable: boolean;
  canManage: boolean;
  visible: boolean;
};

export function OrganizationOperations({
  orgId,
  orgName,
  accountStatus,
  suspensionReason,
  policyGateOpen,
  schemaAvailable,
  canManage,
  visible,
}: OrganizationOperationsProps) {
  const [suspendState, suspendAction, suspendPending] = useActionState(suspendOrganization, INITIAL_STATE);
  const [restoreState, restoreAction, restorePending] = useActionState(restoreOrganization, INITIAL_STATE);
  const [supportState, supportAction, supportPending] = useActionState(openSupportCase, INITIAL_STATE);
  const suspended = accountStatus === "suspended";
  const locked = !canManage || !policyGateOpen || !schemaAvailable;
  const lockMessage = !canManage
    ? "Only Support and Owner operators can change account lifecycle or open support cases."
    : !policyGateOpen
    ? "Publish both policies to unlock this action."
    : "Apply migrations 0027 and 0028 to unlock this action.";

  if (!visible) {
    return <p role="status" className="flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />Support controls are not available to Billing operators.</p>;
  }

  return (
    <div className="min-w-[250px] space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-extrabold ${suspended ? "bg-danger-soft text-danger" : "bg-success/10 text-success"}`}>
          {suspended ? "Suspended" : "Active"}
        </span>
        {suspended && suspensionReason && <span className="max-w-[220px] truncate text-xs font-semibold text-ink-muted" title={suspensionReason}>{suspensionReason}</span>}
      </div>

      {suspendState.message && <ActionMessage state={suspendState} />}
      {restoreState.message && <ActionMessage state={restoreState} />}
      {supportState.message && <ActionMessage state={supportState} />}

      {suspended ? (
        <form action={restoreAction}>
          <input type="hidden" name="organization_id" value={orgId} />
          <button type="submit" disabled={locked || restorePending} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-secondary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">
            <AdminIcon name="refresh" size={14} />
            {restorePending ? "Restoring…" : "Restore account"}
          </button>
        </form>
      ) : (
        <details className="group rounded-btn border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-danger [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2"><AdminIcon name="alert" size={14} /> Suspend</span>
            <span className="text-ink-subtle transition group-open:rotate-180">⌄</span>
          </summary>
          <form action={suspendAction} className="space-y-3 border-t border-line px-3 pb-3 pt-3">
            <input type="hidden" name="organization_id" value={orgId} />
            <fieldset disabled={locked || suspendPending} className="space-y-3">
              <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`suspension-reason-${orgId}`}>Reason
                <textarea id={`suspension-reason-${orgId}`} name="reason" rows={3} minLength={10} maxLength={500} required placeholder={`Why should ${orgName} be suspended?`} className={`${CONTROL_CLASS} resize-y`} />
              </label>
              <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-danger px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                <AdminIcon name="alert" size={14} />
                {suspendPending ? "Suspending…" : "Confirm suspension"}
              </button>
            </fieldset>
          </form>
        </details>
      )}

      <details className="group rounded-btn border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2"><AdminIcon name="help" size={14} /> Open support case</span>
          <span className="text-ink-subtle transition group-open:rotate-180">⌄</span>
        </summary>
        <form action={supportAction} className="space-y-3 border-t border-line px-3 pb-3 pt-3">
          <input type="hidden" name="organization_id" value={orgId} />
          <fieldset disabled={locked || supportPending} className="space-y-3">
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`support-subject-${orgId}`}>Subject
              <input id={`support-subject-${orgId}`} name="subject" type="text" required maxLength={160} placeholder="What needs attention?" className={CONTROL_CLASS} />
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`support-description-${orgId}`}>Details
              <textarea id={`support-description-${orgId}`} name="description" rows={3} required maxLength={5000} placeholder="Record the customer need, context, and next step." className={`${CONTROL_CLASS} resize-y`} />
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`support-priority-${orgId}`}>Priority
              <select id={`support-priority-${orgId}`} name="priority" defaultValue="normal" className={CONTROL_CLASS}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              <AdminIcon name="help" size={14} />
              {supportPending ? "Opening…" : "Open case"}
            </button>
          </fieldset>
        </form>
      </details>

      {locked && <p role="status" className="flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />{lockMessage}</p>}
    </div>
  );
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-3 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}
