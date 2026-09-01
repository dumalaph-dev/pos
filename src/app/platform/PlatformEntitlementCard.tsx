"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import type { PlatformEntitlementSummary } from "@/lib/platform-entitlements";
import { extendOrganizationTrial, grantComplimentaryPremium, revokeComplimentaryPremium, type OperationsActionState } from "./operations-actions";
import { PlatformGrantAdjustmentForm } from "./PlatformGrantAdjustmentForm";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function PlatformEntitlementCard({ summary, grantSchemaAvailable, adjustmentSchemaAvailable, trialSchemaAvailable, policyGateOpen, canManage }: {
  summary: PlatformEntitlementSummary;
  grantSchemaAvailable: boolean;
  adjustmentSchemaAvailable: boolean;
  trialSchemaAvailable: boolean;
  policyGateOpen: boolean;
  canManage: boolean;
}) {
  const [trialState, trialAction, trialPending] = useActionState(extendOrganizationTrial, INITIAL_STATE);
  const [grantState, grantAction, grantPending] = useActionState(grantComplimentaryPremium, INITIAL_STATE);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeComplimentaryPremium, INITIAL_STATE);
  const [trialDays, setTrialDays] = useState(Math.min(7, Math.max(1, summary.trialExtension.maxDays)));
  const [grantDays, setGrantDays] = useState(14);
  const grantLocked = !canManage || !grantSchemaAvailable || !policyGateOpen || summary.accountStatus === "suspended";
  const trialLocked = !canManage || !trialSchemaAvailable || !policyGateOpen || !summary.trialExtension.canExtend;
  const grantLockMessage = !canManage
    ? "Only Billing and Owner operators can change entitlements."
    : summary.accountStatus === "suspended"
      ? "Restore the suspended account before granting tenant access."
      : !policyGateOpen
        ? "Publish both platform policies to unlock entitlement actions."
        : !grantSchemaAvailable
          ? "Apply migrations 0052_platform_access_grants.sql and 0054_atomic_platform_access_grant.sql to enable grants."
          : undefined;
  const trialLockMessage = !canManage
    ? "Only Billing and Owner operators can extend a trial."
    : !trialSchemaAvailable
      ? "Apply migration 0075_extend_organization_trial.sql to enable trial extensions."
      : !policyGateOpen
        ? "Publish both platform policies to unlock trial extensions."
        : summary.trialExtension.block !== "none"
          ? trialBlockMessage(summary.trialExtension.block)
          : undefined;
  const currentGrant = summary.currentGrant;

  return <article className="rounded-[18px] border border-line bg-raised p-4 shadow-[var(--shadow-card)]">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/platform/organizations/${summary.organizationId}`} className="truncate font-extrabold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{summary.organizationName}</Link>
          <StatusPill state={summary.accessState} />
        </div>
        <p className="mt-1 text-xs font-semibold text-ink-muted">{summary.accessLabel} · {summary.accessDetail} · {summary.organizationId.slice(0, 8)}</p>
      </div>
      <Link href={`/platform/organizations/${summary.organizationId}`} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Full record <AdminIcon name="arrow" size={12} /></Link>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <EntitlementMetric label="Trial end" value={summary.trial.endsAt ? formatDate(summary.trial.endsAt) : "—"} detail={summary.trial.known ? formatTrialDetail(summary) : "No trial window"} />
      <EntitlementMetric label="Current grant" value={currentGrant ? formatDate(currentGrant.endsAt) : "None"} detail={currentGrant ? `${sourceLabel(currentGrant.source)} · access end` : "No platform grant carrying access"} />
      <EntitlementMetric label="Paid branch capacity" value={`${summary.paidBranch.entitledCount} slot${summary.paidBranch.entitledCount === 1 ? "" : "s"}`} detail={`${summary.paidBranch.includedCount} included · ${summary.paidBranch.paidAddOnCount} paid add-on${summary.paidBranch.paidAddOnCount === 1 ? "" : "s"}`} />
      <EntitlementMetric label="Branch usage" value={`${summary.paidBranch.activeCount} active`} detail={summary.paidBranch.pendingCount ? `${summary.paidBranch.pendingCount} pending paid capacity` : "No pending capacity change"} />
    </div>

    {summary.filterKeys.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{summary.filterKeys.map((filter) => <span key={filter} className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">{filterLabel(filter)}</span>)}</div>}

    <details className="group mt-4 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-extrabold text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><AdminIcon name="refresh" size={14} /> Inline entitlement controls</span>
        <span className="text-ink-subtle transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-line p-3.5">
        <div className="grid gap-3 lg:grid-cols-2">
          <form action={trialAction} className="rounded-xl border border-primary/15 bg-primary-soft/45 p-3.5">
            <input type="hidden" name="organization_id" value={summary.organizationId} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Trial control</p>
            <p className="mt-1 text-sm font-extrabold">Add trial days</p>
            <fieldset disabled={trialLocked || trialPending} className="mt-3 space-y-2.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-trial-days-${summary.organizationId}`}>Days
                <input id={`inline-trial-days-${summary.organizationId}`} name="days" type="number" min={1} max={Math.max(1, summary.trialExtension.maxDays)} value={trialDays} onChange={(event) => setTrialDays(Number(event.target.value))} required className={CONTROL_CLASS} />
              </label>
              <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-trial-reason-${summary.organizationId}`}>Reason
                <textarea id={`inline-trial-reason-${summary.organizationId}`} name="reason" rows={2} minLength={5} maxLength={500} required placeholder="Why should this trial move?" className={`${CONTROL_CLASS} resize-y`} />
              </label>
              <button type="submit" className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{trialPending ? "Extending…" : "Extend trial"}</button>
            </fieldset>
            {trialLocked && <LockNote message={trialLockMessage ?? "Trial extensions are unavailable for this account."} />}
            {trialState.message && <ActionMessage state={trialState} />}
          </form>

          <form action={grantAction} className="rounded-xl border border-primary/15 bg-primary-soft/45 p-3.5">
            <input type="hidden" name="organization_id" value={summary.organizationId} />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Grant control</p>
            <p className="mt-1 text-sm font-extrabold">Grant Premium access</p>
            <fieldset disabled={grantLocked || grantPending} className="mt-3 space-y-2.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-grant-days-${summary.organizationId}`}>Premium days
                <input id={`inline-grant-days-${summary.organizationId}`} name="days" type="number" min={1} max={365} value={grantDays} onChange={(event) => setGrantDays(Number(event.target.value))} required className={CONTROL_CLASS} />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-grant-start-${summary.organizationId}`}>Starts
                  <select id={`inline-grant-start-${summary.organizationId}`} name="start_mode" defaultValue="after_current_access" className={CONTROL_CLASS}><option value="after_current_access">After current access</option><option value="now">Immediately</option></select>
                </label>
                <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-grant-source-${summary.organizationId}`}>Source
                  <select id={`inline-grant-source-${summary.organizationId}`} name="source" defaultValue="manual" className={CONTROL_CLASS}><option value="manual">Manual</option><option value="support">Support</option><option value="campaign">Campaign</option></select>
                </label>
              </div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`inline-grant-reason-${summary.organizationId}`}>Reason
                <textarea id={`inline-grant-reason-${summary.organizationId}`} name="reason" rows={2} minLength={5} maxLength={500} required placeholder="Why is access being granted?" className={`${CONTROL_CLASS} resize-y`} />
              </label>
              <button type="submit" className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{grantPending ? "Granting…" : "Grant Premium access"}</button>
            </fieldset>
            {grantLocked && <LockNote message={grantLockMessage ?? "Grant changes are unavailable for this account."} />}
            {grantState.message && <ActionMessage state={grantState} />}
          </form>
        </div>

        {currentGrant && <div className="mt-3 rounded-xl border border-success/20 bg-success/10 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-success">Current grant</p><p className="mt-1 text-sm font-extrabold">{sourceLabel(currentGrant.source)} through {formatDate(currentGrant.endsAt)}</p><p className="mt-1 text-[11px] leading-4 text-ink-muted">Original reason: {currentGrant.reason}</p></div>
            <form action={revokeAction}><input type="hidden" name="grant_id" value={currentGrant.id} /><button type="submit" disabled={grantLocked || revokePending} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="alert" size={13} />{revokePending ? "Revoking…" : "Revoke"}</button></form>
          </div>
          <div className="mt-3"><PlatformGrantAdjustmentForm grantId={currentGrant.id} endsAt={currentGrant.endsAt} locked={grantLocked || !adjustmentSchemaAvailable} lockMessage={!adjustmentSchemaAvailable ? "Apply migration 0078_adjust_platform_access_grant.sql to adjust grants in place." : grantLockMessage} compact /></div>
          {revokeState.message && <ActionMessage state={revokeState} />}
        </div>}
      </div>
    </details>
  </article>;
}

function EntitlementMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-line bg-surface px-3 py-2.5"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">{label}</p><p className="mt-1 text-sm font-extrabold text-ink">{value}</p><p className="mt-1 text-[10px] font-semibold leading-4 text-ink-muted">{detail}</p></div>;
}

function StatusPill({ state }: { state: PlatformEntitlementSummary["accessState"] }) {
  const tone = state === "grant" || state === "paid" ? "bg-success/10 text-success" : state === "trial" ? "bg-primary-soft text-primary" : state === "suspended" || state === "ended" ? "bg-danger-soft text-danger" : "bg-raised text-ink-muted";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${tone}`}>{state === "grant" ? "Grant" : state === "paid" ? "Paid" : state === "trial" ? "Trial" : state === "suspended" ? "Suspended" : state === "ended" ? "Ended" : state === "paused" ? "Paused" : "Unknown"}</span>;
}

function LockNote({ message }: { message: string }) {
  return <p role="status" className="mt-3 flex items-start gap-1.5 text-[10px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={12} />{message}</p>;
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-lg border px-3 py-2 text-[10px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function formatTrialDetail(summary: PlatformEntitlementSummary) {
  if (summary.trial.isActive) return summary.trial.remainingMs === null ? "Live" : `${formatTrialRemaining(summary.trial.remainingMs)} · ${summary.trialExtension.daysUsed} operator days used`;
  return summary.trial.isExpired ? "Ended" : "Not scheduled";
}

function formatTrialRemaining(remainingMs: number | null) {
  if (remainingMs === null) return "Live";
  if (remainingMs <= 0) return "Ended";
  return `${Math.ceil(remainingMs / (24 * 60 * 60 * 1000))} day${Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) === 1 ? "" : "s"} left`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}

function sourceLabel(value: NonNullable<PlatformEntitlementSummary["currentGrant"]>["source"]) {
  return value === "support" ? "Support recovery" : value === "campaign" ? "Campaign" : value === "referral" ? "Referral" : "Manual";
}

function filterLabel(value: string) {
  return value === "trial_expiring" ? "Trial <7d" : value === "grant_expiring" ? "Grant <7d" : value === "in_trial" ? "In trial" : value === "on_grant" ? "On grant" : value === "paused" ? "Paused" : value === "suspended" ? "Suspended" : value;
}

function trialBlockMessage(block: PlatformEntitlementSummary["trialExtension"]["block"]) {
  switch (block) {
    case "account_suspended": return "Restore the suspended account before extending its trial.";
    case "billing_pause": return "This account is paused for a billing failure. Resolve the payment instead.";
    case "billing_subscription": return "This account is on a paid subscription. Use a complimentary grant instead.";
    case "cap_reached": return "The trial extension ceiling is reached. Use a complimentary grant instead.";
    default: return "This organization has no trial state to extend.";
  }
}
