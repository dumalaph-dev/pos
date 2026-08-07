# Dumala POS — Build & Deployment Tasks

**Companion to:** [POS_PRD.md](POS_PRD.md) (v0.3) · [MVP.md](MVP.md)
**How to use:** Work top-to-bottom. Each phase gates the next only where noted. Check boxes as you go and keep the tracker below in sync.

---

## Current project status

**Last updated:** 2026-08-07

This section is the current source of truth for delivered work and the next gate. Keep it updated in the same change as every feature, migration, QA pass, commit, or deployment.

| Workstream | Current status | Next gate |
|---|---|---|
| Foundation and infrastructure | Complete (9/9 checklist items) | Keep CI and preview deployments green |
| POS online core | Complete | Pilot validation |
| Offline layer | Complete | Full 15-sale pilot drill |
| Printing | In progress (6/7) | Physical LAN printer slip validation |
| Multi-branch | Complete | Production second-branch sign-off |
| Customer display | Not started | Build `/display` pairing and live cart mirror |
| Admin backoffice | In progress (manager QA, employee save-flow, price-audit hardening, and kg metric verified) | Reachable LAN printer, staff-login configuration, and remaining P6 polish |
| Inventory workflow | Complete | Maintain regression coverage |
| Inventory reporting and exports | Authenticated admin and manager QA passed | Reconciliation against broader live data |
| Shifts, till, and Z-readings | Implemented and verified on the local stack | Apply `0024` to the hosted project, then authenticated till QA |
| Store-owner onboarding and guidance | Implemented | Verify first-run and mobile behavior on the deployed app |
| Admin workspace themes | Merged in PR #2 | Verify Classic/Light/Dark/Retro on the live main deployment |
| Production pilot | Not started | Production Supabase, device setup, pilot week, and branch #2 |

### Recent delivery log

