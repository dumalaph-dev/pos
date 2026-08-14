# Phase 7 POS acceptance and rollout report

**Date:** 2026-08-14
**Release under test:** `main` at `d88195d` (`feat(pos): modularize offline-ready checkout architecture`)
**Local URL:** `http://127.0.0.1:3000/pos`
**Status:** Code-level gates passed; authenticated tablet/device acceptance is blocked pending a signed-in session and staging/peripheral controls.

## Scope

This pass covers the Phase 7 acceptance items listed in
`ADMIN_LOCAL_FIRST_OFFLINE_ROADMAP.md`: tablet layouts, account-menu and overlay
behavior, online/offline recovery, synchronization and duplicate prevention,
hardware health, tenant/role isolation, shared-terminal cleanup, telemetry, and
rollout/rollback readiness.

## Evidence collected

### Automated and source-level gates

| Check | Result | Evidence |
| --- | --- | --- |
| POS business/property tests | PASS | `npm run test:pos` - 5 tests passed |
| POS accessibility/overlay checks | PASS | `npm run test:pos:accessibility` - 3 tests passed |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS | `npm run lint` |
| Production build | PASS | `npm run build` |
| Printer failure and retry flow | PASS (mock) | `npm run printer:validate:mock` acknowledged a print, forced an unreachable-printer failure, and delivered the retry |
| Diff hygiene | PASS | `git diff --check` |

The source audit also confirms:

- POS dialogs use `OverlayDialog` and the shared portal layer. Dialogs expose
  `aria-modal`, Escape handling, focus containment, focus restoration, and
  backdrop-only close behavior.
- Dropdowns use the shared overlay z-index token and the account menu computes a
  viewport-safe fixed position. The account menu keeps submit forms mounted so
  the Sign out server action is not cancelled by menu unmounting.
- Sign out clears the offline session, admin local-first cache, and private
  Cache Storage entries before ending the auth session. The order outbox is
  intentionally preserved so unsynced sales are not lost during a shared-
  terminal user change.
- Queued orders are replayed through the idempotent `place_order` RPC using
  `local_uuid`; scoped queue metrics expose pending count and the oldest queued
  sale without exposing order payloads.
- The health panel includes pending sync, oldest queued sale, failed prints,
  customer-display status, and sync state. Hardware status derives from the
  browser online state, display transport, print reducer, and sync reducer.

### Tablet viewport probe

The requested viewport overrides were applied and reset after each probe.

| Viewport | Result |
| --- | --- |
| 1024 x 768 landscape | POS route redirected to `/login`; no authenticated POS surface was available to exercise |
| 1280 x 800 landscape | POS route redirected to `/login`; no authenticated POS surface was available to exercise |

This confirms the local server and viewport controls are working, but it is not
an acceptance result for the authenticated POS layout.

## Runtime matrix

The following items remain open because the in-app browser had no authenticated
session and the local Supabase fixture could not start. No unauthenticated or
source-only result is promoted to a runtime pass.

