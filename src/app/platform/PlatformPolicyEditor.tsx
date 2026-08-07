"use client";

import { useActionState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  policyStatusLabel,
  policyStatusTone,
  readPolicyNumber,
  readPolicyText,
  type PlatformPolicy,
  type PlatformPolicyKey,
} from "@/lib/platform-operations";
import { savePlatformPolicy, type PlatformActionState } from "./actions";

const INITIAL_STATE: PlatformActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

export function PlatformPolicyEditor({ policy, schemaAvailable }: { policy: PlatformPolicy; schemaAvailable: boolean }) {
  const [state, formAction, pending] = useActionState(savePlatformPolicy, INITIAL_STATE);
  const isBilling = policy.key === "billing";

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="policy_key" value={policy.key} readOnly />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex rounded-pill px-3 py-1.5 text-xs font-extrabold ${policyStatusTone(policy.status)}`}>{policyStatusLabel(policy.status)}</span>
        <span className="text-[11px] font-semibold text-ink-muted">Version {policy.version}</span>
      </div>

      <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`${policy.key}-summary`}>Policy summary
        <textarea id={`${policy.key}-summary`} name="summary" defaultValue={policy.summary} rows={2} maxLength={500} className={`${CONTROL_CLASS} resize-y`} disabled={!schemaAvailable || pending} />
      </label>

      {isBilling ? <BillingPolicyFields policy={policy} disabled={!schemaAvailable || pending} /> : <SupportPolicyFields policy={policy} disabled={!schemaAvailable || pending} />}

      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-4 py-3 text-sm font-semibold ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>}
      {!schemaAvailable && <p role="status" className="rounded-btn border border-warning/35 bg-warning/10 px-4 py-3 text-xs font-semibold leading-5 text-ink">Policy storage is not active yet. Apply migration <code className="font-extrabold">0027_platform_operations.sql</code> to edit or publish this policy.</p>}

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
        <button type="submit" name="intent" value="draft" disabled={!schemaAvailable || pending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-btn bg-secondary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary transition hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : "Save draft"}</button>
        <button type="submit" name="intent" value="publish" disabled={!schemaAvailable || pending} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"><AdminIcon name="check" size={15} /> Publish policy</button>
      </div>
    </form>
  );
}

function BillingPolicyFields({ policy, disabled }: { policy: PlatformPolicy; disabled: boolean }) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Billing policy controls</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField id="billing-trial-days" name="trial_days" label="Trial period" suffix="days" value={readPolicyNumber(policy, "trialDays", 14)} min={0} max={365} disabled={disabled} />
        <NumberField id="billing-grace-days" name="payment_grace_days" label="Payment grace" suffix="days" value={readPolicyNumber(policy, "paymentGraceDays", 7)} min={0} max={90} disabled={disabled} />
        <NumberField id="billing-refund-days" name="refund_window_days" label="Refund window" suffix="days" value={readPolicyNumber(policy, "refundWindowDays", 7)} min={0} max={365} disabled={disabled} />
        <NumberField id="billing-notice-days" name="price_change_notice_days" label="Price-change notice" suffix="days" value={readPolicyNumber(policy, "priceChangeNoticeDays", 30)} min={0} max={365} disabled={disabled} />
      </div>
      <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="billing-annual-renewal">Annual renewal behavior
        <select id="billing-annual-renewal" name="annual_renewal" defaultValue={readPolicyText(policy, "annualRenewal", "auto_renew")} className={CONTROL_CLASS} disabled={disabled}>
          <option value="auto_renew">Auto-renew unless canceled</option>
          <option value="manual_review">Manual renewal review</option>
        </select>
      </label>
      <p className="rounded-btn bg-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">These values are policy inputs, not live enforcement yet. Checkout and suspension rules stay unavailable until both policy documents are published.</p>
    </fieldset>
  );
}

function SupportPolicyFields({ policy, disabled }: { policy: PlatformPolicy; disabled: boolean }) {
  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Support policy controls</legend>
      <NumberField id="support-response-hours" name="first_response_hours" label="First response target" suffix="hours" value={readPolicyNumber(policy, "firstResponseHours", 24)} min={1} max={720} disabled={disabled} />
      <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="support-hours">Coverage hours
        <input id="support-hours" name="support_hours" type="text" defaultValue={readPolicyText(policy, "supportHours", "Monday to Friday, 9:00 AM to 5:00 PM PHT")} maxLength={160} className={CONTROL_CLASS} disabled={disabled} />
      </label>
      <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="support-email">Support email
        <input id="support-email" name="support_email" type="email" defaultValue={readPolicyText(policy, "supportEmail")} maxLength={160} placeholder="support@yourdomain.com" className={CONTROL_CLASS} disabled={disabled} />
      </label>
      <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor="support-escalation">Escalation and account-recovery path
        <textarea id="support-escalation" name="escalation_path" defaultValue={readPolicyText(policy, "escalationPath")} maxLength={500} rows={3} placeholder="Who reviews urgent cases, and how can an owner appeal a suspension?" className={`${CONTROL_CLASS} resize-y`} disabled={disabled} />
      </label>
    </fieldset>
  );
}

function NumberField({ id, name, label, suffix, value, min, max, disabled }: { id: string; name: string; label: string; suffix: string; value: number; min: number; max: number; disabled: boolean }) {
  return (
    <label className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={id}>{label}
      <div className="relative">
        <input id={id} name={name} type="number" min={min} max={max} step="1" defaultValue={value} className={`${CONTROL_CLASS} pr-16`} disabled={disabled} />
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[11px] font-bold text-ink-muted">{suffix}</span>
      </div>
    </label>
  );
}

export function PolicyCardHeading({ policy }: { policy: PlatformPolicy }) {
  const isBilling = policy.key === "billing";
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isBilling ? "bg-primary-soft text-primary" : "bg-secondary text-primary"}`}><AdminIcon name={isBilling ? "wallet" : "help"} size={18} /></span>
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{isBilling ? "Billing policy" : "Support policy"}</p>
        <h2 className="mt-1 text-xl font-extrabold">{isBilling ? "Decide the billing contract" : "Set the support promise"}</h2>
        <p className="mt-1 text-sm leading-5 text-ink-muted">{isBilling ? "Write down the rules the checkout and account lifecycle will enforce." : "Give owners a clear response, escalation, and recovery path."}</p>
      </div>
    </div>
  );
}

export function policyKeyLabel(key: PlatformPolicyKey) {
  return key === "billing" ? "Billing" : "Support";
}
