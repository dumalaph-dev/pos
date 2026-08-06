# Dumala POS — Test Plan

**Companion to:** [POS_PRD.md](POS_PRD.md) (acceptance criteria) · [SCHEMA.md](SCHEMA.md) (RLS) · [INTERFACES.md](INTERFACES.md) (contracts)
**Principle:** the two things most expensive to get wrong are **tenant isolation** and **offline correctness** — those get the deepest tests. A change isn't "done" until its box here passes on a real device where noted.

**Legend:** `U`=unit · `I`=integration · `E`=e2e · `M`=manual-on-device · 🔴=must pass before pilot.

---

## 1. Tenant isolation & RLS 🔴 (write the fixture first — SCHEMA §7)

Fixture: **2 orgs**, each with **2 branches**, each branch with an admin + a cashier.

| # | Test | Type | Pass |
|---|---|---|---|
| 1.1 | Org A admin reads Org B rows (any table) | I | **denied** (0 rows) |
| 1.2 | Branch A cashier reads Branch B orders/products (same org) | I | **denied** |
| 1.3 | Cashier `UPDATE`/`DELETE` on `orders` | I | **rejected** by RLS |
| 1.4 | Any role `UPDATE`/`DELETE` on `audit_logs` / `stock_movements` | I | **rejected** (append-only) |
| 1.5 | Cashier inserts order with mismatched `store_id`/`cashier_id` | I | **rejected** by `with check` |
| 1.6 | Price edit on Branch A | I | Branch B unchanged |
| 1.7 | Admin "All branches" query | I | returns own org's branches only |

✅ **Implemented** in `supabase/seed.sql` + `scripts/rls-fixture.mjs` — 18/18 assertions pass on the local stack (2026-07-31). The fixture is idempotent; rerun anytime with `node scripts/rls-fixture.mjs`.

## 2. Offline-first & sync 🔴 (PRD §6.3)

| # | Test | Type | Pass |
|---|---|---|---|
| 2.1 | Airplane mode: complete 15 sales → reconnect | E/M | exactly **15** server orders, correct branch, device timestamps preserved |
| 2.2 | Replay `SyncQueue.processPending()` twice | U/I | one server row per `local_uuid` (idempotent) |
| 2.3 | Force-close app mid-queue → reopen | M | unsynced orders persist, queue resumes |
| 2.4 | Price changes on server while tablet offline | I | completed offline orders keep their price snapshot |
| 2.5 | Two devices (diff branches) sell same second | I | order numbers never collide |
| 2.6 | UI never blocks on network during a sale | E | sell flow completes with network throttled to 0 |
| 2.7 | Connection pill reflects `online/offline · N pending` | E | accurate count, "never red" styling |

## 3. Sell flow & pricing (PRD §6.2, INTERFACES §6)

| # | Test | Type | Pass |
|---|---|---|---|
| 3.1 | Weight item ₱850/kg × 1.35 | U | line total = `114750` centavos (₱1,147.50), 2-dp, integer |
| 3.2 | Cash ₱1,000 tendered on ₱1,147.50 | E | Confirm disabled, insufficient state |
| 3.3 | Quick-tender chips (Exact/₱500/₱1000) | U | change computed correctly |
| 3.4 | Fixed item tap / re-tap | E | adds qty1 / increments |
| 3.5 | Remove line, edit weight line | E | totals recompute |
| 3.6 | Park order + resume (max 10) | E | cart restored; Hold disabled at 10 |
| 3.7 | Money never uses floats | U | all arithmetic in centavos (property test) |

## 4. Discounts & VAT (PRD §5, §6.2)

| # | Test | Type | Pass |
|---|---|---|---|
| 4.1 | Senior/PWD requires name + ID | E | can't apply without capture; stored on order |
| 4.2 | SC/PWD 20% + VAT-exempt split | U | matches confirmed formula (SCHEMA §8) |
| 4.3 | Custom % above threshold | E | Admin PIN blocks completion |
| 4.4 | Custom % below threshold | E | applies without PIN |

## 5. Printing 🔴 (PRD §6.4, INTERFACES §2) — on real hardware

