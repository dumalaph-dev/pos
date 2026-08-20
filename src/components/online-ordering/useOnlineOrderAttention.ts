"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createOnlineOrderAttentionRateLimiter,
  emitOnlineOrderAttentionSignal,
  formatOnlineOrderAttentionMessage,
  getNewOnlinePickupOrderIds,
  getUnacknowledgedOnlinePickupOrders,
  type OnlineOrderAttentionRecord,
} from "@/lib/online-order-alerts";

export function useOnlineOrderAttention({
  orders,
  scopeKey,
  enabled = true,
}: {
  orders: readonly OnlineOrderAttentionRecord[];
  scopeKey: string;
  enabled?: boolean;
}) {
  const pendingOrders = useMemo(
    () => getUnacknowledgedOnlinePickupOrders(orders),
    [orders],
  );
  const previousOrdersRef = useRef<readonly OnlineOrderAttentionRecord[] | null>(null);
  const scopeKeyRef = useRef(scopeKey);
  const rateLimiterRef = useRef(createOnlineOrderAttentionRateLimiter());
  const [announcement, setAnnouncement] = useState("");
  const [attentionPulse, setAttentionPulse] = useState(0);

  useEffect(() => {
    if (scopeKeyRef.current !== scopeKey) {
      scopeKeyRef.current = scopeKey;
      previousOrdersRef.current = orders;
      rateLimiterRef.current = createOnlineOrderAttentionRateLimiter();
      setAnnouncement("");
      return;
    }

    const previousOrders = previousOrdersRef.current;
    previousOrdersRef.current = orders;
    if (!enabled || !previousOrders) return;

    const newOrderIds = getNewOnlinePickupOrderIds(previousOrders, orders);
    if (newOrderIds.length === 0 || !rateLimiterRef.current()) return;

    const newOrders = orders.filter((order) => newOrderIds.includes(order.id));
    setAnnouncement(formatOnlineOrderAttentionMessage(newOrders));
    setAttentionPulse((value) => value + 1);
    emitOnlineOrderAttentionSignal();
  }, [enabled, orders, scopeKey]);

  useEffect(() => {
    if (!announcement) return;
    const timeout = window.setTimeout(() => setAnnouncement(""), 6_000);
    return () => window.clearTimeout(timeout);
  }, [announcement]);

  return { pendingOrders, announcement, attentionPulse };
}
