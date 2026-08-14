"use client";

import { useCallback, useEffect, useState } from "react";
import { OFFLINE_PARKED_ORDER_KEY } from "@/lib/offline";
import { lineTotal } from "@/lib/pos/pricing";
import { NO_DISCOUNT, type CartLine, type DiscountState, type ParkedOrder, type PosProduct } from "@/lib/pos/types";

const MAX_PARKED = 10;

type UseCartStateOptions = {
  stockByProductId: Record<string, number>;
  onStockNotice?: (product: PosProduct, available: number | undefined) => void;
};

export function useCartState({ stockByProductId, onStockNotice }: UseCartStateOptions) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState<DiscountState>(NO_DISCOUNT);
  const [parked, setParked] = useState<ParkedOrder[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_PARKED_ORDER_KEY);
      if (!raw) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate device-local held orders once.
      setParked(JSON.parse(raw) as ParkedOrder[]);
    } catch {
      // A corrupt hold tray behaves like an empty tray.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_PARKED_ORDER_KEY, JSON.stringify(parked));
    } catch {
      // Held orders are best-effort when storage is unavailable or full.
    }
  }, [parked]);

  const notifyStock = useCallback((product: PosProduct) => {
    if (product.track_stock) onStockNotice?.(product, stockByProductId[product.id]);
  }, [onStockNotice, stockByProductId]);

  const addFixed = useCallback((product: PosProduct) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.key === product.id);
      if (!existing) return [...previous, { key: product.id, product, qty: 1, weightKg: null, lineTotal: product.price }];
      const qty = existing.qty + 1;
      return previous.map((line) => line.key === product.id
        ? { ...line, qty, lineTotal: lineTotal(product, qty, null) }
        : line);
    });
  }, []);

  const chooseProduct = useCallback((product: PosProduct) => {
    notifyStock(product);
    if (product.pricing_mode === "fixed") addFixed(product);
  }, [addFixed, notifyStock]);

  const bump = useCallback((key: string, delta: number) => {
    setCart((previous) => previous.map((line) => {
      if (line.key !== key || line.product.pricing_mode !== "fixed") return line;
      const qty = Math.max(1, line.qty + delta);
      return { ...line, qty, lineTotal: lineTotal(line.product, qty, null) };
    }));
  }, []);

  const applyWeight = useCallback((product: PosProduct, kg: number, lineKey?: string) => {
    const nextTotal = lineTotal(product, 1, kg);
    setCart((previous) => {
      if (lineKey) return previous.map((line) => line.key === lineKey ? { ...line, weightKg: kg, lineTotal: nextTotal } : line);
      const existing = previous.find((line) => line.key === product.id);
      if (existing) return previous.map((line) => line.key === product.id ? { ...line, weightKg: kg, lineTotal: nextTotal } : line);
      return [...previous, { key: product.id, product, qty: 1, weightKg: kg, lineTotal: nextTotal }];
    });
  }, []);

  const removeLine = useCallback((key: string) => {
    setCart((previous) => previous.filter((line) => line.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setNote("");
    setDiscount(NO_DISCOUNT);
  }, []);

  const holdOrder = useCallback(() => {
    if (cart.length === 0 || parked.length >= MAX_PARKED) return false;
    setParked((previous) => [...previous, { at: Date.now(), lines: cart, note, discount }]);
    clearCart();
    return true;
  }, [cart, clearCart, discount, note, parked.length]);

  const resumeOrder = useCallback((index: number) => {
    const parkedOrder = parked[index];
    if (!parkedOrder) return false;
    setCart(parkedOrder.lines);
    setNote(parkedOrder.note);
    setDiscount(parkedOrder.discount);
    setParked((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    return true;
  }, [parked]);

  const removeParked = useCallback((index: number) => {
    setParked((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  return {
    cart,
    setCart,
    note,
    setNote,
    discount,
    setDiscount,
    parked,
    setParked,
    maxParked: MAX_PARKED,
    chooseProduct,
    addFixed,
    bump,
    applyWeight,
    removeLine,
    clearCart,
    holdOrder,
    resumeOrder,
    removeParked,
  };
}
