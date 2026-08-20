import type {
  OnlineOrderStatus,
  OnlineOrderingFulfillmentMethod,
} from "./online-ordering.ts";

export const ONLINE_ORDER_ALERT_POLL_MS = 15_000;
export const ONLINE_ORDER_ALERT_COOLDOWN_MS = 30_000;

export type OnlineOrderAttentionRecord = {
  id: string;
  orderNo: string;
  status: OnlineOrderStatus;
  fulfillmentMethod: OnlineOrderingFulfillmentMethod;
};

export type OnlineOrderAlertScope = {
  orgId: string;
  storeId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeScopedNewOnlinePickupAlerts(
  rows: readonly unknown[],
  scope: OnlineOrderAlertScope,
): OnlineOrderAttentionRecord[] {
  return rows.flatMap((value) => {
    if (!isRecord(value)) return [];
    if (
      value.org_id !== scope.orgId ||
      value.store_id !== scope.storeId ||
      value.status !== "new" ||
      value.fulfillment_method !== "pickup" ||
      typeof value.id !== "string" ||
      typeof value.order_no !== "string"
    ) {
      return [];
    }

    return [{
      id: value.id,
      orderNo: value.order_no,
      status: "new" as const,
      fulfillmentMethod: "pickup" as const,
    }];
  });
}

export function isUnacknowledgedOnlinePickupOrder(order: OnlineOrderAttentionRecord) {
  return order.fulfillmentMethod === "pickup" && order.status === "new";
}

export function getUnacknowledgedOnlinePickupOrders(
  orders: readonly OnlineOrderAttentionRecord[],
) {
  return orders.filter(isUnacknowledgedOnlinePickupOrder);
}

export function getNewOnlinePickupOrderIds(
  previousOrders: readonly OnlineOrderAttentionRecord[],
  currentOrders: readonly OnlineOrderAttentionRecord[],
) {
  const previousIds = new Set(
    getUnacknowledgedOnlinePickupOrders(previousOrders).map((order) => order.id),
  );

  return getUnacknowledgedOnlinePickupOrders(currentOrders)
    .filter((order) => !previousIds.has(order.id))
    .map((order) => order.id);
}

export function formatOnlineOrderAttentionMessage(
  orders: readonly OnlineOrderAttentionRecord[],
) {
  const pendingOrders = getUnacknowledgedOnlinePickupOrders(orders);
  if (pendingOrders.length === 0) return "";

  if (pendingOrders.length === 1) {
    return `New online pickup order ${pendingOrders[0].orderNo} needs acknowledgment.`;
  }

  return `${pendingOrders.length} new online pickup orders need acknowledgment.`;
}

export function createOnlineOrderAttentionRateLimiter(
  cooldownMs = ONLINE_ORDER_ALERT_COOLDOWN_MS,
  now: () => number = Date.now,
) {
  let lastSignalAt = Number.NEGATIVE_INFINITY;

  return () => {
    const currentTime = now();
    if (!Number.isFinite(currentTime) || currentTime < lastSignalAt) return false;
    if (currentTime - lastSignalAt < cooldownMs) return false;
    lastSignalAt = currentTime;
    return true;
  };
}

/**
 * A local, best-effort attention cue. The live region and visible alert remain
 * the accessible source of truth; vibration is only a supplementary cue on
 * devices that already expose it and does not change browser notification
 * permissions or any external notification setting.
 */
export function emitOnlineOrderAttentionSignal() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate([80, 40, 80]);
  } catch {
    // Vibration is optional and can be rejected by the browser or device.
  }
}
