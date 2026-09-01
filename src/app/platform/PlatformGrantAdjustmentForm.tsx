"use client";

import { useActionState, useState } from "react";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { adjustComplimentaryPremium, type OperationsActionState } from "./operations-actions";

const INITIAL_STATE: OperationsActionState = { ok: false, message: "" };
const CONTROL_CLASS = "mt-1 w-full rounded-btn border border-line-strong bg-raised px-3 py-2.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";
const DAY_MS = 24 * 60 * 60 * 1000;

export function PlatformGrantAdjustmentForm({ grantId, endsAt, locked, lockMessage, compact = false }: {
  grantId: string;
  endsAt: string;
  locked: boolean;
  lockMessage?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(adjustComplimentaryPremium, INITIAL_STATE);
  const [deltaDays, setDeltaDays] = useState(7);
  const preview = previewEnd(endsAt, deltaDays);
  const defaultLockMessage = "Apply migration 0078_adjust_platform_access_grant.sql to adjust grants in place.";

  return <details className={`group rounded-btn border border-line bg-surface ${compact ? "" : "min-w-[180px]"}`}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wide text-primary [&::-webkit-details-marker]:hidden">
      <span className="inline-flex items-center gap-1.5"><AdminIcon name="refresh" size={13} /> Adjust</span>
      <span className="text-ink-subtle transition group-open:rotate-180">⌄</span>
    </summary>
    <form action={action} className="space-y-3 border-t border-line px-3 pb-3 pt-3">
      <input type="hidden" name="grant_id" value={grantId} />
      <fieldset disabled={locked || pending} className="space-y-3">
        <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-delta-${grantId}`}>Days to add or remove
          <input id={`grant-delta-${grantId}`} name="delta_days" type="number" min={-365} max={365} value={deltaDays} onChange={(event) => setDeltaDays(Number(event.target.value))} required className={CONTROL_CLASS} />
        </label>
        <p className="text-[10px] leading-4 text-ink-muted">Use a negative number to shorten. Shortening never revokes immediately; use Revoke for that.</p>
        {preview && <p className="rounded-lg border border-primary/15 bg-primary-soft px-3 py-2 text-[11px] font-semibold leading-4 text-ink-muted">New end: <strong className="text-ink">{formatDate(preview)}</strong></p>}
        <label className="block text-[11px] font-extrabold uppercase tracking-wide text-ink-muted" htmlFor={`grant-adjustment-reason-${grantId}`}>Adjustment reason
          <textarea id={`grant-adjustment-reason-${grantId}`} name="reason" rows={3} minLength={5} maxLength={500} required placeholder="Why is this access window changing?" className={`${CONTROL_CLASS} resize-y`} />
        </label>
        <button type="submit" className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : "Save adjustment"}</button>
      </fieldset>
      {locked && <p role="status" className="flex items-start gap-1.5 text-[10px] font-semibold leading-4 text-ink-muted"><AdminIcon name="lock" size={12} />{lockMessage ?? defaultLockMessage}</p>}
      {state.message && <ActionMessage state={state} />}
    </form>
  </details>;
}

function ActionMessage({ state }: { state: OperationsActionState }) {
  return <p role={state.ok ? "status" : "alert"} className={`rounded-btn border px-3 py-2 text-[11px] font-semibold leading-4 ${state.ok ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger-soft text-danger"}`}>{state.message}</p>;
}

function previewEnd(value: string, deltaDays: number) {
  const end = Date.parse(value);
  if (!Number.isFinite(end) || !Number.isInteger(deltaDays) || deltaDays === 0) return null;
  return new Date(end + deltaDays * DAY_MS).toISOString();
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(date);
}
