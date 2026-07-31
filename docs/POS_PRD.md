# Lechon POS — Product Requirements Document (v0.3 Draft)

**Owner:** Klein
**Status:** Draft v0.3 — scope expanded (multi-branch · customer-facing display · products-first sell screen). Still Android tablet · order slips only · walk-in sales only.
**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + RLS + Realtime) · Vercel · GitHub · Tailwind + shadcn/ui · PWA (Serwist) · Dexie/IndexedDB · Web Bluetooth (ESC/POS) · WebRTC/LAN (customer display)
**Target devices:** Android tablet in landscape, Chrome, installed as PWA (cashier). Second cheap screen (Android tablet / mini-PC + monitor) as the customer-facing display.

---

## 1. Problem Statement

A lechon store sells a product that is priced by weight, moves fast during peak hours (lunch, weekends, fiestas, holidays), and is often run out of a stall or small storefront where internet is unreliable or absent. Today the counter runs on a calculator, a notebook, and a manual OR booklet — which means slow queues, no reliable sales record, no visibility into how much lechon was actually sold vs. wasted, and no way for the owner to see numbers without physically being there.

The cost of not solving it: the owner cannot tell which days/cuts are profitable, cash shrinkage is invisible, and inventory (a perishable, high-value item) is managed by memory.

**As the business grows, a second problem appears:** the owner opens a second (then third) branch, and now has zero consolidated view. Each stall is its own island of numbers. The system must let the owner **add a branch from their account in minutes**, drop a new tablet on that counter, and see every branch — separately and combined — from one login.

**The core bet:** a cashier should be able to complete a sale in under 20 seconds, with a printed receipt, whether or not the store has internet — at any branch, on any tablet.

---

## 2. Users & Roles

The account model is **Organization → Branches → Staff**. One owner account (the *organization*) owns one or many *branches*; each staff member belongs to a branch (an admin may span all branches).

| Role | Who | Scope | Primary surface |
|---|---|---|---|
| **Owner / Admin** | Owner, manager | **All branches** in the org | Backoffice (any device) + full POS access at any branch |
| **Branch Manager** *(P1)* | Person running one stall | **One branch** | Backoffice (own branch) + POS |
| **Staff / Cashier** | Counter staff | **One branch** | POS tablet only |

**Role capabilities**

| Capability | Owner/Admin | Cashier |
|---|:--:|:--:|
| Ring up a sale, print receipt | ✅ | ✅ |
| Open / close own shift | ✅ | ✅ |
| Void a line item before payment | ✅ | ✅ |
| Void a completed order / refund | ✅ | ⛔ (requires Admin PIN) |
| Manual price override | ✅ | ⛔ (requires Admin PIN) |
| Apply discount above threshold | ✅ | ⛔ (requires Admin PIN) |
| View X-reading (own shift) | ✅ | ✅ |
| View Z-reading / daily totals | ✅ | ⛔ |
| Manage products & prices | ✅ | ⛔ |
| Manage inventory & stock in/out | ✅ | ⛔ |
| View reports & POS logs | ✅ | ⛔ |
| Manage staff accounts | ✅ | ⛔ |
| **Add / edit branches** | ✅ | ⛔ |
| **Switch active branch / view all branches** | ✅ | ⛔ (locked to their branch) |
| **Configure a tablet's printer & branch** | ✅ | ✅ *(own tablet, own branch)* |

**Notes**
- A cashier is bound to one branch; every order, shift, and audit row they create is stamped with that branch.
- The owner sees a **branch switcher** in the backoffice (and an "All branches" consolidated view).
- Products, prices, and categories default to being **owned by the branch**, with an org-level template a new branch can be cloned from (see §6.7). This keeps a two-stall owner from re-typing the menu, without forcing identical pricing across branches.

---

## 3. Goals

1. **Speed at the counter** — median time from first item tap to printed receipt ≤ 20 seconds for a 3-line order.
2. **True offline operation** — 100% of sales rung up during an internet outage are captured locally, printed, and synced without duplication or loss once connectivity returns.
3. **Owner visibility across branches** — the owner can see today's sales, cash position, and remaining stock **per branch and combined**, from their phone, without being at any store.
4. **Add a branch in minutes** — the owner adds a branch from their account, a new tablet joins it by selecting the branch and pairing its own printer, and it's selling the same day. No developer, no migration.
5. **Inventory truth for a perishable product** — daily reconciliation of kilos received vs. kilos sold vs. kilos wasted, with variance visible, per branch.
6. **Trust in the till** — every void, discount, price override, and drawer event is attributable to a named user, at a named branch, with a timestamp.
7. **A calmer queue** — the customer sees their order and total build in real time on a second screen, reducing "wait, how much?" disputes and speeding confirmation.

---

## 4. Non-Goals (explicitly out of scope for v1)

