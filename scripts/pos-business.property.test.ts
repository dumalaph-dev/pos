import assert from "node:assert/strict";
import test from "node:test";
import { fixedLineTotal, weightLineTotal } from "../src/lib/money.ts";
import { applySaleToStock } from "../src/lib/pos/inventory-movements.ts";
import { calculatePayment } from "../src/lib/pos/payment.ts";
import { discountAmount, saleTotals, vatFromInclusiveTotal } from "../src/lib/pos/pricing.ts";
import {
  orderReducer,
  paymentReducer,
  printReducer,
  syncReducer,
  type SyncState,
} from "../src/lib/pos/state-machines.ts";
import { NO_DISCOUNT, type CartLine, type DiscountState, type PosProduct } from "../src/lib/pos/types.ts";

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function product(id: string, pricingMode: PosProduct["pricing_mode"], price: number, trackStock = true): PosProduct {
  return {
    id,
    name: id,
    pricing_mode: pricingMode,
    price,
    unit: pricingMode === "per_kg" ? "kg" : "pc",
    category_id: null,
    track_stock: trackStock,
  };
}

function line(item: PosProduct, qty: number, weightKg: number | null): CartLine {
  return {
    key: item.id,
    product: item,
    qty,
    weightKg,
    lineTotal: item.pricing_mode === "per_kg"
      ? weightLineTotal(item.price, weightKg ?? 0)
      : fixedLineTotal(item.price, qty),
  };
}

test("money and weight pricing stay centavo-safe across generated inputs", () => {
  const next = random(0x51a1e);
  for (let index = 0; index < 750; index += 1) {
    const price = Math.floor(next() * 250_000);
    const quantity = Math.floor(next() * 25);
    const weightKg = Math.floor(next() * 100_000) / 100;

    assert.equal(fixedLineTotal(price, quantity), price * quantity);
    const weighted = weightLineTotal(price, weightKg);
    assert.ok(Math.abs(weighted - price * weightKg) <= 0.5);
    assert.equal(weightLineTotal(price, 0), 0);
  }
});

test("discount, VAT, and totals preserve sale invariants", () => {
  const next = random(0xdecafbad);
  for (let index = 0; index < 500; index += 1) {
    const first = product(`fixed-${index}`, "fixed", Math.floor(next() * 50_000));
    const second = product(`weight-${index}`, "per_kg", Math.floor(next() * 50_000));
    const lines = [line(first, Math.floor(next() * 10) + 1, null), line(second, 1, Math.floor(next() * 500) / 100)];
    const discount: DiscountState = {
      type: "custom",
      pct: Math.floor(next() * 140) - 20,
      name: "",
      id: "",
    };
    const subtotal = lines.reduce((sum, item) => sum + item.lineTotal, 0);
    const totals = saleTotals(lines, discount, { showVat: true, vatRate: 0.12 });

    assert.equal(totals.subtotal, subtotal);
    assert.ok(totals.discountAmount >= 0 && totals.discountAmount <= subtotal);
    assert.ok(totals.total >= 0 && totals.total <= subtotal);
    assert.ok(totals.vatAmount >= 0 && totals.vatAmount <= totals.total);
    assert.equal(totals.vatableSale + totals.vatExemptSale, totals.total - totals.vatAmount);
    assert.equal(vatFromInclusiveTotal(totals.total, 0), 0);
    assert.equal(discountAmount(subtotal, NO_DISCOUNT), 0);

    const exempt = saleTotals(lines, discount, { showVat: true, vatRate: 0.12, vatExempt: true });
    assert.equal(exempt.vatAmount, 0);
    assert.equal(exempt.vatExemptSale, exempt.total);
    assert.equal(exempt.vatableSale, 0);
  }
});

