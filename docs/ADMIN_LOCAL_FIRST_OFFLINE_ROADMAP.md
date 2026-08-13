# Admin Local-First and Offline Roadmap

**Project:** Dumala POS
**Created:** 2026-08-13
**Status:** Phase 5 initial inventory slice complete; Phase 6 in progress; production request/payload baseline remains pending deployment
**Owner:** Product and engineering

## Purpose

Make the admin workspace fast, URL-aware, and useful during an internet outage without weakening organization, branch, role, or audit boundaries.

This document is the working plan for the entire initiative. Update the checkboxes, decision log, phase notes, and acceptance results as work progresses.

## Current source-audit baseline

- The exact URL-aware local-first controller exists in two admin areas:
  - Orders receipt view: `src/components/admin/OrderDialogController.tsx`.
  - Shifts, X-reading, Closed shift, and Z-reading view: `src/components/admin/ShiftDialogController.tsx`.
- Those controllers make opening and closing an already-hydrated modal local and URL-addressable. They do not make the page data available offline.
- Sales, Dashboard, and Promotions order entry points share the receipt controller and keep their own page URL; only explicit "View all orders" links navigate to the Orders directory.
- The admin layout and most admin pages read from Supabase during server rendering and server actions.
- The existing Dexie/IndexedDB offline layer is POS-focused: catalog/profile cache, offline PIN, order outbox, and audit outbox.
- The service worker deliberately excludes private authenticated HTML from Cache Storage. This security boundary must remain in place.
- Calendar events are device-local `localStorage` data, but are not part of the admin URL-aware controller or a server-synchronized admin read model.

## Guiding principles

1. A local modal open must never trigger a route navigation or network request.
2. Cached admin data is scoped, stale-aware, and not an authorization source.
3. Server-side RLS and role checks remain authoritative for every mutation and sensitive action.
4. Read-only offline support comes before offline writes.
5. Every offline mutation must be idempotent, auditable, retryable, and conflict-visible.
6. Private authenticated documents must not be broadly cached in the service worker.
7. Cross-page entry points should open shared local records instead of navigating to another page solely to display details.

## Roadmap

### Phase 0 — Baseline, safeguards, and scope

**Status:** Complete for the authenticated local-modal baseline; request/payload instrumentation remains a rollout follow-up

- [x] Record current click-to-modal and click-to-route latency for Orders, Sales, Dashboard, Shifts, and Z-readings. Orders, Sales, and Shifts were captured; Dashboard had no transaction trigger in the capture dataset.
- [ ] Count route/RSC requests and Supabase requests for each interaction. Deferred: the authenticated browser control surface exposes neither request counters nor PerformanceResourceTiming.
- [ ] Record payload sizes and the admin layout/page query timings. Deferred: the authenticated browser control surface exposes neither payload sizes nor server query timings.
- [x] Add performance marks and diagnostics that do not expose order, customer, or staff data.
- [x] Exclude local-first modal triggers from global route-progress behavior.
- [x] Define cache scope, retention, invalidation, sign-out cleanup, and branch-switch behavior.
- [x] Define the initial offline admin contract: cached read-only mode, visible stale state, and online-only sensitive actions.
- [x] Capture a baseline acceptance report before changing data architecture. The remaining request/payload counters are explicitly marked as unavailable in the runtime report.

**Exit criteria:**

- A repeatable authenticated online baseline exists for the available triggers; simulated-offline acceptance is tracked under Phase 4 and Phase 5.
- Local modal triggers are proven not to initiate route navigation; captured URLs remained on the originating `/admin/orders`, `/admin/sales`, and `/admin/shifts` paths and route progress remained inactive.
- Cache/security rules are documented and approved.
- The runtime baseline must be stored before Phase 2 is promoted; Phase 1 foundation work may proceed in parallel under explicit implementation direction.

### Phase 1 — Shared local-first foundation

**Status:** Complete