- **2026-08-05 — Admin workspace theme polish (working tree):** Added immediate theme preview on the Settings page, save pending feedback, shared `/admin` layout revalidation, more readable Classic/Light/Dark palettes, a new Retro theme, and updated swatches/previews. `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The changes are currently uncommitted on `main`.
- **2026-08-05 — P6 Orders operations (working tree):** Added migration `0020_order_actions.sql` for immutable, one-time admin void/refund reversals that restore tracked stock and write an audit event. The Orders detail now supports browser-configured reprint with post-print audit logging, reason-required admin actions, success/error feedback, and manager read-only messaging. `npm run typecheck` and `npm run lint` pass; migration application and hosted/browser verification remain pending.
- **2026-08-05 — P0 foundation completion (working tree):** Confirmed the existing `/setup` flow completes branch-scoped device binding, stores the local binding, registers printer settings, and writes an audit event. Added `npm run typecheck` and `.github/workflows/ci.yml` for PR/main typecheck, lint, and production-build validation. Vercel preview deployments remain managed by the linked Vercel project and are part of deployment verification.
- **2026-08-05 — Inventory reporting and exports:** Merged as `68e8eb9`. Inventory, movement, yield/waste, low/out-of-stock, and expected-versus-counted variance report views include branch/date/product/category/supplier filters and CSV export paths. End-to-end QA is the next reporting gate.
- **2026-08-05 — Store-owner onboarding and guidance:** Merged as `25d9ffa`. The compact checklist, progress indicator, unfinished-setup suggestions, contextual feature help, dismissible tips, and Settings restore action are in place.
- **2026-08-05 — Inventory workflow:** Merged as `208b76c`. Whole-lechon yield/waste entry, configurable dashboard low-stock alerts, and end-of-day count/variance adjustments are implemented.
- **2026-08-05 — Admin dashboard settings baseline:** Merged as `e7fa396`. Organization branding, dashboard identity, and persisted workspace theme settings are available to admins.
- **2026-08-06 — P6 backoffice hardening + Inventory Reporting QA:** Added and applied `0021_product_price_audit.sql`; the hosted `product_price_audit` trigger is present and records price changes in the append-only audit ledger. Authenticated admin route checks passed for Employees, Roles & Permissions, Attendance, Payroll, Leave Requests, and Audit Log. Inventory Reporting QA passed for category/product/supplier filters, clear state, totals, movements, three CSV download endpoints, and a 390x844 viewport with no horizontal overflow. Exact evidence is recorded below.
- **2026-08-06 — Remaining P6 gate pass:** Temporary hosted manager read-only QA passed across Orders, Inventory, Products, Settings, Employees, and Inventory Reports; the temporary Auth/profile was deleted after the pass. The admin employee save-flow passed with a reversible Juan Dela Cruz job-title change and restore. The dashboard now exposes an explicit `Kg sold` metric from `order_items.weight_kg`; the 390x844 dashboard check passed with no horizontal overflow. Software printer validation passed, but the real LAN target remained unreachable.

### Immediate next task

1. Apply `0024_shifts_and_z_readings.sql` to the hosted project, then run authenticated till QA: open a shift on the POS, ring a sale, read the X-reading, close with a counted drawer, and generate the Z-reading from `/admin/shifts`.
2. Put the real LAN printer on the same network and provide/confirm its reachable IP; rerun the physical ESC/POS validation and observe the slip, including the new X/Z reading slips.
3. Finish the remaining P6 configuration/polish: hosted employee-login provisioning needs a valid project service key plus `EMPLOYEE_INITIAL_PASSWORD`; the dashboard cash/e-wallet breakdown, settings split, and full-phone pass remain open.
4. Reconcile reporting against a broader real-day data set; the remaining P8 sales/discount/branch-comparison reports are still open.

---

## 📊 Progress Tracker

| Phase | Name | Status | Progress | Gate |
|---|---|:--:|:--:|---|
| **P0** | Foundation & infra | ✅ Done | 9 / 9 | Device binding and CI are implemented; deployment verification remains in P9 |
| **P1** | POS core (online) | ✅ Done | 8 / 8 | — |
| **P2** | Offline layer | ✅ Done | 7 / 7 | — |
| **P3** | Printing | 🟡 In progress | 6 / 7 | **Physical LAN printer validation pending (PRD §6.4)** |
| **P4** | Multi-branch | ✅ Done | 8 / 8 | Schema from P0 |
| **P5** | Customer display | ⬜ Not started | 0 / 6 | Needs P1 cart events |
| **P6** | Backoffice | 🟡 In progress | Core admin slices implemented | Hosted/browser QA and production hardening |
| **P7** | Inventory | ✅ Done | 6 / 6 | Maintain regression coverage |
| **P8** | Shifts & reports | 🟡 In progress | Shifts, X/Z readings, sales reports, and inventory reporting implemented | Authenticated till QA; reconcile against a real day's data |
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
- [x] Device binding: on first setup, bind tablet to a branch; persist locally; seed `devices` row. *(Implemented in `/setup`: branch-scoped `devices` insert, local binding, printer settings, and `device.created` audit event.)*
- [x] Design tokens wired to Tailwind v4 from `ui.png` (globals.css `@theme` + IBM Plex Sans + `money.ts`). Smoke page verifies render; `npm run build` green.
- [x] CI: lint + typecheck on PR; Vercel preview deploys per branch. *(`.github/workflows/ci.yml` now runs typecheck, lint, and build on pull requests and `main`; Vercel preview behavior still needs live verification after the next push.)*

P0 implementation is complete in source (9/9). Production preview deployment verification remains part of P9.

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

## P3 — Printing  🟡 *(confirm physical printer first — PRD §6.4)*
*Goal: an order slip prints in ≤3s, offline, per tablet.*

- [ ] **Buy-one-to-test:** put the recommended LAN printer on a router with no internet; confirm raw TCP to `ip:9100` prints ESC/POS. *(2026-08-03: attempted the active LAN peer `192.168.254.116` and scanned `192.168.254.0/24`; no TCP `9100` listener was reachable, so no physical slip was observed.)*
- [x] `PrinterAdapter` interface: `bluetooth | network | usb`, single ESC/POS receipt builder. *(`src/lib/printer.ts` + `src/lib/receipt.ts`; mock bridge validation passes the PWA-equivalent adapter path.)*
- [x] `network` adapter (raw TCP :9100) — the recommended default; then `bluetooth` (BLE/GATT) and `usb` (WebUSB). *(2026-08-03: mock success, forced unreachable target, and retry all pass; real hardware remains pending.)*
- [x] Receipt builder: branch name/address, order #, items, discount+ID, totals, payment, change, "not an official receipt" line; 58/80mm. *(✅ 12/12 unit checks; VAT split now computed: VAT-inclusive prices, SC/PWD exempt)*
- [x] Per-tablet printer settings screen (transport + connection + paper width), stored on the device + `devices` row. *(✅ settings modal + Test print; admin saves also upsert the devices row)*
- [x] Reprint last / reprint from history (marked `REPRINT`, logged); auto-reconnect. *(✅ Reprint button prints last order + `order.reprint` audit row)*
- [x] Failure handling: non-blocking "Retry print" toast; sale always completes. *(adapter/bridge failure → retry is automated and passing; the POS toast plus sale-preservation step still needs the on-device run.)*

### P3 validation record — 2026-08-03

- `npm run printer:validate:mock`: PASS — final run delivered the exact 988-byte ESC/POS payload in 7ms, passed 8/8 capture checks, returned the expected `ECONNREFUSED` failure, and delivered the retry in 4ms with 8/8 checks.
- Existing `node --experimental-strip-types scripts/test-print.mjs`: PASS — 12/12 receipt-byte checks through WebSocket bridge → TCP `9100` mock.
- Real-store result: BLOCKED by current network state, not by a code failure. The workstation is `192.168.254.105`; the only visible peer `192.168.254.116` refused `9100`, and the full `/24` scan found no open `9100`. Re-run `node --experimental-strip-types scripts/validate-printer.mjs --printer-ip <store-printer-ip>` when the printer is powered on and on the same LAN, then observe the physical slip before marking the first item complete.

## P4 — Multi-Branch
*Goal: owner adds a branch and a tablet joins it — no developer.*

- [x] Backoffice **Branches**: list, add-branch form (name/address/TIN/VAT/currency), edit, deactivate. Receipt and paper settings remain in the POS settings workspace.
- [x] **Clone menu** on branch create (copy products/categories/prices from a branch or org template). *(Migration `0016_p4_branch_workflows.sql` preserves catalog metadata, clears org-wide SKU/barcodes, and records clone failures for recovery.)*
- [x] Branch switcher in backoffice top bar with persisted branch context and an **"All branches"** selection.
- [x] Apply the selected branch context to catalog and inventory reads, forms, metrics, and server-side writes.
- [x] Make the consolidated **"All branches"** dashboard plus branch-scoped orders and reports consume the selected context. Dashboard, orders, sales analytics, reports, and CSV export now honor the top-bar branch context.
- [x] New-tablet onboarding flow: admin login → pick branch → pair printer → hand to cashier (≤30 min). *(Guided `/setup` flow persists a device binding locally, registers the server device, and offers a test slip.)*
- [x] **Devices/tablets** management: per branch, show printer transport, last-seen, prefix; rename/retire. *(POS → Hardware now follows the global branch context and audits device changes.)*
- [x] Harden per-branch scoping across products, inventory, orders, shifts, audit (RLS + query filters). *(Catalog/inventory/orders/reports/dashboard/audit/CSV reads and writes are branch-aware; existing RLS remains the database boundary.)*
- [x] Two-branch isolation test: price edit at A doesn't touch B; cashier A can't see/switch to B. *(Covered by `scripts/rls-fixture.mjs`; the local fixture should be rerun when Docker/Supabase is available.)*
- [x] Consolidated dashboard: totals sum across branches + per-branch breakdown table.

P4 implementation is complete (8/8 checklist items). The progress table above predates this final workflow slice; the completed checklist is the source of truth for the P4 gate.

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
- [ ] Dashboard: today's sales, orders, avg ticket, cash vs. e-wallet, top items, kg sold, low-stock alerts (per branch + consolidated). *(Overview slice implemented: live sales, top items, branch pulse, recent orders, low/out-of-stock alerts, and an explicit kg-sold metric; the cash/e-wallet breakdown remains pending.)*
- [x] Products CRUD (per branch): pricing mode, price, image, active/track-stock toggles; copy to another branch; price changes versioned in audit. *(Hosted `0021_product_price_audit.sql` is applied; the `product_price_audit` trigger is present on `public.products`.)*
- [x] Orders: filterable list (branch/date/cashier/method/status), detail drawer, admin-only reason-required immutable void/refund reversals with tracked-stock restoration and audit logging, browser reprint with audit.
- [ ] Staff: invite/create, assign branch + role, set/reset PIN, deactivate.
- [x] Employee workspace slice: reference-matched Employees dashboard with live employee KPIs, searchable/paginated directory, roles & permissions, attendance, payroll, leave requests, quick actions, and CSV export. *(Implemented 2026-08-03; authenticated route and reversible admin save/restore checks passed 2026-08-06; employee-login provisioning still needs valid server configuration.)*
- [x] Audit log viewer: append-only, filter by branch/actor/action/date. *(Implemented 2026-08-03; authenticated browser route check passed 2026-08-06 and showed existing order events.)*
- [ ] Settings split: **org** / **branch** / **device** (per PRD §6.6).
- [ ] Empty/loading/error states + mobile pass (owner uses a phone).

### P6 backoffice and Inventory Reporting QA — 2026-08-06

- Hosted P6 hardening: `supabase/migrations/0021_product_price_audit.sql` applied successfully. `npx --yes supabase migration list --linked` reports local `0021` = remote `0021`. Hosted verification found `public.audit_product_price_change()` and the `product_price_audit` trigger: `AFTER UPDATE OF price`, guarded by `old.price IS DISTINCT FROM new.price`, writing `product.price_changed` audit entries.
- Authenticated P6 route checks passed as Klein / Admin / Main Branch. Roles & Permissions showed `Admin editing enabled`; Attendance showed date controls and employee rows; Payroll showed period `2026-08-03` through `2026-08-09`, a `Record payroll` form, and no payroll records; Leave Requests showed `No leave requests yet`; Audit Log showed the existing `order.created`, `order.voided`, and `order.reprint` events. No protected write/save was performed.
- Inventory Reporting opened at `/admin/reports/inventory` for `2026-07-08` through `2026-08-06`, Main Branch (`83d485dd-bd00-4ffa-a3f2-344566177baf`). The authenticated admin badge and filters were visible. Category `Codex Image QA 20260806`, the matching product, and supplier `Pork Farm` each preserved the expected row; clearing filters returned to the unfiltered report with only the branch/date scope active.
- Exact report result: 1 tracked product, 0 low stock, 1 out of stock, estimated value `₱0`; the row was `Codex Image QA Product 20260806`, `0 pcs` on hand, minimum `2 pcs`, Out of stock, `₱0`. Movements contained 2 records: POS sale net `-1 pcs` and manual adjustment net `+1 pcs`; yield entries were 0 and variance count lines were 0.
- CSV export checks initiated all three browser downloads using the filter-preserving endpoints `kind=inventory`, `kind=movements`, and `kind=variance`. The in-app browser returned `net::ERR_ABORTED` for each download response (expected browser behavior for a file download); the report page remained available after each attempt. File contents were not inspected through the in-app browser API.
- Responsive check passed at `390x844`: report and filter content remained available in the accessibility snapshot, document/body width was `375px`, and horizontal overflow was false. The viewport was restored afterward.
- Follow-up gates: physical printer validation, hosted employee-login provisioning, dashboard cash/e-wallet breakdown, settings split, and the remaining full-phone polish checklist. Broader real-day report reconciliation and shifts/till reports remain P8 work.

### Remaining P6 gate pass — 2026-08-06

- Manager permission QA passed in an isolated local app session on port `3001` using a temporary confirmed hosted profile scoped to Main Branch. Orders showed `Manager access is read-only for order operations.` with zero `Void order` and `Refund order` controls while `Reprint` remained available. Inventory showed the read-only status and no stock-write submit control. Products showed `Create product` disabled and the POS-visibility switch disabled. Settings showed `Manager view only`, five editable controls disabled, and `Save dashboard settings` disabled. Employees showed `Manager view only`. Inventory Reports loaded with the `Manager read-only` badge and all report exports. The temporary Auth user/profile was deleted afterward; no test manager account remains.
- Employee save-flow passed as admin using Juan Dela Cruz: changed `Job title` from `Cashier` to the temporary marker `Cashier QA`, received the `saved=employee-updated` redirect, confirmed the changed row, then restored `Cashier` and received the same successful redirect. No net employee data change remains.
- P6 dashboard polish: added the explicit `Kg sold` KPI from completed `order_items.weight_kg` values in `src/app/admin/page.tsx`. The rebuilt authenticated dashboard displayed `Kg sold`; at `390x844`, the dashboard rendered without horizontal overflow. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed after the change.
- Physical printer result: `npm run printer:validate:mock` passed the 988-byte ESC/POS receipt, all 8 capture checks, unreachable-target handling, and retry delivery in 4ms. The real run against `192.168.254.116:9100` could not complete; a direct 2-second TCP probe returned `connected=False`, and the real bridge path timed out before acknowledging a print. No physical slip was observed. Re-run `node --experimental-strip-types scripts/validate-printer.mjs --printer-ip <reachable-printer-ip>` once the printer is powered on and reachable from the POS workstation.

### P6 Orders operations implementation — 2026-08-05

- `0020_order_actions.sql` adds `orders.reversal_of`, a unique reversal guard, and the `record_order_action` RPC. The original completed order is never updated or deleted; the linked void/refund row and stock adjustment are append-only.
- `/admin/orders` keeps filters and detail context after an action, surfaces database errors, identifies a prior reversal, and passes branch receipt metadata into the action panel.
- Admins can submit a reason-required void or refund. Managers can reprint but cannot see or submit reversal controls. Reprint uses the terminal printer settings and writes `order.reprint` only after the printer confirms delivery.
 - Hosted migration and authenticated QA passed on 2026-08-06. Physical printer output remains a separate hardware gate.
 - Application checks passed: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. The PR CI and Vercel preview checks also passed.

### Employee workspace implementation — 2026-08-03

- Hosted migration `0011_employee_workspace.sql` applied successfully after the linked project reported `0001` through `0010` already applied. The CLI emitted only a local Docker Desktop cache warning while pushing; a follow-up migration list confirmed remote `0011`.
- Hosted schema verification passed: `employee_roles`, `employee_records`, `attendance_logs`, `payroll_records`, and `leave_requests` exist; seed/backfill counts are 3 roles, 1 employee record, 0 attendance logs, 0 payroll records, and 0 leave requests.
- The new Employees route is wired to those tables with RLS-scoped server actions for create/update employee, role permissions, attendance upsert, payroll upsert, leave creation, approval/rejection, and CSV export. Payroll/attendance/leave summaries intentionally show zero/empty values until real records exist.
- Verification passed: `npx tsc --noEmit`, `npm run lint`, and `npm run build`. The build exposes `/admin/employees` and `/admin/employees/export` successfully; existing middleware/OpenNext-on-Windows warnings remain.
- Authenticated browser save-flow verification is pending: the available in-app browser session opened the local sign-in page instead of the previously signed-in tab, so no protected form was submitted and no verification records were created.

## P7 — Inventory
*Goal: perishable stock reconciles per branch.*

- [x] Stock model on `stock_movements` (on-hand always derived from the ledger, per branch). *(✅ `/admin/inventory` derives balances from the append-only ledger.)*
- [x] Stock In (whole lechon: units + gross kg + cost; packaged goods). *(✅ first movement form supports branch, unit quantity, unit cost, and reference.)*
- [x] Yield entry (whole → chopped kg + waste kg). *(Guided whole-lechon yield conversion records usable yield and waste with audited stock movements.)*
- [x] Wastage/spoilage entry (reason) + stock adjustment (mandatory reason). *(✅ audited `record_stock_movement` RPC.)*
- [x] Low-stock alerts wired to dashboard; sell-with-zero-stock warns, never blocks. *(Organization-level alert settings, product minimums, dashboard cards, and POS warnings are live.)*
- [x] End-of-day variance view: opening + received − sold − wasted = expected vs. counted. *(Counts can be saved and revised with variance adjustments and audit history.)*

### Hosted Supabase migration and catalog verification — 2026-08-03

- Linked project migration check: `npx --yes supabase@latest migration list --linked` reported local and remote `0001` through `0010` matching. `0009_admin_business_records.sql` and `0010_inventory_catalog_fields.sql` were already applied in the required order, so no hosted migration push was needed.
- Hosted schema check passed: `suppliers` exists; `products.sku`, `products.barcode`, `products.cost_price`, `products.min_stock`, and `products.supplier_id` exist with the expected types/default; the two cost/minimum-stock checks and the three `0010` indexes are present.
- Hosted SQL round-trip passed: a temporary supplier and product were inserted, the product was updated to `SKU=CODEX-MIG-VERIFY-SINGLE-UPDATED-20260803`, `cost_price=4321`, and `min_stock=7.250`, and a joined read returned the supplier name plus all updated fields. The temporary product and supplier were deleted afterward; no verification records remain.
- Authenticated UI walkthrough passed at `http://127.0.0.1:3000`: the Products page loaded with no schema warning; a temporary supplier `Codex UI Supplier 20260803` and product `Codex UI Product 20260803` were created with SKU `CODEX-UI-20260803`, cost `₱42.50`, minimum stock `3.5`, and that supplier selected. The edit form loaded those values, then saved SKU `CODEX-UI-20260803-UPDATED`, cost `₱44.25`, minimum stock `4.25`, and the same supplier with the success message `Product saved. POS will use the updated catalog on its next refresh.`
- Inventory then loaded the updated product with no schema warning and no inventory refresh warning; the row displayed the updated SKU, supplier, cost price `₱44.25`, and minimum stock `4.25`. The temporary product and supplier were deleted after verification and a final hosted count confirmed zero rows remain; a final Inventory reload remained warning-free.

