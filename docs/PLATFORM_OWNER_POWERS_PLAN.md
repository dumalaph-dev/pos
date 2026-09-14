# Platform Owner Powers Plan

**Project:** Dumala POS
**Created:** 2026-08-29
**Status:** Phase 4 in progress — the audit, fleet, sync/outbox, and schema-drift read surfaces are deployed through `0084`; device inventory is implemented locally, pending deployment and real terminal heartbeat validation
**Owner:** Product and engineering
**Companion to:** [tasks.md](tasks.md) · [SCHEMA.md](SCHEMA.md) §8 · [SETUP.md](SETUP.md)

## Purpose

Give the platform owner direct, audited control over a registered account's entitlement — extending a trial, granting Premium, and the operator powers around them — without a database console, a support email thread, or a deploy.

This document is the working plan for the initiative. Phases 1–3 are complete against hosted Supabase, and Phase 4 is the current implementation slice. The open decisions in [Decisions to make](#decisions-to-make-before-implementation) still change the shape of Phase 5.

---

## Current source-audit baseline

Read this section first. One of the two features requested already exists, and the plan is smaller because of it.

### Granting Premium to a registered account — already implemented

The platform console can already put a paying-tier entitlement on any registered organization:

- **Action:** `grantComplimentaryPremium` / `revokeComplimentaryPremium` in [operations-actions.ts:199](../src/app/platform/operations-actions.ts).
- **UI:** `ComplimentaryGrantPanel` — mounted **only** on the organization detail page `/platform/organizations/[orgId]`.
- **Inputs:** 1–365 days; source `manual` / `support` / `campaign` / `referral`; start `now` or `after_current_access`; a 5–500 character reason.
- **Storage:** `platform_access_grants` (migration `0052`), written atomically with its `audit_logs` evidence by the `grant_platform_access` RPC (migration `0054`).
- **Enforcement:** genuinely defense-in-depth. `0052` rewired `auth_org_id`, `auth_store_id`, `auth_role`, `auth_is_admin`, and `auth_is_billing_admin` to consult `organization_has_current_access_grant`, so a granted org keeps its RLS context even with an expired trial. The app layer agrees through `isSubscriptionAccessCurrent` ([trial.ts:140](../src/lib/trial.ts)) and `transitionExpiredTrial` ([trial-server.ts:20](../src/lib/trial-server.ts)), which refuses to expire a trial while a grant is live.
- **Gate:** blocked unless both the `billing` and `support` platform policies are `published`, and refused on a suspended account.

**What is actually missing here** is reach and edit, not capability: the panel is one click deeper than the Operations page where an operator starts, and an existing grant can only be revoked and re-created, never extended or shortened.

### Extending trial days — not implemented

Nothing in the console can move a trial. `subscription_trial_ends_at` is written at signup and only ever read afterward. The only trial-related operator action is `updateTrialFeedback`, which changes a feedback record's status, not the trial.

Existing machinery to build on:

- Columns on `organizations`: `subscription_status`, `subscription_trial_started_at`, `subscription_trial_ends_at`, `subscription_current_period_end`, `subscription_billing_mode`.
- `DEFAULT_TRIAL_DAYS = 14` ([trial.ts:3](../src/lib/trial.ts)).
- Expiry writes `subscription_status = 'paused'` (`TRIAL_EXPIRED_SUBSCRIPTION_STATUS`) through the `expire_trialing_organization` RPC (migration `0041`, hardened in `0052`).
- SQL truth function `subscription_access_is_current(status, trial_ends_at, current_period_end, billing_mode)`.

**The hazard this creates.** `paused` has two different causes: an expired trial, and a PayMongo `unpaid` provider status ([paymongo/webhook/route.ts:222](../src/app/api/paymongo/webhook/route.ts), [billing/subscribe/route.ts:310](../src/app/api/billing/subscribe/route.ts)). Any action that revives a paused org into `trialing` must tell them apart, or it will hand free access to an account that stopped paying. The codebase already has the discriminator it should reuse verbatim — [billing/subscribe/route.ts:113](../src/app/api/billing/subscribe/route.ts): `paused` **and** no `subscription_provider_subscription_id` **and** no `subscription_provider_payment_intent_id`.

### Operator access model

`PLATFORM_ADMIN_EMAILS` is a comma-separated env allowlist read by [platform-admin.ts:1](../src/lib/platform-admin.ts). It remains a flat Owner bootstrap path, while managed operators now live in `platform_operators`; membership changes for managed operators no longer require a redeploy. This is the ceiling that made Phase 3 necessary before adding more powers.

### Console surface today

| Page | Powers |
|---|---|
| Overview | Org/store/staff counts, subscription split, policy and checkout readiness |
| Plans & Pricing | Base price, monthly/annual variants, discounts, PayMongo plan IDs |
| Promo & Marketing | Create and toggle checkout codes, paid-conversion performance |
| Directory | Users, organizations, per-org drill-down |
| Policies | Versioned billing/support drafts, publish (gates every mutation) |
| Operations | Suspend/restore org, open support case, grant/revoke Premium, trial feedback |

---

## Guiding principles

1. **The database is the boundary, not the console.** Every new power lands as an RPC with its own guard, mirroring `0052`, so a power cannot be exercised by calling Supabase around the UI.
2. **One atomic write, one audit row.** Follow `grant_platform_access`: the mutation and its `audit_logs` evidence commit together or not at all.
3. **The policy gate applies to every entitlement mutation.** Both policies published, or the action is refused.
4. **Never revive a non-paying account by accident.** Trial actions must prove the pause came from expiry, not from a failed payment.
5. **The tenant's own screens must stay truthful.** If an operator extends a trial, the owner's billing banner and trial countdown must show the new date — no state where the tenant is told "Trial ended" while access works.
6. **Read powers before write powers, and scoped operators before either.**
7. **No new power gets a bypass of tenant RLS that outlives the request.**

---

## Roadmap

### Phase 1 — Trial extension

**Status:** Phase 1 complete 2026-09-01; hosted migration state and authenticated console verification passed
**Migration:** `0075_extend_organization_trial.sql`

The requested feature. An operator picks a registered account, adds days, gives a reason, and the tenant's trial genuinely moves.

- [x] Add `extend_organization_trial(p_org_id, p_days, p_reason, p_actor_id, p_actor_email)` as a `security definer`, service-role-only RPC that in one transaction recomputes `subscription_trial_ends_at`, revives the account only when the pause is trial-caused, stamps `subscription_updated_at`, and inserts the `platform.trial.extended` audit row.
- [x] Define the new end date as `greatest(now(), coalesce(subscription_trial_ends_at, subscription_current_period_end, now())) + p_days`, so extending a *live* trial appends to the remaining time and extending a *lapsed* one restarts from today rather than silently burning days.
- [x] Guard the revive: set `subscription_status = 'trialing'` only when the row is `paused` **and** both `subscription_provider_subscription_id` and `subscription_provider_payment_intent_id` are null. A `paused`-for-nonpayment org is refused with a message pointing at billing.
- [x] Refuse extension for `active`, `past_due`, `canceled`, and `incomplete` — those are billing states, and the Premium grant is the right instrument there.
- [x] Refuse on `account_status = 'suspended'`, matching `grantComplimentaryPremium`.
- [x] Bound the input: 1–90 days per action, and a 180-day lifetime cap on operator-added trial days per organization, enforced in the RPC against the `platform_trial_extensions` ledger through `organization_trial_extension_days`.
- [x] Add `extendOrganizationTrial` to [operations-actions.ts](../src/app/platform/operations-actions.ts), using `requirePlatformOperator("entitlement_manage")` → `requirePublishedPolicies` → `readOrganization` → RPC → `revalidatePlatformPages`.
- [x] Add a **Trial extension** panel above the grant panel on the organization detail page: current trial state, operator-days meter, day input bounded by the remaining cap, reason, a live preview of the resulting end date, and the full extension history.
- [x] Confirm the tenant-side reads pick the change up with no further work. Verified by reading the call sites: `readTrialLifecycle`, `isSubscriptionAccessCurrent`, `getBillingAccessReason`, and the SQL `subscription_access_is_current` all derive from `subscription_status` and `subscription_trial_ends_at`, both of which the RPC writes. No tenant-side change was needed.
- [x] Register the RPC in `scripts/rpc-contracts.test.ts` and reload PostgREST at the end of the migration, matching `0073`.
- [x] Add `scripts/platform-trial-extension.test.ts` (12 cases) and the `npm run test:platform-trial` script.
- [x] Add `scripts/platform-trial-extension-smoke.sql` and the `npm run platform:trial:validate` script, and prove every RPC guard against a real Postgres.
- [x] Record the migration in [SETUP.md](SETUP.md) and the RPC in [SCHEMA.md](SCHEMA.md) §8 in the same change.
- [x] Apply `0075` to hosted Supabase and run the authenticated console pass against a real second account. The linked production ledger contains `0075` and `0076`; the normal linked push confirmed the database is up to date, and the hosted console pass verified a live countdown extension, trial-expired revival, and nonpayment-pause refusal.

**Exit criteria:** A live trial extended by an operator shows the new countdown on the owner's billing page. A trial-expired `paused` org returns to `trialing` and regains POS access. A nonpayment `paused` org is refused. Every attempt, successful or not, leaves an audit row. The per-org cap blocks the action at the boundary. Verified against hosted Supabase with a real second account, not only locally.

**Verification status.** The static gates pass: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:platform-trial` (12 passed), `npm run test:rpc-contracts` (2 passed), `npm run test:trial` (5 passed), `npm run test:platform-access` (3 passed).

The hosted rollback-scoped smoke and authenticated console pass are recorded in [tasks.md](tasks.md): a live trial countdown moved, a trial-expired `paused` account returned to `trialing` and regained `/pos` access, and a provider-backed nonpayment pause was refused without a ledger or audit row. The direct tenant ACL check also remains closed, and the smoke fixtures were rolled back. The hosted ledger contains `0075` and `0076`; the only intentional hosted rows from the console pass are the two trial-extension ledger rows and their two corresponding `platform.trial.extended` audit rows.

**Decision taken:** the trial columns are mutated rather than modelled as a second grant kind. The grant-row approach keeps the trial columns immutable and gives a natural ledger, but leaves the tenant reading "Trial ended" while access works — a direct violation of principle 5.

### Phase 2 — Complete and surface the entitlement controls

**Status:** Complete — code and migration deployed from `main` commit `198e77e`; hosted boundary smoke, CI, production preflight, and the owner-reported authenticated entitlement walkthrough passed
**Migration:** `0078_adjust_platform_access_grant.sql`

Close the gaps the audit found in the Premium grant that already exists.

- [x] Add an **Account entitlement** card to `/platform/operations` showing, per organization, the live state — status, trial end, current grant and its expiry, paid-branch entitlement — with the actions inline instead of one page deeper.
- [x] Make an active grant adjustable: extend or shorten in place, with before/after in the audit row, replacing today's revoke-and-recreate, which leaves two rows and loses the original reason.
- [x] Show a combined entitlement timeline per org — trial window, grants, subscription periods, suspensions — so an operator can see *why* an account currently has access.
- [x] Add search and filter by entitlement state (in trial, trial expiring within 7 days, on a grant, grant expiring, paused, suspended) so the console works past a handful of accounts.
- [x] Surface grant and trial expiry on the Overview readiness panel.

**Exit criteria:** Every entitlement power is reachable within one click of `/platform/operations`. Adjusting a grant produces exactly one audit row with before and after. No regression to the existing grant and revoke flows.

**Implementation notes (2026-09-01).** `/platform/operations` now loads a searchable,
filterable entitlement directory with inline trial-extension, grant, adjustment, and
revoke controls. Organization detail adds the combined entitlement timeline, and the
Overview readiness panel reports near-term trial and grant expiry. Migration `0078`
adds `updated_by`/`updated_at` to `platform_access_grants` and the service-role-only
`adjust_platform_access_grant` RPC. It locks and updates the existing grant row in
place and writes one `platform.access_grant.adjusted` audit row containing the full
before/after snapshots and adjustment reason. The existing grant and revoke paths are
unchanged.

**Verification status.** Local `0078` application and the rollback-scoped adjustment,
grant, trial, and operator smokes passed. `npm run test:platform-entitlements` (4
passed), `npm run test:rpc-contracts` (3 passed), `npm run typecheck`, `npm run lint`,
`npm run build`, and `npm run production:preflight` passed. Hosted Supabase project
`uzavkjftwcuixidxyopr` records migration `0078` with two adjustment columns and one
adjustment function; direct ACL checks report `anon` and `authenticated` EXECUTE as
false, authenticated table SELECT as false, and `service_role` EXECUTE as true.
The hosted rollback smoke passed. Existing hosted counts remain unchanged at 3
organizations, 0 access grants, 2 trial-extension rows, 2 `platform.%` audit rows,
and 1 platform operator. The code push's GitHub CI run `33470633381` passed, and the
live operations route returns the expected unauthenticated `307` redirect to
`/platform/login`.

The owner reports completing the authenticated Phase 2 console walkthrough and
confirming the entitlement directory, filters, timeline, live grant adjustment,
countdown change, before/after audit entry, and existing revoke flow all work. This
is recorded as owner-reported evidence without adding account credentials or
identifiers to the repository; the database smoke remained rollback-scoped.

### Phase 3 — Operator role model

**Status:** Deployed from `main` commit `c7131fb` — migration applied, hosted boundary smoke and CI passed; the owner reports the authenticated two-account console verification complete
**Migration:** `0077_platform_operators.sql`

The flat `PLATFORM_ADMIN_EMAILS` allowlist is the reason the remaining powers should not simply be stacked on what exists.

- [x] Add a `platform_operators` table: identity, role, active flag, created/revoked evidence. Service-role only, matching `platform_access_grants`.
- [x] Define the initial roles: `owner` (everything, including operator management), `billing` (plans, promos, entitlement; no support access), `support` (support cases, read-only entitlement; no pricing), `read_only` (no mutations).
- [x] Keep `PLATFORM_ADMIN_EMAILS` as the bootstrap path for the first `owner` so the console cannot lock itself out, and document that precedence explicitly.
- [x] Move the role check into a single server-side helper every action calls, so a new action cannot forget it; keep `isPlatformAdminEmail` as the bootstrap branch only.
- [x] Add an Operators page: list, invite, change role, revoke — each writing an audit row.
- [x] Add a contract test asserting that every exported platform server action performs a role check.

**Exit criteria:** Operator membership changes without a redeploy. A `read_only` operator can see the console and cannot mutate anything. Every role change is audited. The bootstrap allowlist still recovers a locked-out console.

**Implementation notes (2026-09-01).** Migration `0077_platform_operators.sql` adds service-role-only operator and audit tables plus security-definer invite/reactivate, role-change, and revoke RPCs. The server-side `requirePlatformOperator` helper resolves a managed active row or the `PLATFORM_ADMIN_EMAILS` bootstrap owner, and every exported platform Server Action now names its required permission. The console has an Operators page and role-aware Plans, Promotions, Policies, Operations, and organization-detail controls. Bootstrap emails take precedence over table rows and cannot be changed or revoked from the console; managed membership can be revoked without deleting history, and the final active table owner is protected by the RPCs.

**Verification status.** `npm run test:platform-operators`, `npm run test:rpc-contracts`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run production:preflight` pass. `npm run platform:operators:validate` passed against hosted Supabase with a rollback-scoped invite → role-change → revoke → reactivation flow, final-owner protection, append-only audit trigger, and browser-role ACL checks. `npx --yes supabase@2.114.0 db push --linked --yes` applied `0077_platform_operators.sql`; the hosted counts remain 3 organizations, 11 profiles, and 5 stores, with no smoke fixtures left behind. Commit `c7131fb` was pushed to `main`; GitHub CI run `33465830354` passed its typecheck, lint, build, and production-preflight job, and the live `/platform/operators` route returns the expected unauthenticated `307` redirect to `/platform/login`. The owner reported completing the authenticated two-account invite, login, role restriction, role change/revoke, and audit-entry console verification on 2026-09-01; no account credentials or additional identity details are recorded here.

After Docker Desktop became available, the preserved local Supabase volume recovered without a reset. Local `0076` and `0077` were applied with `db push --local --yes`; the container `psql` operator smoke and the existing trial smoke passed, and local counts remain 2 organizations, 0 profiles, 4 stores, 0 platform operators, and 0 operator audit rows.

### Phase 4 — Cross-org read surfaces

**Status:** In progress — audit, fleet, sync/outbox, and schema-drift surfaces are deployed through `0084`; device and terminal inventory is implemented locally, pending deployment, authenticated operator QA, and the first real terminal heartbeats
**Migration:** `0079_scope_admin_performance_to_organizations.sql`, `0080_sync_health_snapshots.sql`, `0081_sync_health_enhanced_metrics.sql`, `0082_admin_latency_scoping.sql`, `0083_scoped_read_rpc_acl_hardening.sql`, and `0084_schema_drift_readout.sql` applied; platform readers are read-only, and legacy performance samples plus existing tenant data remain preserved

Powers that only need to look. Safe to build once Phase 3 can scope who looks.

- [x] **Platform audit viewer.** The deployed `/platform/audit` page combines platform-scoped `audit_logs` rows with `platform_operator_audit_logs`, and supports search plus source, action, organization, and time-window filters. Before/after snapshots remain expandable; the page is read-only and excludes tenant order, customer, and staff activity.
- [x] **Fleet health.** The deployed `/platform/fleet` page aggregates `admin_performance_samples` into p50/p95 interaction latency, error rate, sample freshness, and surface breakdowns per organization, with time-window, search, and status filters. Migration `0079` attributes future authenticated samples from the server-resolved profile organization; existing rows remain preserved as unattributed history, and no raw tenant activity is exposed.
- [x] **Sync and outbox health.** The deployed `/platform/sync` page reports bounded POS-order, audit-event, and admin-mutation queue snapshots per organization and active branch, including pending depth, offline-sync failure/conflict counts, exact stuck-outbox depth, last successful sync per queue, oldest-pending age, reporter freshness, and explicit `healthy`, `needs attention`, `stale`, and `no telemetry` states. Search, queue, freshness, and health-status filters plus organization/branch/queue aggregate drill-downs are read-only; payloads never leave the terminal.
- [ ] **Device and terminal inventory.** Implemented locally on 2026-09-14 at `/platform/devices`; deployment and real heartbeat validation remain open. Shows registered devices and unmatched browser reporters, scoped exact-prefix associations, branch/health/search filters, inactive entries, last heartbeat and success, pending orders, and queue details. Each reporting queue contributes to freshness so a newer admin report cannot hide a silent POS queue. Device-record last-seen activity never implies sync success. The hosted read-only check found 2 active registered devices and 0 heartbeat reporters. No schema change is needed; the page uses the existing device directory and `0080`/`0081` telemetry, with explicit missing/partial-data states. See the 2026-09-14 delivery log in [tasks.md](tasks.md) for verification. Physical printer testing is deferred by the owner.
- [x] **Schema drift.** The deployed `/platform/schema` page compares the migrations this deployment ships against the applied ledger, reporting `in sync`, `pending` (shipped but never applied), `unknown remote` (applied but absent from this build), `diverged`, and `renamed`, with search and state filters. It replaces the hand-typed "local X = remote X" note in [tasks.md](tasks.md). The plan wording assumed a per-tenant ledger; every organization shares one database, so the ledger position is fleet-wide by construction and the page says so, offering per-organization *backfill readiness* as the real per-tenant dimension. Migration `0084` adds the service-role-only reader, which returns version and name and never the `statements` SQL text.

**Exit criteria:** The 2026-08-25-style production verification can be read off the console instead of assembled from scripts. No page exposes order, customer, or staff personal data to an operator not entitled to it.

**Verification status (2026-09-01).** `npm run test:platform-audit` (3
passed), `npm run test:rpc-contracts` (3 passed), `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run production:preflight`, and
`git diff --check` pass. The local read-only smoke returned zero platform rows
against the preserved local fixture. The hosted
`npm run platform:audit:validate` smoke returned 5 organization events and 2
operator-membership events, confirmed every organization event is scoped to
`platform.%`, loaded 2 organization IDs, and made no writes. GitHub CI run
`33475370420` passed typecheck, lint, build, and production preflight; commit
`2e195fd` is deployed to production through Vercel deployment `6195435114`.
The live unauthenticated `/platform/audit` boundary returns the expected `307`
redirect to `/platform/login`. No migration or hosted data change was needed.

**Fleet health verification (2026-09-01).** The `/platform/fleet` reader is
server-side and aggregated: it exposes organization-level samples, p50/p95
duration, error rate, freshness, and surface breakdowns only. The status rules
are explicit in the UI and code: `needs attention` at a 5% or higher error rate,
`stale` when the latest sample is more than 24 hours old, and `no telemetry`
when an organization has no samples in the selected window. Migration `0079`
adds nullable `org_id` attribution to `admin_performance_samples` with a
server-derived insert guard; it does not rewrite or remove existing data.

`npm run test:platform-fleet` (3 passed), `npm run test:platform-audit` (3
passed), `npm run test:rpc-contracts` (3 passed), `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run production:preflight`, and
`git diff --check` pass. Local fleet smoke returned zero samples with the new
schema present. Hosted `npm run platform:fleet:validate` returned 643 samples
in the last 60 days, 4 error samples, 0 attributed samples, 643 legacy
unattributed samples, 0 organizations with attributed samples, and latest
sample `2026-08-29T14:23:04.405294+00:00`; the pre-migration hosted count was
643 and remains 643 after the migration. The smoke is read-only and no fixtures
were added. GitHub CI run `33478837547` passed typecheck, lint, build, and
production preflight; commit `979b151` is deployed through Vercel deployment
`6196018458`. The live unauthenticated `/platform/fleet` boundary returns the
expected `307` redirect to `/platform/login`. The next Phase 4 slice is device
inventory, followed by schema-drift visibility.

**Sync/outbox health verification (2026-09-01).** Migration `0080_sync_health_snapshots.sql`
was previewed as the only pending local and linked migration and applied to both
Supabase databases through `npx --yes supabase@2.114.0 db push`. The linked push
completed the migration and emitted only the CLI's optional post-apply
pg-delta catalog-cache timeout warning; the direct read-only smoke confirmed the
schema. The new table keeps one upserted row per organization, branch, local
terminal key, and queue, so it does not copy order or mutation payloads or grow
an unbounded history. Existing hosted counts remain 3 organizations, 11
profiles, and 5 stores; the new table contains 0 rows because no deployed
terminal has reported a heartbeat yet.

The viewer derives branch and organization health server-side. A queue is
`needs attention` when it has failed/conflict items, an offline reporter, or an
oldest pending item over 15 minutes; a reporter is `stale` after 30 minutes
without a heartbeat; branches with no report are `no telemetry`. The local and
hosted read-only smoke both returned `schema_has_table: true`, 0 snapshots, 0
reporting stores/devices, 0 pending depth, 0 failed items, 0 conflicts, and
`read_is_telemetry_only: true`. The hosted ACL check confirms RLS is enabled,
authenticated insert/update is allowed only through branch/org policies,
authenticated and anon SELECT are false, authenticated DELETE is false, and
service-role SELECT is true.

`npm run test:platform-sync` (3 passed), `npm run test:platform-fleet` (3
passed), `npm run test:platform-audit` (3 passed), `npm run test:rpc-contracts`
(3 passed), `npm run test:pos` (5 passed), `npm run test:pos:accessibility` (6
passed), `npm run test:platform-entitlements` (4 passed), `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run production:preflight`, and
`git diff --check` pass. Commit `ab18eb7` is deployed through Vercel deployment
`6196547670`; GitHub CI run `33481888299` passed typecheck, lint, build, and
production preflight. The live unauthenticated `/platform/sync` boundary
returns the expected `307` redirect to `/platform/login`. The next Phase 4
slice is device inventory, followed by schema-drift visibility.

**Enhanced sync/outbox health verification (2026-09-02).** Migration
`0081_sync_health_enhanced_metrics.sql` adds exact `stuck_count` and a
server-recorded, monotonic `last_successful_sync_at` without copying tenant
payloads or rewriting existing snapshots. The linked dry run initially showed
only `0081` pending; the linked apply completed, and a second dry run reported
the remote database up to date. The hosted read-only smoke returned zero
snapshots, zero pending/failed/conflict/stuck depth, both enhanced columns,
both integrity constraints, the success-preserving trigger, RLS enabled,
service-role SELECT allowed, and authenticated SELECT/DELETE denied. No hosted
fixtures were created, so there was no fixture data to retain or clean up.

`npm run test:platform-sync`, the adjacent platform/POS/accessibility/RPC
regressions, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run production:preflight`, and `git diff --check` pass. The local
Supabase dry run could not connect because Docker Desktop was not running; no
local database or fixture state was changed. The live unauthenticated
`/platform/sync` boundary still returns the expected `307` redirect to
`/platform/login`. Commit `9ea585f` is deployed through Vercel production
deployment `6205982303`, and GitHub CI run `33533961354` passed. The next gate
is authenticated operator QA plus the first real POS/admin terminal
heartbeats before device inventory.

**Admin latency scoping close-out (2026-09-05).** Migration
`0082_admin_latency_scoping.sql` shipped in commit `a3b2daa` without the
paired documentation entry every earlier migration in this initiative has, so
its hosted state could not be read off the repository. That gap is now closed.
`npx --yes supabase@2.114.0 migration list --linked` reports local and remote
matching through `0082`; the migration had already been applied, and no push
was needed or attempted.

A read-only hosted query confirmed the objects rather than inferring them from
the ledger row: `ledger_max` `0082`; `ttfb_ms`, `transfer_ms`, and
`browser_settle_ms` present as `integer` with their 3 check constraints;
`org_id` still present from `0079`; all six function signatures present,
`stable`, `security invoker`, and executable by `authenticated` — both
arities of `current_stock` and `current_inventory_stock` plus
`admin_sales_period_totals` and `admin_products_top_items`; and
`orders_completed_org_store_created_idx` created as the expected partial index
on completed, non-reversal orders. The query made no writes and created no
fixtures.

`admin_performance_samples` holds 643 rows, unchanged from the count recorded
before `0079`, with 0 attributed to an organization, 0 carrying the new timing
fields, and latest sample `2026-08-29T14:23:04`. Both zeros are the same
fact and are expected: no authenticated admin session has been recorded since
before `0079` shipped, so neither attribution nor the timing split has had
traffic to capture. It also means the Fleet Health page has been verified
against legacy history only. The first authenticated admin navigation after
this deployment is what proves the write path end to end, which is the same
gate as the sync heartbeats below.

`npm run test:rpc-contracts` (3 passed), `npm run test:platform-fleet`
(3 passed), `npm run test:platform-sync` (3 passed), `npm run typecheck`,
`npm run lint`, and `git diff --check` pass. The migration is now recorded in
[SETUP.md](SETUP.md) §4 as entry 82 with its own verification section, and in
[SCHEMA.md](SCHEMA.md) §8; entry 81 was missing from the same numbered list and
was added with it. The next gate is unchanged: authenticated operator QA plus
the first real POS/admin terminal heartbeats, before device inventory.

**Anon EXECUTE gap found by the close-out smoke (2026-09-05).** Writing a
repeatable smoke for `0082` — `scripts/admin-latency-scoping-smoke.sql`, run
as `npm run admin:latency:validate` — surfaced a defect the ledger check alone
would have missed. `0064` and `0065` removed `PUBLIC`/`anon` EXECUTE from
the application RPCs by enumerating them by name. Every RPC added since kept
the hosted `PUBLIC` default, and because a new overload is a separate
function, `0082` reintroduced the gap on signatures whose one-argument form
`0065` had already hardened. Eight RPCs plus one writer were anon-executable;
`current_stock(uuid)` was the lone hardened control that made the pattern
unambiguous.

Severity is split, and worth stating precisely. The seven read/count RPCs are
`security invoker`, so the table grants from `0004`/`0026` still refuse
anon — a hosted probe with the public anon key returns HTTP 401 `42501
permission denied for table stock_movements` / `orders`. No tenant data was
reachable. `seed_default_employee_roles(uuid)` is different: `security
definer`, no internal caller check, no application call site, and it inserts
the four default employee roles for any `p_org_id` given to it. Definer rights
bypass the table grant that protected the others, so an unauthenticated caller
holding the public anon key and an observable organization id could write into
a tenant. It was not called or exercised during this pass.

`supabase/migrations/0083_scoped_read_rpc_acl_hardening.sql` restores the
invariant: `revoke ... from public, anon` then re-grant `authenticated` and
`service_role` for the seven RPCs, and service-role-only for
`seed_default_employee_roles`. It changes ACLs only — no body, table, policy,
or row. **Applied to production 2026-09-05** on the owner's approval. The first push
failed on an ambiguous `oid` reference across the joined `pg_proc`/
`pg_namespace` catalogs and was rejected atomically, so nothing was applied;
the reference was qualified to `p.oid` and the second push completed, emitting
only the CLI's known optional pg-delta catalog-cache warning (Docker was not
running on this workstation).

The fix is verified rather than assumed, because the smoke asserts the boundary
on both sides. Post-apply: `ledger_max` `0083`; `anon_execute_boundary`
reports `false` for all nine signatures; `anon_callable_rpc_count` fell from
18 to 10; and `authenticated` EXECUTE is retained on all six scoped read
functions. A hosted probe with the public anon key now returns HTTP 401
`42501 permission denied for function current_stock` /
`admin_sales_period_totals` — the refusal moved from the table to the
function, which is the defense-in-depth the invariant is for.

No anon-facing regression: `https://dumala.store` serves, the public menu at
`/menu/demo` renders its full catalog with no console errors, and
`/platform/fleet` still redirects to the platform login. The public menu is
the meaningful check here — it reads stock through `current_stock` on the
service-role client, the grant `0083` re-issues explicitly.

Ten other anon-executable functions were found and deliberately left alone: the
`auth_*` profile helpers, `organization_has_current_access_grant`,
`shift_variance_threshold`, `build_staff_login_slug`,
`staff_login_slug_part`, and `subscription_access_is_current`. Some are
invoked inside RLS policies, and a policy calling a function the querying role
cannot execute fails the entire query, so revoking them risks breaking the
anon-facing public menu and staff-login routes. That is a separate hardening
pass with its own policy-by-policy verification, not a rider on this one.

**Schema drift verification (2026-09-05).** The plan item asked for "which
organizations are on which migration ledger position". That reading does not
survive contact with the architecture: every organization shares one Postgres
database and is isolated by RLS, so there is exactly one ledger and one applied
position for the whole fleet, and no tenant can be behind another on it. The
deployed page states this rather than implying a per-tenant ledger. What the
hand-maintained note in tasks.md actually records — repeated dozens of times as
"local X = remote X" after each hosted pass — is repository-versus-database
sync, and that is what `/platform/schema` now reads off the database.

The comparison names both directions. `pending` is a migration this deployment
ships that the database never applied, which is a forgotten push. `unknown
remote` is the reverse and the more dangerous one: a version the database
applied that this build does not carry, meaning an out-of-band apply or a file
deleted after it shipped. `renamed` catches a version present on both sides
under a different name, because renaming an applied file does not change the
ledger row. The genuinely per-tenant dimension is reported separately as
backfill readiness — how many organizations actually received the data a
migration introduced.

The manifest of shipped migrations is generated
(`npm run schema:manifest` → `src/lib/platform-schema-manifest.ts`) and pinned
against `supabase/migrations` by the test suite, so adding a migration without
regenerating fails CI instead of showing a false "in sync". This slice is what
the 0082 close-out argued for: the drift that went unnoticed for three days
would have been visible on the console.

Migration `0084_schema_drift_readout.sql` adds the reader. `supabase_migrations`
is not an exposed PostgREST schema, so the ledger cannot be selected directly.
The function returns version and name only — `statements` holds the full SQL
text of every migration and is never selected — and it revokes `public`,
`anon`, and `authenticated` before granting `service_role`, applying the 0083
lesson from the start rather than needing a later repair.

`npm run test:platform-schema` (9 passed) covers in-sync, pending, unknown
remote, diverged, renamed, the unreadable-ledger case, input-order
independence, backfill clamping, and the manifest-versus-disk pin.
`npm run test:rpc-contracts` initially failed on the unregistered RPC — the
contract test doing its job — and passes now at 3. The adjacent platform, POS,
accessibility, and entitlement suites, `npm run typecheck`, `npm run lint`,
`npm run build`, and `git diff --check` all pass; the build exposes
`/platform/schema`.

Hosted `npm run platform:schema:validate` confirms the reader is present,
`anon` and `authenticated` cannot execute it while `service_role` can, and its
return type excludes `statements`. The ledger reports 84 applied with latest
`0084`, matching the 84 migrations in the manifest, so the surface reads
`in sync`. Backfill readiness: 5/5 branches carry a staff-login slug and 3/3
organizations have their default employee roles, both complete; 0/5 branches
have reported sync telemetry, which is the outstanding heartbeat gate below now
visible on the console instead of only in a smoke script. The smoke performs no
writes. The unauthenticated `/platform/schema` boundary redirects to
`/platform/login`, matching every other console page. The authenticated render
was not exercised, for the same reason the heartbeat gate is still open: it
needs a real operator sign-in.

**Remaining Phase 4 work.** Device and terminal inventory is the last item, and
it stays gated on the same thing it was before: authenticated operator QA plus
the first real POS/admin terminal heartbeats. The write path was reviewed end
to end during this pass and is sound — the reporter fires on an empty queue as
well as a full one, every hosted admin profile has the branch the reporter
requires, and the route's `failed/conflict/stuck <= pending` validation cannot
silently drop a well-formed report. `admin_sync_health_snapshots` is empty
because no authenticated session has occurred since before `0079` shipped; the
newest performance sample is `2026-08-29` with zero organization attribution,
which corroborates the same conclusion from a second table.

### Phase 5 — Support access into a tenant

**Status:** Not started — needs an explicit owner decision before design

The highest-value and highest-risk power: an operator reproducing a tenant's bug in the tenant's own workspace.

- [ ] Decide the model — full impersonation, a read-only shadow session, or a tenant-approved time-boxed grant.
- [ ] Require a support case and a reason; bind the session to a short expiry.
- [ ] Make it visible to the tenant: an in-app banner while active, and a record the owner can read afterward.
- [ ] Write an audit row on entry, on exit, and for every mutation performed while inside.
- [ ] Keep it read-only in the first slice: no order edits, refunds, voids, Z-generation, employee auth, or billing changes.

**Exit criteria:** deferred until the model is chosen.

### Phase 6 — Billing reconciliation and data operations

**Status:** Not started

- [ ] Surface `billing_provider_events`: failed, unmatched, and replayed PayMongo webhook events, with a safe manual replay.
- [ ] Show dunning state — which paying accounts are `past_due`, and for how long.
- [ ] Show backup status per [PRODUCTION_BACKUP_AND_RESTORE.md](PRODUCTION_BACKUP_AND_RESTORE.md); on the Free plan `npm run backup:production` is the only recovery path and its cadence is currently invisible.
- [ ] Add per-organization export for support and offboarding requests.

**Exit criteria:** A payment that silently failed to reconcile is visible in the console rather than discovered from a tenant complaint.

---

## Decisions to make before implementation

1. **Trial extension model.** Mutate `subscription_trial_ends_at` (recommended), or add a trial grant kind to `platform_access_grants`? The recommendation is the mutation, because the tenant's own trial countdown and billing banner read those columns and would otherwise lie.
2. **Trial extension caps.** Proposed 1–90 days per action and 180 operator-added days per organization, lifetime. Both numbers are arbitrary until you set them.
3. **Should extending a trial be reversible?** A shorten action is easy to add and easy to misuse. Proposed: no shorten in Phase 1; revoke stays a grant-only concept.
4. **Phase 5 model.** Full impersonation, read-only shadow, or tenant-approved access? This decides whether Phase 5 is a week or a month, and it is the only item here with a real abuse surface.
5. **Operator roles.** Are the four proposed roles right, or is `owner` + `read_only` enough for a single-operator platform today?
6. **Phase order.** As written, Phase 1 ships before the role model. That is deliberate — it is the feature you asked for, and it is already gated by published policies and audited — but it does mean one more powerful action sits behind a flat env allowlist until Phase 3.

## Non-goals

- Tenant-facing self-service trial extension. Every power here is operator-initiated.
- Changing how PayMongo billing, checkout, or the paid-branch entitlement works.
- Weakening the service-worker boundary that keeps private authenticated HTML out of Cache Storage.
- Retrofitting audit logging after the fact; every phase writes its audit row in the same change.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-29 | Plan drafted, nothing implemented | Owner review requested before any code |
| 2026-08-29 | Phase 1 built on the recommended defaults without waiting on the open decisions | The owner asked to proceed; decisions 1–3 were carried at their recommended values (mutate the trial columns, 1–90 per action with a 180-day lifetime cap, no shorten action) and remain changeable — the caps are two constants in `0075` and `src/lib/platform-trial.ts` |
