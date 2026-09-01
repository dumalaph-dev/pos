"use client";

import { useActionState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { isComplimentaryAccessCurrent, type ComplimentaryAccessGrant } from "@/lib/platform-access";
import { grantComplimentaryPremium, revokeComplimentaryPremium, type OperationsActionState } from "./operations-actions";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

type ComplimentaryGrantPanelProps = {
  orgId: string;
  grants: ComplimentaryAccessGrant[];
  schemaAvailable: boolean;
  policyGateOpen: boolean;
  canManage: boolean;
  accountSuspended: boolean;
  asOf: string;
};

export function ComplimentaryGrantPanel({ orgId, grants, schemaAvailable, policyGateOpen, canManage, accountSuspended, asOf }: ComplimentaryGrantPanelProps) {
  const [grantState, grantAction, grantPending] = useActionState(grantComplimentaryPremium, INITIAL_STATE);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeComplimentaryPremium, INITIAL_STATE);
  const locked = !canManage || !schemaAvailable || !policyGateOpen || accountSuspended;
  const lockMessage = !canManage
    ? "Only Billing and Owner operators can change complimentary access."
    : accountSuspended
    ? "Restore the suspended account before granting tenant access."
    : !policyGateOpen
      ? "Publish both platform policies to unlock complimentary access."
      : "Apply migrations 0052_platform_access_grants.sql and 0054_atomic_platform_access_grant.sql to enable grants.";

  return (
    <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="complimentary-access-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Platform entitlement</p>
            <h2 id="complimentary-access-heading" className="mt-1 text-xl font-extrabold">Complimentary Premium access</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Add a time-bounded Premium grant without changing the organization&apos;s paid subscription, trial dates, or provider records. Paused or expired subscriptions can be restored deliberately; suspended accounts remain blocked. Every grant and revocation is audited.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="star" size={14} /> {grants.length} recorded grant{grants.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] sm:p-6">
        <form action={grantAction} className="rounded-[18px] border border-primary/15 bg-primary-soft/45 p-4 sm:p-5">
          <input type="hidden" name="organization_id" value={orgId} />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">New grant</p>
            <h3 className="mt-1 text-base font-extrabold">Give Premium days</h3>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Use a clear reason so future operators can understand why access was added. “After current access ends” follows the server-side trial or prepaid expiry boundary; paused and expired accounts start immediately.</p>
          </div>
          <fieldset disabled={locked || grantPending} className="mt-4 space-y-3">
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-days-${orgId}`}>Premium days
              <input id={`grant-days-${orgId}`} name="days" type="number" min={1} max={365} defaultValue={14} required className={CONTROL_CLASS} />
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-start-${orgId}`}>Starts
              <select id={`grant-start-${orgId}`} name="start_mode" defaultValue="after_current_access" className={CONTROL_CLASS}>
                <option value="after_current_access">After current access ends</option>
                <option value="now">Immediately</option>
              </select>
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-source-${orgId}`}>Source
              <select id={`grant-source-${orgId}`} name="source" defaultValue="manual" className={CONTROL_CLASS}>
                <option value="manual">Manual platform decision</option>
                <option value="support">Support recovery</option>
                <option value="campaign">Campaign or partnership</option>
              </select>
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-reason-${orgId}`}>Reason
              <textarea id={`grant-reason-${orgId}`} name="reason" rows={4} minLength={5} maxLength={500} required placeholder="Example: onboarding recovery after payment issue" className={`${CONTROL_CLASS} resize-y`} />
            </label>
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              <AdminIcon name="star" size={14} />
              {grantPending ? "Granting…" : "Grant Premium access"}
            </button>
          </fieldset>
          {locked && <p role="status" className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />{lockMessage}</p>}
          {grantState.message && <ActionMessage state={grantState} />}
        </form>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Grant history</p>
              <h3 className="mt-1 text-base font-extrabold">Current and past access</h3>
            </div>
            {revokeState.message && <span className="max-w-[260px]"><ActionMessage state={revokeState} /></span>}
          </div>
          {grants.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-raised px-4 py-8 text-center text-sm leading-6 text-ink-muted">No complimentary Premium grants have been recorded for this organization.</div> : <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-[700px] w-full text-left text-xs"><thead className="bg-raised uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3 font-extrabold">Status</th><th className="px-4 py-3 font-extrabold">Access window</th><th className="px-4 py-3 font-extrabold">Source</th><th className="px-4 py-3 font-extrabold">Reason</th><th className="px-4 py-3 font-extrabold">Action</th></tr></thead><tbody className="divide-y divide-line">{grants.map((grant) => <GrantRow key={grant.id} grant={grant} revokeAction={revokeAction} revokePending={revokePending} locked={locked} asOf={asOf} />)}</tbody></table></div>}
        </div>
      </div>
    </section>
  );
}

function GrantRow({ grant, revokeAction, revokePending, locked, asOf }: { grant: ComplimentaryAccessGrant; revokeAction: (formData: FormData) => void; revokePending: boolean; locked: boolean; asOf: string }) {
  const asOfMs = Date.parse(asOf);
  const current = grant.status === "active" && isComplimentaryAccessCurrent(grant.ends_at, asOfMs) && Date.parse(grant.starts_at) <= asOfMs;
  const statusLabel = grant.status === "revoked" ? "Revoked" : current ? "Current" : "Expired";
  const statusTone = grant.status === "revoked" ? "bg-raised text-ink-muted" : current ? "bg-success/10 text-success" : "bg-warning/15 text-ink";
  return <tr className="align-top"><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 font-extrabold ${statusTone}`}>{statusLabel}</span></td><td className="whitespace-nowrap px-4 py-3 font-semibold text-ink-muted"><span className="block">{formatAccessDate(grant.starts_at)}</span><span className="mt-1 block">to {formatAccessDate(grant.ends_at)}</span></td><td className="px-4 py-3 font-semibold text-ink-muted">{sourceLabel(grant.source)}</td><td className="max-w-[260px] px-4 py-3 leading-5 text-ink-muted">{grant.reason}</td><td className="px-4 py-3">{grant.status === "active" ? <form action={revokeAction}><input type="hidden" name="grant_id" value={grant.id} /><button type="submit" disabled={locked || revokePending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 font-extrabold text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="alert" size={13} />{revokePending ? "Revoking…" : "Revoke"}</button></form> : <span className="text-ink-subtle">—</span>}</td></tr>;
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-btn border px-3 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function formatAccessDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function sourceLabel(value: ComplimentaryAccessGrant["source"]) {
  return value === "support" ? "Support recovery" : value === "campaign" ? "Campaign" : value === "referral" ? "Referral" : "Manual";
}
