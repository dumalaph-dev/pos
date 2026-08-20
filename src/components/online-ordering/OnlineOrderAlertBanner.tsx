"use client";

import { AdminIcon } from "@/components/admin/AdminIcon";
import type { OnlineOrderAttentionRecord } from "@/lib/online-order-alerts";

export function OnlineOrderAlertBanner({
  surface,
  orders,
  announcement,
  attentionPulse,
  queueHref,
}: {
  surface: "admin" | "pos";
  orders: readonly OnlineOrderAttentionRecord[];
  announcement: string;
  attentionPulse: number;
  queueHref?: string;
}) {
  const orderNumbers = orders
    .slice(0, 3)
    .map((order) => order.orderNo)
    .join(", ");
  const extraOrderCount = Math.max(0, orders.length - 3);
  const detail = orders.length === 1
    ? `Order ${orderNumbers} is waiting for acknowledgment.`
    : `${orderNumbers}${extraOrderCount > 0 ? ` and ${extraOrderCount} more` : ""} are waiting for acknowledgment.`;

  return (
    <>
      {orders.length > 0 && (
        <section
          key={attentionPulse}
          className={surface === "pos"
            ? `online-order-alert online-order-alert--pos${attentionPulse > 0 ? " is-pulsing" : ""}`
            : `mt-5 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3 text-danger shadow-sm${attentionPulse > 0 ? " ring-2 ring-danger/15" : ""}`}
          data-online-order-alert={surface}
          data-attention-pulse={attentionPulse}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={surface === "pos" ? "online-order-alert__icon" : "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-danger/10"}>
            <AdminIcon name="bell" size={surface === "pos" ? 20 : 17} />
          </span>
          <span className={surface === "pos" ? "online-order-alert__copy" : "min-w-0"}>
            <strong className={surface === "pos" ? undefined : "block text-sm font-extrabold"}>
              {orders.length === 1 ? `New online pickup order · ${orderNumbers}` : `${orders.length} new online pickup orders`}
            </strong>
            <span className={surface === "pos" ? undefined : "mt-0.5 block text-xs font-semibold text-ink-muted"}>{detail}</span>
            <small className={surface === "pos" ? undefined : "mt-1 block text-[11px] font-semibold text-ink-muted"}>
              The alert clears when the order is acknowledged or moved forward.
            </small>
          </span>
          {surface === "pos" && queueHref && <a className="online-order-alert__link" href={queueHref}>Open order queue</a>}
        </section>
      )}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </>
  );
}
