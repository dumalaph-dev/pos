# Platform Owner Powers Plan

**Project:** Dumala POS
**Created:** 2026-08-29
**Status:** Phase 4 in progress — the first cross-org read surface is deployed; fleet, sync/outbox, device, and schema-drift views remain
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

**Status:** In progress — platform audit viewer, fleet health, and the baseline sync/outbox health surface are deployed from `main` commits `2e195fd`, `979b151`, and `ab18eb7`; the enhanced sync/outbox slice is implemented with linked migration `0081` applied; device and schema-drift views remain queued
**Migration:** `0079_scope_admin_performance_to_organizations.sql`, `0080_sync_health_snapshots.sql`, and `0081_sync_health_enhanced_metrics.sql` applied; platform readers are read-only, and legacy performance samples plus existing tenant data remain preserved

Powers that only need to look. Safe to build once Phase 3 can scope who looks.

- [x] **Platform audit viewer.** The deployed `/platform/audit` page combines platform-scoped `audit_logs` rows with `platform_operator_audit_logs`, and supports search plus source, action, organization, and time-window filters. Before/after snapshots remain expandable; the page is read-only and excludes tenant order, customer, and staff activity.
- [x] **Fleet health.** The deployed `/platform/fleet` page aggregates `admin_performance_samples` into p50/p95 interaction latency, error rate, sample freshness, and surface breakdowns per organization, with time-window, search, and status filters. Migration `0079` attributes future authenticated samples from the server-resolved profile organization; existing rows remain preserved as unattributed history, and no raw tenant activity is exposed.
- [x] **Sync and outbox health.** The `/platform/sync` page is extended to report bounded POS-order, audit-event, and admin-mutation queue snapshots per organization and active branch, including pending depth, offline-sync failure/conflict counts, exact stuck-outbox depth, last successful sync per queue, oldest-pending age, reporter freshness, and explicit `healthy`, `needs attention`, `stale`, and `no telemetry` states. Search, queue, freshness, and health-status filters plus organization/branch/queue aggregate drill-downs are read-only; payloads never leave the terminal. The enhanced application slice is implemented locally and awaits deployment.
- [ ] **Device and terminal inventory.** Last-seen heartbeat per device, so "the tablet at branch 2 has not synced in three days" is visible without asking.
- [ ] **Schema drift.** Which organizations are on which migration ledger position, replacing the hand-maintained note in [tasks.md](tasks.md).

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
`/platform/login`. Application deployment remains the next gate before real
POS/admin terminals begin populating enhanced heartbeats.

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
