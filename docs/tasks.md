# Lechon POS — Build & Deployment Tasks

**Companion to:** [POS_PRD.md](POS_PRD.md) (v0.3) · [MVP.md](MVP.md)
**How to use:** Work top-to-bottom. Each phase gates the next only where noted. Check boxes as you go and keep the tracker below in sync.

---

## 📊 Progress Tracker

| Phase | Name | Status | Progress | Gate |
|---|---|:--:|:--:|---|
| **P0** | Foundation & infra | 🟡 In progress | 5 / 9 | Schema + auth must exist before any feature |
| **P1** | POS core (online) | ⬜ Not started | 0 / 8 | — |
| **P2** | Offline layer | ⬜ Not started | 0 / 7 | Needs P1 sell flow |
| **P3** | Printing | ⬜ Not started | 0 / 7 | **Blocked on printer purchase (PRD §6.4)** |
| **P4** | Multi-branch | ⬜ Not started | 0 / 8 | Schema from P0 |
| **P5** | Customer display | ⬜ Not started | 0 / 6 | Needs P1 cart events |
| **P6** | Backoffice | ⬜ Not started | 0 / 8 | — |
| **P7** | Inventory | ⬜ Not started | 0 / 6 | Needs P6 shell |
| **P8** | Shifts & reports | ⬜ Not started | 0 / 6 | — |
| **P9** | Pilot & production deploy | ⬜ Not started | 0 / 8 | Everything above |

**Status legend:** ⬜ Not started · 🟡 In progress · ✅ Done · 🔴 Blocked
**First shippable slice:** P0 → P3 (sell + print offline, one branch). **Full MVP:** P0 → P9.

**Foundational docs (write-before-code):** ✅ [PRD](POS_PRD.md) · ✅ [MVP](MVP.md) · ✅ [DESIGN_SYSTEM](DESIGN_SYSTEM.md) · ✅ [SCHEMA](SCHEMA.md) · ✅ [ARCHITECTURE](ARCHITECTURE.md) · ✅ [INTERFACES](INTERFACES.md) · ✅ [UI_SPEC](UI_SPEC.md) · ✅ [TEST_PLAN](TEST_PLAN.md) · ✅ [SETUP](SETUP.md) · 🟡 Seed data (menu/branding — owner input)

---

## P0 — Foundation & Infrastructure
*Goal: an empty app that logs in, knows roles/branches, and has a locked-down schema.*

- [x] Scaffold Next.js 16 (App Router) + TypeScript + Tailwind v4. *(shadcn/ui deferred to P1 when first components land.)*
- [x] Create Supabase project; set up local `.env` and Vercel project (link repo, set env vars). *(env template + clients ready; needs your accounts — see SETUP.md.)* *(✅ hosted project `uzavkjftwcuixidxyopr` connected + seeded (org Dumala / Main Branch); Vercel deploy pending P9.)*
- [x] Write the schema (`organizations`, `stores`, `devices`, `profiles`, `categories`, `products`, `stock_movements`, `orders`, `order_items`, `shifts`, `audit_logs`) as SQL migrations. → `supabase/migrations/0001_schema.sql` *(✅ applied + verified on local stack 2026-07-31)*
- [x] Enable **RLS on every table**; policies (admins by `org_id`, cashiers by `store_id`; append-only audit/stock + triggers). → `0002_rls.sql`. *(Two-branch test fixture still TODO — TEST_PLAN §1.)* *(✅ applied + verified on local stack 2026-07-31: 11 tables RLS-on, 29 policies, 4 triggers)*
- [x] Supabase Auth: email+password login page at root; `profiles` row created on invite. *(Client/server helpers ready; login UI pending.)* *(✅ first login verified on hosted 2026-07-31 — admin lands on /admin.)*
- [x] Protected routing skeleton via Next 16 `proxy.ts`: guards `/pos` `/admin`, cashier→`/pos`. *(Audit-log-on-violation TODO.)*
- [ ] Device binding: on first setup, bind tablet to a branch; persist locally; seed `devices` row.
- [x] Design tokens wired to Tailwind v4 from `ui.png` (globals.css `@theme` + Plus Jakarta Sans + `money.ts`). Smoke page verifies render; `npm run build` green.
- [ ] CI: lint + typecheck on PR; Vercel preview deploys per branch.