1. **BIR-accredited official receipts** — ✅ *decided:* the POS prints an **order slip only** and the store keeps issuing its manual OR booklet. No accreditation work, no e-journal requirements, no sequential-invoice constraints in v1. The receipt carries a "This is not an official receipt" line.
2. **Pre-orders / reservations for whole lechon** — ✅ *decided:* walk-in sales only. No customer records, no pickup calendar, no downpayment tracking.
3. **Online ordering app for customers** — a customer-installable app to browse the menu and order ahead is a *different product, different problem*, and stays out of v1. **Note:** the *customer-facing display* (a passive second screen at the counter) **is now in scope** — see §6.8. The two are not the same thing.
4. **Payroll, purchasing/PO workflows, supplier management** — backoffice v1 is inventory + reports only.
5. **Kitchen display system / order routing** — a lechon counter is a takeout counter; there is no kitchen ticket flow.
6. **Barcode scanning** — lechon is weighed and chopped to order; barcodes add hardware cost for near-zero benefit. Revisit if packaged goods (bottled sarsa, chicharon) become a real line.
7. **Cross-branch inventory transfers & central commissary accounting** — each branch's stock is its own ledger in v1. Moving kilos between branches is a manual stock-out/stock-in for now; a true transfer document is P2.

> **What changed from v0.2:** multi-branch and the customer-facing display were previously non-goals. They are now **P0**. Multi-branch was always schema-ready (`store_id` in every table), so this is additive, not a rewrite. Online *ordering* remains out.

---

## 5. Domain Model — Why This Isn't a Generic POS

This is the part most off-the-shelf POS templates get wrong:

- **Weight-priced items.** `Lechon (chopped) — ₱850/kg`. The cashier enters kilos (e.g. `1.35`), the system computes the line total. The keypad must default to weight entry for these items, not quantity.
- **Fixed-price items.** Rice, drinks, sarsa, chicharon — normal quantity × price.
- **Whole-lechon units.** Still sellable at the counter as a single unit priced by dressed weight — the cashier enters the weight the same way as chopped lechon. No reservation flow needed.
- **Yield loss.** A 25 kg whole pig does not become 25 kg of sellable chopped lechon. Inventory must tolerate a yield factor and a wastage entry, or the numbers will never reconcile.
- **PH-specific discounts.** Senior Citizen / PWD discount (20% + VAT exemption on their share) is legally mandated and requires capturing the ID/OSCA number on the record.
- **Branch is a first-class dimension.** Every price, stock level, shift, order, and audit row belongs to a branch. Two branches can sell the same product at different prices and have independent stock. Reporting rolls up by branch. Nothing is "the store's" anymore — it's "this branch's."
- **A tablet is a physical thing with its own settings.** The printer connection (Bluetooth / Wi-Fi / USB), paper width, and device order-number prefix live with the *tablet*, not the account — because they're physically different at each counter.

---

## 6. MVP Scope — Must-Have (P0)

### 6.1 Auth & Session

- Single login page at the app root; email + password via Supabase Auth.
- After first successful **online** login on a device, the app stores a device-bound unlock credential so the user can re-enter the POS **offline** with a 4–6 digit PIN.
- Role **and branch** are read from `profiles`; cashiers who land on `/admin` are redirected to `/pos`.
- **On first setup, a tablet is bound to a branch** (owner/admin picks the branch; the choice is remembered on the device). A cashier logging into that tablet inherits its branch.
- Session persists across app restarts; the tablet should never log itself out mid-shift.

**Acceptance criteria**
- [ ] Given a cashier has logged in online at least once on this device, when the tablet is offline and the app is reopened, then they can unlock with their PIN and reach the POS **for the branch this tablet is bound to**.
- [ ] Given a user with role `cashier`, when they navigate to any `/admin` route, then they are redirected to `/pos` and the attempt is written to the audit log.
- [ ] Given a wrong PIN entered 5 times, then PIN unlock is locked for 60 seconds.
- [ ] Given a tablet already bound to Branch A, when a cashier of Branch A logs in, then all orders they create are stamped with Branch A without any per-sale branch choice.

### 6.2 POS — Sell Screen (products-first layout)

**Layout (landscape tablet) — three columns, products dominate:**

```
┌──────┬────────────────────────────────┬───────────────┐
│ CAT  │            PRODUCTS             │     CART      │
│ rail │        (the main event)        │  order + total│
│ ~12% │             ~52%               │    ~36%       │
└──────┴────────────────────────────────┴───────────────┘
```

- **Left: category rail — deliberately small.** A narrow vertical rail (~120–160px / ~12% width), one tappable chip per category (icon + short label), the active category highlighted. It's navigation, not the star. Scrollable if categories overflow. An "All" chip sits at top.
- **Center: product grid — the hero of the screen.** The largest region. Big tiles (min 96×96px, aim larger), name, price, and a `/kg` badge for weight items. This is where the cashier's eyes and thumbs live. Grid reflows to fill the freed-up width from the slim rail.
- **Right: current order (cart), running total, and the Charge button** as a persistent full-width primary action (~36%).