## P8 — Shifts & Reports
*Goal: trustworthy till + numbers the owner reads weekly.*

### Sales reporting slice — 2026-08-07

- **Reversal correctness bug found and fixed.** A void or refund (0020) never mutates the original sale — it inserts a linked reversal row and leaves the original at `completed`. `/admin/reports` filtered on `status === "completed"`, so it **counted voided sales as revenue**. Reproduced on the local fixture: three sales of `₱750`, `₱850`, and `₱300` with the `₱300` GCash sale voided reported **3 orders / `₱1,900.00`** under the old rule versus **2 orders / `₱1,600.00`** under the corrected one — an 18.75% overstatement in that sample. The corrected tender mix drops GCash entirely, the discount report keeps the `₱150` senior discount on its one order, the voided order's Rice line leaves the item rows, and the void is reported separately as 1 × `₱300`.
- `src/lib/admin/sales-reports.ts` is now the single reversal-aware aggregation, shared by the page and the CSV routes so the two can never disagree. It matches the `shift_reading` rule in `0024`, which is what makes `/admin/reports` and `/admin/shifts` agree about the same day.
- A reversal can be recorded after the reporting window closes, so the reversal lookup is keyed on the order ids in range (chunked `in()` lookups) rather than on a date filter. Reversals are reported as recorded in the window — that is when the money left the drawer — while net figures exclude the underlying sale whenever it was reversed.
- `/admin/reports` rebuilt on that module: day/week/month grouping, cashier and payment-method filters, sales trend, tender mix with a reversals line, best sellers, category sales, a weekday×hour heatmap trimmed to trading hours, sales by cashier including the reversals each recorded, the discount report, and branch comparison.
- `/admin/reports/export?kind=` emits summary, periods, items, categories, cashiers, branches, discounts, and hourly CSVs. Amounts stay in centavos so a spreadsheet never inherits a rounding decision the app did not make, cells are guarded against formula injection, and the route returns `413` rather than emitting a silently truncated file.
- Row limits are explicit (10k orders, 20k items) and the page shows a blocking warning when a range exceeds them, because silent truncation in a financial report is worse than no report.
- Verified: PostgREST accepts the embedded-resource filters used for `order_items` (`orders.status`, `orders.reversal_of=is.null`) and the `reversal_of=in.()` lookup — both returned HTTP 200 against the local stack. The aggregation rule itself was verified in SQL against seeded fixture rows, run in a transaction and rolled back. `npm run typecheck`, `npm run lint`, and `npm run build` pass; the build exposes `/admin/reports/export`.
- **The same reversal bug was then fixed everywhere else it appeared (2026-08-07).** `loadReversedOrderIds` and `selectNetSales` were extracted from the reports module so every revenue figure in the app applies one rule, and `loadSalesReport` was refactored onto them so there is genuinely a single implementation. Fixed: the dashboard (`src/app/admin/page.tsx` — today's KPIs, the seven-day series, and the item/category panels), Sales (`src/app/admin/sales/page.tsx` — both period summaries, the daily/hourly/weekday buckets, and best sellers), Promotions (`src/app/admin/promotions/page.tsx` — a discount on a sale that was later voided was never actually given), the Orders list metrics and trend (`src/app/admin/orders/page.tsx`; its existing reversal query only covers the visible page because it feeds the per-row badges, so the metrics take their own scope), and `/products` (`src/app/products/page.tsx`), which was a fifth page not in the original list. Every embedded `order_items` query now also filters `orders.reversal_of is null`.
- A failed reversal lookup is surfaced through each page's existing `queryWarning` rather than swallowed, because falling back to "nothing was reversed" would silently overstate revenue — the exact bug being fixed.
- Verified against seeded fixture rows on the local stack, run in a transaction and rolled back: a refunded sale is still returned by the `status = completed and reversal_of is null` query (confirming the id-keyed second pass is what removes it, not the query alone), the reversal lookup returns exactly the refunded order's id, the net selection leaves only the surviving sale, the discount on the refunded order drops out of the promotions totals, and the refunded order's line leaves the item rows. `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Not done: reconciling reports against a real day's data. That needs real sales volume on the hosted project, which does not exist yet.

### Shift and Z-reading slice — 2026-08-07

- `supabase/migrations/0024_shifts_and_z_readings.sql` adds the whole slice: shift hardening (`shift_no`, `closed_by`, a partial unique index enforcing one open till per cashier per branch, a manager read policy matching 0019), `shift_variance_threshold`, `shift_reading`, `shift_reading_list`, `open_shift`, `close_shift`, the append-only `z_readings` table, `record_z_reading`, and a replacement `place_order`.
- **`place_order` now stamps `shift_id`.** The device sends the till it captured at sale time, so an order queued offline still belongs to the shift that rang it up instead of whichever shift is open when it syncs; a closed shift is therefore still a valid target. If the client sends nothing, or a shift outside the branch, the RPC falls back to the caller's open till and otherwise writes `null` — a sale is never rejected over shift attribution. Every other part of the sale path (local_uuid idempotency, order items, stock movements, audit) is unchanged.
- Readings are computed from the order ledger, never from a mutable counter. Reversal rows from 0020 copy the original's `shift_id` and `payment_method`, so a void or refund lands in the same till; net figures exclude any sale that has a reversal and report the reversals on their own lines.
- "Resetting the counters" is expressed as sealing a shift into `z_readings` and starting the next one, which keeps the append-only guarantees of 0002 intact. A Z stores a snapshot, so a void taken after the Z does not rewrite it; the admin detail panel surfaces the resulting gap instead of hiding it.
- App surface: POS till panel (`src/components/pos/ShiftPanel.tsx`) for open / live X-reading / counted-cash close, `/admin/shifts` for the till register, full reading, admin close-out, Z generation, and the sealed archive, plus a `Shifts & Z-readings` sidebar entry. `buildReadingSlip` in `src/lib/receipt.ts` prints X and Z slips; the shared ESC/POS writer extracted for it leaves receipt bytes identical (`npm run printer:validate:mock` still delivers the same 988-byte payload, 8/8 capture checks).
- Local verification passed against the two-branch RLS fixture on the local stack, run in a transaction and rolled back so no fixture rows remain: shift label `SH-260807-001` generated; second open rejected; three sales stamped to the shift and a fourth with no `shift_id` correctly fell back to the open till; X-reading returned net `₱1,930.00`, cash `₱1,630.00`, expected cash `₱2,630.00`; an admin void moved the GCash sale out of net sales into `void_total` with cash untouched; closing with a large variance and no note was rejected; closing with `₱2,620.00` counted produced variance `−₱10.00` stored on the shift; a cashier was blocked from generating a Z; the admin Z sealed as `#1` with grand total `₱1,630.00`; a duplicate Z was rejected; `authenticated` has no UPDATE/DELETE privilege on `z_readings` and even the table owner is blocked by the append-only trigger; audit rows `shift.opened`, `shift.closed`, and `shift.z_reading` were written; a second shift sealed as `#2` and accumulated the grand total to `₱1,730.00`; and a Beta-org admin saw zero Alpha shifts and zero Z-readings.
- Privilege note found during that pass: hosted Supabase default privileges grant `anon` and `authenticated` full DML on new `public` tables (this is what 0004 documents for `anon`), so a bare `grant select, insert` is a no-op on top of an existing `grant all`. `0024` explicitly revokes on `z_readings` before granting. The same gap still exists on the older append-only tables — `authenticated` currently holds UPDATE/DELETE privileges on `orders`, `order_items`, `stock_movements`, and `audit_logs`, where only RLS and the `forbid_mutation` triggers stand in the way. Worth a follow-up hardening migration.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run printer:validate:mock`, and `git diff --check` pass. The build exposes `/admin/shifts`.
- **Hosted migration applied 2026-08-07.** `npx supabase db push --linked` applied `0024`; `migration list --linked` now reports local `0024` = remote `0024`. The push printed a `Warning: failed to cache migrations catalog: error exporting pg-delta catalog ... timeout exceeded when trying to connect`, followed by edge-runtime `event loop error` / `main worker has been destroyed` lines. That is the CLI's optional post-apply schema-snapshot step (pg-delta, used for declarative-schema diffing) failing inside its sandbox, not the migration — the CLI reported it as a warning, then `Finished supabase db push`, and only records the ledger row after a successful apply.
- Hosted verification passed by probing the project API with the public anon key: `z_readings` returned `42501 permission denied for table z_readings`, which proves both that the table exists and that the `revoke ... from anon` in `0024` took effect. All five new RPCs resolve through PostgREST with no `PGRST202`, so the schema cache picked them up: `shift_reading`, `shift_reading_list`, `open_shift`, `close_shift`, and `record_z_reading` — the last reaching its guard and raising `P0001 only organization admins can generate a Z-reading`. `place_order` is in the same single-transaction migration file as those objects, so it was replaced with them; the first hosted sale carrying a non-null `shift_id` is the direct confirmation.
- Authenticated browser QA of the till flow is still pending.

- [x] Shift open (declared cash) / close (counted vs. expected, variance, note over threshold), per branch/device. *(`0024_shifts_and_z_readings.sql`: `open_shift` / `close_shift`, one open till per cashier per branch, expected cash = opening + cash sales − cash refunds, note enforced above the org threshold. POS till panel + admin close-out.)*
- [x] X-reading (cashier) / Z-reading (admin), per branch. *(One `shift_reading` RPC feeds both. X is live and non-resetting in the POS; Z is admin-only, sealed into the append-only `z_readings` archive with a per-branch sequence and running grand total. Both print as ESC/POS slips.)*
- [x] Reports: sales by day/week/month, item, category, cashier; hourly heatmap. *(`src/lib/admin/sales-reports.ts` is the single reversal-aware aggregation; `/admin/reports` renders it with day/week/month grouping plus cashier and payment filters.)*
- [x] Discount report; branch-vs-branch comparison. *(Discounts grouped by `discount_type`; branch table shows orders, net sales, discounts, average order, and share.)*
- [x] CSV export. *(`/admin/reports/export?kind=` for summary, periods, items, categories, cashiers, branches, discounts, and hourly. Amounts stay in centavos and the route refuses to emit a truncated file.)*
- [ ] Reconcile reports against raw orders on a real day's data. *(Blocked: needs real sales volume on the hosted project. Not yet possible.)*

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

### Employees implementation audit - 2026-08-03

- Audited the Employees route, server actions, CSV export, sidebar quick actions, migration, and RLS surface for hardcoded reference values, dead links, lost filter/date state, and silent validation failures.
- Fixed the date-range control so it submits real start/end dates; preserved search, role, status, branch, and selected period through filters, pagination, employee editing, attendance saves, and payroll saves; made employee-row attendance open the selected employee; and kept attendance summaries scoped to the displayed period.
- Tightened server validation for access roles, branch/role ownership, schedule and attendance times, payroll amounts, role accent values, date ranges, and missing leave-review records. Export now returns an error response when its source queries fail instead of emitting a misleading empty CSV.
- Hosted verification passed: linked migration ledger remains 0001-0011 in sync; all five employee tables exist with RLS enabled, authenticated/service-role grants, no anon grants, expected unique upsert keys, and the admin/manager policies. A rollback-safe hosted round-trip created, updated, read, and cleaned temporary role, employee, attendance, payroll, and leave rows; final counts remain 3 roles, 1 employee, 0 attendance logs, 0 payroll records, and 0 leave requests.
- Final code verification passed: `npx tsc --noEmit`, `npm run lint`, `git diff --check`, and `npm run build`. The build exposes `/admin/employees` and `/admin/employees/export`; only the existing middleware/OpenNext-on-Windows warnings remain.
- Browser verification is still pending for protected form submission: the local app opened successfully in the in-app browser, but its available session was signed out and showed the Sign in page. No protected UI writes or browser-created audit records were made.

### Audit log viewer implementation - 2026-08-03

- Added `/admin/audit` and the Admin navigation entry. The page queries `audit_logs` through the authenticated Supabase server client, applies organization/branch scope, paginates with an exact count, and derives available action filters from live rows rather than hardcoded event data.
- Added working branch, actor, action, and Singapore-local date filters, plus reset/all-history links. Each row shows the timestamp, actor, action, entity, branch, device reference when present, and expandable read-only `before`/`after` JSON snapshots. There are no create, update, or delete controls because the ledger is append-only.
- Hosted verification passed: linked migrations remain `0001` through `0011` in sync; `audit_logs` has the expected 11 columns, `audit_read` and `audit_insert` RLS policies, and the `no_mutate_audit` trigger. The live hosted table currently contains 0 audit events, so the route correctly renders an empty state until real order, inventory, or other audited activity is recorded; no fixture rows were left behind.
- Code verification passed: `npx tsc --noEmit`, `npm run lint`, `git diff --check`, and `npm run build`. The build exposes `/admin/audit`; only the existing middleware/OpenNext-on-Windows/punycode warnings remain. An unauthenticated local request was redirected to the app auth entry point as expected. Protected browser interaction remains pending because the available in-app browser session is signed out.

### Employee ID login implementation - 2026-08-03

- Added an Employee ID sign-in path alongside the existing email sign-in path. Staff enter their `EMP-####` code and password; the server resolves the code to a Supabase Auth user without exposing the internal Auth email to the browser.
- Added an admin-only Set up login / Reset login action on the Employees list. It creates a confirmed Supabase Auth user for new employee records, links the Auth user to `profiles` and `employee_records`, resets the configured common initial password when requested, and records an `auth.employee.login_provisioned` audit event without logging the password.
- Added first-login password enforcement at `/account/password`. The required flag is checked by middleware before `/pos` and `/admin`, and the password-change action clears it server-side after Supabase Auth accepts the new password. The change is recorded as `auth.password.changed`.
- Added migration `0012_employee_id_login.sql`; linked hosted verification passed with migrations `0001` through `0012` matching, `profiles.password_change_required` present with default `false`, the active employee-code lookup index present, and current hosted counts of 1 employee and 0 forced-password profiles.
- Server configuration required before provisioning: set the real hosted `SUPABASE_SERVICE_ROLE_KEY` and a server-only `EMPLOYEE_INITIAL_PASSWORD` of at least 8 characters. The temporary password is never shipped to the client. Protected browser login/provisioning remains pending until those runtime values are configured and the in-app browser is signed in.
- Code verification passed: `npx tsc --noEmit`, `npm run lint`, and `npm run build`. The build exposes `/account/password`; only the existing middleware/OpenNext-on-Windows/punycode warnings remain.
- Deployment follow-up: Sites initially rejected the publish for Cloudflare's 10 MiB Worker limit because the staged server bundle included an unused 4 MiB font-metrics file and duplicated static assets. The validated staging step now removes both server-only duplicates while preserving the UI's sans-serif fallback stack and the separate static asset directory.

## Cross-cutting (do continuously, not a phase)
- [ ] Audit-logging on every sensitive action as features land (don't retrofit).
- [ ] Accessibility & tap-target sizing on every POS screen.
- [x] Test data: keep a two-branch, multi-cashier fixture for every RLS/scope test. *(✅ `supabase/seed.sql` + `scripts/rls-fixture.mjs`, 18/18 §1 assertions green 2026-07-31)*
- [ ] Update [MVP.md](MVP.md) done-criteria and this tracker as phases complete.

### Hosted Supabase product-image migration and authenticated flow - 2026-08-06

- Local Docker context was corrected first: the SKED project was stopped with its data volume preserved, then the existing POS project from H:/pos was started. supabase_db_pos was healthy on 54322; Kong/API was on 54321 and Auth was healthy. The local Storage container repair is recorded below; the POS project volume was preserved.
- Hosted migration check: npx supabase migration list --linked showed local and remote 0017 matching (remote migrations through 0019; unrelated 0020 remains pending). A linked SQL query returned supabase_migrations.schema_migrations.version = 0017, so 0017_product_images.sql was already applied before this run and no duplicate push was attempted.
- Hosted storage verification passed: bucket product-images is public, file_size_limit = 921600, and allowed_mime_types = {image/jpeg,image/png,image/webp}. All four expected policies are present: public select plus authenticated-admin insert, update, and delete, each scoped to the organization-prefixed storage path.
- Authenticated browser flow passed at http://127.0.0.1:3000 as admin Klein on Main Branch. From /admin/inventory, Add item opened the inventory product form; inline category creation returned Category "Codex Image QA 20260806" created and selected. Product Codex Image QA Product 20260806 was created with SKU CODEX-IMG-20260806, price 123.45, cost 80.00, unit pcs, and stock tracking enabled. Product id: 62c4d353-6e4f-4cc6-820f-898908aea861; category id: 7653e1fb-18a8-4480-b753-b106c990d9ef.
- Initial photo compression passed: source public/food/whole-lechon-small.png was 2,473,703 bytes; the UI reported Optimized photo - 2.4 MB -> 205 KB. Hosted storage recorded WebP path 8d453c86-4db6-4356-b9fa-1cc36fd830d6/62c4d353-6e4f-4cc6-820f-898908aea861-6b115e77-a27a-4e81-aeae-73ea556e518b.webp, MIME image/webp, 210026 bytes. The product image rendered in both Inventory and Products using that same public Supabase Storage URL.
- Replacement photo flow passed: editing the product and replacing with public/food/lechon-paksiw.png (2,674,721 bytes) reported Optimized photo - 2.6 MB -> 252 KB. The final hosted object is WebP path 8d453c86-4db6-4356-b9fa-1cc36fd830d6/62c4d353-6e4f-4cc6-820f-898908aea861-2e039903-678d-45d7-b0b1-4fc0a42c4b16.webp, MIME image/webp, 257628 bytes. After reload, both Inventory and Products rendered the new public URL. The old object was absent from storage.objects; its public URL returned HTTP 400, while the new URL returned HTTP 200 with image/webp.
- The edit server action committed the database and storage change even though this local production runner did not navigate away from the editor within the browser wait window; refreshed Inventory and Products reads confirmed the final URL and image state. No unrelated migration was applied.

### Local POS Storage container legacy-schema repair - 2026-08-06

- `supabase_storage_pos` (Storage API `v1.67.26`) was restarting because the existing `storage.objects` and `storage.buckets` tables came from the older POS/SKED local schema while the container's recorded migrations had already advanced through 0017. The missing legacy `owner` column blocked migration 0018; the local Storage volume was not reset.
- Repair applied transactionally after stopping only `supabase_storage_pos`: restored the nullable legacy columns expected by the bundled Storage migrations (`owner`, `created_at`, `updated_at` on `storage.buckets`; `owner`, `created_at`, `updated_at`, `last_accessed_at`, and `metadata` on `storage.objects`). Existing table owners remained `supabase_storage_admin`.
- Verification passed: `storage.migrations` contains all 61 migrations, ids 0 through 60; the container is `running (healthy)`; `http://127.0.0.1:54321/storage/v1/status` returned HTTP 200; the existing `product-images` bucket remained present; and local object count remained 0. Post-start logs contained no `startupError` or `Migration failed` entries. No local volume or user data was deleted.

### Hosted P6 Orders migration and authenticated verification - 2026-08-06

- Release branch codex/admin-orders-theme-release was pushed and merged into main by PR #2. Merge commit: 6239eed. The three source commits were 55d8a21 (Orders actions and migration), 7e07e1a (workspace themes and CI), and b2dcd50 (verification log).
- Hosted migration check passed: 0020_order_actions.sql applied successfully; linked migration list now shows local and remote 0020 matching. Hosted schema checks found orders.reversal_of as uuid and the public record_order_action RPC.
- Authenticated POS creation passed as admin Klein on Main Branch. Product Codex Image QA Product 20260806 was charged for 123.45 cash, creating order MB-D9ND1MW-260806-0001 (id e8c5520d-2d2d-4dcf-9579-c2ab1fcf3386). The app returned the expected printer warning because no printer IP was initially configured, but the order saved successfully.
- Reason validation passed: the empty required reason field blocked the Void order submission and no confirmation dialog or database action occurred.
- Admin void passed with reason QA verification after hosted migration. The UI returned the audited reversal success message; hosted order 2f7b2044-7870-40f2-8186-58074d9bb197 is status voided, reversal_of points to the original order, and the original completed order remains unchanged. Hosted stock_movements contains one adjust return for product 62c4d353-6e4f-4cc6-820f-898908aea861, qty 1.000 pcs, with the same reason. Hosted audit_logs contains order.voided with the reason and reversal id.
- Browser reprint passed through a temporary local WebSocket bridge and TCP mock printer configured through the authenticated POS printer settings. The Orders UI reported MB-D9ND1MW-260806-0001 reprinted and audit logged; hosted audit_logs contains order.reprint for the original order. The temporary bridge, mock printer, and log were stopped/removed after verification. Physical printer paper output remains unverified.
- Mobile layout check passed at a 390x844 viewport override: the order detail and action region remained available, document width was 375px, and horizontal overflow was false. The viewport was reset afterward.
- Manager read-only verification is blocked by available hosted data rather than the implementation: the linked project currently has only admin Klein and cashier Juan Dela Cruz, with no manager profile to authenticate. No real user was modified or fabricated for this check.