- [x] Define `AdminLocalFirstStore` interfaces and entity scopes.
- [x] Define a reusable `UrlLocalDialogController<T>` contract.
- [x] Centralize `pushState`, `replaceState`, `popstate`, focus restoration, and modal close behavior.
- [x] Add IndexedDB/Dexie tables for scoped admin read models and sync metadata.
- [x] Add stale timestamps, schema versions, organization IDs, branch IDs, and user scopes.
- [x] Add cache invalidation/isolation on sign-out, user change, organization change, and branch change.

**Exit criteria:** Passed. One generic controller supports typed records, and one scoped store supports typed entity snapshots without duplicating history logic. Orders and Shifts now use the shared controller.

### Phase 2 — Orders receipt vertical slice

**Status:** Complete for the shared-controller slice

- [x] Use the existing receipt data shape as the canonical order detail model.
- [x] Hydrate the shared order store from Orders, Sales, and Dashboard data.
- [x] Open receipts locally from Orders, Sales, Dashboard, and Promotions.
- [x] Preserve direct URL/deep-link behavior when online.
- [x] Show cached receipt data with a clear stale indicator when offline.
- [x] Keep void, refund, reprint, and approval actions online-only until separately approved.
- [x] Complete authenticated browser smoke coverage for Orders, Sales, Promotions, live X-reading, and Closed shift dialogs.
- [x] Verify same-surface URL updates, modal visibility, close behavior, and browser-back behavior for hydrated records.

**Exit criteria:** Passed for the shared-controller slice. Hydrated record opens stay on the originating surface, render locally, and close/back to the originating list. The broader request-count, p50/p95, and simulated-offline acceptance report remains tracked under Phase 0 and Phase 7.

### Phase 3 — Shifts, Z-readings, Inventory, and Audit read models

**Status:** Complete for the current read-model slice

- [x] Cache shift readings and Z-reading records.
- [x] Open X-reading, Closed shift, and Z-reading details locally.
- [x] Cache inventory products, current stock snapshots, movements, and variance details.
- [x] Cache recent audit events and open payload snapshots locally.
- [x] Add stale/read-only labels and refresh-on-reconnect behavior.

**Exit criteria:** The last synchronized operational view remains readable offline without serving private HTML from the service worker.

### Phase 4 — Secure offline admin bootstrap

**Status:** Complete

- [x] Add device/user/branch-scoped offline admin bootstrap.
- [x] Reuse or extend the device-bound offline PIN model with explicit admin role scope.
- [x] Render a cached, read-only admin shell when Supabase is unreachable.
- [x] Prevent cached permissions from authorizing sensitive actions.
- [x] Clear private admin cache when credentials, users, organizations, or branch scope change.
- [x] Surface offline, last-synced, and read-only state consistently.
- [x] Verify same-origin signed-in online PIN enrollment and hydrate orders, shifts, inventory, variance, and audit caches.
- [x] Complete an actual network-unavailable reload, PIN unlock, cached-read verification, and mutation-gating drill.

**Exit criteria:** Passed. An authorized user reopened the previously synchronized admin workspace during a real network outage, unlocked it with the enrolled device PIN, viewed permitted cached data, and confirmed that offline admin remained read-only.

### Phase 5 — Safe offline mutation outbox

**Status:** Complete for the initial inventory slice

- [x] Select the first low-risk mutations: inventory movements and physical counts. Yield entries, expenses, and catalog/contact edits remain follow-up slices.
- [x] Add idempotency keys, queue states, retry/backoff, conflict status, and audit payloads for the first slice.
- [ ] Apply optimistic local projections only where conflict behavior is defined. Deferred; replay currently refreshes the authoritative server read model.
- [x] Revalidate organization, branch, user, role, and record ownership on the server.
- [x] Keep billing, permissions, employee authentication, refunds, voids, Z-generation, and shift closing online-only initially.

