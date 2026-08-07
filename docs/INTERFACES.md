# Dumala POS — Interface Contracts

**Companion to:** [ARCHITECTURE.md](ARCHITECTURE.md) · [SCHEMA.md](SCHEMA.md)

These are the load-bearing abstractions. Defining them up front keeps the printer, customer display, and sync engine swappable (PRD §6.4, §6.8, §6.3). All money is **integer centavos** (`type Centavos = number`); weight is **kg** (`number`, 3-decimal precision).

---

## 1. Core domain types

```ts
type Centavos = number;   // ₱850.00 -> 85000
type Kg = number;         // 1.350

type PricingMode = 'fixed' | 'per_kg';
type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'card';
type DiscountType = 'none' | 'senior' | 'pwd' | 'custom';
type OrderStatus = 'completed' | 'voided' | 'refunded';

interface Product {
  id: string;
  storeId: string;
  categoryId: string | null;
  name: string;
  pricingMode: PricingMode;
  price: Centavos;          // per unit, or per kg when per_kg
  unit: 'pcs' | 'kg';
  trackStock: boolean;
  imageUrl: string | null;
  isActive: boolean;
}

interface CartLine {
  productId: string;
  nameSnapshot: string;
  pricingMode: PricingMode;
  unitPrice: Centavos;      // snapshot at add-time
  qty: number;              // fixed items
  weightKg?: Kg;            // per_kg items
  lineTotal: Centavos;
}

interface Discount {
  type: DiscountType;
  amount: Centavos;
  ref?: string;             // SC/PWD name + OSCA/ID, or custom % note
}

interface Payment {
  method: PaymentMethod;
  ref?: string;             // gcash/maya ref, card last4
  amountTendered?: Centavos;
  changeDue?: Centavos;
}

// The immutable record written to Dexie first, then synced.
interface OrderDTO {
  localUuid: string;        // idempotency key (client-generated)
  orderNo: string;          // {branch}-{device}-{yyMMdd}-{seq}
  orgId: string;
  storeId: string;
  deviceId: string;
  shiftId: string | null;
  cashierId: string;
  status: OrderStatus;      // 'completed' at creation
  lines: CartLine[];
  subtotal: Centavos;
  discount: Discount;
  vatableSale: Centavos;
  vatAmount: Centavos;
  vatExemptSale: Centavos;
  total: Centavos;
  payment: Payment;
  note?: string;
  createdAtDevice: string;  // ISO, original device time
}
```

**Money rules:** all arithmetic in centavos, integer only. Per-kg line: `lineTotal = Math.round(unitPrice * weightKg)`. Never use floats for currency. A single `money.ts` module owns formatting (`₱6,920.00`) and parsing.

---

## 2. `PrinterAdapter` (PRD §6.4)

One interface, three transports, one shared ESC/POS builder. Config is per-device.

```ts
type PrinterTransport = 'bluetooth' | 'network' | 'usb';

interface PrinterConfig {
  transport: PrinterTransport;
  paperWidth: 52 | 58 | 80;  // mm
  // bluetooth: { bleDeviceId }  |  network: { ip, port=9100, bridgeHost, bridgePort=8787 }  |  usb: { vendorId, productId }
  connection: Record<string, unknown>;
}

interface PrintResult { ok: boolean; error?: string; }

interface PrinterAdapter {
  readonly transport: PrinterTransport;
  connect(config: PrinterConfig): Promise<void>;
  isConnected(): boolean;
  /** Send raw ESC/POS bytes. Non-blocking to the sale — caller never awaits in the sell flow. */
  print(bytes: Uint8Array): Promise<PrintResult>;
  disconnect(): Promise<void>;
}
```

- Implementations: `NetworkPrinterAdapter` (raw TCP :9100 — **default**), `BluetoothPrinterAdapter` (Web Bluetooth GATT), `UsbPrinterAdapter` (WebUSB).
- **Never awaited in the sell flow.** The sale is saved first; `print()` runs fire-and-forget with a retry affordance on failure.

### ESC/POS `ReceiptBuilder`
Transport-agnostic; turns an order into bytes. One builder for all adapters.

