# Lechon POS — Architecture

**Companion to:** [POS_PRD.md](POS_PRD.md) · [SCHEMA.md](SCHEMA.md) · [INTERFACES.md](INTERFACES.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

The three hard problems, in order: **(1) offline-first correctness**, **(2) multi-tenant isolation**, **(3) hardware I/O (printer, customer display)**. Everything below serves those.

---

## 1. Stack & runtime

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind + shadcn/ui, themed via [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Backend | Supabase — Postgres + Auth + RLS + Realtime + Storage |
| Hosting | Vercel (app) · Supabase (DB) |
| PWA / offline | Serwist service worker + Dexie/IndexedDB |
| Printer I/O | Web Bluetooth (BLE) · raw TCP (LAN, recommended) · WebUSB — behind `PrinterAdapter` |
| Customer display | WebRTC (LAN) · Realtime (online) · BroadcastChannel (same-device) — behind `DisplayLink` |
| State | React Query for server state; Zustand (or context) for cart/session; Dexie as source of truth offline |

**Client is offline-authoritative for sales.** The tablet must complete a sale with the network fully down; the server is a sync target, not a gatekeeper.

---

## 2. App structure (routes)

```
/                     login (email+password) / PIN unlock
/setup                first-run: bind tablet → branch, configure printer/display
/pos                  sell screen (cashier + admin)   ← DESIGN_SYSTEM §4
/pos/orders           order history / reprint (the "ORDERS" tab)
/display              customer-facing display (paired, passive)
/admin                backoffice shell + branch switcher
  /admin/dashboard    per-branch + "All branches"
  /admin/branches     add/edit branch, clone menu, devices
  /products           product and category CRUD (per branch)
  /admin/inventory    stock in / yield / waste / variance
  /admin/orders       list, void/refund, reprint
  /admin/shifts       X/Z reading
  /admin/reports      sales/item/category/cashier, CSV
  /admin/staff        users, roles, branch assignment, PIN
  /admin/audit        append-only log viewer
  /admin/settings     org / branch / device settings
```

**Route guards:** middleware reads the session + `profiles.role`/`store_id`. Cashiers hitting `/admin` → redirect to `/pos` + audit log. `/display` requires a valid pairing token, not a user session.

**Folder shape (suggested):**
```
src/
  app/…(routes)
  components/ (ui/, pos/, admin/, display/)
  lib/
    db/ (dexie schema, repositories)
    sync/ (queue, engine)
    supabase/ (client, server, rls-safe queries)
    printing/ (PrinterAdapter, escpos builder)
    display/ (DisplayLink)
    money.ts (centavo helpers), pricing.ts, orderno.ts
  stores/ (cart, session)
```

---

## 3. Offline-first sync — the core engine

### Write path (every sale)
1. Cashier completes payment → build the order in memory (centavos, snapshots).
2. **Write to Dexie first** (`orders`, `order_items`) with a client `local_uuid`, `order_no` (generated locally), and `created_at_device`. Status `pending`.
3. Fire the receipt print (fire-and-forget, non-blocking) and push cart state to the customer display.
4. UI shows success immediately. **The network was never awaited.**
5. The **sync queue** picks up `pending` orders and upserts to Supabase.

### Order number (offline-safe, no server round-trip)
`{branch_prefix}-{device_prefix}-{yyMMdd}-{seq}` — `seq` is a per-device daily counter kept in Dexie. Two tablets (even across branches) can never collide because branch+device prefixes differ. Server assigns nothing.

### Idempotent sync
- Each order carries a UNIQUE `local_uuid`.
- Sync does an **upsert on `local_uuid`** (`on conflict do nothing`). Replaying the queue after a flaky reconnect can only ever result in one server row.
- Queue item states: `pending → in_flight → synced` (or `→ failed → pending` on retry). Exponential backoff; manual "Sync now".
- On success, store `synced_at` locally; keep the row (for reprint/history) but mark synced.

### Read path / catalog cache
- On login/sync, cache **this branch's** `categories`, `products`, `stores.settings`, and the caller's profile into Dexie.
- The sell screen renders entirely from Dexie → instant, offline. Refresh on every successful sync.
- **Price snapshots** on `order_items` mean a price change mid-offline never rewrites a completed sale.

### Conflict rule
The order is **immutable truth**. Server stock is decremented from synced orders and may go negative; variance surfaces in the backoffice rather than blocking a sale (PRD §6.3). No merge logic on orders — they only ever insert.

### Failure/edge handling
| Situation | Behavior |
|---|---|
| App force-closed mid-queue | Dexie persists; queue resumes on next open |
| Print fails | Sale already saved; non-blocking "Retry print" |
| Reconnect after N offline sales | Exactly N server rows (idempotent) |
| SW cached stale app | Versioned SW + "Update available" prompt at shift boundary |

---

## 4. Multi-tenant / multi-branch model

- **Org → Branch → Device/Staff.** Isolation is enforced in the DB by RLS (see [SCHEMA.md](SCHEMA.md) §4), **not** by client filtering. The client never sends `org_id`; it's derived from the session's `profiles` row.
- **Tablet is branch-bound** at `/setup`; the binding lives in Dexie + a `devices` row. A cashier inherits the tablet's branch; they cannot switch.
- **Admin branch switcher** changes which `store_id` the backoffice queries; "All branches" aggregates across the org (admin RLS already permits the whole `org_id`).
- **Clone menu** on branch creation is a server function copying categories/products within the org.
- Every scoped query goes through a thin `lib/supabase` layer that assumes RLS is the guard — no query is trusted to filter correctly on its own; the two-branch test fixture (SCHEMA §7) is the proof.

---

## 5. Printing architecture

- One **`PrinterAdapter`** interface, three transports (`bluetooth | network | usb`), one shared **ESC/POS `ReceiptBuilder`**. Contracts in [INTERFACES.md](INTERFACES.md).
- Config is **per-device** (`devices.printer_config` + Dexie mirror), because the printer is physical to the tablet.
- **Recommended transport: `network` (raw TCP :9100)** to a LAN 80mm ESC/POS printer (PRD §6.4). Works fully offline over the branch router; survives tablet swaps.
- Printing is **out of the sale's critical path** — always fire-and-forget with a retry affordance. A print failure never loses or blocks a sale.
- Build the adapter + builder **first** in Phase 3 and test against real hardware day one.

---

## 6. Customer-facing display architecture

- One **`DisplayLink`** interface; the POS pushes cart snapshots (add/remove/total/tender/change/complete). Contract in [INTERFACES.md](INTERFACES.md).
- Transport preference: **WebRTC data channel over the branch LAN** (works offline) → **Supabase Realtime** (online fallback) → **BroadcastChannel** (display is a second monitor on the *same* device).
- The display is **passive and non-critical**: if it's off/disconnected, the sale flow is unaffected. Pairing token stored in `devices.paired_display_id`.
- `/display` runs fullscreen/kiosk; billboard theme (DESIGN_SYSTEM §7).

---

## 7. Security

- **Auth:** Supabase email+password. After first online login, store a **device-bound unlock credential**; offline re-entry via 4–6 digit **PIN** (`profiles.pin_hash`, hashed server-side; PIN verify works offline against the cached credential). 5 wrong PINs → 60s lockout.
- **Authorization:** RLS is the source of truth. App-layer role checks are UX only, never the security boundary.
- **Append-only:** `audit_logs`, `stock_movements`, and order immutability enforced by absent UPDATE/DELETE policies + triggers (SCHEMA §4).
- **Secrets:** service-role key server-only (Vercel env, never shipped to client). Client uses the anon key + RLS.
- **Audit everything sensitive** as it happens (login, PIN fail, void, refund, discount, price edit, stock move, branch/device change, sync error, permission denied). Don't retrofit.
- **PII:** SC/PWD name + ID captured on the order for legal compliance only; no customer directory (PRD §4). Keep it off URLs/logs.

---

## 8. Environments & deploy

| Env | DB | App |
|---|---|---|
| Local | Supabase local / dev project | `next dev` |
| Preview | Dev Supabase | Vercel preview per PR |
| Production | **Separate** Supabase project | Vercel production domain |

- Migrations are versioned SQL (Supabase CLI), applied to dev → prod. RLS verified in prod with the fixture.
- PWA installed on the actual tablet ("Add to Home Screen"); confirm SW update flow.
- Backups: Supabase PITR on for prod; document restore. Monitoring: error logging (Sentry), sync-failure alerting.

---

## 9. Key decisions (ADR summary)

| # | Decision | Why |
|---|---|---|
| 1 | Money as integer centavos | No float rounding on totals/change |
| 2 | Client-generated `local_uuid` + `order_no` | Offline-safe, collision-free, idempotent sync |
| 3 | RLS is the only trust boundary | Multi-tenant isolation can't rely on client filtering |
| 4 | Append-only orders/audit/stock | Trust in the till + keeps BIR-CAS path open (PRD §8) |
| 5 | Dexie is offline source of truth; server is a sync target | Sales must never await the network |
| 6 | Adapter interfaces for printer & display | Swap transport/hardware without a rewrite |
| 7 | LAN printer as default per branch | Removes BLE-vs-Classic risk; fits multi-branch |
| 8 | Org/Branch/Device split in schema from day 0 | Multi-branch is additive, not a migration |

---

## 10. Build order (see [tasks.md](tasks.md))

P0 foundation (schema+RLS+auth) → P1 online sell → P2 offline → P3 printing → P4 multi-branch → P5 display → P6–P8 backoffice/inventory/reports → P9 pilot. First shippable slice: P0–P3.