## P1 — POS Core (Online)
*Goal: ring up a real sale online and write it to the DB.*

- [x] Sell-screen layout: **slim category rail (~12%) · product grid (hero) · cart (right ~36%)**. *(✅ e2e-verified on local stack 2026-07-31)*
- [x] Product grid from catalog; category rail filters; `/kg` badge for weight items.
- [x] Fixed-price tap = add/increment; weight item = keypad modal (kg, 2 decimals, live line total). *(✅ 1.35kg × ₱850 → ₱1,147.50)*
- [x] Cart: edit qty/weight, remove line, order note field, running total (tabular figures).
- [x] Discounts: None / Senior / PWD (name + ID capture, 20%) / Custom % (Admin PIN above threshold). *(PIN threshold deferred to P6 settings)*
- [x] Charge flow: Cash (tendered → change, quick-tender chips), GCash/Maya (ref), Card (last 4). *(✅ ₱4,097.50 sale / ₱5,000 tendered → ₱902.50 change)*
- [x] Hold/park orders (tray, max 10); branch label in header.
- [x] Write order + `order_items` with price snapshots; success state → fresh order. Audit-log the sale. *(✅ atomic `place_order` RPC — order AB1-260731-012528: 2 items + audit row verified in DB)*

## P2 — Offline Layer
*Goal: never lose a sale, never block on the network.*

- [x] Serwist service worker: precache app shell; versioned SW with `skipWaiting` + update prompt. *(Implemented as manual `public/sw.js` — Serwist is not compatible with this Next 16 build; registered in production only so dev chunks never go stale.)*
- [x] Dexie/IndexedDB stores: cache **this branch's** catalog, prices, settings; refresh on sync. *(`src/lib/offline.ts` — products + categories + profile, network-first, cache fallback)*
- [x] Write orders to local DB first; queue for sync; UI never awaits network. *(outbox in Dexie; success shows instantly, syncs in background)*
- [x] `local_uuid` idempotency key; order number `{branch}-{device}-{yyMMdd}-{seq}`. *(✅ verified: AB1-DXF8MHI-260731-0001..0003)*
- [x] Sync engine: server-side idempotent upsert; exponential backoff; manual "Sync now". *(✅ `place_order` 0006: same local_uuid replayed → same order id, no dupes)*
- [x] Connection indicator pill: `Online / Offline · N pending`. *(✅ e2e-verified)*
- [x] Airplane-mode drill: 15 offline sales + reconnect → exactly 15 server orders, no dupes; force-close resumes. *(✅ drill passed locally: 3 offline sales → API down → reconnect → exactly 3 orders, 3 audit rows, unique uuids; full 15-on-device drill at pilot, P9)*

## P3 — Printing  🔴 *(confirm printer purchase first — PRD §6.4)*
*Goal: an order slip prints in ≤3s, offline, per tablet.*

- [ ] **Buy-one-to-test:** put the recommended LAN printer on a router with no internet; confirm raw TCP to `ip:9100` prints ESC/POS.
- [ ] `PrinterAdapter` interface: `bluetooth | network | usb`, single ESC/POS receipt builder.
- [ ] `network` adapter (raw TCP :9100) — the recommended default; then `bluetooth` (BLE/GATT) and `usb` (WebUSB).
- [ ] Receipt builder: branch name/address, order #, items, discount+ID, totals, payment, change, "not an official receipt" line; 58/80mm.
- [ ] Per-tablet printer settings screen (transport + connection + paper width), stored on the device + `devices` row.
- [ ] Reprint last / reprint from history (marked `REPRINT`, logged); auto-reconnect.
- [ ] Failure handling: non-blocking "Retry print" toast; sale always completes.

## P4 — Multi-Branch
*Goal: owner adds a branch and a tablet joins it — no developer.*

- [ ] Backoffice **Branches**: list, add-branch form (name/address/TIN/receipt/paper/currency), edit, deactivate.
- [ ] **Clone menu** on branch create (copy products/categories/prices from a branch or org template).
- [ ] Branch switcher in backoffice top bar + **"All branches"** consolidated mode.
- [ ] New-tablet onboarding flow: admin login → pick branch → pair printer → hand to cashier (≤30 min).
- [ ] **Devices/tablets** management: per branch, show printer transport, last-seen, prefix; rename/retire.
- [ ] Harden per-branch scoping across products, inventory, orders, shifts, audit (RLS + query filters).
- [ ] Two-branch isolation test: price edit at A doesn't touch B; cashier A can't see/switch to B.
- [ ] Consolidated dashboard: totals sum across branches + per-branch breakdown table.

