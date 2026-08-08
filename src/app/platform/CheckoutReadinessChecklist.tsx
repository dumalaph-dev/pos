import Link from "next/link";
import { AdminIcon } from "@/components/admin/AdminIcon";
import type { CheckoutReadiness, CheckoutReadinessItem } from "@/lib/platform-operations";

export function CheckoutReadinessChecklist({ readiness }: { readiness: CheckoutReadiness }) {
  const nextAction = readiness.remainingActions[0];

  return (
    <article className="rounded-[22px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="checkout-readiness-heading">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${readiness.ready ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}><AdminIcon name={readiness.ready ? "check" : "wallet"} size={18} /></span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Checkout readiness</p>
          <h2 id="checkout-readiness-heading" className="mt-1 text-xl font-extrabold">{readiness.ready ? "Checkout can be enabled" : "Complete the checklist first"}</h2>
          <p className="mt-1 text-sm leading-5 text-ink-muted">Configuration is checked by status only. PayMongo key and webhook values are never rendered here.</p>
        </div>
        <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${readiness.ready ? "bg-success/10 text-success" : "bg-warning/15 text-ink"}`}>{readiness.ready ? "Ready" : `${readiness.remainingActions.length} remaining`}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/platform/plans#pricing-settings" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-raised px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="wallet" size={13} /> Plans & Pricing</Link>
        <Link href="/platform/policies#billing-policy" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-raised px-3 py-2 text-[11px] font-extrabold text-primary transition hover:border-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><AdminIcon name="lock" size={13} /> Policies</Link>
      </div>

      <div className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised" role="list" aria-label="Checkout readiness checks">
        {readiness.items.map((item) => <ReadinessItemRow key={item.id} item={item} />)}
      </div>

      <div className={`mt-5 rounded-xl border px-4 py-3.5 ${readiness.ready ? "border-success/25 bg-success/10" : "border-warning/30 bg-warning/10"}`} role={readiness.ready ? "status" : "alert"}>
        {readiness.ready ? (
          <div className="flex items-start gap-2.5 text-sm font-semibold leading-5 text-ink"><span className="mt-0.5 text-success"><AdminIcon name="check" size={15} /></span><p>All checks pass. Keep the provider credentials in the server environment before enabling live checkout.</p></div>
        ) : (
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-accent"><AdminIcon name="alert" size={15} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-muted">Next required action</p>
              <p className="mt-1 text-sm font-extrabold leading-5 text-ink">{nextAction?.action ?? "Review the checklist and complete the remaining setup."}</p>
              {nextAction?.href && <Link href={nextAction.href} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-fg transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{nextAction.linkLabel ?? "Open workspace"}<AdminIcon name="arrow" size={13} /></Link>}
              {readiness.remainingActions.length > 1 && <p className="mt-2 text-xs font-semibold leading-5 text-ink-muted">Complete the other {readiness.remainingActions.length - 1} remaining {readiness.remainingActions.length - 1 === 1 ? "action" : "actions"} after this one.</p>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ReadinessItemRow({ item }: { item: CheckoutReadinessItem }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-3" role="listitem">
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${item.ready ? "bg-success text-primary-fg" : "bg-secondary text-ink-muted"}`}><AdminIcon name={item.ready ? "check" : "alert"} size={12} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-extrabold text-ink">{item.label}</p>
          <span className={`text-[11px] font-extrabold ${item.ready ? "text-success" : "text-ink-muted"}`}>{item.ready ? "Ready" : "Action needed"}</span>
        </div>
        <p className={`mt-1 text-xs leading-5 ${item.ready ? "text-ink-muted" : "font-semibold text-ink"}`}>{item.ready ? item.detail : item.action}</p>
        {!item.ready && item.href && <Link href={item.href} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-primary transition hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{item.linkLabel ?? "Open workspace"}<AdminIcon name="arrow" size={12} /></Link>}
      </div>
    </div>
  );
}
