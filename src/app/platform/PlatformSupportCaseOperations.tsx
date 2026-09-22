"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  appendSupportCaseNote,
  assignSupportCase,
  transitionSupportCase,
  type OperationsActionState,
} from "./operations-actions";
import type { SupportCaseRecord } from "./_lib/platform-data";

type SupportOperator = { id: string; email: string; role: "owner" | "support" | "billing" | "read_only" };

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-xl border border-line-strong bg-raised px-3 py-2 text-xs font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";
const STATUS_OPTIONS: SupportCaseRecord["status"][] = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];

export function PlatformSupportCaseOperations({ supportCase, operators, policyGateOpen, canManage, schemaAvailable }: {
  supportCase: SupportCaseRecord;
  operators: SupportOperator[];
  policyGateOpen: boolean;
  canManage: boolean;
  schemaAvailable: boolean;
}) {
  const [transitionState, transitionAction, transitionPending] = useActionState(transitionSupportCase, INITIAL_STATE);
  const [assignmentState, assignmentAction, assignmentPending] = useActionState(assignSupportCase, INITIAL_STATE);
  const [noteState, noteAction, notePending] = useActionState(appendSupportCaseNote, INITIAL_STATE);
  const [transitionRequestId] = useState(() => crypto.randomUUID());
  const [assignmentRequestId] = useState(() => crypto.randomUUID());
  const [noteRequestId] = useState(() => crypto.randomUUID());
  const version = supportCase.version ?? 1;
  const locked = !canManage || !policyGateOpen || !schemaAvailable || !supportCase.id;
  const lockMessage = !canManage
    ? "Only Support and Owner operators can manage this case."
    : !policyGateOpen
      ? "Publish both policies to unlock support actions."
      : !schemaAvailable
        ? "Apply migration 0088 to unlock atomic support actions."
        : "Refresh the case if another operator changes it.";
  const assignee = operators.find((operator) => operator.id === supportCase.assigned_to);

  return (
    <div className="mt-4 rounded-xl border border-line bg-raised/45 p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-ink-muted">
        <span>Version {version}</span>
        <span aria-hidden="true">·</span>
        <span>{assignee ? `Assigned to ${assignee.email}` : "Unassigned"}</span>
        <span aria-hidden="true">·</span>
        <span>{supportCase.first_response_at ? `First response ${formatDate(supportCase.first_response_at)}` : "No operator response recorded"}</span>
      </div>

      {(transitionState.message || assignmentState.message || noteState.message) && <div className="mt-3 space-y-2"><ActionMessage state={transitionState} /><ActionMessage state={assignmentState} /><ActionMessage state={noteState} /></div>}

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <form action={transitionAction} className="space-y-2">
          <input type="hidden" name="case_id" value={supportCase.id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="request_id" value={transitionRequestId} />
          <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Move case
            <select name="status" defaultValue={supportCase.status} className={CONTROL_CLASS} disabled={locked || transitionPending}>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Resolution reason
            <textarea name="resolution_reason" rows={2} maxLength={1000} placeholder="Required for resolved or closed" className={`${CONTROL_CLASS} resize-y`} disabled={locked || transitionPending} />
          </label>
          <button type="submit" disabled={locked || transitionPending} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="refresh" size={13} />{transitionPending ? "Saving…" : "Save status"}</button>
        </form>

        <form action={assignmentAction} className="space-y-2">
          <input type="hidden" name="case_id" value={supportCase.id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="request_id" value={assignmentRequestId} />
          <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Assignee
            <select name="assignee_id" defaultValue={supportCase.assigned_to ?? ""} className={CONTROL_CLASS} disabled={locked || assignmentPending}>
              <option value="">Unassigned</option>
              {operators.filter((operator) => operator.role === "owner" || operator.role === "support").map((operator) => <option key={operator.id} value={operator.id}>{operator.email} · {operator.role}</option>)}
            </select>
          </label>
          <p className="text-[11px] leading-4 text-ink-muted">Only active Support and Owner operators can be assigned.</p>
          <button type="submit" disabled={locked || assignmentPending} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="employees" size={13} />{assignmentPending ? "Saving…" : "Save assignment"}</button>
        </form>

        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="case_id" value={supportCase.id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="request_id" value={noteRequestId} />
          <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Note type
            <select name="note_type" defaultValue="internal" className={CONTROL_CLASS} disabled={locked || notePending}><option value="internal">Internal note</option><option value="operator_response">Operator response</option></select>
          </label>
          <label className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">Note
            <textarea name="body" rows={2} maxLength={5000} required placeholder="Record context or the first actual operator response" className={`${CONTROL_CLASS} resize-y`} disabled={locked || notePending} />
          </label>
          <button type="submit" disabled={locked || notePending} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="edit" size={13} />{notePending ? "Saving…" : "Add note"}</button>
        </form>
      </div>

      {(supportCase.events?.length || supportCase.notes?.length) ? <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2"><summary className="cursor-pointer text-[11px] font-extrabold text-primary">View lifecycle history ({(supportCase.events?.length ?? 0) + (supportCase.notes?.length ?? 0)})</summary><div className="mt-2 space-y-2 border-t border-line pt-2">{supportCase.events?.map((event) => <div key={`event-${event.id}`} className="text-[11px] leading-4 text-ink-muted"><strong className="text-ink">{event.event_type.replaceAll("_", " ")}</strong> · {formatDate(event.created_at)}{event.to_status ? ` · ${event.to_status.replaceAll("_", " ")}` : ""}{event.reason ? ` · ${event.reason}` : ""}</div>)}{supportCase.notes?.map((note) => <div key={`note-${note.id}`} className="rounded-lg bg-raised px-2.5 py-2 text-[11px] leading-4 text-ink-muted"><strong className="text-ink">{note.note_type === "operator_response" ? "Operator response" : "Internal note"}</strong> · {formatDate(note.created_at)}<p className="mt-1 whitespace-pre-wrap">{note.body}</p></div>)}</div></details> : null}
      {locked && <p role="status" className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />{lockMessage}</p>}
    </div>
  );
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function formatDate(value: string | null | undefined) {
  const date = new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
