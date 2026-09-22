"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  platformFollowUpSourceLabel,
  platformFollowUpStatusLabel,
  platformFollowUpStatusTone,
  type PlatformFollowUpTask,
} from "@/lib/platform-follow-ups";
import { createPlatformFollowUpTask, updatePlatformFollowUpTask, type FollowUpActionState } from "./follow-up-actions";

type FollowUpOperator = { id: string; email: string; role: "owner" | "support" };
const INITIAL_STATE: FollowUpActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function PlatformFollowUpOperations({ organizationId, tasks, operators, schemaAvailable, canManage }: { organizationId: string; tasks: PlatformFollowUpTask[]; operators: FollowUpOperator[]; schemaAvailable: boolean; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(createPlatformFollowUpTask, INITIAL_STATE);
  const [requestId] = useState(() => crypto.randomUUID());
  const locked = !canManage || !schemaAvailable || pending;
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress").length;
  const assigneeLabel = new Map(operators.map((operator) => [operator.id, `${operator.email} · ${operator.role}`]));

  return <section className="mt-8 rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="follow-up-tasks-heading">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Account success</p><h2 id="follow-up-tasks-heading" className="mt-1 text-xl font-extrabold tracking-[-0.025em]">Internal follow-up tasks</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Give the next operator a clear reason, owner, deadline, and outcome without sending anything to the merchant.</p></div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="check" size={13} /> {openTasks} open</span>
    </div>

    <form action={formAction} className="mt-5 rounded-2xl border border-line bg-raised/60 p-4" aria-label="Create follow-up task">
      <input type="hidden" name="organization_id" value={organizationId} readOnly />
      <input type="hidden" name="request_id" value={requestId} readOnly />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Task title<input name="title" required maxLength={160} placeholder="Review stalled onboarding" className={CONTROL_CLASS} disabled={locked} /></label>
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Reason<input name="reason" required maxLength={500} placeholder="No first sale after setup" className={CONTROL_CLASS} disabled={locked} /></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Source<select name="source_type" defaultValue="manual" className={CONTROL_CLASS} disabled={locked}><option value="manual">Manual</option><option value="attention">Attention occurrence</option><option value="support_case">Support case</option><option value="trial_feedback">Trial feedback</option><option value="renewal">Renewal planning</option></select></label>
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Owner<select name="assignee_id" defaultValue="" className={CONTROL_CLASS} disabled={locked}><option value="">Unassigned</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.email} · {operator.role}</option>)}</select></label>
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Due (Singapore time, UTC+8)<input name="due_at" type="datetime-local" className={CONTROL_CLASS} disabled={locked} /></label>
        <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Next step<input name="next_step" maxLength={1000} placeholder="Call owner after close" className={CONTROL_CLASS} disabled={locked} /></label>
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
      {!schemaAvailable && <p role="status" className="mt-3 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">Follow-up storage is not active yet. Apply <code className="font-extrabold">0093_platform_follow_up_tasks.sql</code>.</p>}
      {!canManage && <p role="status" className="mt-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold leading-5 text-ink-muted">Read-only and billing operators can review tasks; account-success changes require an Owner or Support operator.</p>}
      <button type="submit" disabled={locked} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="plus" size={14} />{pending ? "Creating…" : "Create follow-up"}</button>
    </form>

    <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {tasks.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink-muted">No internal follow-up tasks have been created for this organization.</p> : tasks.map((task) => <FollowUpTaskRow key={task.id} task={task} operators={operators} assigneeLabel={assigneeLabel} canManage={canManage} schemaAvailable={schemaAvailable} />)}
    </div>
  </section>;
}