| # | Test | Type | Pass |
|---|---|---|---|
| 5.1 | Buy-one-to-test: raw TCP `ip:9100` ESC/POS slip, no internet | M | prints |
| 5.2 | Sale completes, printer reachable | M | receipt prints ≤ 3s |
| 5.3 | Printer out of range/unreachable | M | non-blocking "Retry print"; sale still saved |
| 5.4 | Two tablets, own printers, same branch | M | independent config; no overwrite |
| 5.5 | Reprint from history | M | marked `REPRINT` + audit logged |
| 5.6 | 58mm vs 80mm layout | M | both render correctly |
| 5.7 | Receipt content | M | branch, items, discount+ID, totals, "not an official receipt" line present |

### Validation record — 2026-08-03

- `npm run printer:validate:mock` is the repeatable bridge preflight. Final run: PASS with an exact 988-byte payload, 8/8 capture checks on the initial delivery, an expected `ECONNREFUSED` failure, and 8/8 checks on the retry (4ms retry acknowledgement).
- The real-store probe used the active LAN (`192.168.254.105`) and checked the visible peer `192.168.254.116`; TCP `9100` was closed. A scan of `192.168.254.0/24` found no TCP `9100` listener. No physical slip was observed, so 5.1 and 5.2 remain pending rather than being marked passed.
- 5.3's bridge/adapter failure-and-retry behavior is automated and passing; the POS toast plus sale-preservation behavior still needs the on-device/manual run against a reachable store setup.

## 6. Multi-branch (PRD §6.7)

| # | Test | Type | Pass |
|---|---|---|---|
| 6.1 | Add 2nd branch + "clone menu from A" | E | B opens with A's products/prices, independently editable |
| 6.2 | New tablet: admin → pick branch → pair printer → cashier PIN | M | ≤ 30 min; sales stamped correct branch |
| 6.3 | Cashier bound to A | E | cannot see/switch to B |
| 6.4 | "All branches" dashboard | E | totals sum across branches + per-branch breakdown |

## 7. Customer display (PRD §6.8, INTERFACES §3)

| # | Test | Type | Pass |
|---|---|---|---|
| 7.1 | Add line item | E/M | appears on display + total updates ≤ 500ms |
| 7.2 | Cash tender entered | M | display shows change due, hero type |
| 7.3 | Sale complete | M | thank-you → idle |
| 7.4 | Display off / disconnected | M | POS sale unaffected, completes normally |
| 7.5 | No internet + LAN transport | M | display mirrors in real time |
| 7.6 | `DisplayLink.push` throws | U | never propagates into sell flow |

## 8. Auth & session (PRD §6.1)

| # | Test | Type | Pass |
|---|---|---|---|
| 8.1 | Offline PIN unlock after prior online login | M | reaches POS for bound branch |
| 8.2 | Cashier navigates to `/admin` | E | redirect to `/pos` + audit logged |
| 8.3 | 5 wrong PINs | E | 60s lockout |
| 8.4 | Session survives app restart | M | no mid-shift logout |

## 9. Shifts & cash (PRD §6.5)

| # | Test | Type | Pass |
|---|---|---|---|
| 9.1 | Open shift with opening cash | E | recorded |
| 9.2 | Close: counted vs expected, variance | U/E | variance correct; note required over threshold |
| 9.3 | X-reading (cashier) / Z-reading (admin-only) | E | role-gated |

## 10. Audit trail (PRD §6.6)

| # | Test | Type | Pass |
|---|---|---|---|
| 10.1 | Sensitive actions logged | I | login, PIN fail, void, refund, discount, price edit, stock move, branch/device change, sync error, permission denied all appear |
| 10.2 | Log is append-only | I | no update/delete path (see 1.4) |

## 11. Non-functional

- **Performance 🔴:** median 3-line sale tap→printed ≤ 20s (M, timed on the actual tablet).
- **Accessibility:** tap targets ≥ 48px, tiles ≥ 96px; `prefers-reduced-motion` honored; contrast AA on `--text`/`--bg`.
- **PWA:** installs, offline shell loads, SW update prompt appears at shift boundary.
- **Resilience:** kill network/printer/display mid-flow — no data loss, no stuck UI.

---

## Pre-pilot gate (all 🔴 green)
1.1–1.7 · 2.1–2.7 · 5.1–5.3 · 11-performance. If any fail, the pilot does not start.
