"use client";

import { useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { recordOrderAction, recordOrderReprint } from "@/app/admin/orders/actions";
import { AdminIcon } from "@/components/admin/AdminIcon";
import { getPrinter, loadPrinterSettings } from "@/lib/printer";
import { buildReceipt } from "@/lib/receipt";

type OrderStatus = "completed" | "voided" | "refunded";

type OrderActionItem = {
  name_snapshot: string;
  qty: number;
  weight_kg: number | null;
  line_total: number;
};

type OrderActionOrder = {
  id: string;
  order_no: string;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  discount_ref: string | null;
  vatable_sale: number;
  vat_amount: number;
  vat_exempt_sale: number;
  total: number;
  payment_method: string;
  payment_ref: string | null;
  amount_tendered: number | null;
  change_due: number | null;
  created_at_device: string;
};

function subscribeOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineStatus() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getServerOnlineStatus() {
  return true;
}

function OrderActionSubmit({ action }: { action: "voided" | "refunded" }) {
  const { pending } = useFormStatus();
  const isVoid = action === "voided";

  return (
    <button
      type="submit"
      name="order_action"
      value={action}
      disabled={pending}
      className={`min-h-10 flex-1 rounded-btn px-3 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isVoid
          ? "border border-danger/30 bg-danger-soft text-danger hover:border-danger/50"
          : "bg-primary text-primary-fg hover:bg-primary-hover"
      }`}
    >
      {pending ? "Saving..." : isVoid ? "Void order" : "Refund order"}
    </button>
  );
}

export function AdminOrderActions({
  order,
  items,
  branchName,
  branchAddress,
  branchTin,
  branchVatRegistered,
  branchVatRate,
  cashierName,
  returnTo,
  canManage,
  canReprint,
  className = "",
  hasReversal,
  readOnlyReason,
}: {
  order: OrderActionOrder;
  items: OrderActionItem[];
  branchName: string;
  branchAddress: string | null;
  branchTin: string | null;
  branchVatRegistered: boolean;
  branchVatRate: number;
  cashierName: string;
  returnTo: string;
  canManage: boolean;
  canReprint: boolean;
  className?: string;
  hasReversal: boolean;
  readOnlyReason?: "cached";
}) {
  const [reprintState, setReprintState] = useState<"idle" | "printing" | "success" | "error">("idle");
  const [reprintMessage, setReprintMessage] = useState("");
  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getOnlineStatus, getServerOnlineStatus);

  const reprint = async () => {
    if (!canReprint || reprintState === "printing") return;

    setReprintState("printing");
    setReprintMessage("");

    try {
      const settings = loadPrinterSettings();
      const printer = await getPrinter(settings);
      const receipt = buildReceipt({
        storeName: branchName,
        storeAddress: branchAddress,
        storeTin: branchTin,
        orderNo: order.order_no,
        cashier: cashierName,
        createdAt: new Date(order.created_at_device),
        items: items.map((item) => ({
          name: item.name_snapshot,
          qty: Number(item.qty),
          weightKg: item.weight_kg === null ? null : Number(item.weight_kg),
          lineTotal: Number(item.line_total),
        })),
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discount_amount),
        discountRef: order.discount_ref,
        vatableSale: Number(order.vatable_sale),
        vatAmount: Number(order.vat_amount),
        vatExemptSale: Number(order.vat_exempt_sale),
        vatRate: Number(order.vat_amount) > 0 ? branchVatRate : 0,
        showVat: branchVatRegistered || Number(order.vat_amount) > 0,
        total: Number(order.total),
        paymentMethod: order.payment_method,
        paymentRef: order.payment_ref,
        amountTendered: order.amount_tendered,
        changeDue: order.change_due,
        officialReceipt: false,
        isReprint: true,
        paperWidth: settings.paperWidth,
      });

      await printer.print(receipt);
      const audit = await recordOrderReprint(order.id);
      setReprintState(audit.ok ? "success" : "error");
      setReprintMessage(audit.message);
    } catch (error) {
      setReprintState("error");
      setReprintMessage(error instanceof Error ? error.message : "The receipt could not be printed.");
    }
  };

  const showActionForm = isOnline && canManage && order.status === "completed" && !hasReversal;

  return (
    <section className={`mt-5 border-t border-line pt-4 ${className}`} aria-labelledby="order-actions-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="order-actions-heading" className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Order actions</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Reprints use this browser&apos;s printer settings. Voids and refunds create an audited reversal.</p>
        </div>
        {canReprint && isOnline && (
          <button
            type="button"
            onClick={() => void reprint()}
            disabled={reprintState === "printing"}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-btn border border-line bg-surface px-3 text-xs font-extrabold text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <AdminIcon name="history" size={15} />
            {reprintState === "printing" ? "Printing..." : "Reprint"}
          </button>
        )}
      </div>

      {reprintMessage && (
        <p className={`mt-3 rounded-btn px-3 py-2 text-xs leading-5 ${reprintState === "success" ? "bg-success/10 text-success" : "bg-danger-soft text-danger"}`} role="status" aria-live="polite">
          {reprintMessage}
        </p>
      )}

      {showActionForm ? (
        <form
          action={recordOrderAction}
          className="mt-4 rounded-btn border border-warning/30 bg-warning/10 p-3"
          onSubmit={(event) => {
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const label = submitter?.value === "refunded" ? "refund" : "void";
            if (!window.confirm(`Confirm ${label} for ${order.order_no}? This will create a permanent audited reversal and return tracked stock.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="order_id" value={order.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <label className="block">
            <span className="text-xs font-extrabold text-ink">Reason required</span>
            <textarea
              name="reason"
              required
              maxLength={180}
              rows={2}
              placeholder="Example: Customer payment reversed at the counter"
              className="inventory-input mt-2 min-h-20 resize-y"
            />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <OrderActionSubmit action="voided" />
            <OrderActionSubmit action="refunded" />
          </div>
        </form>
      ) : !isOnline ? (
        <p className="mt-4 rounded-btn border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-ink">
          Offline mode is read-only. Reprint, void, and refund actions will be available after the connection returns.
        </p>
      ) : readOnlyReason === "cached" ? (
        <p className="mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">
          This cached receipt is read-only. Reopen it while online to access authorized order actions.
        </p>
      ) : canManage && hasReversal ? (
        <p className="mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">
          This order already has a void or refund action. The original sale remains available above for audit history.
        </p>
      ) : !canManage ? (
        <p className="mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">
          Manager access is read-only for order operations. An organization admin must approve voids and refunds.
        </p>
      ) : (
        <p className="mt-4 rounded-btn border border-line bg-surface-raised px-3 py-2.5 text-xs leading-5 text-ink-muted">
          Only completed orders can be voided or refunded.
        </p>
      )}

    </section>
  );
}
