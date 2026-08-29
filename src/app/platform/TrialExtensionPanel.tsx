"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import {
  previewExtendedTrialEnd,
  trialExtensionBlockMessage,
  TRIAL_EXTENSION_DEFAULT_DAYS,
  TRIAL_EXTENSION_MAX_DAYS_LIFETIME,
  type TrialExtensionEligibility,
  type TrialExtensionRecord,
} from "@/lib/platform-trial";
import { extendOrganizationTrial, type OperationsActionState } from "./operations-actions";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

type TrialExtensionPanelProps = {
  orgId: string;
  extensions: TrialExtensionRecord[];
  eligibility: TrialExtensionEligibility;
  schemaAvailable: boolean;
  policyGateOpen: boolean;
  trialEndsAt: string | null;
  trialRemainingLabel: string;
  asOf: string;
};

export function TrialExtensionPanel({ orgId, extensions, eligibility, schemaAvailable, policyGateOpen, trialEndsAt, trialRemainingLabel, asOf }: TrialExtensionPanelProps) {
  const [state, action, pending] = useActionState(extendOrganizationTrial, INITIAL_STATE);
  const maxDays = Math.max(1, eligibility.maxDays);
  const [days, setDays] = useState(Math.min(TRIAL_EXTENSION_DEFAULT_DAYS, maxDays));

  const locked = !schemaAvailable || !policyGateOpen || !eligibility.canExtend;
  const lockMessage = !schemaAvailable
    ? "Apply migration 0075_extend_organization_trial.sql to enable trial extensions."
    : !policyGateOpen
      ? "Publish both platform policies to unlock trial extensions."
      : trialExtensionBlockMessage(eligibility.block);

  const asOfMs = Date.parse(asOf);
  const preview = Number.isFinite(asOfMs) ? previewExtendedTrialEnd(trialEndsAt, days, asOfMs) : null;
  const usedPercent = Math.min(100, Math.round((eligibility.daysUsed / TRIAL_EXTENSION_MAX_DAYS_LIFETIME) * 100));

  return (
    <section className="mt-8 overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--shadow-card)]" aria-labelledby="trial-extension-heading">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Platform entitlement</p>
            <h2 id="trial-extension-heading" className="mt-1 text-xl font-extrabold">Trial extension</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Move the trial itself, so the owner&apos;s countdown and billing page show the new date. A live trial is extended from where it ends; an expired one reopens from today. Accounts paused for a billing failure are never reopened here.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary"><AdminIcon name="bell" size={14} /> {eligibility.daysUsed} of {TRIAL_EXTENSION_MAX_DAYS_LIFETIME} operator days used</span>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] sm:p-6">
        <form action={action} className="rounded-[18px] border border-primary/15 bg-primary-soft/45 p-4 sm:p-5">
          <input type="hidden" name="organization_id" value={orgId} />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Add days</p>
            <h3 className="mt-1 text-base font-extrabold">Extend this trial</h3>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Currently {trialRemainingLabel.toLowerCase()}. Up to {maxDays} day{maxDays === 1 ? "" : "s"} can be added in this action.</p>
          </div>
          <fieldset disabled={locked || pending} className="mt-4 space-y-3">
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`trial-days-${orgId}`}>Trial days
              <input
                id={`trial-days-${orgId}`}
                name="days"
                type="number"
                min={1}
                max={maxDays}
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                required
                className={CONTROL_CLASS}
              />
            </label>
            <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`trial-reason-${orgId}`}>Reason
              <textarea id={`trial-reason-${orgId}`} name="reason" rows={4} minLength={5} maxLength={500} required placeholder="Example: onboarding delayed while the owner waited on hardware" className={`${CONTROL_CLASS} resize-y`} />
            </label>
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-btn bg-primary px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              <AdminIcon name="bell" size={14} />
              {pending ? "Extending…" : "Extend trial"}
            </button>
          </fieldset>
          {!locked && preview && <p className="mt-3 rounded-btn border border-primary/20 bg-surface px-3 py-2 text-[11px] font-semibold leading-4 text-ink-muted">New trial end: <strong className="text-ink">{formatTrialDate(preview)}</strong>{eligibility.revives ? " · the expired trial reopens" : ""}</p>}
          {locked && lockMessage && <p role="status" className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={13} />{lockMessage}</p>}
          {state.message && <ActionMessage state={state} />}
        </form>

        <div>
          <div className="rounded-[18px] border border-line bg-raised/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-subtle">Operator-added days</p>
              <p className="text-xs font-extrabold text-ink">{eligibility.daysUsed} used · {eligibility.daysRemaining} left</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${eligibility.daysUsed} of ${TRIAL_EXTENSION_MAX_DAYS_LIFETIME} operator-added trial days used`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-muted">A lifetime ceiling of {TRIAL_EXTENSION_MAX_DAYS_LIFETIME} days keeps repeated small extensions from carrying an account indefinitely. Past the ceiling, use a complimentary Premium grant so the decision is recorded as one.</p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Extension history</p>
            <h3 className="mt-1 text-base font-extrabold">Every operator change to this trial</h3>
          </div>
          {extensions.length === 0
            ? <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-raised px-4 py-8 text-center text-sm leading-6 text-ink-muted">No operator has extended this organization&apos;s trial.</div>
            : <div className="mt-4 overflow-x-auto rounded-xl border border-line"><table className="min-w-[620px] w-full text-left text-xs"><thead className="bg-raised uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-3 font-extrabold">Applied</th><th className="px-4 py-3 font-extrabold">Days</th><th className="px-4 py-3 font-extrabold">New trial end</th><th className="px-4 py-3 font-extrabold">Reason</th></tr></thead><tbody className="divide-y divide-line">{extensions.map((extension) => <tr key={extension.id} className="align-top"><td className="whitespace-nowrap px-4 py-3 font-semibold text-ink-muted">{formatTrialDate(extension.created_at)}{extension.revived && <span className="mt-1 block rounded-full bg-warning/15 px-2 py-0.5 text-center text-[10px] font-extrabold uppercase tracking-wide text-ink">Reopened</span>}</td><td className="whitespace-nowrap px-4 py-3 font-extrabold text-ink">+{extension.days}</td><td className="whitespace-nowrap px-4 py-3 font-semibold text-ink-muted">{formatTrialDate(extension.new_trial_ends_at)}</td><td className="max-w-[260px] px-4 py-3 leading-5 text-ink-muted">{extension.reason}</td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </section>
  );
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-btn border px-3 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function formatTrialDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