**Exit criteria:** Passed for the initial inventory movement and physical-count slice. The controlled offline drill queued locally, replayed after reconnect, produced one authoritative receipt and one stock-movement row, and showed no duplicate movement.

### Phase 6 — Remaining dialogs and server-navigation optimization

**Status:** In progress — branch payload projection and deployment telemetry slice complete; focused large-query optimization next

- [ ] Convert suitable product, customer, supplier, expense, employee, and branch detail flows to local dialogs.
- [ ] Move filter/search/pagination state to client state with URL synchronization where appropriate.
- [x] Reduce repeated admin branch queries between the shared layout and active page through request-scoped deduplication.
- [x] Reduce repeated admin connection/device-heartbeat queries with a short user/organization/branch-scoped advisory TTL.
- [x] Reduce branch fields in non-receipt server-rendered routes through a shared `id/name/is_active` projection; receipt routes retain the tax/address fields required to render receipts.
- [ ] Reduce repeated admin profile queries.
- [ ] Reduce large server payloads and use focused summaries/pagination.
- [x] Add bounded deployment-level request/payload telemetry for online soft navigations without sending private URLs or record identifiers.
- [ ] Add background refresh instead of blocking every interaction on a full server render.

### Phase 7 — Acceptance, rollout, and monitoring

**Status:** Planned

- [ ] Test online, slow-network, airplane-mode, reconnect, and force-close scenarios.
- [ ] Test browser back/forward, refresh, deep links, and multiple tabs.
- [ ] Test multi-branch and role isolation.
- [ ] Test sign-out and cache cleanup on a shared terminal.
- [ ] Test duplicate prevention and conflict recovery for queued writes.
- [ ] Record p50/p95 interaction latency and request counts.
- [ ] Roll out in slices with rollback notes and production monitoring.

## First implementation slice

The first implementation sequence is deliberately narrow:

1. Establish the Phase 0 performance and request baseline.
2. Add diagnostics around the existing Orders and Shifts controllers.
3. Exclude `[data-order-trigger]` and `[data-shift-trigger]` from route-progress handling.
4. Define the shared receipt store/controller contract.
5. Move the Sales order links to the shared receipt controller.
6. Verify no route/RSC/Supabase request occurs when opening a cached receipt.

Orders, Sales, Dashboard, and Promotions are included in the first cross-page slice; runtime acceptance capture remains before Phase 2 promotion.

## Phase 0 measurement contract

Each interaction should record only non-sensitive metadata:

- `surface`: dashboard, sales, orders, shifts, or z-readings
- `interaction`: open, close, back, or route-navigation fallback
- `mode`: online, offline, or degraded
- `duration_ms`
- `route_changed`: boolean
- `request_started`: boolean
- `record_cached`: boolean
- `error`: boolean
- `sample_type`: initial document or soft navigation
- `resource_count`, `resource_transfer_bytes`, `resource_encoded_body_bytes`: aggregate soft-navigation resource deltas
- `navigation_transfer_bytes`, `navigation_encoded_body_bytes`: initial-document byte totals when available

Do not record order numbers, customer names, employee names, receipt payloads, or authentication data in browser diagnostics.

## Important decisions

| Decision | Reason |
|---|---|
| Keep private admin HTML out of the service worker cache | Prevents cross-user data exposure on shared terminals. |
| Read-only offline admin mode comes before offline admin writes | Reduces conflict, authorization, and accounting risk. |
| Use one shared controller contract | Prevents Orders, Shifts, Inventory, and Audit from reimplementing history behavior. |
| Orders are the first cross-page slice | Existing receipt data and controller already provide the smallest measurable path. |
| Sensitive actions remain online-only initially | Void/refund, payroll, permissions, billing, shift closing, and Z-generation require fresh server authority. |

## Phase log

### 2026-08-13 — Roadmap created

- Source audit identified Orders and Shifts/Z-readings as the only exact URL-aware local-first admin controllers.
- POS remains the only broad offline-first workflow.
- Phase 0 is now the active implementation gate.

