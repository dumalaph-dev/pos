import type { PaymentPreview, RuntimePaymentMethod } from "./types.ts";

export type OrderState =
  | { status: "empty" }
  | { status: "editing" }
  | { status: "paying"; preview: PaymentPreview | null }
  | { status: "saved"; orderNo: string; change: number | null };

export type OrderEvent =
  | { type: "cart_changed"; lineCount: number }
  | { type: "start_payment"; preview: PaymentPreview | null }
  | { type: "update_payment"; preview: PaymentPreview }
  | { type: "cancel_payment" }
  | { type: "saved"; orderNo: string; change: number | null }
  | { type: "dismiss_saved" };

export function orderReducer(state: OrderState, event: OrderEvent): OrderState {
  switch (event.type) {
    case "cart_changed":
      if (event.lineCount === 0) return { status: "empty" };
      return state.status === "paying" ? state : { status: "editing" };
    case "start_payment":
      return { status: "paying", preview: event.preview };
    case "update_payment":
      return state.status === "paying" ? { status: "paying", preview: event.preview } : state;
    case "cancel_payment":
      return state.status === "empty" ? state : { status: "editing" };
    case "saved":
      return { status: "saved", orderNo: event.orderNo, change: event.change };
    case "dismiss_saved":
      return { status: "empty" };
  }
}

export type PaymentMachineState = {
  phase: "editing" | "invalid";
  method: RuntimePaymentMethod;
  tendered: string;
  reference: string;
  error: string | null;
};

export type PaymentEvent =
  | { type: "method_changed"; method: RuntimePaymentMethod }
  | { type: "tendered_changed"; value: string }
  | { type: "reference_changed"; value: string }
  | { type: "invalid"; error: string }
  | { type: "editing" };

export function paymentReducer(state: PaymentMachineState, event: PaymentEvent): PaymentMachineState {
  switch (event.type) {
    case "method_changed":
      return { ...state, method: event.method, tendered: "", reference: "", phase: "editing", error: null };
    case "tendered_changed":
      return { ...state, tendered: event.value, phase: "editing", error: null };
    case "reference_changed":
      return { ...state, reference: event.value, phase: "editing", error: null };
    case "invalid":
      return { ...state, phase: "invalid", error: event.error };
    case "editing":
      return { ...state, phase: "editing", error: null };
  }
}

export type PrintState =
  | { status: "idle" }
  | { status: "printing"; label: string }
  | { status: "printed"; label: string }
  | { status: "failed"; label: string; error: string };

export type PrintEvent =
  | { type: "start"; label: string }
  | { type: "success"; label: string }
  | { type: "failure"; label: string; error: string }
  | { type: "reset" };

export function printReducer(state: PrintState, event: PrintEvent): PrintState {
  switch (event.type) {
    case "start": return { status: "printing", label: event.label };
    case "success": return { status: "printed", label: event.label };
    case "failure": return { status: "failed", label: event.label, error: event.error };
    case "reset": return { status: "idle" };
  }
}

export type SyncState = {
  status: "idle" | "online" | "syncing" | "offline" | "failed";
  pending: number;
  oldestQueuedSaleAt: string | null;
  error: string | null;
};

export type SyncEvent =
  | { type: "queue_changed"; pending: number; oldestQueuedSaleAt: string | null }
  | { type: "started" }
  | { type: "succeeded" }
  | { type: "failed"; error: string }
  | { type: "offline" }
  | { type: "online" };

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "queue_changed": return { ...state, pending: event.pending, oldestQueuedSaleAt: event.oldestQueuedSaleAt };
    case "started": return { ...state, status: "syncing", error: null };
    case "succeeded": return { ...state, status: "online", error: null };
    case "failed": return { ...state, status: "failed", error: event.error };
    case "offline": return { ...state, status: "offline" };
    case "online": return { ...state, status: "online", error: null };
  }
}