## P5 — Customer-Facing Display
*Goal: passive second screen mirrors the live order; never blocks the sale.*

- [ ] `/display` route: idle (branding) · active (order) · payment (change due, big type) · thank-you states.
- [ ] `DisplayLink` interface; implement **LAN/WebRTC** (offline-capable) as primary transport.
- [ ] Realtime fallback (online) + same-origin `BroadcastChannel` (single-device monitor) paths.
- [ ] Pairing: display ↔ a POS tablet (store in `devices.paired_display_id`).
- [ ] Push cart events from POS (add/remove line, total, tendered, change, complete) fire-and-forget.
- [ ] Per-branch branding on idle screen; verify sale is unaffected when display is off/disconnected.

## P6 — Admin Backoffice
*Goal: enough tooling to run the business from a phone.*

- [ ] Backoffice shell: responsive layout, branch switcher, nav, auth guards.
- [ ] Dashboard: today's sales, orders, avg ticket, cash vs. e-wallet, top items, kg sold, low-stock alerts (per branch + consolidated).
- [ ] Products CRUD (per branch): pricing mode, price, image, active/track-stock toggles; copy to another branch; price changes versioned in audit.
- [ ] Orders: filterable list (branch/date/cashier/method/status), detail drawer, void/refund (admin, reason), reprint.
- [ ] Staff: invite/create, assign branch + role, set/reset PIN, deactivate.
- [ ] Audit log viewer: append-only, filter by branch/actor/action/date.
- [ ] Settings split: **org** / **branch** / **device** (per PRD §6.6).
- [ ] Empty/loading/error states + mobile pass (owner uses a phone).

## P7 — Inventory
*Goal: perishable stock reconciles per branch.*

- [ ] Stock model on `stock_movements` (on-hand always derived from the ledger, per branch).
- [ ] Stock In (whole lechon: units + gross kg + cost; packaged goods).
- [ ] Yield entry (whole → chopped kg + waste kg).
- [ ] Wastage/spoilage entry (reason) + stock adjustment (mandatory reason).
- [ ] Low-stock alerts wired to dashboard; sell-with-zero-stock warns, never blocks.
- [ ] End-of-day variance view: opening + received − sold − wasted = expected vs. counted.

## P8 — Shifts & Reports
*Goal: trustworthy till + numbers the owner reads weekly.*

- [ ] Shift open (declared cash) / close (counted vs. expected, variance, note over threshold), per branch/device.
- [ ] X-reading (cashier) / Z-reading (admin), per branch.
- [ ] Reports: sales by day/week/month, item, category, cashier; hourly heatmap.
- [ ] Discount report; branch-vs-branch comparison.
- [ ] CSV export.
- [ ] Reconcile reports against raw orders on a real day's data.

## P9 — Pilot & Production Deployment
*Goal: live in a real store, then a second branch as the true multi-branch test.*

- [ ] Production Supabase (separate project from dev); run migrations; verify RLS in prod.
- [ ] Vercel production domain + PWA install verified on the actual tablet(s); "Add to Home Screen".
- [ ] Seed the real org, first branch, real menu/prices, staff accounts + PINs.
- [ ] On-device checklist: printer paired, customer display paired, offline drill passed, receipt looks right.
- [ ] Backups: confirm Supabase PITR/backups on; document restore steps.
- [ ] Basic monitoring: error logging (e.g. Sentry), Vercel analytics, sync-failure alerting.
- [ ] **Pilot week:** run one branch alongside the notebook; log every issue; fix fast.
- [ ] **Add branch #2** from the account as the real multi-branch validation; sign off against MVP success bars.

---

## Cross-cutting (do continuously, not a phase)
- [ ] Audit-logging on every sensitive action as features land (don't retrofit).
- [ ] Accessibility & tap-target sizing on every POS screen.
- [x] Test data: keep a two-branch, multi-cashier fixture for every RLS/scope test. *(✅ `supabase/seed.sql` + `scripts/rls-fixture.mjs`, 18/18 §1 assertions green 2026-07-31)*
- [ ] Update [MVP.md](MVP.md) done-criteria and this tracker as phases complete.
