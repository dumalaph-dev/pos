"use client";

import { useActionState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  hasPlatformOperatorPermission,
  PLATFORM_OPERATOR_ROLE_DESCRIPTIONS,
  PLATFORM_OPERATOR_ROLE_LABELS,
  PLATFORM_OPERATOR_ROLES,
  type PlatformOperatorRole,
} from "@/lib/platform-operators";
import type { PlatformOperatorAuditRecord, PlatformOperatorRecord } from "@/lib/platform-operators-server";
import {
  changePlatformOperatorRole,
  invitePlatformOperator,
  revokePlatformOperator,
  type OperatorActionState,
} from "./operators-actions";

const INITIAL_STATE: OperatorActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60";

export function PlatformOperatorsPanel({ records, auditLogs, schemaAvailable, currentRole }: { records: PlatformOperatorRecord[]; auditLogs: PlatformOperatorAuditRecord[]; schemaAvailable: boolean; currentRole: PlatformOperatorRole }) {
  const [inviteState, inviteAction, invitePending] = useActionState(invitePlatformOperator, INITIAL_STATE);
  const [roleState, roleAction, rolePending] = useActionState(changePlatformOperatorRole, INITIAL_STATE);
  const [revokeState, revokeAction, revokePending] = useActionState(revokePlatformOperator, INITIAL_STATE);
  const canManage = schemaAvailable && hasPlatformOperatorPermission(currentRole, "operator_manage");

  return (
    <>
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]" aria-label="Platform operator membership">
        <form action={inviteAction} className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Add access</p>
              <h2 className="mt-1 text-xl font-extrabold">Invite an operator</h2>
              <p className="mt-1 text-sm leading-5 text-ink-muted">Add an email and role. The operator can use the existing platform sign-in once an Auth account exists; revoked identities can be re-invited without losing history.</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AdminIcon name="employees" size={17} /></span>
          </div>

          <fieldset disabled={!canManage || invitePending} className="mt-5 space-y-4">
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="platform-operator-email">Operator email
              <input id="platform-operator-email" name="email" type="email" required maxLength={320} autoComplete="email" placeholder="operator@yourdomain.com" className={CONTROL_CLASS} />
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="platform-operator-role">Role
              <select id="platform-operator-role" name="role" defaultValue="read_only" className={CONTROL_CLASS}>
                {PLATFORM_OPERATOR_ROLES.map((role) => <option key={role} value={role}>{PLATFORM_OPERATOR_ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              <AdminIcon name="plus" size={14} />
              {invitePending ? "Saving…" : "Invite operator"}
            </button>
          </fieldset>

          {!schemaAvailable && <p role="status" className="mt-4 rounded-btn border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs font-semibold leading-5 text-ink">Apply migration <code className="font-extrabold">0077_platform_operators.sql</code> before managing operator membership.</p>}
          {!canManage && schemaAvailable && <p role="status" className="mt-4 flex items-start gap-1.5 text-xs font-semibold leading-5 text-ink-muted"><AdminIcon name="lock" size={13} />Only Owner operators can invite, change, or revoke platform operators.</p>}
          {inviteState.message && <ActionMessage state={inviteState} />}
        </form>

        <section className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="operator-roles-heading">
          <div className="border-b border-line pb-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Permission model</p>
            <h2 id="operator-roles-heading" className="mt-1 text-xl font-extrabold">Roles stay narrow by default</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">Every server action checks the current role again. The environment allowlist remains a bootstrap Owner path and cannot be demoted or revoked here.</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {PLATFORM_OPERATOR_ROLES.map((role) => <article key={role} className={`rounded-[18px] border p-4 ${role === currentRole ? "border-primary/35 bg-primary-soft/45" : "border-line bg-raised/55"}`}>
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold">{PLATFORM_OPERATOR_ROLE_LABELS[role]}</h3>{role === currentRole && <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary-fg">Your role</span>}</div>
              <p className="mt-2 text-xs leading-5 text-ink-muted">{PLATFORM_OPERATOR_ROLE_DESCRIPTIONS[role]}</p>
            </article>)}
          </div>
          {(roleState.message || revokeState.message) && <div className="mt-4 space-y-2"><p className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">Latest membership result</p>{roleState.message && <ActionMessage state={roleState} />}{revokeState.message && <ActionMessage state={revokeState} />}</div>}
        </section>
      </section>

      <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="operator-directory-heading">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Membership directory</p>
            <h2 id="operator-directory-heading" className="mt-1 text-xl font-extrabold">Platform operators</h2>
            <p className="mt-1 text-sm leading-5 text-ink-muted">Membership stays visible after revocation so role changes and recovery decisions remain reviewable.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="check" size={13} /> {records.filter((record) => record.is_active).length} active</span>
        </div>

        {records.length === 0 ? <p className="px-6 py-12 text-center text-sm text-ink-muted">No platform operators are configured yet. The bootstrap allowlist is still available when configured.</p> : <div className="overflow-x-auto"><table className="min-w-[860px] w-full text-left text-sm"><thead className="bg-raised text-[10px] uppercase tracking-[0.12em] text-ink-muted"><tr><th className="px-6 py-3 font-extrabold">Identity</th><th className="px-4 py-3 font-extrabold">Role</th><th className="px-4 py-3 font-extrabold">Status</th><th className="px-4 py-3 font-extrabold">Added</th><th className="px-6 py-3 text-right font-extrabold">Controls</th></tr></thead><tbody className="divide-y divide-line">{records.map((record) => <OperatorRow key={record.id} record={record} canManage={canManage} roleAction={roleAction} rolePending={rolePending} revokeAction={revokeAction} revokePending={revokePending} />)}</tbody></table></div>}
      </section>

      <section className="mt-6 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="operator-audit-heading">
        <div className="px-5 py-5 sm:px-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Audit trail</p><h2 id="operator-audit-heading" className="mt-1 text-xl font-extrabold">Membership changes</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Invites, role changes, reactivations, and revocations are recorded with before and after snapshots.</p></div><span className="rounded-full bg-raised px-3 py-1.5 text-xs font-extrabold text-ink-muted">{auditLogs.length} entries</span></div></div>
        {auditLogs.length === 0 ? <p className="border-t border-line px-6 py-10 text-center text-sm text-ink-muted">No operator membership changes have been recorded.</p> : <div className="divide-y divide-line">{auditLogs.slice(0, 20).map((audit) => <div key={audit.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6"><div><strong className="block text-sm font-extrabold">{operatorAuditLabel(audit.action)}</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Operator {audit.operator_id} · Actor {audit.actor_email || audit.actor_id || "unknown"}</p></div><time className="whitespace-nowrap text-xs font-semibold text-ink-muted" dateTime={audit.created_at}>{formatDate(audit.created_at)}</time></div>)}</div>}
      </section>
    </>
  );
}

function OperatorRow({ record, canManage, roleAction, rolePending, revokeAction, revokePending }: { record: PlatformOperatorRecord; canManage: boolean; roleAction: (formData: FormData) => void; rolePending: boolean; revokeAction: (formData: FormData) => void; revokePending: boolean }) {
  return <tr className="align-top transition hover:bg-raised/55">
    <td className="px-6 py-4"><strong className="block font-extrabold text-primary">{record.email}</strong><span className="mt-1 block text-xs text-ink-muted">{record.is_bootstrap ? "Bootstrap owner from PLATFORM_ADMIN_EMAILS" : record.is_active ? "Managed membership" : `Revoked ${record.revoked_at ? formatDate(record.revoked_at) : ""}`}</span></td>
    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${roleTone(record.role)}`}>{PLATFORM_OPERATOR_ROLE_LABELS[record.role]}</span></td>
    <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${record.is_active ? "bg-success/10 text-success" : "bg-raised text-ink-muted"}`}>{record.is_active ? "Active" : "Revoked"}</span></td>
    <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-ink-muted">{record.created_at ? formatDate(record.created_at) : "Environment bootstrap"}</td>
    <td className="px-6 py-4 text-right">{record.is_bootstrap ? <span className="text-xs font-semibold text-ink-muted">Managed in deployment settings</span> : record.is_active ? <div className="flex flex-col items-end gap-2"><form action={roleAction} className="flex items-center gap-2"><input type="hidden" name="operator_id" value={record.id} readOnly /><label className="sr-only" htmlFor={`operator-role-${record.id}`}>Role for {record.email}</label><select id={`operator-role-${record.id}`} name="role" defaultValue={record.role} className="min-h-9 rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-xs font-semibold text-ink" disabled={!canManage || rolePending}>{PLATFORM_OPERATOR_ROLES.map((role) => <option key={role} value={role}>{PLATFORM_OPERATOR_ROLE_LABELS[role]}</option>)}</select><button type="submit" disabled={!canManage || rolePending} className="inline-flex min-h-9 items-center rounded-lg border border-line-strong bg-raised px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">{rolePending ? "Saving…" : "Save role"}</button></form><form action={revokeAction}><input type="hidden" name="operator_id" value={record.id} readOnly /><button type="submit" disabled={!canManage || revokePending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="alert" size={12} />{revokePending ? "Revoking…" : "Revoke"}</button></form></div> : <span className="text-xs font-semibold text-ink-muted">Re-invite using the form above</span>}</td>
  </tr>;
}

function ActionMessage({ state }: { state: OperatorActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-btn border px-3 py-2.5 text-xs font-semibold leading-5 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function roleTone(role: PlatformOperatorRole) {
  return role === "owner" ? "bg-primary text-primary-fg" : role === "billing" ? "bg-primary-soft text-primary" : role === "support" ? "bg-warning/15 text-ink" : "bg-raised text-ink-muted";
}

function operatorAuditLabel(action: string) {
  return action === "platform.operator.invited" ? "Operator invited" : action === "platform.operator.reactivated" ? "Operator reactivated" : action === "platform.operator.role_changed" ? "Operator role changed" : action === "platform.operator.revoked" ? "Operator revoked" : action;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