Rationale for the change from v0.2 (categories were a fat 62%-side element): a lechon menu is short and the cashier already knows it. Categories are a filter you tap once; **products are what you tap all day.** Give the pixels to the products.

- Category rail entries are admin-configurable per branch: e.g. Lechon · Sides · Drinks · Others.
- Tapping a **fixed-price** item adds qty 1; tapping again increments.
- Tapping a **weight-priced** item opens a numeric keypad modal: enter kilos (2 decimals), live-computed line total, Confirm.
- Cart line: tap to edit qty/weight, swipe or tap ✕ to remove.
- Order-level note field (e.g. "for pickup 5pm", "walang sarsa").
- Discount button: `None / Senior Citizen / PWD / Custom %` — SC & PWD require name + ID number and apply 20%; Custom % above a configurable threshold requires Admin PIN.
- **Charge** opens payment: `Cash` (amount tendered → change due, with quick-tender chips: exact, ₱500, ₱1000) or `GCash/Maya` (capture reference number) or `Card` (capture last 4, manual).
- On completion: print receipt, show a 3-second success state with change due in large type, auto-return to a fresh empty order.
- **Hold / Park order**: park the current cart and start a new one (essential when someone's lechon is still being chopped). Parked orders visible in a tray, max 10.
- A small, non-intrusive **branch label** in the POS header (so staff on a shared account never ring up on the wrong branch).

**Acceptance criteria**
- [ ] Given the sell screen on a landscape tablet, then the product grid occupies the largest share of width, the category rail is a slim vertical strip (≤ ~15%), and the cart is on the right.
- [ ] Given a weight item at ₱850/kg, when the cashier enters `1.35`, then the line total reads ₱1,147.50 and rounds to 2 decimals.
- [ ] Given a cash payment of ₱1,000 on a ₱1,147.50 total, then the Confirm button is disabled and the tendered field shows an insufficient-amount state.
- [ ] Given a completed sale, when the receipt fails to print, then the order is still saved and a "Reprint" action is offered — a print failure never loses a sale.
- [ ] Given a cashier applies a 25% custom discount and the admin threshold is 10%, then an Admin PIN prompt blocks completion.

### 6.3 Offline-First Behaviour

- App shell, **this branch's** product catalog, prices, and settings are cached locally (IndexedDB via Dexie) and refreshed on every successful sync.
- Orders are written to the local DB **first**, then queued for sync. The UI never blocks on the network.
- Every order carries a client-generated `local_uuid` (idempotency key) with a unique constraint server-side — replaying the queue can never create duplicates.
- Order numbers are generated as `{branch_prefix}-{device_prefix}-{yyMMdd}-{seq}` so two offline tablets — even across branches — can't collide.
- A persistent connection indicator in the POS header: `Online / Offline · N pending`.
- Background sync retries with exponential backoff; manual "Sync now" available.
- Conflict rule: **the order is immutable truth**. Server-side stock is decremented from synced orders; it may go negative, and the variance surfaces in the backoffice rather than blocking a sale.

**Acceptance criteria**
- [ ] Given the tablet is offline, when 15 sales are completed and the tablet reconnects, then exactly 15 orders exist server-side, stamped to the correct branch, with their original device timestamps preserved.
- [ ] Given the app is force-closed mid-queue, when reopened, then unsynced orders are still present and the queue resumes.
- [ ] Given a product's price changed on the server while the tablet was offline, then already-completed offline orders retain the price snapshot they were sold at.
- [ ] Given two tablets on two different branches ring up sales offline at the same second, when both sync, then their order numbers never collide.

### 6.4 Receipt Printing (Bluetooth / Wi-Fi / USB) — per-tablet settings

- **Printer configuration lives on the tablet (per device, within its branch), not on the account.** Each counter's printer is a physical thing; the Settings screen configures *this* tablet's printer and the setting stays with the device.
- Pair a printer from a Settings screen; the chosen device is remembered and auto-reconnects. Supported transports behind one adapter:
  - **Bluetooth (BLE)** — pair from the tablet.
  - **Wi-Fi / LAN thermal printer** — enter the printer's IP:port on the branch's local router; prints over the LAN with zero internet. *(Recommended default for reliability.)*
  - **USB-OTG (WebUSB)** — cable-tethered to the tablet.
- Receipt content (**order slip**): **branch** name & address, order number, date/time, cashier name, line items (name, qty or kg, unit price, line total), subtotal, discount (with type + ID if SC/PWD), total, payment method, tendered, change, footer message, and a fixed **"This is not an official receipt"** line. VAT breakdown is a settings toggle, off by default.
- Reprint last receipt; reprint any order from the POS order history (reprints are marked `REPRINT` and logged).
- 58mm and 80mm paper width support (per-tablet setting).

> ⚠️ **Hardware constraint (unchanged).** Web Bluetooth on Android/Chrome can **only** talk to **Bluetooth Low Energy (BLE)** devices. Many ₱1.5–3k PH thermal printers are Bluetooth **Classic (SPP)** and are invisible to Web Bluetooth. Confirm the exact printer model exposes a BLE GATT service before relying on Bluetooth.
>
> Fallbacks, in order of preference: **(1) Wi-Fi/LAN printer** (most reliable, and it's the natural fit for multi-branch — each branch has its own router and its own network printer), (2) **USB-OTG via WebUSB**, (3) swap for a BLE model.
>
> Mitigation regardless: printing sits behind a `PrinterAdapter` interface (`bluetooth` | `network` | `usb`) sharing one ESC/POS receipt builder, so a tablet changing transport — or a new branch standardizing on Wi-Fi printers — is a settings change, not a rewrite. **Build the adapter + receipt builder first and test against the actual printer on day one of Phase 3.**

**✅ Recommended printer spec (the safe default to buy per branch)**

Standardize every branch on a **Wi-Fi / Ethernet (LAN) 80mm thermal receipt printer** with native **ESC/POS**. This removes the BLE-vs-Classic risk entirely, is the most reliable transport in an offline stall, and lets multiple tablets at one counter share one printer over the branch router.

| Attribute | Recommendation | Why |
|---|---|---|
| **Transport** | Wi-Fi (2.4GHz) **and/or** Ethernet LAN | Prints with zero internet over the branch's own router; no OS pairing quirks; survives tablet swaps |
| **Protocol** | ESC/POS (raw TCP, **port 9100**) | One receipt builder drives it; the `network` adapter is a thin TCP send |
| **Paper width** | 80mm (58mm supported as a setting) | 80mm is the PH counter standard; roomier order slips |
| **Print speed** | ≥ 200 mm/s | Keeps within the 3-second print target at peak |
| **Cutter** | Auto-cutter | Hands stay on the next order, not tearing paper |
| **Cash drawer port** | RJ11/RJ12 drawer kick | Optional now, but "kick drawer" becomes a one-line ESC/POS command later |
| **Power/mount** | Fixed AC, countertop | It lives on the counter; it isn't a mobile device |
| **Reference models** | Epson **TM-T20III (Ethernet/Wi-Fi)** or **TM-m30** · Xprinter **XP-N160II / XP-T80 (LAN)** · Rongta **RP328-USE (LAN)** | Widely available in PH, well-documented ESC/POS, LAN variants confirmed |

> **Buy-one-to-test rule:** before committing per branch, buy a single unit, put it on a router with **no internet**, and confirm the tablet can open a raw TCP socket to `printer_ip:9100` and print an ESC/POS test slip. That one test de-risks the whole printing story.
>
> **Bluetooth is the exception, not the default.** Only choose a Bluetooth printer if it's already owned *and* confirmed **BLE** (not Classic/SPP). USB-OTG is the fallback when a branch has no usable router.

**Acceptance criteria**
- [ ] Given a tablet configured with its own printer and no internet, when a sale is completed, then a receipt prints within 3 seconds.
- [ ] Given the printer is out of range/unreachable, then the app shows a non-blocking toast with "Retry print" and the sale still completes.
- [ ] Given two tablets at the same branch, when each is paired to its own printer, then their printer settings are independent and neither overwrites the other.
- [ ] Given a new tablet added to a branch, when the admin sets its printer to the branch's Wi-Fi printer IP, then it prints without touching any other tablet's config.

### 6.5 Shifts & Cash Drawer

- Cashier opens a shift with a declared opening cash amount. Shifts are per branch (and per cashier/tablet).
- Close shift: declare counted cash → app shows **expected cash** (opening + cash sales − refunds), **variance**, and requires a note if variance exceeds a configurable amount.
- X-reading (mid-shift summary, non-resetting) available to the cashier; Z-reading (end-of-day) is Admin-only and can be viewed per branch.

### 6.6 Admin Backoffice

Routes under `/admin`, responsive (owner will check it on a phone). A **branch switcher** sits in the top bar: pick one branch, or **"All branches"** for consolidated views.

**Dashboard** — today's sales, order count, average ticket, cash vs. e-wallet split, top items, kilos of lechon sold, live low-stock alerts — for the selected branch, or **rolled up across all branches** with a per-branch breakdown table.

**Branches** *(new)* — the owner's control for the multi-branch feature:
- List all branches with status, today's sales, and tablet/printer health at a glance.
- **Add branch**: name, address, TIN (optional), receipt header/footer, paper-width default, currency. On create, optionally **clone products, categories, and prices from an existing branch or an org template** so a new stall isn't retyped.
- Edit / deactivate a branch (deactivating hides it from POS login and stops new sales; history is retained).
- **Devices/tablets per branch**: see paired tablets, their printer transport, last-seen, and order-number prefix; rename or retire a tablet.

**Products** — CRUD: name, category, pricing mode (`fixed` | `per_kg`), price, image, active toggle, track-stock toggle. **Scoped to the selected branch**; an admin can copy a product (or the whole menu) to another branch. Price changes are versioned in the audit log.

**Inventory** *(per branch)*
- Stock is tracked per item in its own unit (`kg` for lechon, `pcs` for drinks), per branch.
- **Stock In**: receive whole lechon (units + gross kg + cost), or receive packaged goods.
- **Yield entry**: convert `1 whole lechon (25 kg)` → `X kg chopped lechon` + `Y kg waste/bones`.
- **Wastage / spoilage** entry with a reason.
- **Stock adjustment** with mandatory reason.
- Every movement writes a row to `stock_movements` — stock on hand is always derivable from the ledger.
- End-of-day variance view per branch: opening kg + received − sold − wasted = expected vs. counted.

**Orders** — searchable/filterable list (**branch**, date range, cashier, payment method, status), order detail drawer, void/refund with reason (Admin only), reprint.

**POS Logs (Audit Trail)** — immutable, append-only, filterable by **branch** / actor / action / date. Logged events: login, logout, failed PIN, shift open/close, sale completed, line void, order void, refund, discount applied, price override, product/price edit, stock movement, **branch created/edited**, **tablet/printer configured**, printer pairing, sync error, permission denied.

**Reports** — sales by day/week/month, by item, by category, by cashier, hourly heatmap, discount report, CSV export — **filterable by branch and comparable across branches** (e.g. Branch A vs. Branch B side by side).

**Staff** — invite/create users, **assign to a branch**, assign role, set/reset PIN, deactivate.

**Settings** — split into:
- **Organization settings**: business name, owner, default currency, VAT policy defaults, discount threshold requiring Admin PIN, low-stock threshold defaults, org-level receipt template.
- **Branch settings**: name/address/TIN, receipt header & footer, VAT registration toggle + rate, paper-width default, low-stock thresholds (override), customer-display branding.
- **Tablet/device settings** *(configured on the device itself)*: printer transport + connection (BLE device / Wi-Fi IP / USB), paper width, order-number prefix, paired customer display.

### 6.7 Multi-Branch *(new — P0)*

The headline addition: an owner runs more than one stall from **one account**, adds branches themselves, and drops a tablet on each counter.

**What it must do**
1. **Add a branch from the account** — one form (see Backoffice → Branches). No developer involvement, no schema migration. Live immediately.
2. **Clone the menu (optional)** — a new branch can start from an existing branch's or an org template's products/categories/prices, then diverge (different prices, different SKUs per branch are allowed).
3. **Onboard a tablet in minutes** — on a fresh tablet: log in as owner/admin → pick the branch → the tablet is bound → configure *its own* printer (Bluetooth/Wi-Fi/USB) and paper width → hand it to the cashier. Cashiers of that branch then log in with just their PIN.
4. **Per-branch isolation** — orders, shifts, stock, prices, categories, and audit logs are all stamped with and scoped to a branch. One branch's activity never leaks into another's numbers.
5. **Consolidated + per-branch reporting** — the owner sees each branch alone and all branches combined (see Dashboard/Reports).
6. **Per-tablet, per-branch settings** — printer connection and paper width belong to the device; receipt header/VAT belong to the branch.

**Data & security**
- New `organizations` table sits above `stores` (a `store` = a *branch*). Every branch has `org_id`.
- Every scoped table already carries `store_id` (branch); RLS narrows to `org_id` for admins and to a single `store_id` for cashiers.
- A `devices` table records each tablet: its branch, printer config, order-number prefix, and last-seen.

**Acceptance criteria**
- [ ] Given an owner with one branch, when they add a second branch and choose "clone menu from Branch A", then Branch B opens with Branch A's products and prices, independently editable.
- [ ] Given a new tablet, when the admin logs in, selects Branch B, and pairs a printer, then a Branch-B cashier can log in with a PIN and every sale is stamped Branch B.
- [ ] Given a cashier bound to Branch A, when they log in, then they can only see and sell Branch A's catalog and can never switch branches.
- [ ] Given the owner opens the dashboard with "All branches", then totals sum across branches and a per-branch breakdown is shown.
- [ ] Given a price edited at Branch A, then Branch B's price for the same product is unaffected.

### 6.8 Customer-Facing Display *(new — P0)*

A **second, passive screen** at the counter, facing the customer, mirroring the live order. Not interactive — no customer input, no ordering. It exists to make the total visible and the queue calmer.

**What it shows**
- **Idle state**: branch name/logo, a "Welcome" / branding screen (configurable per branch).
- **Active order**: line items appearing as the cashier rings them (name, qty/kg, line total), a large **running total**, and any discount applied.
- **Payment state**: total, amount tendered, and **change due in large type**.
- **Thank-you state**: a brief "Salamat!" / thank-you + branding, then back to idle.

**How it connects (design, mirroring the printer approach)**
- The display pairs to a specific POS tablet (one display ↔ one cashier tablet).
- Transport behind a small `DisplayLink` interface so it's swappable:
  - **Preferred: local peer link over the branch LAN (WebRTC data channel)** — works with **no internet**, which matches the offline-first bet. Cart state is pushed from the POS to the display as it changes.
  - **Fallback: Supabase Realtime** — trivial to build, but requires internet; degrades to "last known / idle" when offline.
  - **Simplest hardware fallback**: if the display is a second monitor on the *same* device (mini-PC + monitor, or tablet with video-out), a same-origin `BroadcastChannel` mirror works with zero networking.
- **The display is never in the critical path.** If it's disconnected or asleep, the sale still completes and prints. It's an enhancement, not a dependency.
- Hardware: cheapest viable is a second Android tablet or an Android TV stick + monitor running the `/display` route in kiosk/fullscreen. Per-branch branding is a Branch setting; the pairing is a Tablet setting.

**Acceptance criteria**
- [ ] Given a paired display, when the cashier adds a line item, then the item and the updated running total appear on the display within ~500ms.
- [ ] Given the cashier takes a cash payment, when they enter tendered, then the display shows change due in large type.
- [ ] Given a completed sale, then the display shows a thank-you state and returns to idle for the next customer.
- [ ] Given the display device is off or disconnected, then the POS sale flow is unaffected and completes normally.
- [ ] Given no internet, when using the LAN/local transport, then the display still mirrors the order in real time.

---

## 7. Nice-to-Have (P1 — fast follow)

1. **Weighing scale integration** (Bluetooth/USB scale auto-fills kilos) — removes the biggest source of manual entry error.
2. **Split payment** (part cash, part GCash).
3. **Realtime backoffice** via Supabase Realtime — owner's cross-branch dashboard updates live as sales come in.
4. **Branch Manager role** — a manager scoped to a single branch's backoffice.
5. **Multi-device shift awareness** — two tablets on one counter/branch.
6. **Customer display: promos & upsell** — rotating promo cards / featured items on the idle screen.
7. **Daily summary push/email to the owner** at closing time — per branch and consolidated.
8. **Dark theme** for the POS.

## 8. Future Considerations (P2 — design for, don't build)

- **Pre-orders / reservations** for whole lechon (customer, pickup date, downpayment, balance) — the orders schema should not assume "created and paid in the same second", so a future `pre_orders` table can attach cleanly.
- Customer directory and repeat-customer history.
- **Cross-branch inventory transfers** with a proper transfer document (branch-to-branch stock movement), and a central commissary/kitchen that supplies branches.
- **Online ordering app** for customers (browse, order-ahead, pickup) — a separate front-end that feeds orders into the same backoffice.
- BIR CAS accreditation path: sequential unbreakable invoice numbering, e-journal, Z-reading archive, no-delete policy.
- Franchise / white-label — multi-org, per-org branding; the org/branch split added now is the foundation for this.
- Cost of goods & margin per item, per branch (Stock In already captures purchase costs).

---

## 9. UI Direction

The brief is "beautiful, simple, modern." Concretely, for a POS that's used 8 hours a day by someone with greasy hands under fluorescent light:

- **Light theme by default**, high contrast, no glassmorphism or low-contrast greys. Dark theme is a P1 nicety.
- **One accent color**, used only for the primary action. Everything else is neutral. Semantic red/green reserved strictly for destructive/success.
- **Type**: one geometric sans (Inter or Geist). Numbers in tabular figures — totals must not jitter as they change.
- **Density**: generous. Tap targets ≥ 48px, product tiles ≥ 96px. Whitespace is the "premium" signal.
- **Products are the hero of the sell screen.** The category rail is a slim, quiet strip — navigation, not decoration. The product grid gets the width. The running total is the hero of the cart column.
- **Motion**: ≤ 150ms, only for state transitions. No decorative animation on the sell screen.
- **Offline is a neutral state, not an error.** A calm grey pill saying "Offline · 3 pending", never a red alarm.
- **Branch is always visible but never loud** — a small header label so staff know which branch they're on, without cluttering the sell flow.
- **The customer-facing display is a different design target**: viewed from a distance, so big type, high contrast, minimal chrome, the total dominant. It's a billboard, not a dashboard.
- Backoffice can be more expressive (charts, cards, branch comparisons); the POS should be boring, fast, and unmistakable.

---

## 10. Data Model (Supabase / Postgres — first cut)

```
organizations     id, name, owner_profile_id, currency, settings jsonb
                  -- the owner's account; parent of all branches

stores            id, org_id, name, address, tin, vat_registered, vat_rate,
                  currency, settings jsonb, is_active
                  -- a "store" row = a BRANCH

devices           id, store_id (branch), name, device_prefix, printer_transport
                  ('bluetooth'|'network'|'usb'), printer_config jsonb
                  (ble_id | ip:port | paper_width), paired_display_id,
                  is_active, last_seen_at
                  -- one row per physical tablet; printer settings live here

profiles          id (→auth.users), org_id, store_id (home branch),
                  full_name, role('admin'|'manager'|'cashier'),
                  pin_hash, is_active

categories        id, store_id, name, sort_order
products          id, store_id, category_id, name, pricing_mode('fixed'|'per_kg'),
                  price, unit, track_stock, image_url, is_active
stock_movements   id, store_id, product_id, type('receive'|'yield_in'|'yield_out'|
                  'sale'|'waste'|'adjust'), qty, unit, unit_cost, reason,
                  ref_order_id, actor_id, created_at
orders            id, local_uuid (UNIQUE), store_id, device_id, order_no, shift_id,
                  cashier_id, status('completed'|'voided'|'refunded'), subtotal,
                  discount_type, discount_amount, discount_ref (SC/PWD id),
                  vatable_sale, vat_amount, vat_exempt_sale, total, payment_method,
                  amount_tendered, change_due, note, created_at_device, synced_at,
                  created_at
order_items       id, order_id, product_id, name_snapshot, pricing_mode_snapshot,
                  unit_price_snapshot, qty, weight_kg, line_total
shifts            id, store_id, device_id, cashier_id, opened_at, opening_cash,
                  closed_at, declared_cash, expected_cash, variance, note
audit_logs        id, store_id, actor_id, action, entity, entity_id, before jsonb,
                  after jsonb, device_id, created_at
```

**Key rules**
- `organizations` is the account root; `stores` are its branches (`store_id` is effectively `branch_id`).
- `orders.local_uuid` UNIQUE → idempotent sync.
- Order numbers embed branch + device prefix so offline collisions are impossible across branches and tablets.
- Snapshot product name and price on `order_items` → historical receipts never change when prices change.
- `audit_logs` and `stock_movements` are **append-only** (no UPDATE/DELETE policy for any role).
- Voids/refunds create new rows; they never mutate the original order.
- **RLS**: admins/managers are scoped by `org_id` (admins see all branches; managers to their `store_id`); cashiers can `INSERT` orders and `SELECT` only their own shift's orders **within their bound `store_id`**. No query can cross an `org_id` boundary.
- Printer/display config is in `devices` (per tablet), not in `stores` or `organizations`, because it's physically device-specific.

---

## 11. Success Metrics

**Leading (week 1–4)**
| Metric | Target | Stretch |
|---|---|---|
| Median time to complete a 3-line sale | ≤ 20s | ≤ 12s |
| Offline orders synced without loss or duplication | 100% | 100% |
| Receipt print success rate (first attempt) | ≥ 98% | ≥ 99.5% |
| Sales rung up on POS vs. total sales (adoption) | ≥ 95% by day 14 | 100% by day 7 |
| Shifts closed with a completed cash count | ≥ 90% | 100% |
| Time for owner to add a branch + get a tablet selling | ≤ 30 min | ≤ 15 min |
| Customer-display uptime during a shift | ≥ 95% | ≥ 99% |

**Lagging (month 1–3)**
- Daily cash variance trends toward ≤ 0.5% of cash sales, per branch.
- Owner opens the backoffice ≥ 5 days/week and uses the "All branches" view weekly.
- Wastage as % of kilos received becomes a known, tracked number per branch.
- Zero "we lost a day of sales" incidents.
- Zero cross-branch data leaks (a branch's numbers never appear under another).

---

## 12. Open Questions

**Resolved**

- ✅ Android tablet + Chrome → Web Bluetooth is available; PWA install works properly.
- ✅ Order slips only, manual OR booklet stays → no BIR accreditation scope.
- ✅ Walk-in sales only → pre-orders, customer records, and pickup scheduling cut from v1.
- ✅ **Customer-facing display is in scope** (passive second screen, §6.8). Online *ordering* stays out.
- ✅ **Multi-branch is in scope** (owner adds branches, per-branch tablets & printers, consolidated reporting, §6.7).
- ✅ **Sell screen is products-first** — slim category rail, product grid is the main UI (§6.2).

**Blocking**

1. 🟡 **Printer purchase confirmation.** Recommended spec is set (§6.4): a **Wi-Fi/LAN 80mm ESC/POS printer per branch**, e.g. Epson TM-T20III (Ethernet) or Xprinter XP-N160II (LAN). Remaining decision: buy per this spec, or must an already-owned Bluetooth printer be supported (then confirm that exact model is **BLE**, not Classic)? Run the buy-one-to-test check before committing per branch. *(You / hardware)*

**Non-blocking — resolve during implementation**

2. What's the actual product list, and how many SKUs? A photo of the current menu board is enough. Do branches share one menu or diverge?
3. How many tablets per branch, and is a tablet shared by all staff or one per cashier?
4. Is there a physical **cash drawer** to kick (via printer RJ11), or just a cash box?
5. Should the cashier be able to sell an item with **zero stock**? *Default: yes, with a warning — never block a sale.*
6. ✅ Customer-facing display — **yes** (resolved above). Remaining sub-question: is the display a separate device or a second monitor on the same device? (Decides LAN link vs. same-origin mirror.)
7. Any existing branding — logo, colors — per branch or shared org-wide?
8. Roughly what does a busy hour look like (orders/hour) at the busiest branch?

---

## 13. Phasing

| Phase | Scope | Rough effort |
|---|---|---|
| **0 — Foundation** | Repo, Supabase schema + RLS (**org/branch/devices from day one**), auth, roles, branch-bound tablet, protected routing, design tokens | ~1–1.5 weeks |
| **1 — POS core (online)** | **Products-first** sell screen (slim category rail + product grid + cart), weight keypad, discounts, cash payment, order write | ~1.5 weeks |
| **2 — Offline layer** | Serwist SW, Dexie cache (per branch), order queue, idempotent sync, connection UI | ~1.5 weeks |
| **3 — Printing** | `PrinterAdapter` (BLE/network/USB), ESC/POS receipt builder, per-tablet pairing UI, reprint | ~1 week |
| **4 — Multi-branch** | Branches CRUD, add-branch + clone-menu, branch switcher, per-branch scoping/RLS hardening, devices/tablets management | ~1–1.5 weeks |
| **5 — Customer display** | `/display` route, `DisplayLink` (LAN/Realtime/BroadcastChannel), pairing, idle/active/payment/thank-you states, per-branch branding | ~1 week |
| **6 — Backoffice** | Dashboard (per-branch + consolidated), products, orders, audit logs, staff, settings | ~2 weeks |
| **7 — Inventory** | Stock movements, receive/yield/waste, variance report (per branch) | ~1 week |
| **8 — Shifts + reports** | Shift open/close, X/Z reading, reports w/ branch compare, CSV export | ~1 week |
| **9 — Pilot** | Run in one branch alongside the notebook for 1 week, then add a second branch as the real multi-branch test | ~1 week |

**Suggested first shippable slice (~4–5 weeks):** Phases 0–3 — a cashier can sell and print offline at one branch. Phases 4–5 (multi-branch + customer display) land next and are what turn it from "a POS" into "the owner's multi-branch POS." Backoffice/inventory/reports (6–8) can land while the store is already using it.

**Total to full v1: ~11–12 weeks solo.** The added multi-branch and customer-display scope is roughly +2 weeks over v0.2; both were schema-anticipated, so there's no rework, just additive build.

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Printer turns out to be Bluetooth Classic, not BLE | Blocks the core loop | Standardize branches on **Wi-Fi/LAN printers**; `PrinterAdapter` keeps network/USB/BLE swappable per tablet; confirm the model before Phase 3 |
| Sync duplicates orders after a flaky reconnect | Corrupt sales data | `local_uuid` UNIQUE + server-side idempotent upsert; branch+device order prefixes; airplane-mode drills |
| Cross-branch data leak (wrong branch sees another's numbers) | Trust + privacy failure | RLS scoped by `org_id`/`store_id` from day one; every scoped query tested with a two-branch fixture |
| Cashier rings up on the wrong branch on a shared account | Bad data, refunds | Tablet is *bound* to a branch at setup; cashier can't switch; branch label always visible in header |
| Customer display becomes a dependency and stalls sales | Slows the counter | `DisplayLink` is fire-and-forget; sale flow never awaits the display; display can be off entirely |
| Display can't mirror offline (Realtime needs internet) | Feature unusable at the stall | Prefer **LAN/WebRTC** or same-origin `BroadcastChannel`; Realtime is only the online fallback |
| Service worker caches a stale app version | Cashier sees old prices | Versioned SW with skipWaiting + in-app "Update available" prompt at shift boundaries |
| Inventory never reconciles because of yield loss | Owner stops trusting the numbers | Yield entry is P0; surface variance instead of hiding it |
| Adding a branch feels technical and the owner won't do it | Multi-branch unused | One-form add-branch + clone-menu; ≤ 30-min tablet onboarding target; no developer in the loop |
| Staff revert to the notebook under pressure | Adoption failure | Sub-20s checkout; hold/park orders; never block a sale on stock or print failure |