### 2026-08-13 — Phase 0 safeguards implemented

- Added `src/lib/admin/performance.ts` with non-sensitive browser timing marks and `dumala:admin-performance` events for local modal opens/closes and route navigations.
- Updated `src/components/admin/AdminNavigationProgress.tsx` so `[data-admin-local-trigger]`, `[data-order-trigger]`, and `[data-shift-trigger]` do not show route progress or get classified as normal route navigation.
- Orders and Shifts local interactions explicitly report `record_cached`, `request_started`, and `route_changed` metadata.
- Validation passed: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- Runtime p50/p95 measurements and authenticated online/offline browser capture remain the next Phase 0 gate; the instrumentation is ready for that capture.

### 2026-08-13 — Phase 1 foundation implemented

- Added `src/components/admin/UrlLocalDialogController.tsx` for shared URL/query/history handling, trigger interception, browser back behavior, focus-compatible modal closing, and optional performance metrics.
- Refactored Orders and Shifts/Z-readings to use the shared controller while preserving their existing receipt and reading views.
- Added `src/lib/admin/local-first-store.ts` with scoped Dexie records/snapshots, schema versions, fetched timestamps, organization/user/role/branch scope keys, replacement reads, and safe cache clearing.
- Sign-out and signed-out recovery now clear private admin local-first data in addition to the existing POS session cleanup.
- Validation passed: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- Phase 2 remains gated on the authenticated runtime baseline and will use Orders as the first cross-page vertical slice.

### 2026-08-13 â€” Phase 2 cross-page receipt slice in progress

- Extracted `OrderReceiptData` into `src/lib/admin/order-receipts.ts` as the shared receipt contract.
- Added scoped receipt upserts and cache hydration to `OrderDialogController`; cache-only receipts show a `Cached copy` indicator.
- Sales and Dashboard now build receipt records from their existing parallel order, item, branch, product, and cashier data queries.
- Sales invoice links stay on `/admin/sales`; Dashboard invoice links stay on `/admin`; both use `[data-order-trigger]` and the shared controller, so opening a hydrated receipt does not navigate to `/admin/orders`.
- Orders, Sales, and Dashboard share the same `order_receipts` Dexie entity scope and clear it through the existing sign-out cleanup.

### 2026-08-13 â€” Phase 2 completion slice continued

- Promotions now uses the shared receipt controller and hydrates the same canonical order detail shape from its existing order window plus parallel branch, cashier, product, and line-item reads.
- Promotions invoice links stay on `/admin/promotions` and use the same local query-string history behavior as the other admin surfaces.
- Receipt actions now subscribe to browser online/offline state; cached receipts and offline sessions are explicitly read-only for reprint, void, and refund actions.

### 2026-08-13 — Phase 2 authenticated smoke acceptance

- Restarted the local Next server on `127.0.0.1:3000` and connected the authenticated local browser session.
- Orders, Sales, and Promotions each opened a visible `Receipt view` dialog while retaining the originating admin pathname; close returned to the list. Orders also passed browser-back close behavior.
- Shifts opened both `X-reading · live` and `Closed shift` dialogs while retaining `/admin/shifts`; close returned to the shift list.
- Dashboard had no current-day transaction row in the smoke dataset, so its runtime trigger was not exercised; the source audit still confirms its same-surface shared-controller wiring. This is a data-coverage note, not a code failure.
- A batched navigation attempt hit one transient CDP `Page.navigate` timeout during local development; the tab recovered, and the affected individual route checks completed successfully.
- Phase 3 is now the active implementation phase. The first task is to define and hydrate scoped shift/Z-reading read models without weakening online-only close, void, refund, or Z-generation authority.

### 2026-08-13 — Phase 3 shift/Z-reading read-model slice

