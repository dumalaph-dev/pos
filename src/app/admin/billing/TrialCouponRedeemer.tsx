"use client";

import { useActionState } from "react";
import { redeemTrialCoupon, type TrialCouponState } from "./actions";

const INITIAL_STATE: TrialCouponState = { ok: false, message: "" };

export function TrialCouponRedeemer({ canRedeem }: { canRedeem: boolean }) {
  const [state, formAction, pending] = useActionState(redeemTrialCoupon, INITIAL_STATE);
  return <section className="mt-5 rounded-[18px] border border-accent/25 bg-secondary p-4 shadow-[var(--shadow-card)] sm:p-5" aria-labelledby="trial-coupon-heading">
    <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Have an offer?</p><h2 id="trial-coupon-heading" className="mt-1 text-lg font-extrabold">Redeem a free trial coupon</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Enter your code here to add free months to your trial—no plan checkout is needed. Each code can be claimed once per business account.</p></div>
    {canRedeem ? <form action={formAction} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label htmlFor="trial-coupon-code-input" className="block w-full max-w-sm text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Coupon code<input id="trial-coupon-code-input" name="coupon_code" type="text" required minLength={3} maxLength={32} autoCapitalize="characters" autoComplete="off" placeholder="WELCOME3M" className="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm font-bold uppercase text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" disabled={pending} /></label>
      <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-primary-fg disabled:opacity-50">{pending ? "Applying…" : "Apply coupon"}</button>
    </form> : <p className="mt-3 rounded-xl border border-line bg-surface/70 px-3 py-2.5 text-sm leading-5 text-ink-muted">Coupon codes can be claimed during an active, unpaid trial. This account isn&apos;t eligible to add trial months right now.</p>}
    {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
  </section>;
}
