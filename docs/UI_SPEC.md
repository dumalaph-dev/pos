# Dumala POS — UI Spec (Screen States)

**Companion to:** [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (tokens/theme) · [POS_PRD.md](POS_PRD.md) · [INTERFACES.md](INTERFACES.md)
**Rule:** every screen defines all of **empty · loading · error · offline · success**. "Offline is a neutral state, not an error" (PRD §9). All colors are token names from the design system.

---

## 1. Login / PIN unlock (`/`)

- **Online login:** centered card on `--bg`, logo, email + password, primary CTA "Sign in" (`--accent`). Error → inline message under the field (`--danger`), never a full-page error.
- **PIN unlock (offline re-entry):** big 4–6 digit keypad, per DESIGN_SYSTEM. States: default · wrong-PIN (shake ≤150ms, remaining-attempts hint) · **locked** (after 5 fails → 60s countdown, keypad disabled).
- **Offline + never-logged-in-here:** blocking message "Connect to the internet once to set up this tablet." (PRD §6.1).

## 2. First-run setup (`/setup`, admin only)

Wizard, one step per screen:
1. **Pick branch** — list of the org's branches (`--surface` cards); select binds the tablet.
2. **Configure printer** — transport picker (Network / Bluetooth / USB), then connection fields (IP:port default `:9100` / BLE scan / USB grant), paper width 52·58·80, **"Print test slip"** button with success/fail state.
3. **Pair customer display** *(optional)* — show pairing token/QR; "Skip".
4. **Done** — "This tablet is set up for **{Branch}**." → `/pos`.

## 3. POS Sell Screen (`/pos`) — the primary surface

Layout: DESIGN_SYSTEM §4 (slim rail · product grid hero · order panel). States:

| State | Treatment |
|---|---|
| **Loading catalog** | Skeleton tiles (shimmer ≤150ms) in the grid; rail + panel chrome visible immediately |
| **Empty category** | Centered "No items in {category}" with a muted illustration; other categories still tappable |
| **Search no-results** | "No products match '{q}'" under the search bar; grid area only |
| **Offline** | Header pill `Offline · N pending` (`--surface`, `--text-muted`, never red). Grid fully usable from Dexie cache |
| **Syncing** | Pill → `Syncing…` with subtle pulse; "Sync now" in More menu |
| **Sync error** | Pill stays `Offline · N pending`; toast "Couldn't sync — will retry" (non-blocking) |

**Top bar:** see §3.1 for the placement contract — what lives in the bar, what lives behind a menu, and how to decide.

### 3.1 Top bar — placement contract

*Added 2026-08-15. On 2026-08-14 the system-health widget moved navbar → account menu → back to the navbar across four commits. That was a missing rule, not a design disagreement. This section is the rule.*

The bar has two states. **Collapsed** is a single full-width button that reclaims vertical space on a tablet; **expanded** is the full `nav`. Collapsing is a cashier action and must never be automatic mid-sale.

**Three homes. Each answers exactly one question:**

| Home | The question it answers | Contents today |
|---|---|---|
| **Navbar** (always visible) | "Can a cashier afford to *miss* this mid-sale?" | Brand + branch, POS/ORDERS tabs, Shift, **System health**, account trigger, sync pill |
| **More menu** | "Is this per-terminal configuration, touched rarely and never mid-sale?" | Hold, Receipts, Display, Printer Settings |
| **Account menu** | "Is this scoped to the *person* signed in rather than the terminal?" | Role/branch meta, Account settings, Sign out |

**The test that settles placement:** *does the cashier need to notice this without opening anything?*

System health reports pending sync, failed prints, and a disconnected customer display — every one of them a condition where a sale has **already** silently gone wrong. Behind the account menu it is discovered at end of shift instead of at the sale that failed. That is why it belongs in the navbar and why moving it out was reverted. Do not move it again without changing this rule first.

Sign out and Account settings are the mirror image: per-person, never urgent, never needed mid-sale, and actively dangerous as one-tap targets sitting near CHARGE. They stay behind the account menu.

**The collapsed state must preserve every ambient signal.** Collapsing is a space decision, never an information decision. The collapsed button therefore still carries branch identity, the online/offline/sync-issue dot, and the pending count. A signal that only exists in the expanded bar is a bug — a cashier who prefers the collapsed bar must not see less.

**Sync state appears in three places on purpose, in this precedence:**

1. `sync-pill` — canonical, expanded nav, appears only when offline / pending / failed.
2. Collapsed dot + label — the collapsed-state fallback for the same condition.
3. System health panel — detail on demand (counts, oldest queued sale, display status).

Do not add a fourth surface. A new ambient signal extends the health panel and, if a cashier must not miss it, promotes to the pill — it does not get its own chrome.

**Before moving anything in this bar,** state in the change description which of the three homes it lands in and which question above it answers. A move that cannot answer one of those questions is churn.

**Product tile interactions:**
- Fixed item → tap adds qty 1 / increments; brief press feedback (scale 0.98).
- Weight item (`/kg` pill) → opens **Weight Keypad modal** (§4). Never silently adds.
- Out-of-stock (track_stock) → tile shows a `Low`/`Out` corner tag (`--warning`); still tappable with a warning (PRD default: never block a sale).

**Order panel (cart):**
- **Empty:** "No items yet — tap a product to start." SAVE/CHARGE disabled (`--text-subtle`).
- **Line row:** stepper `[− n +]`, name + `x{qty}`, line total (tabular). Weight lines show `1.35 kg` instead of `x{qty}`.
- Remove: row ✕ or swipe; confirm only if line total is large (config).
- **Add Customer / Discount** row → Discount sheet (§6).
- Totals: Subtotal, Discount, **TOTAL** (hero, `--accent`).
- **SAVE** (park order) + **CHARGE** (`--accent`).

## 4. Weight Keypad modal

- Trigger: tapping a `per_kg` product.
- Content: product name + `₱{price}/kg`, big numeric display (kg, 2 decimals), numpad (0–9, `.`, ⌫), **live line total** updating as digits enter, Confirm (`--accent`) / Cancel.
- States: default (0.00) · valid (>0 → Confirm enabled) · invalid (0.00 → Confirm disabled).
- Editing an existing weight line reopens this pre-filled.

## 5. Payment modal (Charge)

- Method tabs: **Cash · GCash · Maya · Card**.
- **Cash:** amount-tendered input + quick-tender chips (Exact, ₱500, ₱1000), live **Change Due** (large). Confirm disabled while tendered < total (insufficient state on the field, `--warning`).
- **GCash/Maya:** reference-number field (required).
- **Card:** last-4 field (manual).
- Confirm → **Success state**: full-panel success, **Change Due in hero type** (`--success`), auto-print fires, 3s → fresh empty order.
- **Print-failed** sub-state: success still shown + "Retry print" button; the sale is already saved (never blocked).

## 6. Discount sheet (SC / PWD / Custom)

- Options: None · Senior Citizen · PWD · Custom %.
- **SC/PWD:** require **name + ID/OSCA number** (captured on order), apply 20% + VAT-exempt handling.
- **Custom %:** free input; if above the org threshold → **Admin PIN prompt** blocks apply (PRD §6.2).
- Note: this is the reference mockup's "Add Customer" repurposed — discount capture, not a customer directory (DESIGN_SYSTEM §6).

## 7. Park / Hold tray

- "Hold" parks current cart, opens fresh order. Tray (max 10) accessible from top bar: list of parked orders with item count + total + time; tap to resume; badge shows count. Full (10) → "Hold" disabled with hint.

## 8. Orders tab / history (`/pos/orders`)

- List of this branch's recent orders (order no, time, cashier, total, status chip). States: loading (skeleton rows) · empty ("No orders yet today") · offline (shows locally-cached + pending, pending marked).
- Row → detail drawer: line items, payment, **Reprint** (marks `REPRINT`, logs). Void/refund only if admin (else hidden).

## 9. Customer-Facing Display (`/display`)

Billboard theme (DESIGN_SYSTEM §7). States drive off `DisplayState`:
- **Idle:** logo + "FRESHLY ROASTED EVERYDAY / Salamat!".
- **Active:** line list (big), running **TOTAL** (64–80px, `--accent`).
- **Payment:** TOTAL + **CHANGE** (hero, `--success`).
- **Thank-you:** brand + "Salamat po!" → idle.
- **Disconnected:** silently holds last idle/branding; **never shows an error to the customer**; POS is unaffected.

## 10. Admin Backoffice (`/admin/*`)

- **Shell:** responsive (owner on a phone), top bar with **branch switcher** (`{Branch}` / "All branches"), left nav.
- Every list view defines: loading (skeleton) · empty · error (inline retry) · offline (read-only cached where available).
- **Dashboard:** stat cards (today's sales, orders, avg ticket, cash vs e-wallet, kg sold), low-stock alerts; "All branches" adds a per-branch breakdown table.
- **Branches:** list + **Add branch** form (with "clone menu from…") + Devices sub-view.
- **Products / Inventory / Orders / Shifts / Reports / Staff / Audit / Settings:** standard table/detail + form patterns; destructive actions (void, deactivate) use `--danger` + confirm.
- **Settings** split into **Org / Branch / Device** tabs (device tab configures printer/display).

## 11. Global patterns

- **Toasts:** non-blocking, bottom, auto-dismiss; sync/print issues live here, never modal.
- **Confirm dialogs:** only for irreversible/large actions (void, delete, remove large line).
- **Buttons/inputs/steppers:** exactly per DESIGN_SYSTEM §5; tap targets ≥ 48px, tiles ≥ 96px.
- **Motion:** ≤150ms state transitions only; no decorative animation on `/pos`.
- **Numbers:** tabular figures everywhere money/qty appears.
- **Reduced-motion:** respect `prefers-reduced-motion` (disable shimmer/pulse).