- Added the shared `ShiftDialogReadModel` and `ShiftZReadingRecord` contracts in `src/lib/admin/shift-readings.ts`.
- Shifts now upsert scoped `shifts` and `z_readings` records into the existing Dexie admin store after a successful server render.
- `ShiftDialogController` merges cached-only readings, displays a cached-copy state, and disables close-till/Z-generation actions for cached records.
- Authenticated browser smoke after the change opened a live X-reading dialog and closed it back to `/admin/shifts`.
- Validation passed: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` (line-ending warnings only).
### 2026-08-13 — Phase 3 inventory and audit read-model slice

- Added typed inventory read models for products, current stock snapshots, recent movements, and end-of-day variance rows.
- Added typed audit read models that preserve recent append-only before/after payload snapshots inside the scoped Dexie cache.
- Added `AdminReadModelHydrator` to write scoped read models without blocking the server-rendered page, show online/offline read-only state, and request a server refresh after reconnect.
- Inventory, Variance, and Audit browser smoke checks rendered the new local-cache status and retained existing inventory count, stock movement, and audit snapshot controls.
- Validation passed: `npm run typecheck`, `npm run lint`, `npm run build`, and authenticated local browser smoke checks.
- The data layer is ready for Phase 4’s secure offline admin bootstrap; a full offline reload still remains intentionally gated there so cached data never becomes an authorization source.

### 2026-08-13 — Phase 4 secure offline admin bootstrap slice

- Extended `src/lib/offline.ts` with an explicit device-local `OfflineAdminScope` bound to organization, branch context, and admin/manager role. Legacy POS-only credentials do not gain admin access automatically, and the raw PIN remains unpersisted.
- Added `src/components/admin/OfflineAdminSetup.tsx` to enroll or upgrade the device PIN only from an authenticated online admin shell. Existing POS profile/catalog data is preserved when the admin scope is added.
- Added `src/components/admin/AdminOfflineShell.tsx`, rendered through the public login shell when Supabase is unreachable. It reads only the exact scoped Dexie read models for receipts, shifts/Z-readings, inventory, variance, and audit, and exposes no server actions or mutation controls.
- Updated `src/components/OwnerLoginPage.tsx` so offline POS unlock is limited to `/pos`, while `/admin` requires an explicit admin scope, matching cached read models, and a successful device-PIN unlock.
- Added cache readiness metadata and branch/role scope cleanup. Offline sign-out clears the admin read-model store alongside the POS session and service-worker cache boundary; private admin HTML remains excluded from `public/sw.js`.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` pass. Production service-worker smoke confirmed `/admin` stays on the requested path and shows the explicit no-credential recovery state, while `/pos` keeps its separate offline guidance. Full authenticated PIN-unlock/read-model rendering remains the final Phase 4 acceptance step when a signed-in browser session is available.

### 2026-08-13 — Phase 4 signed-in browser acceptance boundary

- A signed-in Chrome session was verified on `https://dumala.store/admin/orders` as the expected admin user, organization, and branch context, then restored to its original URL after inspection.
- The hosted deployment did not contain the local `Secure offline admin` / `Enable read-only recovery` setup prompt, so PIN enrollment and cached-admin unlock were not run against production and no production IndexedDB or account state was changed.
- The local origin reached the new no-credential `/admin` recovery state, but it had no signed-in local session. This is a deployment/session boundary, not a code pass; the authenticated acceptance remains open.

### 2026-08-13 — Phase 5 inventory mutation outbox slice

