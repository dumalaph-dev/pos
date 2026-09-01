"use client";

import { useActionState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { TRIAL_FEEDBACK_STATUS_LABELS, type TrialFeedbackStatus } from "@/lib/trial";
import { updateTrialFeedback, type OperationsActionState } from "./operations-actions";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };

export function TrialFeedbackOperations({
  orgId,
  status,
  platformNotes,
  workflowAvailable,
  canManage,
}: {
  orgId: string;
  status: TrialFeedbackStatus;
  platformNotes: string;
  workflowAvailable: boolean;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(updateTrialFeedback, INITIAL_STATE);

  return (
    <details className="group mt-4 rounded-xl border border-line bg-raised">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><AdminIcon name="refresh" size={14} /> Record follow-up</span>
        <span className="text-ink-subtle transition group-open:rotate-180">⌄</span>
      </summary>
      <form action={action} className="space-y-3 border-t border-line px-3 pb-3 pt-3">
        <input type="hidden" name="organization_id" value={orgId} />
        <fieldset disabled={!canManage || !workflowAvailable || pending} className="space-y-3">
          <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`trial-feedback-status-${orgId}`}>
            Status
            <select id={`trial-feedback-status-${orgId}`} name="status" defaultValue={status} className="mt-1 w-full rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10">
              {(Object.keys(TRIAL_FEEDBACK_STATUS_LABELS) as TrialFeedbackStatus[]).map((value) => <option key={value} value={value}>{TRIAL_FEEDBACK_STATUS_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`trial-feedback-notes-${orgId}`}>
            Internal note
            <textarea id={`trial-feedback-notes-${orgId}`} name="platform_notes" defaultValue={platformNotes} maxLength={2000} rows={3} placeholder="Record the owner contact, offer, or next step." className="mt-1 w-full resize-y rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </label>
          <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
            <AdminIcon name="check" size={14} />
            {pending ? "Saving..." : "Save follow-up"}
          </button>
        </fieldset>
        {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-3 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
        {!workflowAvailable && <p role="status" className="text-[11px] font-semibold leading-4 text-ink-muted">Apply migration 0039_trial_feedback_workflow.sql to enable follow-up tracking.</p>}
        {!canManage && <p role="status" className="text-[11px] font-semibold leading-4 text-ink-muted">Only Support and Owner operators can record retention follow-up.</p>}
      </form>
    </details>
  );
}