function FollowUpTaskRow({ task, operators, assigneeLabel, canManage, schemaAvailable }: { task: PlatformFollowUpTask; operators: FollowUpOperator[]; assigneeLabel: Map<string, string>; canManage: boolean; schemaAvailable: boolean }) {
  const [state, action, pending] = useActionState(updatePlatformFollowUpTask, INITIAL_STATE);
  const [requestIds] = useState(() => ({ complete: crypto.randomUUID(), reopen: crypto.randomUUID(), start: crypto.randomUUID(), cancel: crypto.randomUUID() }));
  const locked = !canManage || !schemaAvailable || pending;
  const tone = platformFollowUpStatusTone(task.status);
  const toneClass = tone === "success" ? "bg-success/10 text-success" : tone === "muted" ? "bg-raised text-ink-muted" : tone === "primary" ? "bg-primary-soft text-primary" : "bg-warning/15 text-ink";
  const closed = task.status === "completed" || task.status === "cancelled";

  const requestId = closed ? requestIds.reopen : requestIds.complete;
  return <article className="px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${toneClass}`}>{platformFollowUpStatusLabel(task.status)}</span><span className="rounded-full bg-raised px-2.5 py-1 text-[10px] font-extrabold text-ink-muted">{platformFollowUpSourceLabel(task.sourceType)}</span><span className="text-[10px] font-semibold text-ink-muted">Version {task.version}</span></div><h3 className="mt-2 text-sm font-extrabold text-ink">{task.title}</h3><p className="mt-1 text-sm leading-5 text-ink-muted">{task.reason}</p><p className="mt-2 text-[11px] font-semibold text-ink-muted">{task.assigneeId ? `Owner: ${assigneeLabel.get(task.assigneeId) ?? "Inactive operator"}` : "Unassigned"}{task.dueAt ? ` · Due ${formatDate(task.dueAt)}` : " · No due date"}</p>{task.nextStep && <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-xs leading-5 text-ink-muted"><strong className="text-ink">Next step:</strong> {task.nextStep}</p>}{task.outcome && <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs leading-5 text-ink-muted"><strong className="text-success">Outcome:</strong> {task.outcome}</p>}</div><div className="flex shrink-0 flex-col gap-2 lg:w-[280px]"><form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto]"><input type="hidden" name="organization_id" value={task.orgId} readOnly /><input type="hidden" name="task_id" value={task.id} readOnly /><input type="hidden" name="version" value={task.version} readOnly /><input type="hidden" name="request_id" value={requestId} readOnly /><input type="hidden" name="action" value={closed ? "reopen" : "complete"} readOnly />{closed ? <button type="submit" disabled={locked} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="refresh" size={13} />{pending ? "Saving…" : "Reopen"}</button> : <><input name="outcome" maxLength={2000} placeholder="Outcome to complete" className="min-h-9 rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs font-semibold text-ink outline-none focus:border-primary" disabled={locked} /><button type="submit" disabled={locked} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="check" size={13} />{pending ? "Saving…" : "Complete"}</button></>}</form>{!closed && <div className="flex flex-wrap gap-2"><TaskActionButton action={action} task={task} requestId={requestIds.start} name="start" label="Start" locked={locked || task.status === "in_progress"} /><TaskActionButton action={action} task={task} requestId={requestIds.cancel} name="cancel" label="Cancel" locked={locked} /></div>}{state.message && <p role={state.ok ? "status" : "alert"} className={`text-[11px] font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}</div></div></article>;
}

function TaskActionButton({ action, task, requestId, name, label, locked }: { action: (payload: FormData) => void; task: PlatformFollowUpTask; requestId: string; name: string; label: string; locked: boolean }) {
  return <form action={action}><input type="hidden" name="organization_id" value={task.orgId} readOnly /><input type="hidden" name="task_id" value={task.id} readOnly /><input type="hidden" name="version" value={task.version} readOnly /><input type="hidden" name="request_id" value={requestId} readOnly /><input type="hidden" name="action" value={name} readOnly />{name === "cancel" && <input type="hidden" name="reason" value="Cancelled by operator" readOnly />}<button type="submit" disabled={locked} className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">{label}</button></form>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(date);
}