| Scenario | Result | Required next evidence |
| --- | --- | --- |
| 1024 x 768 catalog/order layout | BLOCKED | Signed-in cashier on a tablet or browser viewport; verify no horizontal scroll and reachable order panel |
| 1280 x 800 topbar/account/health layout | BLOCKED | Signed-in cashier; verify account menu and health panel stay inside the viewport and do not cover navigation |
| Account dropdown positioning | CODE PASS / RUNTIME BLOCKED | Click `Open account menu`, record panel bounds, then check right-edge and topbar overlap at both widths |
| Sign out | CODE PASS / RUNTIME BLOCKED | Click the menu Sign out button, verify pending label, redirect to `/login?signed-out=1`, and verify the next user cannot see the previous user's cached catalog/profile |
| Escape and focus restoration | CODE PASS / RUNTIME BLOCKED | Open account menu and every dialog; press Escape; verify close and focus return to the trigger |
| Dialog focus trap and keyboard navigation | CODE PASS / RUNTIME BLOCKED | Tab and Shift+Tab at first/last controls; verify focus remains in the dialog and all actions have visible focus |
| Outside click | CODE PASS / RUNTIME BLOCKED | Click backdrop to close; click dialog content and verify it remains open |
| Online / slow network / airplane mode | BLOCKED | Use staging or a physical tablet network toggle; confirm sale entry remains usable offline and sensitive actions stay gated |
| Reconnect / force-close / refresh | BLOCKED | Queue a controlled QA sale, force-close and relaunch, reconnect, then verify one authoritative receipt and no lost cart/outbox data |
| Pending sync and failed-print states | CODE PASS / RUNTIME BLOCKED | Create a controlled offline queue and mock/QA printer failure; verify health counts and retry affordance in the UI |
| Customer display and terminal health | CODE PASS / RUNTIME BLOCKED | Pair a QA display and test disconnected, connecting, connected, offline, syncing, and attention states |
| Duplicate prevention and reconnect sync | CODE PASS / RUNTIME BLOCKED | Replay the same controlled `local_uuid` twice and verify one server order/receipt; inspect the queue after reconnect |
| Branch and role isolation | AUTOMATION AVAILABLE / RUNTIME BLOCKED | Run `scripts/rls-fixture.mjs` against local Supabase or a disposable staging project, then sign in as both org admins and branch cashiers |
| Shared-terminal cache cleanup | CODE PASS / RUNTIME BLOCKED | Sign out on a shared tablet, sign in as another branch/user offline, and verify no prior catalog/profile/admin cache is readable |
| Performance telemetry | READY / NOT CAPTURED | Allow normal signed-in traffic, then run `npx supabase db query --linked --file scripts/admin-performance-summary.sql --output json` and attach the 24-hour p50/p95 output |

## Environment blockers

- The in-app browser started at `/login` for both requested viewport sizes; no
  authenticated session was available to the task.
- `npx supabase status` could not inspect the local stack because the Docker
  Desktop Linux engine was not running.
- The browser control surface does not provide the authenticated session,
  physical network toggle, or real customer-display/printer hardware needed for
  the remaining checks. Production mutations and unknown credentials were not
  used as a workaround.

## Acceptance runbook for the next signed-in pass

1. Use a disposable local/staging organization with two branches and the
   fixture users from `docs/SETUP.md`; do not run queue or isolation drills
   against production data.
2. Sign in as a branch cashier and run the complete UI matrix at 1024 x 768 and
   1280 x 800. Capture a screenshot for each viewport and record the focused
   element after every Escape, Tab, Shift+Tab, and outside-click step.
3. Configure a QA printer and customer display. Exercise a successful print,
   unreachable printer, retry, disconnected display, reconnecting display, and
   connected display. Do not use live payment or a production printer for the
   drill.
4. Use an actual network toggle or browser network throttling for online,
   slow, offline, reconnect, refresh, and force-close flows. Record the local
   order UUID, pending count, reconnect time, final server receipt count, and
   whether the cart/outbox survived relaunch.
5. Run the RLS fixture as the two org admins and four branch cashiers. Confirm
   cross-organization reads, cross-branch reads, cashier write restrictions,
   and the positive own-branch sale path.
6. Sign out and sign in as a different user on the same device. Confirm the
   prior user’s profile/catalog/admin cache is unavailable while the outbox
   behavior matches the documented policy.
7. Run the telemetry summary query and append the output, sample window, route
   mix, and observed p50/p95 values to this report.

## Rollout and rollback notes

### Recommended rollout gate

Keep the release in controlled acceptance until the blocked runtime matrix is
green. After that, roll out in slices: one internal terminal, one branch, a
small multi-branch canary, then the remaining terminals. Monitor sync failures,
pending queue age, failed prints, display disconnects, auth/cache-cleanup
reports, and the admin performance summary after each slice.

### Rollback

- Application rollback target: previous `main` commit `23fcc43`.
- Preferred repository rollback: create a reviewed revert of `d88195d` and
  redeploy through the normal pipeline; do not reset or force-push `main`.
- If a live terminal has queued sales, preserve and reconcile the outbox before
  removing the release. Never clear the order outbox as part of rollback.
- If telemetry or hardware errors increase without accounting impact, disable
  the rollout slice and return the affected terminals to the previous deployed
  application while the queued-sale reconciliation is monitored.

## Exit decision

The release is technically buildable and the automated POS/overlay/printing
gates pass. Phase 7 is not yet accepted for broad rollout because the
authenticated browser/tablet, real network, hardware, isolation, and
authoritative telemetry checks were not executable in this environment.