- Added `supabase/migrations/0044_admin_offline_mutations.sql` with scope-bound idempotency receipts and new RPC overloads for stock movements and physical counts. The existing online six-/three-argument functions remain available for compatibility.
- Upgraded `dumala-admin-db` to version 2 with a scoped admin mutation outbox. Records carry the exact user, organization, branch, role, mutation kind, payload, attempts, retry time, and conflict/error state; no PIN material is stored.
- Added `AdminMutationForm` so stock movements and physical counts queue locally first for low-latency interaction, even while online. `AdminMutationSync` replays them on reconnect or a 30-second cadence through the authenticated Supabase client, deletes only successful receipts, and backs off transient failures.
- Permanent server-validation failures are retained as visible conflicts for review. Billing, permissions, employee authentication, refunds, voids, Z-generation, and shift closing remain online-only.
- Validation passed after the slice: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` (line-ending warnings only). Migration `0044` is now applied to the linked Supabase project and a linked dry-run reports no pending migrations. Remote schema lint completes with one pre-existing warning in `build_staff_login_slug`; the same-origin signed-in browser drill remains open.

### 2026-08-13 — Phase 4 deployed online acceptance

- The merged frontend was live on `https://dumala.store`; the signed-in admin session showed the `Secure offline admin` / `Enable read-only recovery` prompt.
- Enrolled a temporary device-local PIN for the smoke test. The prompt closed successfully, confirming the admin scope enrollment path without exposing the raw PIN.
- Opened a receipt locally at `/admin/orders?order=...` and closed it back to `/admin/orders`. Visited Shifts, Inventory, Variance, and Audit so their scoped read models were hydrated online.
- The Chrome control surface did not expose per-tab network emulation, so the remaining acceptance was handed to the signed-in user for a physical network toggle; the user confirmed the offline reload, PIN unlock, cached-read, and mutation-gating drill succeeded.

### 2026-08-13 — Phase 4 actual offline browser acceptance

- User-confirmed acceptance passed on the signed-in browser: the admin workspace reopened while the network was unavailable, the enrolled device PIN unlocked the scoped admin shell, previously hydrated orders/shifts/inventory/variance/audit data remained readable, and mutation controls stayed gated in offline recovery mode.
- The temporary device-local test PIN must be replaced before production use; the raw PIN is not persisted by the application.

### 2026-08-13 — Phase 5 mutation drill attempt

- The staged inventory movement and physical-count forms accepted locally, but the browser was online at submit time and the outbox immediately reported `Offline admin changes synced.` This is not accepted as the offline mutation drill.
- The server showed one replayed Espresso movement and one physical-count batch with no duplicate movement for the same attempt. A compensating QA-item adjustment restored the QA item’s pre-drill stock baseline; the test physical-count rows remain auditable records for the selected business date.
- Phase 5 remains open until a confirmed network-unavailable submit shows queued state, followed by reconnect replay and authoritative reconciliation.

### 2026-08-14 — Phase 5 retry handling and baseline capture

