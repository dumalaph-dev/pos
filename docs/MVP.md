# Dumala POS — MVP Definition

**Companion to:** [POS_PRD.md](POS_PRD.md) (v0.3)
**Owner:** Klein
**One-line goal:** A cashier sells lechon and prints a receipt in under 20 seconds — online or offline — across one or many branches, each on its own tablet, with the customer watching the total build on a second screen.

This file is the **cut line**: what ships as the MVP, what's explicitly deferred, and how we know it's done. When in doubt, the PRD is the detail; this is the boundary.

---

## 1. What the MVP is (and isn't)

The MVP is the **full loop that makes the product real for a growing owner**: sell → print → sync, at any branch, with a live customer display. Per the scope decision, multi-branch and the customer-facing display are **in** the MVP, not fast-follows.

**In the MVP**
- Products-first POS sell screen (weight + fixed pricing, discounts, cash/e-wallet)
- Offline-first: never lose a sale, never block on the network
- Receipt printing per tablet (Bluetooth / Wi-Fi / USB behind one adapter)
- **Multi-branch**: owner adds a branch, a tablet joins it, per-branch settings & printer
- **Customer-facing display**: passive second screen mirroring the order + total
- A backoffice thin enough to run the business: dashboard, products, orders, staff, branches, settings
- Shifts + cash count; audit trail

**Not in the MVP** (see PRD §4, §7, §8)
- BIR-accredited official receipts (order slips only)
- Pre-orders / reservations / customer records
- Online *ordering* app for customers (the display is passive, not an ordering surface)
- Cross-branch inventory transfers / central commissary
- Weighing-scale integration, split payment, dark theme, promos on the display *(all P1)*
- Full inventory reconciliation depth and rich reports *(basic versions in MVP; full in fast-follow)*

---

## 2. MVP feature list & done-criteria

Each item is "done" when its box can be checked in a real store, not a demo.

### 2.1 Auth & branch-bound tablet
- [ ] Email + password login (Supabase Auth); role + branch from `profiles`.
- [ ] Tablet is bound to a branch at setup; cashier unlocks with a 4–6 digit PIN offline after first online login.
- [ ] Cashier landing on `/admin` is redirected and logged.

### 2.2 Sell screen (products-first)
- [ ] Layout: **slim category rail (≤ ~15%) · product grid (largest) · cart (right)**.
- [ ] Fixed-price tap adds/increments; weight item opens keypad (kg, 2 decimals, live line total).
- [ ] Discounts: None / Senior / PWD (20% + ID capture) / Custom % (Admin PIN above threshold).
- [ ] Charge: Cash (tendered → change, quick-tender chips), GCash/Maya (ref #), Card (last 4).
- [ ] Hold/park orders (tray, max 10). Order note field. Branch label in header.
- [ ] Complete → print → 3s success with change due → fresh empty order.

### 2.3 Offline-first
- [ ] Order written locally first, queued for sync; UI never blocks on network.
- [ ] `local_uuid` idempotency + branch/device order-number prefix → no duplicates, no collisions.
- [ ] Connection pill: `Online / Offline · N pending`; background retry + manual "Sync now".
- [ ] Price snapshots on line items; force-close mid-queue resumes cleanly.

### 2.4 Printing (per tablet)
- [ ] `PrinterAdapter` with `bluetooth | network | usb`, one ESC/POS receipt builder.
- [ ] Printer config lives on the device; 52/58/80mm; auto-reconnect; reprint (marked + logged).
- [ ] Print failure never loses a sale (non-blocking retry).

### 2.5 Multi-branch
- [ ] Owner adds a branch from the backoffice (one form); optional **clone menu** from another branch/template.
- [ ] New tablet: log in as admin → pick branch → pair printer → hand to cashier.
- [ ] All orders/shifts/stock/audit scoped to a branch; cashier can't cross branches (RLS enforced).
- [ ] Backoffice branch switcher + "All branches" consolidated dashboard with per-branch breakdown.

### 2.6 Customer-facing display
- [ ] `/display` route pairs to a POS tablet; mirrors line items + running total live.
- [ ] Idle (branding) → active (order) → payment (change due, big type) → thank-you → idle.
- [ ] `DisplayLink` prefers LAN/WebRTC (works offline); Realtime fallback online; same-origin mirror if one device.
- [ ] Display off/disconnected → sale flow unaffected.

### 2.7 Shifts & cash
- [ ] Open shift (declared cash) / close shift (counted vs. expected, variance, note if over threshold).
- [ ] X-reading (cashier) / Z-reading (admin), per branch.

### 2.8 Backoffice (thin but real)
- [ ] Dashboard (per branch + consolidated), Products CRUD, Orders list + void/refund (admin), Branches, Devices, Staff, Settings (org / branch / device split), Audit log.

---

## 3. The thinnest slice (build order)

Ship value early; prove the risky parts first.

1. **Slice A — Sell & print at one branch (online):** foundation + products-first sell screen + cash payment + receipt on the real printer. *This is the day-one demo.*
2. **Slice B — Offline:** service worker + Dexie + idempotent sync. *Now it survives the stall.*
3. **Slice C — Multi-branch:** org/branch/devices (schema was there from day 0) + add-branch + branch-bound tablets + scoped RLS. *Now the second stall works.*
4. **Slice D — Customer display:** `/display` + `DisplayLink`. *Now the counter feels finished.*
5. **Slice E — Owner tooling:** backoffice dashboard, orders, shifts, inventory basics, reports.

> Riskiest unknown is the **printer** (BLE vs. Classic) — build the `PrinterAdapter` + receipt builder against the actual hardware on day one of Slice A. Multi-branch standardizing on **Wi-Fi/LAN printers** sidesteps the risk entirely.

---

## 4. MVP success criteria (go/no-go for the pilot)

| Signal | Bar |
|---|---|
| Median 3-line sale, tap → printed | ≤ 20s |
| Offline sales synced without loss/dup | 100% |
| First-attempt print success | ≥ 98% |
| Owner adds a branch + gets a tablet selling | ≤ 30 min, no developer |
| Cross-branch data leaks | 0 |
| Customer-display uptime during a shift | ≥ 95% |
| POS adoption vs. total sales by day 14 | ≥ 95% |

---

## 5. Rough timeline

~**4–5 weeks** to the first shippable slice (A–B: sell + print offline, one branch). ~**11–12 weeks** to the full MVP including multi-branch, customer display, and owner tooling — solo. Detail in [POS_PRD.md §13](POS_PRD.md).

---

## 6. Open items that gate the MVP

1. 🟡 **Printer purchase** — recommended spec is set (Wi-Fi/LAN 80mm ESC/POS, PRD §6.4). Confirm the buy, or the exact Bluetooth model if reusing one (BLE vs. Classic). *(PRD Q1)*
2. Menu/SKU list per branch (shared or divergent). *(PRD Q2)*
3. Customer display: separate device vs. second monitor on the same device (decides LAN link vs. same-origin mirror). *(PRD Q6)*
4. Branding per branch or org-wide. *(PRD Q7)*