test("payment validation never accepts underpayment or malformed references", () => {
  const next = random(0x504159);
  for (let index = 0; index < 400; index += 1) {
    const total = Math.floor(next() * 100_000) + 1;
    const tendered = total + Math.floor(next() * 100_000);
    const cash = calculatePayment(total, "cash", tendered, "");
    assert.equal(cash.valid, true);
    assert.equal(cash.changeDue, tendered - total);
    assert.equal((cash.tendered ?? 0) - (cash.changeDue ?? 0), total);

    const underpaid = calculatePayment(total, "cash", Math.max(0, total - 1), "");
    assert.equal(underpaid.valid, false);
    assert.equal(calculatePayment(total, "card", null, "123").valid, false);
    assert.equal(calculatePayment(total, "card", null, "1234").valid, true);
    assert.equal(calculatePayment(total, "gcash", null, "ref").valid, false);
    assert.equal(calculatePayment(total, "gcash", null, "ref-1234").valid, true);
  }
});

test("local inventory projections subtract sale quantities without changing untracked items", () => {
  const next = random(0x570c);
  for (let index = 0; index < 300; index += 1) {
    const trackedFixed = product(`tracked-fixed-${index}`, "fixed", 100, true);
    const trackedWeight = product(`tracked-weight-${index}`, "per_kg", 100, true);
    const untracked = product(`untracked-${index}`, "fixed", 100, false);
    const fixedQty = Math.floor(next() * 8) + 1;
    const weight = Math.floor(next() * 500) / 100;
    const initial = {
      [trackedFixed.id]: 100,
      [trackedWeight.id]: 100,
      [untracked.id]: 100,
    };
    const projected = applySaleToStock(initial, [line(trackedFixed, fixedQty, null), line(trackedWeight, 1, weight), line(untracked, 2, null)]);

    assert.equal(projected[trackedFixed.id], 100 - fixedQty);
    assert.equal(projected[trackedWeight.id], 100 - weight);
    assert.equal(projected[untracked.id], 100);
    assert.deepEqual(initial, { [trackedFixed.id]: 100, [trackedWeight.id]: 100, [untracked.id]: 100 });
  }
});

test("order, payment, printing, and sync reducers have explicit stable transitions", () => {
  const editing = orderReducer({ status: "empty" }, { type: "cart_changed", lineCount: 2 });
  assert.deepEqual(editing, { status: "editing" });
  const paying = orderReducer(editing, { type: "start_payment", preview: null });
  assert.equal(paying.status, "paying");
  assert.deepEqual(orderReducer(paying, { type: "cancel_payment" }), editing);
  const saved = orderReducer(paying, { type: "saved", orderNo: "ORD-1", change: 25 });
  assert.deepEqual(orderReducer(saved, { type: "saved", orderNo: "ORD-1", change: 25 }), saved);
  assert.deepEqual(orderReducer(saved, { type: "dismiss_saved" }), { status: "empty" });

  const paymentEditing = paymentReducer({ phase: "editing", method: "cash", tendered: "", reference: "", error: null }, { type: "method_changed", method: "card" });
  assert.deepEqual(paymentEditing, { phase: "editing", method: "card", tendered: "", reference: "", error: null });
  assert.deepEqual(paymentReducer(paymentEditing, { type: "invalid", error: "bad" }).phase, "invalid");

  const printing = printReducer({ status: "idle" }, { type: "start", label: "receipt" });
  const printed = printReducer(printing, { type: "success", label: "receipt" });
  assert.deepEqual(printReducer(printed, { type: "success", label: "receipt" }), printed);

  const initialSync: SyncState = { status: "idle", pending: 0, oldestQueuedSaleAt: null, error: null };
  const queued = syncReducer(initialSync, { type: "queue_changed", pending: 3, oldestQueuedSaleAt: "2026-08-14T00:00:00.000Z" });
  assert.deepEqual(syncReducer(queued, { type: "queue_changed", pending: 3, oldestQueuedSaleAt: "2026-08-14T00:00:00.000Z" }), queued);
  const synced = syncReducer(queued, { type: "succeeded" });
  assert.deepEqual(syncReducer(synced, { type: "succeeded" }), synced);
});
