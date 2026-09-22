"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { platformAttentionStateLabel, type PlatformAttentionOccurrence } from "@/lib/platform-attention";
import { refreshPlatformAttention, updatePlatformAttention, type AttentionActionState } from "./attention-actions";

type AttentionOperator = { id: string; email: string; role: "owner" | "billing" | "support" | "read_only" };

const INITIAL_STATE: AttentionActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2 text-xs font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function PlatformAttentionRefresh({ canManage, schemaAvailable }: { canManage: boolean; schemaAvailable: boolean }) {
  const [state, action, pending] = useActionState(refreshPlatformAttention, INITIAL_STATE);
  const locked = !canManage || !schemaAvailable;
  return <div className="flex flex-col items-end gap-1.5"><form action={action}><button type="submit" disabled={locked || pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-xs font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><AdminIcon name="refresh" size={14} />{pending ? "Refreshing…" : "Refresh signals"}</button></form>{state.message && <span role={state.ok ? "status" : "alert"} className={`max-w-[260px] text-right text-[11px] font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}</div>;
}

export function PlatformAttentionOccurrenceOperations({ occurrence, operators, canManage, schemaAvailable }: { occurrence: PlatformAttentionOccurrence; operators: AttentionOperator[]; canManage: boolean; schemaAvailable: boolean }) {
  const [ackState, ackAction, ackPending] = useActionState(updatePlatformAttention, INITIAL_STATE);
  const [assignState, assignAction, assignPending] = useActionState(updatePlatformAttention, INITIAL_STATE);
  const [snoozeState, snoozeAction, snoozePending] = useActionState(updatePlatformAttention, INITIAL_STATE);
  const [unsnoozeState, unsnoozeAction, unsnoozePending] = useActionState(updatePlatformAttention, INITIAL_STATE);
  const [ackRequestId] = useState(() => crypto.randomUUID());
  const [assignRequestId] = useState(() => crypto.randomUUID());
  const [unassignRequestId] = useState(() => crypto.randomUUID());
  const [snoozeRequestId] = useState(() => crypto.randomUUID());
  const [unsnoozeRequestId] = useState(() => crypto.randomUUID());
  const locked = !canManage || !schemaAvailable || occurrence.state === "resolved";
  const lockMessage = !canManage
    ? "Read-only operators can inspect occurrences; attention actions require an active attention manager."
    : !schemaAvailable
      ? "Apply migration 0089 to enable durable attention actions."
      : occurrence.state === "resolved"
        ? "Resolved occurrences are read-only; a new recurrence will open a new occurrence."
        : "Refresh this occurrence if another operator changes it.";
  const activeOperators = operators.filter((operator) => operator.role !== "read_only");

  return <div className="mt-4 rounded-xl border border-line bg-surface/75 p-3">
    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-muted"><span>Version {occurrence.version}</span><span aria-hidden="true">·</span><span>{occurrence.assignedEmail ? `Assigned to ${occurrence.assignedEmail}` : "Unassigned"}</span><span aria-hidden="true">·</span><span>{occurrence.state === "snoozed" ? `Resurfaces ${formatDate(occurrence.snoozedUntil)}` : platformAttentionStateLabel(occurrence.state)}</span></div>
    {(ackState.message || assignState.message || snoozeState.message || unsnoozeState.message) && <div className="mt-3 space-y-2"><ActionMessage state={ackState} /><ActionMessage state={assignState} /><ActionMessage state={snoozeState} /><ActionMessage state={unsnoozeState} /></div>}
    <div className="mt-3 grid gap-3 lg:grid-cols-3">
      <form action={ackAction} className="space-y-2"><input type="hidden" name="occurrence_id" value={occurrence.id} /><input type="hidden" name="version" value={occurrence.version} /><input type="hidden" name="action" value="acknowledge" /><input type="hidden" name="request_id" value={ackRequestId} /><button type="submit" disabled={locked || ackPending || occurrence.state === "acknowledged"} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="check" size={13} />{ackPending ? "Saving…" : occurrence.state === "acknowledged" ? "Acknowledged" : "Acknowledge"}</button></form>

      <form action={assignAction} className="space-y-2"><input type="hidden" name="occurrence_id" value={occurrence.id} /><input type="hidden" name="version" value={occurrence.version} /><input type="hidden" name="action" value="assign" /><input type="hidden" name="request_id" value={assignRequestId} /><label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Owner<select name="assignee_id" defaultValue={occurrence.assignedTo ?? ""} className={CONTROL_CLASS} disabled={locked || assignPending}><option value="">Choose an operator</option>{activeOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.email} · {operator.role}</option>)}</select></label><button type="submit" disabled={locked || assignPending} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="employees" size={13} />{assignPending ? "Saving…" : "Save owner"}</button></form>

      <form action={snoozeAction} className="space-y-2"><input type="hidden" name="occurrence_id" value={occurrence.id} /><input type="hidden" name="version" value={occurrence.version} /><input type="hidden" name="action" value="snooze" /><input type="hidden" name="request_id" value={snoozeRequestId} /><label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Resurface by<input name="snooze_until" type="datetime-local" defaultValue={defaultSnoozeValue()} className={CONTROL_CLASS} disabled={locked || snoozePending} /></label><input name="reason" type="text" maxLength={240} placeholder="Why should this wait?" className={CONTROL_CLASS} disabled={locked || snoozePending} /><button type="submit" disabled={locked || snoozePending} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="clock" size={13} />{snoozePending ? "Saving…" : "Snooze"}</button></form>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">{occurrence.state === "snoozed" && <form action={unsnoozeAction}><input type="hidden" name="occurrence_id" value={occurrence.id} /><input type="hidden" name="version" value={occurrence.version} /><input type="hidden" name="action" value="unsnooze" /><input type="hidden" name="request_id" value={unsnoozeRequestId} /><button type="submit" disabled={locked || unsnoozePending} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="refresh" size={13} />{unsnoozePending ? "Saving…" : "Return to queue"}</button></form>}{occurrence.assignedTo && <form action={assignAction}><input type="hidden" name="occurrence_id" value={occurrence.id} /><input type="hidden" name="version" value={occurrence.version} /><input type="hidden" name="action" value="unassign" /><input type="hidden" name="request_id" value={unassignRequestId} /><button type="submit" disabled={locked || assignPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="employees" size={13} />{assignPending ? "Saving…" : "Unassign"}</button></form>}</div>
    {locked && <p role="status" className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />{lockMessage}</p>}
  </div>;
}

function ActionMessage({ state }: { state: AttentionActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function defaultSnoozeValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