- User QA confirmed that a transient `Failed to fetch` leaves offline admin work in the outbox; after reconnect, the physical-count batch replayed and the status cleared instead of losing the change.
- The exact reversible-test movement was not present in the authoritative ledger, so the inventory-movement half of the drill is not accepted yet. The browser also produced repeated physical-count receipt attempts during the reconnect window; the client now locks form submission, suppresses same-form repeat payloads, serializes in-tab/cross-tab outbox flushes where the browser supports Web Locks, and presents a user-readable retry message.
- Validation after the repair: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` pass. The remaining Phase 5 gate is one movement-only offline submit followed by a single authoritative receipt.

### 2026-08-14 — Phase 0 runtime baseline capture

- Signed-in Orders browser samples opened the local `Receipt view` without changing the `/admin/orders` pathname. The first observed sample was approximately 3.9 seconds; warm samples were approximately 0.52–0.72 seconds including the browser harness settle window. These timings are user-visible harness measurements, not application performance marks.
- The browser control surface did not expose `PerformanceResourceTiming`, navigation entries, request counters, or a signed-in Shifts tab in this capture. Dashboard had no transaction trigger in the current data set. Request/payload baseline and complete p50/p95 coverage therefore remain open.
- The source audit points to the admin route shell’s repeated branch/device context reads and full server-rendered page payloads as the next Phase 6 measurement targets; Phase 6 can begin now that the initial Phase 5 mutation gate is closed.

### 2026-08-14 — Phase 0 baseline and Phase 6 context deduplication

- Authenticated browser baseline: Orders local receipt opens measured approximately 2.4–3.5 seconds in the browser harness across four samples; Sales approximately 2.6–3.5 seconds across three samples; Shifts approximately 2.6–3.0 seconds across three samples. These include extension/CDP settle overhead and are not raw application marks.
- Every captured local modal kept its originating pathname and query-only state: `/admin/orders?order=…`, `/admin/sales?order=…`, and `/admin/shifts?shift=…`. No route-progress bar was active during the local-modal checks. Dashboard had no transaction trigger in the current dataset.
- The browser control surface did not expose `PerformanceResourceTiming`, navigation entries, request counters, or payload sizes. Those remain rollout instrumentation follow-ups rather than guessed values.
- Added `src/lib/admin/branches.ts` and moved branch reads used by the AdminRouteLayout plus Dashboard, Orders, Sales, Promotions, Shifts, Inventory, Variance, Audit, Customers, Expenses, Suppliers, and Billing to a request-scoped React cache. This removes duplicate layout/page branch queries without persistent stale data or authorization changes.
- Added `src/lib/admin/connection.ts` with a 15-second advisory cache for the sidebar device-heartbeat status, keyed by user, organization, and selected branch. It does not participate in authorization or mutation decisions.
- Validation passed after the optimization: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.
- This baseline identified large server-rendered payloads and remaining profile/device reads as the next Phase 6 measurement targets; the first payload and deployment-telemetry slice is recorded below, with production measurement pending deployment.

### 2026-08-14 — Phase 5 final inventory movement acceptance

- User submitted the prepared Main Branch → Espresso → Stock in quantity 1 mutation while offline and restored the connection.
- Authoritative reconciliation found exactly one `inventory_movement` receipt (`result_count` is not applicable) pointing to exactly one `stock_movements` row with reason `Phase 5 final offline movement QA 2026-08-14`; no duplicate row was found.
- Phase 5 is complete for the initial inventory movement and physical-count slice. Optimistic projections remain deferred until conflict behavior is separately specified.

### 2026-08-14 — Phase 6 branch payload projection and deployment telemetry

- Added `getAdminBranchOptions` with the minimal `id/name/is_active` projection. The shared admin layout uses it for non-receipt routes, while Dashboard, Orders, Sales, and Promotions retain the full branch identity fields needed to construct receipt views. The shell now explicitly strips receipt-only address/TIN/VAT fields before passing branch options to client components, reducing the server-rendered payload without changing branch scoping or RLS.
- Narrowed Promotions line-item reads to the eight recent discounted receipts plus an optional deep-linked receipt instead of fetching up to 10,000 unrelated line items. Report totals still use the order summary query, and receipt contents remain complete for the records rendered by the page.
- Extended the existing admin interaction marks with resource-count, transfer-byte, and encoded-body-byte deltas. `AdminPerformanceReporter` sends only online, request-started navigation metrics to the authenticated `/api/admin/performance` endpoint; local modal opens do not send a request.
- The reporter also captures one initial-document navigation sample per admin page load, including document transfer/encoded-body bytes and aggregate resource bytes. The route validates a small bounded payload and emits structured `dumala_admin_performance` deployment logs without URLs, query strings, order/customer/staff identifiers, user IDs, organization IDs, or request bodies. These logs are the measurement source for the next focused summaries/pagination slice.
- Validation passed: `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` (line-ending warnings only). The changes are still uncommitted and not deployed, so production p50/p95 and byte baselines remain pending.

## References

- `docs/ARCHITECTURE.md` — existing offline architecture and security principles.
- `docs/POS_PRD.md` — POS offline behavior and sync requirements.
- `src/lib/offline.ts` — Dexie catalog, profile, order outbox, and audit outbox.
- `public/sw.js` — authenticated document caching boundary.
- `src/components/admin/OrderDialogController.tsx` — existing receipt controller.
- `src/components/admin/ShiftDialogController.tsx` — existing shift/Z-reading controller.