```ts
interface ReceiptData {
  branch: { name: string; address?: string; };
  orderNo: string;
  dateTime: string;
  cashierName: string;
  lines: { name: string; qtyOrKg: string; unitPrice: Centavos; lineTotal: Centavos; }[];
  subtotal: Centavos;
  discount?: { type: DiscountType; ref?: string; amount: Centavos; };
  vat?: { vatable: Centavos; amount: Centavos; exempt: Centavos; };  // toggle, off by default
  total: Centavos;
  payment: Payment;
  footer?: string;
  isReprint?: boolean;      // prints a REPRINT marker
}

interface ReceiptBuilder {
  build(data: ReceiptData, paperWidth: 52 | 58 | 80): Uint8Array;
}
```
Fixed content: branch name/address, order no, items, discount (+ SC/PWD id), totals, payment, change, `"This is not an official receipt"` line (PRD §6.4). `REPRINT` marker + audit log on reprints.

---

## 3. `DisplayLink` — customer-facing display (PRD §6.8)

The POS pushes cart snapshots to a paired passive display. Non-critical: failures never affect the sale.

```ts
type DisplayLinkTransport = 'webrtc' | 'realtime' | 'broadcast';

type DisplayState =
  | { kind: 'idle' }                                        // branding
  | { kind: 'active'; lines: CartLine[]; subtotal: Centavos; discount: Centavos; total: Centavos; }
  | { kind: 'payment'; total: Centavos; tendered: Centavos; changeDue: Centavos; }
  | { kind: 'thankyou' };

interface DisplayLink {
  readonly transport: DisplayLinkTransport;   // 'webrtc' (LAN, offline) preferred
  pair(token: string): Promise<void>;
  /** Fire-and-forget snapshot push. Must not throw into the sell flow. */
  push(state: DisplayState): void;
  isConnected(): boolean;
  disconnect(): Promise<void>;
}
```

- Preference: `webrtc` (LAN, works offline) → `realtime` (online fallback) → `broadcast` (same-device second monitor).
- The `/display` route subscribes and renders `DisplayState` in the billboard theme (DESIGN_SYSTEM §7).

---

## 4. `SyncQueue` — offline order sync (PRD §6.3, ARCHITECTURE §3)

```ts
type QueueItemStatus = 'pending' | 'in_flight' | 'synced' | 'failed';

interface QueueItem {
  localUuid: string;        // == OrderDTO.localUuid
  status: QueueItemStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: number;   // backoff
}

interface SyncQueue {
  enqueue(order: OrderDTO): Promise<void>;         // writes Dexie + queue in one tx
  processPending(): Promise<void>;                 // idempotent upsert on localUuid
  syncNow(): Promise<{ synced: number; failed: number }>;
  pendingCount(): Promise<number>;
  onChange(cb: (state: { online: boolean; pending: number }) => void): () => void;
}
```

- `enqueue` writes the order to Dexie **and** the queue atomically, then the UI shows success — no network await.
- `processPending` upserts to Supabase `on conflict (local_uuid) do nothing` → replay-safe.
- Backoff on failure; `syncNow` is the manual trigger behind the connection pill.

---

## 5. `OrderNumberGenerator` (offline-safe)

```ts
interface OrderNumberGenerator {
  /** {branchPrefix}-{devicePrefix}-{yyMMdd}-{seq}; seq from a per-device Dexie counter. */
  next(): Promise<string>;
}
```
No server round-trip. Branch+device prefixes guarantee cross-tablet, cross-branch uniqueness offline.

---

## 6. `PricingEngine` (weight + discounts + VAT)

```ts
interface PricingEngine {
  lineTotal(product: Product, opts: { qty?: number; weightKg?: Kg }): Centavos;
  applyDiscount(subtotal: Centavos, d: Discount): { discountAmount: Centavos; total: Centavos };
  /** SC/PWD: 20% + VAT-exempt on their share. Confirm exact formula with owner (SCHEMA §8). */
  computeVat(order: { total: Centavos; discount: Discount }, vatRate: number): {
    vatableSale: Centavos; vatAmount: Centavos; vatExemptSale: Centavos;
  };
}
```

---

## 7. Contract test checklist

- [ ] `lineTotal` for `₱850/kg × 1.35kg` = `114750` (centavos), integer, no float drift.
- [ ] Cash `100000` tendered on `114750` total → Confirm disabled, insufficient state.
- [ ] `print()` rejection → sale still saved, "Retry print" offered.
- [ ] `DisplayLink.push` throwing/disconnected → sell flow unaffected.
- [ ] Replaying `SyncQueue.processPending` twice → exactly one server row per `localUuid`.
- [ ] Two devices, same day → distinct `orderNo`s.
