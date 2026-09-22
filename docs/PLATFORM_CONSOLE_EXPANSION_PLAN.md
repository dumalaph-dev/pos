# Platform Console Expansion Plan

**Project:** Dumala POS
**Created / source review:** 2026-09-22
**Status:** Wave 1, D2, and D3 delivery are merged to `main`; hosted migrations `0088`, `0089`, `0090`, and D2 ACL hardening `0091` are applied and verified. The I3 manual follow-up foundation is implemented on `codex/platform-i3-followups` and is ready for review; source migrations `0092` and `0093` are pending the next hosted push. D3 authenticated tenant/mobile QA remains an enablement gate. The interim C4 policy is accepted for continued pilot engineering, while encrypted separate-boundary storage and hosted Auth/Storage restore evidence remain production recovery gates.
**Owner:** Product and engineering
**Companion to:** [Owner powers](PLATFORM_OWNER_POWERS_PLAN.md), [Attention and announcements](PLATFORM_ATTENTION_AND_ANNOUNCEMENTS_PLAN.md), [tasks.md](tasks.md), [SCHEMA.md](SCHEMA.md), [Backup and restore](PRODUCTION_BACKUP_AND_RESTORE.md)

**Reading guide:** Section 1 describes the product and screens; Section 2 separates verified facts from proposals; Sections 3–13 specify capabilities and prerequisites; Section 14 defines delivery releases; Sections 15–17 cover acceptance, decisions and boundaries. For owner review, start with Sections 1, 14 and 16.

## 1. Recommendation

Expand around three outcomes: operators can finish the work the console surfaces, business metrics can be traced to reliable evidence, and the platform can recover from failures. Add pages only when they serve those outcomes.

The original draft identifies useful gaps but underestimates their foundations. Revenue history is not recoverable from current account state alone; webhook receipt is not proof of reconciliation; and atomic auditing is an intended standard that several existing actions do not yet meet.

**Recommended first release:** bounded and truthful reads, atomic support/account lifecycle writes, a support queue that can resolve cases, a metadata-only billing-event viewer, and honest recovery status. Follow with announcement delivery, useful revenue estimates, and durable billing evidence. Gate replay, tenant access, bulk exports, and framework-wide caching independently.

This revision retains Tracks A–F and **Foundation G**, and adds **H: Owner workspace and reporting**, **I: Account success**, **J: Website and growth management**, and **K: Service operations and governance**. Owner-powers Phases 5 and 6 map to E and C; the companion remains the historical record for Phases 1–4. This document governs the proposed expansion rather than rewriting deployment history.

### Review scope and limitations

- Reviewed local source, migrations through `0087`, scripts, companion plans, and installed Next.js 16.3.1 documentation. External framework/provider references are linked where used.
- No hosted queries, live provider inspection, browser QA, benchmarks, or restore drill were performed for this review. Historical hosted counts and deployment claims are not a current production baseline.
- Sizes are relative: **S** bounded reader/UI work; **M** schema/workflow plus integration checks; **L** financial processing, recovery, or authorization across several boundaries. They are not calendar commitments.
- Initial tenant-facing scope is announcement delivery. Merchant support replies, attachments, and support-session approval are separate later slices. Internal notes must never imply a merchant was contacted.
- H–K are product proposals, not claims of existing implementation. J deliberately adds later public-website publishing scope, with its own public-route regression gate. Review of the existing navigation, shared platform components and public route inventory informs the proposed layout; no visual browser audit was performed.

### Product ambition: the owner's daily operating workspace

The target is a feature-rich **Dumala platform-owner console**: a single place to understand the business, manage merchant relationships, maintain the public website, and operate the service. `/platform` serves the platform owner and authorized operators; `/admin` continues serving each merchant's own business. A platform operator opening `/admin` must never silently enter a selected tenant.

The owner should be able to answer these questions without stitching together unrelated screens:

| Question | Information | Next action |
|---|---|---|
| How is the business doing? | Verified or clearly estimated recurring value, collections, new paying accounts, conversion and retention, with comparable periods | Open the contributing account cohort or finance report |
| What needs my attention today? | Critical incidents, overdue cases, renewal risks, failed jobs, expiring access, pending decisions | Assign, investigate, record a decision, or open the relevant guarded workflow |
| Which merchants need help? | Onboarding stage, adoption signals, support history, renewal dates, explicit risk reasons | Assign an account owner and a follow-up task |
| Why does this account have access? | Separate account status, paid subscription, prepaid term, trial, grant, branch entitlement, and pending changes | Review evidence and use the existing authorized control |
| Are users receiving a reliable service? | Coverage-aware fleet/sync/device health, incidents, deployment context, job health and recovery evidence | Investigate the affected service and linked cases |
| Is the website helping growth? | Content versions, signup funnel, attributed campaigns and unknown attribution | Preview/publish an approved content change or compare a campaign |
| What changed, and who approved it? | Account timeline, audit evidence, policy revisions and sensitive-change requests | Review the actual diff and its outcome |

**Product rule:** each summary must lead to evidence and a useful action. Each action must return to the same account, filter, or queue context. A feature is not complete when only its count or chart exists.

### Target navigation and page ownership

Organize the existing [navigation](../src/app/platform/PlatformNavigation.tsx) around work rather than adding an unstructured list of links. The following is a target architecture, not a claim that new routes exist. Keep existing URLs compatible; use tabs and contextual links before creating extra top-level pages. Hide unreleased modules from normal navigation.

| Navigation group | Screens / proposed routes | Responsibility |
|---|---|---|
| Home | `/platform`; My work and Attention views | Daily summary, assigned work, watchlist, recent changes |
| Accounts | Existing `/platform/users`, `/platform/organizations/[orgId]`, `/platform/operations`; proposed `/platform/success` | Directory, account workspace, access controls, onboarding and follow-ups |
| Revenue | Proposed `/platform/revenue`, `/platform/billing`; existing `/platform/plans`, `/platform/promotions`; proposed referral view | Revenue evidence, billing exceptions, catalog, promotions and referrals |
| Support | Proposed `/platform/support`; existing `/platform/announcements` | Cases, escalation, response templates and merchant communication |
| Website & growth | Proposed `/platform/website`, `/platform/growth` | Public content, guides, release notes and acquisition reporting |
| Service health | Existing `/platform/fleet`, `/platform/sync`, `/platform/devices`, `/platform/schema`; proposed `/platform/reliability` | Incidents, scheduled jobs, releases, integration health and recovery tabs |
| Reports | Proposed `/platform/reports` | Curated reports, saved views, metric definitions and authorized exports |
| Governance | Existing `/platform/operators`, `/platform/policies`, `/platform/audit`; proposed `/platform/settings` | Operator access, review requests, operational settings and notification preferences |

Announcements remain one shared publishing workflow, even when linked from Website or Support. Cases remain D1 records; incidents link cases rather than replace them. Reports reuse A/B/C metrics rather than compute a second version. Account follow-up tasks reference cases/incidents when appropriate rather than duplicating their lifecycle.

### Home screen blueprint

The home page prioritizes six summary cards at most, with deeper views below. Owner, billing, and support presets change ordering and permitted content; a preset never grants permissions.

1. **Header:** environment, role/scope, reporting period and comparison, timezone, global search, data refresh status. Platform and merchant workspaces have distinct labels; replace ambiguous “Owner dashboard” navigation with an explicit merchant-workspace destination.
2. **Business strip:** paying recurring accounts, recurring value with its confidence label, verified collections, trial activation, upcoming renewal exposure, and unresolved critical issues. Unavailable modules show an honest state or are omitted, never fabricated zeros.
3. **Priority work:** ranked Attention with owner, age, reason, severity and next action; My work shows assigned cases/tasks and due decisions. Critical service information remains visible even if lower-priority widgets are personalized.
4. **Trends and distribution:** one business trend and one operational panel with comparable periods and coverage. Do not mix a current operational state with a historical date filter without labeling the separate time bases.
5. **Account watchlist:** upcoming trials/renewals, stalled onboarding, organizations with recurring support issues, and manually followed accounts. Each list opens the exact filtered population.
6. **Changes and calendar:** recent audited changes, scheduled announcements, maintenance, follow-ups, and renewals. Calendar entries reference their source rather than become a second scheduling system.

**First-release usability target:** in a guided five-task evaluation, the owner can identify the highest-priority issue, explain one account's access, find an overdue case, inspect billing-event evidence, and identify the latest verified recovery point. Proposed targets: each answer within 60 seconds; reach its evidence/detail within two navigation steps. Measure with representative fixtures, not handpicked empty states.

### Cross-console interaction and visual standards

- Preserve Dumala's established identity and reuse [PlatformUI](../src/app/platform/PlatformUI.tsx); standardize green brand accents, neutral content surfaces, semantic warning/error colors, and consistent icons. Use readable sentence-case labels, 14–16px primary table/body text, tabular numerals, and an 8px spacing rhythm. Reserve strong color for status and primary actions.
- Desktop uses persistent grouped navigation, a compact toolbar and wide tables; tablet collapses navigation and prioritizes columns; mobile emphasizes urgent summaries, search, case review and one-account actions. Full tables remain available with labeled horizontal scrolling. Do not hide financial context to fit mobile.
- Tables support server-side search/filter/sort, column preferences, saved views, density choice, explicit selection scope and a clear-filter action. Selection across pages requires a visible target count and preview. No bulk financial or suspension actions in the first slice.
- Use one primary action per task context. Changes show validation, impact, expected effective time, reason where required, pending/success/failure feedback, and a conflict recovery path. Preserve entered form data on recoverable errors. Never optimistically display a financial mutation as final.
- Global search returns authorized organizations, case IDs, event IDs and console destinations. Command-menu shortcuts navigate/open workflows; they do not execute sensitive actions. Scope recent items and favorites per operator; clear inaccessible references after revocation.
- Complete loading, empty, filtered-empty, denied, unavailable, partial, stale, offline and conflict states. Offline console views are informational only; do not queue privileged writes in the POS outbox.
- Charts include definition, period, timezone, comparison basis, source freshness/coverage, an accessible data table, and drilldown. Zero, unknown and insufficient history are visually distinct. Use semantic headers/captions for tables, keyboard access, visible focus, non-color status cues, zoom/reflow and reduced motion. Reference: [W3C accessible table guidance](https://www.w3.org/WAI/tutorials/tables/).

Personalization starts with saved presets, reorderable approved widgets and restore-defaults. A drag-and-drop dashboard builder, arbitrary SQL report designer and AI-generated business verdicts are not prerequisites for an informative console.

## 2. Verified baseline and corrections

The console already contains Overview, Directory, organization detail, Announcements, Operations, Plans, Promotions, Fleet, Sync, Devices, Audit, Schema, Operators, Policies, and Login. Extend existing workflows incrementally.

| Finding | Local evidence | Consequence |
|---|---|---|
| Atomic RPC auditing is **not universal**. Suspension, restoration, case creation, grant revocation, and announcement writes include direct writes followed by separate audit calls. | [operations-actions.ts](../src/app/platform/operations-actions.ts), [announcement-actions.ts](../src/app/platform/announcement-actions.ts), [actions.ts](../src/app/platform/actions.ts) | G1 inventories and repairs relevant gaps before expanding dependent writes. The draft described an aspiration as an existing invariant. |
| Human authorization and SQL guards are different boundaries. Roles are resolved in server code, with an environment-based bootstrap owner. | [platform-operators-server.ts](../src/lib/platform-operators-server.ts), [platform-operators.ts](../src/lib/platform-operators.ts), [0075](../supabase/migrations/0075_extend_organization_trial.sql) | A service-role-only RPC does not independently identify the human operator. Every entry point needs verified actor, permission, and scope checks. |
| Billing events are read by the webhook for deduplication, but have no operator viewer. | [webhook route](../src/app/api/paymongo/webhook/route.ts), [0027](../supabase/migrations/0027_platform_operations.sql) | Correct “never read” to “no console reader.” Stored columns do not include organization, error outcome, or duplicate-attempt history. |
| `processed_at` is not proof of successful reconciliation. Unmatched/unsupported events can return without mutation and still be marked processed. | `POST`, `applyProviderEvent`, `findOrganization` in the webhook route | Legacy outcomes must remain unknown. A replay rule based solely on this timestamp is unsafe. |
| Event application and completion stamping are separate writes. Promotion/referral effects may fail after account changes. | Same webhook route | Sequential deduplication is not concurrency control. Establish claims, ordering, and resumable effects before replay. |
| Catalog prices are current quotes, not immutable account contracts or historical financial evidence. | [branch pricing](../src/lib/branch-billing-pricing.ts), [billing catalog](../src/lib/platform-operations-server.ts), [subscribe route](../src/app/api/billing/subscribe/route.ts) | A1 can first offer a labeled estimate. Verified MRR/trends need effective-dated evidence. Active branches may differ from paid/pending entitlement. |
| The normalized product has one Premium plan, with billing-cycle variants and recurring/prepaid modes. | [billing.ts](../src/lib/billing.ts), [0027](../supabase/migrations/0027_platform_operations.sql), [0037](../supabase/migrations/0037_subscription_billing_variant.sql) | Prefer cycle, payment-mode, and branch mix over a largely uninformative product-plan pie chart. |
| Support already has five statuses, a resolution timestamp, and a response deadline; console updates are missing. | [0028](../supabase/migrations/0028_support_cases.sql), `openSupportCase` | Extend the model rather than replacing it. Add first-response evidence, not another deadline field. |
| Attention items are derived during Overview rendering, without durable workflow state. | [Overview](<../src/app/platform/(console)/page.tsx>), [attention types](../src/lib/platform-attention.ts) | Stable keys help, but recurrence, escalation, and source freshness need explicit semantics. |
| Hard limits/in-memory joins exist; some readers already expose truncation and availability. | [platform-data.ts](../src/app/platform/_lib/platform-data.ts), especially `readPlatformSyncInputs` | Fix each completeness contract; not every current page silently truncates. |
| Dynamic routes do not prove every load rereads everything. Billing catalog caching already exists. | `readCachedPlatformBillingCatalog`, [next.config.ts](../next.config.ts) | Measure before caching. Global rendering migration is not needed for SQL aggregates/pagination. |
| Announcement authoring exists; delivery is absent from reviewed admin surfaces. | [0085](../supabase/migrations/0085_platform_announcements.sql), [announcement plan](PLATFORM_ATTENTION_AND_ANNOUNCEMENTS_PLAN.md) | Define scheduled publication, audience enforcement, and authorized dismissal before tenant launch. |
| Backup coverage is behind the schema. The table list omits grants, trial extensions, operators/audits, announcements, and other newer tables. | `TABLES`, `CRITICAL`, `exportTable` in [backup-production.mjs](../scripts/backup-production.mjs) | A recent run is not proof of recoverability. Missing tables can be skipped without failing; paginated API exports are not a consistent database snapshot. |
| The runbook records an August checkpoint and no completed restore drill. | [Backup runbook](PRODUCTION_BACKUP_AND_RESTORE.md) | Current recovery capability and infrastructure plan remain unverified. Move C4 earlier. |
| Referral history exists per org; the draft's fleet-wide referral gap had no delivery slice. | Organization-detail reader, [referrals-server.ts](../src/lib/referrals-server.ts) | Add A4 read-only exceptions; defer reward mutation until side-effect safeguards exist. |

An absent email SDK does not prove no notification capability: direct HTTP and external infrastructure are possible. F starts with an inventory. Audit activity likewise does not prove which operators are currently authenticated.

## 3. Foundation G — Trust boundaries and evidence

### G0 — Reproducible baseline · S

Before implementation, record migration state, route/action inventory, reader limits, existing indexes, authorization paths, and outstanding QA. Use local/staging fixtures first. Any later approved hosted diagnostic should return aggregate metadata, not raw provider payloads or tenant records.

Complete the Devices authenticated walkthrough and first real terminal heartbeat validation carried from the owner-powers plan. This gates telemetry confidence and fleet alerts, not unrelated support or announcement work. Distinguish missing, stale, partial, and healthy telemetry.

**Exit:** dated evidence names known gaps and unknowns; first-wave slices have an owner, fixture, acceptance checks, and rollback approach. Do not reuse historic tenant counts as a current baseline.

### G1 — Atomic mutations and reliable attribution · M–L, split by workflow

Inventory every platform mutation: permission, scope, policy gate, writes, audit destination, concurrency, and invalidation. Prioritize suspension/restoration, case creation, and grant revocation. Migrate announcement writes before D3; handle pricing/promotions/policies in bounded follow-up slices where the inventory shows gaps.

- Move each logical mutation and its successful audit evidence into one transaction through a narrow service-role RPC where appropriate. Preserve existing policy/access behavior.
- Include dependent writes: grant revocation also affects linked referral reward state.
- Require an expected version/lock and idempotency key for retryable commands. Double clicks must not duplicate cases or financial effects.
- Canonical audit evidence includes verified actor, target, reason, before/after, request ID, and applicable policy version. One logical command may change multiple rows.
- Failed attempts require separate sanitized attempt/security records if needed. An audit insert inside a rolled-back transaction cannot survive as rejection evidence.
- Revoke `PUBLIC`, `anon`, and `authenticated` execution on platform-only RPCs; grant intended server roles, set a safe search path, verify table/RPC ACLs, and register RPCs in [rpc-contracts.test.ts](../scripts/rpc-contracts.test.ts).

**Authorization contract:** resolve actor from a verified session at every entry point, never form-supplied identity or organization scope. Service-role access bypasses tenant RLS, so reads also require explicit scope. SQL enforces target, policy, transition, and concurrency invariants. Any later database operator-role enforcement must explicitly support bootstrap owners rather than trust supplied actor fields.

**Exit:** audit failure rolls back the mutation; races refuse or serialize correctly; retries do not duplicate effects; tenant/revoked/unauthorized callers are denied. Tenant access stays consistent after lifecycle changes. Do not claim all legacy actions meet this standard until the inventory is closed.

### G2 — Shared read and permission contracts · M

New readers return bounded records, cursor/count strategy, `asOf`, coverage, and distinct empty/unavailable/partial/stale states. Unexpected database failures must not masquerade as missing migrations or zero totals.

Proposed defaults, not existing permissions:

| Capability | Default roles | Gate |
|---|---|---|
| General console metadata | Existing `console_read` roles | Active operator and authorized scope |
| Financial metrics/event details | Owner and billing | Separate read permission; no automatic support/read-only access |
| Support lifecycle | Owner and support | `support_manage`, scope, existing published-policy requirements |
| Billing replay | Owner and explicitly enabled billing | Dedicated replay permission, reason, C3 gates |
| Bulk export | Owner initially | Export permission plus dataset-specific read rights |
| Announcement authoring | Existing `policy_manage` | Atomic lifecycle and audience validation |
| Support diagnostic access | Nobody by default | Explicit capability and expiring grant |
| Account notes, tasks and segments | Owner and scoped support | Separate account-success permission; no implicit financial access |
| Website drafts and publication | Owner initially | Separate content-edit/content-publish capabilities; review where configured |
| Incidents and job controls | Owner and explicitly assigned operators | Separate service-read/manage capabilities; command-specific limits |
| Reports | Roles permitted for every included dataset | Recheck scope on viewing, generation and download |
| Rule management and sensitive-change review | Owner initially | Separate rule/review capabilities; no self-granted execution rights |

Recheck authorization on every write; never cache permission decisions across requests. Organization scope must apply to listings, totals, search, details, downloads, audits, and notifications. D4 can defer assignment UI, but new reader contracts should already accept validated scope.

## 4. Track B — Correct, bounded reads

### B1 — Query-side filters and pagination · M

Start with Directory, Operations/entitlements, Support, and unified Audit; apply the contract to other readers as touched.

- Validate URL filters, sort fields, windows, and page size; proposed default 50, maximum 100.
- Use deterministic keyset pagination for growing timelines, with a unique tie-breaker. Bounded offset pagination is acceptable for small stable lists. Reset cursors when filters change.
- Filter/sort before pagination. Fetch related data for the selected scope/page. Compute global summaries in SQL, never from a capped page.
- Audit merges **three** sources, including announcement audits. Use an ordered database union/read RPC or proven multi-source cursor; concatenating independently capped sources is not complete pagination.
- Fleet/sync require latest-per-reporter selection before aggregation. A global newest-samples cap can exclude quieter tenants. Report coverage and staleness separately from health.
- Exact counts are optional where expensive. Use `hasNextPage` or separately refreshed/labeled counts; never fabricate “X of Y.”
- Inspect existing indexes and representative `EXPLAIN (ANALYZE, BUFFERS)` before adding indexes. Account for scope/filter/stable sort keys; avoid duplicating existing support indexes.

**Correctness gate:** fixtures with at least 1,500 organizations and over 10,000 related records exceed current limits; use larger skewed audit/telemetry fixtures too. Traversing a fixed snapshot returns every authorized record once. Define cursor behavior under concurrent changes and verify no cross-scope leakage.

**Proposed performance gate:** record tier/hardware, fixture, concurrency, cold/warm runs, and query plans. Target p95 server response below 1.5 seconds for paginated screens and 3 seconds for aggregate screens at five concurrent operators. Ratify or revise after baseline measurement; these are targets, not measured results. Caching must not conceal incorrect queries.

### B2 — Targeted caching if measurement warrants it · M; optional global migration · L

Optimize SQL/projections first. If aggregate cost still exceeds budget, compare short-lived data caching with durable rollups. Keep security/policy checks and mutation readbacks fresh. Proposed freshness: 60 seconds for operational summaries, five minutes for analytics, with visible `asOf` and coverage.

Cache keys include validated scope and normalized filters; authenticate before accessing caches. Invalidation covers webhook, tenant, operator, and job writes, not just platform actions. Expiry-driven changes need bounded freshness even without writes. Never put private session data into shared fleet caches.

**Draft correction:** the installed 16.3.1 [migration guide](../node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md) explicitly permits existing `fetch` and `unstable_cache` layers during adoption. Mixed APIs alone do not establish stale pricing. `cacheComponents` is optional here. References: [Next.js migration guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components), [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents).

If adopted, isolate the project-wide change. Inventory route configs, request APIs, Suspense, offline navigation, and invalidation. Verify POS/admin/public-menu/billing/authentication behavior and the private HTML/service-worker boundary. Re-read installed guides at implementation time. Require measurable benefit and an independent revert path.

### B3 — Audited metadata exports · M

First slice: organization metadata, entitlement state, filtered audit metadata, and scoped support history with explicit columns. Exclude raw provider payloads, customer/order details, and internal notes by default. This is not a full offboarding or data-subject export.

Require separate export permission, bounded filters, CSV formula-injection protection, and the same scope as screens. Large results use a cancellable job and private expiring download with authorization rechecked at retrieval. Define retention before storing artifacts.

Record requested/generated/failed/download-served events with actor, filters, row count, and artifact ID. Refuse delivery if required evidence cannot be recorded. A database transaction cannot atomically guarantee HTTP receipt; “download served” does not prove complete client delivery. Full tenant export needs its own ownership, completeness, and data-handling design.

## 5. Track C — Billing evidence and recovery

### C1 — Truthful event viewer · S–M

Ship the reader before replay. Show event ID/type/provider, receipt time, and legacy timestamp presence as **handler marked processed**, not **payment reconciled**. Matches inferred from current provider IDs remain labeled inferred and cannot authorize automatic repair.

A later hosted diagnostic can count by event type and processed-timestamp presence/age; no stored outcome column currently exists. Default to redacted allowlisted summaries. Raw payload viewing is outside the first slice. Separate verified live/test events and mark unknown provenance explicitly.

**Exit:** operators can inspect backlog without misclassifying legacy records. Financial permissions hold on direct routes/endpoints as well as navigation.

### C0 — Durable outcomes and reconciliation core · L

Required before reliable C2 aging, C3 replay, and verified A1 history. This is a scoped billing-processing change: safe replay cannot simply reuse the current behavior unchanged.

Add event metadata and an append-only attempt/effect ledger: resolved org, validated environment, provider occurrence time where available, receipt time, processing version, attempt status, sanitized errors, and applied/ignored/unmatched/superseded outcomes. Preserve historical rows as `legacy_unknown`; backfill only provable facts with provenance.

- Extract one shared processor for verified webhook ingestion and authorized recovery.
- Atomically claim events with lease/attempt tokens. Concurrent workers cannot apply twice; expired claims recover safely; stale workers cannot finalize newer attempts.
- Prevent older events overwriting newer state. Confirm supported ordering/version semantics or query current provider state when ambiguous. Latest receipt time is not authority.
- Match verified provider identifiers; detect conflicts. Do not accept arbitrary org reassignment or assume an ambiguous customer ID is sufficient.
- Commit local state, outcome, and canonical audit evidence together where possible. Make promotion conversion, referral reward, and prepaid activation individually idempotent; use resumable effects/outbox work outside the transaction.
- Keep financial status, suspension, grants/trials, and access entitlement distinct. Payment success must not undo suspension.
- Invalidate affected tenant/platform readers after negative as well as positive changes.

An RPC cannot replace external orchestration or original signature verification. Preserve verified ingress provenance. PayMongo documents [duplicate delivery](https://docs.paymongo.com/docs/developer-tools-best-practices) and [retry behavior](https://docs.paymongo.com/docs/developer-tools-retry-logic); design for retries rather than exactly-once transport.

**Exit:** cover duplicate/concurrent delivery, webhook/replay races, stale events, unmatched/unsupported events, live/test mismatch, crash after mutation, failed referral effects, expired leases, and resumable finalization. Reconciliation reports disagreement without auto-correcting it.

### C2 — Dunning readout · M

Show confirmed `past_due_since`, last verified failure, provider retry information only where available, and policy-driven access consequences. `subscription_updated_at` is not necessarily the first delinquency date. Legacy age/retry state can be unknown.

Feed confirmed delinquency age into Attention. Distinguish trial expiry, prepaid expiry, canceled renewal, suspension, and failed recurring payment. No automatic collection, suspension, refund, or cancellation in this slice.

### C3 — Controlled manual recovery · L, blocked by C0

One stored event per request; dedicated permission, reason, fresh authorization, retry limit, and expected-effect preview. Apply policy checks to operator-triggered entitlement changes without unintentionally blocking normal webhook acceptance. Blocked recovery remains a visible outcome, not a fabricated payment failure.

Use C0 claims/processor. No synthesized events, edited payloads, bulk replay, or arbitrary status overrides. Refuse completed effects; resume incomplete ones without duplicating successful effects. Legacy processed no-ops need verified reconciliation evidence and an explicit supported recovery path.

**Exit:** repeated/concurrent recovery yields at most one business effect per effect key, cannot regress newer state or duplicate rewards, and retains attempt evidence. Ship disabled, validate controlled fixtures, then selectively enable.

### C4 — Recovery readiness, moved to the first wave · M–L

Independent of billing migrations:

1. Compare all application tables with backup coverage, including platform ledgers and new tables. Missing required tables must fail completeness. Existing manifests cover their recorded set, not today's schema.
2. Define snapshot consistency. Offset API reads during writes are not a restore-consistent snapshot even when sorted. Decide whether the script stays a best-effort export or is supplemented/replaced by a verified backup mechanism.
3. Verify off-machine storage, integrity, restricted access, retention, Auth identity relationships, Storage objects, configuration, and migrations. Recreating employees alone does not prove identity-linked rows restore correctly.
4. Restore into an isolated environment; verify foreign keys, financial totals, platform ledgers, and working authentication. Record achieved recovery point/time independently of export completion.
5. Add run evidence: start/completion/failure, schema coverage, missing tables, counts/bytes, integrity, off-machine confirmation, and last restore-drill result. Hide credentials and sensitive storage paths.

**Exit:** separately display last export, last verified off-machine recovery point, and last successful restore drill. Incomplete coverage cannot appear green. Owner selects RPO (acceptable data loss), RTO (acceptable outage), cadence, and storage responsibility. Later external monitoring must detect database-wide failure or a job that never starts.

## 6. Track D — Finish operator workflows

### D1 — Support lifecycle · M

Build `/platform/support` with status/priority/assignee/org/deadline/age filters, reusing atomic case creation. Add assignment, append-only internal notes, first-response evidence, transition history, resolution reason, and concurrency version.

Use existing values: `open` → `in_progress`/`waiting_on_customer`/`resolved`; in-progress and waiting may transition between each other or resolve; resolved may close or reopen. Reopening closed cases requires a reason and permission. Assignment/notes alone do not change status.

- Assignees must be active eligible operators. Revocation exposes unassigned work instead of hiding it.
- Snapshot support policy/version and deadline at creation. Preserve current elapsed-hour behavior initially; business-hours/holidays are separate policy work.
- Record the first actual operator response to the merchant with channel/time/operator evidence when handled externally. Internal notes are not responses; a future message system can stamp qualifying replies automatically.
- Recorded response stops first-response breach. Waiting status does not erase a breach. Reopening preserves original evidence and creates a new follow-up target only under an explicit rule.
- Internal notes remain private. A merchant reply portal requires separate message visibility, own-org authorization, and delivery evidence.

**Exit:** operators resolve/reopen cases with attributable timelines; overdue items have actions; races cannot overwrite silently. Test transitions, privacy, policy changes, response timing, and operator revocation.

### D2 — Attention incidents and recurrence · M

Keep logical keys such as `billing:{orgId}:past_due` and `support:{caseId}`, pinned by compatibility tests, plus an occurrence/generation or condition fingerprint.

Store acknowledgment, assignee, snooze deadline/reason, actor, and version per occurrence. Acknowledged means owned, not fixed. Critical unresolved items remain visible in an acknowledged section/count. Bound snooze duration and resurface material escalation.

Only source recovery resolves operational incidents. Source unavailability/truncation must not auto-resolve them. Recovery followed by recurrence opens a new occurrence, so old acknowledgment cannot hide a new failure. A render-only evaluator cannot detect recovery/relapse between visits; define recurrence from durable observed transitions. F later runs the same evaluator independently of visits.

**Exit:** refresh persistence, snooze expiry, escalation, recurrence, conflicts, and unknown telemetry have deterministic tests.

### D3 — Merchant announcement delivery · M

Owner notice card with server-resolved profile/org and server-side audience checks. Keep authoring tables private; expose only filtered safe projections or scoped delivery RPCs. Dismissal identity is `(profile, organization, announcement, revision)` and requires verified membership.

Recommended scheduling: Publish authorizes future release; an idempotent worker promotes due scheduled rows to published with evidence. Reads independently enforce start/expiry times. If no durable scheduler exists, ship manual publishing first and disable automatic-scheduling promises.

Render plain/sanitized content and safe links. Define whether material edits resurface dismissed notices. Clarify suspended-merchant reachability: dashboard notices cannot reach someone blocked before that dashboard; login/recovery delivery is separate.

**Exit:** future/expired/archived/wrong-audience notices stay hidden; forged profile/org dismissal fails; scheduled release/retries behave correctly. Tenant isolation and mobile/tablet QA pass before enablement. G1 atomic announcement writes are a prerequisite.

### D4 — Operator activity and optional org assignments · M–L

Activity view includes all audit sources and labels legacy attribution unknown. Say last observed activity, not currently logged in, without an actual session inventory.

Before restricted support hires, enforce org assignments across G2's complete boundary. Test direct URLs, totals, search, exports, caches, alerts, and requests after revocation. Preserve documented bootstrap-owner precedence: removing a managed row does not remove environment allowlist access.

Session inventory, forced logout, and elevated authentication are separate security work, especially before E. Audit rows cannot implement them.

## 7. Track A — Revenue and growth with evidence

### A1a — Current billing estimate · S–M, after G2/B1

Small Overview tile and optional `/platform/revenue`, with account contributions and billing-cycle/payment-mode/branch mix. Title: **Estimated monthly recurring value at current catalog prices** until contract evidence exists. Show source time/version, included/excluded/unknown account counts, and coverage.

- Store integer centavos. Normalize term amount over interval months, or `12 × interval_count` for annual variants; retain precision through aggregation and round for display.
- Count identified recurring commitments. Show past-due value separately as at risk. Access alone does not make paused/incomplete/trial/prepaid accounts recurring revenue.
- Grants contribute zero revenue but must not erase independently paying subscriptions. Separate access reasons from financial commitments.
- Distinguish active, entitled, pending, and actually billed branches. Unknown billed quantity stays unknown or an explicitly labeled scenario.
- Temporary QRPH/prepaid receipts belong in a separate prepaid/cash view, not recurring MRR.
- Current catalog edits, historic discounts, custom plans, and missing variant mappings reduce confidence. Expose unsupported amounts rather than silently substitute current prices.

**Exit:** contributions reconcile to totals with multi-year, discount, paid-plus-grant, prepaid, branch-change, and unknown-pricing fixtures. No historical trend or new/churned MRR is inferred from current state.

### A1b — Verified recurring revenue and cash history · L, after C0

Add effective-dated subscription/price/quantity history or equivalent durable ledger: provider identifiers, term amount/currency/discounts, effective interval, changes/cancellations, source, confidence. Changes do not rewrite previous periods. Backfill only from verified evidence; unavailable history stays unavailable.

| Metric | Definition |
|---|---|
| Contracted MRR | Verified eligible recurring term amount divided by term months at the effective date; version delinquency/cancellation treatment. |
| ARR | 12 × MRR, a run-rate metric rather than annual cash receipts. |
| ARPA | MRR divided by the same included recurring-account population; unavailable when denominator is zero. |
| Cash collected | Deduplicated verified payments in the window; distinguish gross/refunds/fees only when supported. Never call it collected MRR. |
| MRR movement | Opening + new + expansion + reactivation − contraction − churn = closing, under one definition. |

UTC storage; explicit reporting timezone, initially Asia/Singapore; half-open windows. Keep currencies separate if expanding beyond PHP. Snapshots help trends but do not replace change history. Show earliest reliable coverage and document test-account exclusions.

**Exit:** hand-verified fixtures/source receipts reconcile; catalog changes preserve history; unavailable periods are not zeros; metric definition changes are versioned.

### A2 — Activation funnel · M

Define cohort/window/exclusions and evidence first: org created → branch setup milestone → first completed sale observed → first verified paid conversion, separating recurring/prepaid.

A store creation timestamp proves existence, not configuration completion. Orders have server and device timestamps; offline arrival can be late. Choose a trustworthy labeled time rule and explicit handling of void/refund/corrections. If historical completion is not provable, use a labeled proxy and start durable milestones going forward. Audit logs are not a complete subscription transition stream.

Return only aggregate counts/timestamps from trusted readers, not order rows, identities, or sale amounts. Preserve first-achievement evidence against later branch deletion/refunds unless explicit correction policy applies.

**Exit:** 7/14/30-day conversion denominators use sufficiently observed cohorts; immature cohorts are labeled; medians identify their reached-stage population. Paid conversion comes from C0/A1b evidence, not current active status.

### A3 — Churn and retention · M, after A1b/A2

Separate logo/subscription, revenue, and activity retention. Use effective cancellation rather than request date; free trial expiry is not paid churn and prepaid expiry is not canceled recurring revenue. Capture reasons explicitly; support/trial comments provide optional context.

Ship curves only with sufficient history, cohort sizes, coverage, immature-period labels, and versioned definitions. Current status alone cannot support them.

### A4 — Referral exception queue · S–M reads

Aggregate stuck qualification, missing reward links, rejections, and revoked grants, linking relevant orgs subject to scope. Manual qualification/rejection/reward reversal is deferred until C0/G1 cover idempotency, eligibility, attribution, and atomic ledger behavior. No reward mutation is included in the read-only slice.

## 8. Track E — Tenant support access: future decision

Start with purpose-built diagnostics in org detail. Rendering tenant screens under a shadow identity is **L**: tenant auth, RLS, actions, REST writes, offline queues, and browser storage all become boundaries.

Read-only permissions and merchant approval are separate dimensions. Recommend **read-only, tenant-approved, time-boxed access** when feasible, with a separately approved recovery procedure for merchants who cannot sign in. Full impersonation is outside this roadmap.

Require case/reason, narrow org/data scope, expiry, current authorization, entry/access/exit evidence, revocation, and tenant-visible access history. Read-only access can still disclose sensitive data.

Do not swap into long-lived merchant tokens. Any tenant-UI session needs distinct operator attribution and denied writes across APIs, actions, direct tables, storage, and local/offline outboxes. Disabled buttons or RPC-only checks are insufficient. No tenant data persists in an operator browser's POS cache.

**Dependencies:** G1/G2, D1, D4 scope enforcement, an approved model, threat review, and integration tests. Revenue/caching are not dependencies. Exclude order edits, refunds, voids, Z-generation, employee authentication, and billing writes initially.

**Exit:** all write paths fail; expiry/revocation work mid-session; reusable tenant identities/offline data do not remain; tenant evidence survives termination.

## 9. Track F — Reliable proactive alerts · M

Inventory delivery options and choose durable scheduling before selecting an email SDK. Evaluate signals independently of page visits using D2's incident model. Start with verified backup age/failure, overdue support, and billing exceptions. Fleet alerts depend on validated telemetry; revenue history is not required.

Use notification outbox, deduplication by occurrence/recipient/channel, retry backoff, attempt limits, failed-delivery visibility, rate limits, and kill switch. Do not promise exactly-once email delivery. Notify material changes, recovery, or escalation rather than unchanged conditions.

Define recipient scope, quiet hours/timezone, digest cadence, severity, and explicit critical overrides before sending. Recheck revoked recipients at dispatch. Keep tenant details out of email; link to authenticated views. Monitor evaluator freshness and use external monitoring for database/notification-system failure.

**Exit:** no retry storms; recurrence, snooze, quiet hours, scope changes, and revocation work; a stopped evaluator is observable without a console visit.

## 10. Track H — Owner workspace and reporting

### H1 — Overview, My work, search and watchlists · M

Deliver the Home blueprint incrementally from existing G2/B1 readers and D1/D2 workflows. Provide owner/billing/support presets, scoped global search, recent accounts, private favorites, account watchlists, and a personal work queue. Show assigned cases, follow-ups and review requests with their original record type and status.

Store layout preferences and favorites separately from business data. Shared views store filter definitions, not a cached copy of records; opening one evaluates the viewer's permissions again. An owner sharing a view with support cannot share financial access implicitly. Search excludes raw payloads and unrestricted case text by default, and returns bounded typed results.

**Exit:** counts reconcile to drilldowns; browser Back preserves context; two operators see their own preferences and authorized results; revocation removes access; unavailable data is distinct from empty data. Deliver an initial Home using support/billing/recovery evidence before historical finance is available.

### H2 — Curated report library and metric dictionary · M

Add a report library, initially containing:

| Report | Questions answered | Data dependency |
|---|---|---|
| Owner weekly review | What changed in accounts, revenue, service and open work? | Only modules with verified coverage; unavailable sections labeled |
| Subscriptions and collections | Who pays, what is recurring, what is at risk, and what was collected? | A1/C0–C2; estimates separated |
| Activation and adoption | Where do new accounts stall, and which features are used? | A2/I2 instrumentation |
| Support performance | Case backlog, first response/resolution distributions, breaches, reopen rate | D1 timestamps and fixed denominator definitions |
| Service and recovery | Affected orgs, incident duration, sync coverage, job failures, recovery posture | Fleet evidence, C4/K1/K2 |
| Campaigns and referrals | Attributed signup/paid conversion, reward issuance, unknown attribution | Existing promo/referral records plus J2 |
| Operator and policy activity | Sensitive changes, decisions, unresolved requests and policy versions | Audit sources and K3 |

Each metric has an owner, formula, population/exclusions, source, grain, timezone, freshness, history start, version and supported dimensions. Filters only appear when the underlying dataset supports them. Avoid misleading averages: support reports show sample size and median/p95 where appropriate; absent responses and unresolved cases remain explicit populations.

Offer saved filters, previous-period comparison, annotated charts and permitted CSV via B3. Scheduled reports depend on F; default email contains a link to a private snapshot, with scope rechecked on opening. Save generation time, definition version and period for reproducibility. Revoked operators lose access to stored reports too. No unrestricted SQL or cross-tenant record explorer.

**Exit:** reports and dashboard metrics agree under identical filters; scopes remain enforced across snapshots/exports; immature cohorts and incomplete history cannot generate authoritative comparisons.

### H3 — Planning scenarios and owner goals · M, later

After verified A1b history, add explicitly labeled planning scenarios for subscriber growth, churn, collection recovery and branch expansion. Inputs are editable assumptions, outputs are ranges with formulas, and saved scenarios never change billing catalog or actual metrics. Compare owner-entered targets with observed outcomes; never present scenarios as provider commitments or automated forecasts.

**Exit:** changing an assumption only changes the scenario; no write reaches billing. The owner can inspect the baseline, formulas and assumptions and return to observed results.

## 11. Track I — Account success and merchant relationship management

### I1 — Complete account workspace · M

Expand existing organization detail into a consistent account workspace instead of introducing a separate CRM database for the same organization.

| Tab | Contents and actions |
|---|---|
| Summary | Organization identity, authorized owner contact, assigned platform account owner, tags, lifecycle stage, next task and evidence-backed risks |
| Access & billing | Separate account/subscription/access states, current and pending branch entitlement, dates, verified payment evidence, trial/grant timeline; existing guarded controls |
| Adoption | Setup milestones, last trustworthy activity, enabled-versus-used modules, per-branch coverage and freshness |
| Branches & devices | Scoped operational inventory, reporter freshness, sync issues and linked service incidents; no merchant inventory editing |
| Support & success | Cases, internal account notes, follow-up tasks, external-contact record, prior resolutions and upcoming reviews |
| Communications | Eligible/delivered/read notices as distinct states; record external outreach without claiming it was delivered by the platform |
| Timeline | Typed activity across subscription, grants, cases, announcements, tasks, incidents and operator changes, with source links |

Add account owner, tags, internal notes and tasks through audited scoped commands. Define contact display permissions and retention; do not widen access to staff/customer lists. Financial tabs are separately permissioned. Timeline is a filtered projection of original records, not a second mutable audit ledger. Mask unsupported identity fields rather than substituting guessed contacts.

**Exit:** explain an account's current access and latest issue from one workspace; tabs retain the same organization context; role tests deny financial/internal fields at the server, not just the tab bar.

### I2 — Onboarding, adoption and explainable account health · M–L

Create an onboarding queue with stage, missing milestones, elapsed time, assigned owner and next follow-up. Candidate milestones: organization created, branch configured, catalog ready, terminal registered, first successful sync, first completed sale, first verified payment. Define each precisely; initially unavailable milestones remain unavailable. Do not turn row existence into proof of completed setup.

Add a minimal, allowlisted activity model for org/branch-level usage: feature, successful action count, observed period, source and quality. Distinguish enabled from used, browser online from selling, and no activity from missing telemetry. Offline synchronization and backfill update evidence without double counting. No keystrokes, session replay, customer payloads or employee-performance surveillance.

Start health with separate facets: onboarding, adoption, billing, service and support. Each has a reason, source time, coverage and next action. Rules such as trial nearing expiry without first sale or repeated unresolved sync failures are operator-reviewed signals, not automatic suspension/churn predictions. Any later composite score publishes versioned weights and minimum evidence thresholds; unknown inputs do not become a low score. Manual override needs reason and expiry and preserves the source assessment.

**Exit:** every flagged account has an inspectable reason; delayed offline activity does not become confirmed abandonment; incomplete telemetry becomes unknown; setup-stage counts reconcile to A2 definitions.

### I3 — Segments, follow-ups and renewal planning · M

Offer allowlisted segment filters such as lifecycle stage, trial-end range, recurring/prepaid mode, verified renewal date, branch count, support risk and campaign source. Example saved segments: trials ending this week without activation; paying accounts with unresolved critical incidents; prepaid terms expiring soon; branch-expansion candidates identified by confirmed entitlement use.

Save dynamic segment definitions for exploration; snapshot authorized membership when queuing any batch task. First bulk operations are tagging, assignment and creation of bounded internal follow-ups, with target preview, per-item outcomes and retry keys. Do not include bulk suspension, grant issuance, price changes or outbound marketing.

Tasks have assignee, due date, reason, source record, status, outcome and next step. Renewal calendars distinguish known provider renewal dates from prepaid expiry and unknown future billing. Growth opportunities are suggestions for human review, never automatic sales claims or account upgrades.

**Exit:** shared segments cannot widen scope; a changed segment does not silently change an already reviewed batch; completed tasks retain outcomes and links to relevant cases. Automated internal task creation later uses K4 controls.

### I4 — Support knowledge and feedback loop · M, staged

Extend D1 with structured issue categories, reusable internal troubleshooting guides, versioned response templates, linked known incidents and a recurring-problem view. Begin with existing trial feedback; add manually categorized requests and duplicate linking. Counts identify unique contributing organizations rather than inflating votes through duplicate submissions.

Suggested feedback states: new, reviewing, planned, in progress, delivered, declined, with reasons and links to actual releases. An internal planned status is not a merchant-facing delivery promise. Templates insert draft text; they do not send messages. If later adding merchant replies or satisfaction surveys, separately specify participant authorization, external/internal visibility, notification evidence, consent/preferences and retention. Keep attachments deferred until their storage/access model is approved.

Support views and reporting take inspiration from configurable filtered inboxes and explicit reporting attributes, adapted to Dumala rather than requiring an external helpdesk. Reference: [Intercom inbox setup](https://www.intercom.com/help/en/articles/10223008-setting-up-the-inbox).

**Exit:** an operator can find a prior resolution, link the current case, and record feedback without leaking internal notes or sending anything accidentally. Support reporting uses D1 response semantics throughout.

## 12. Track J — Public website and growth management

This track covers Dumala's marketing website and owner-facing educational content. It does not grant platform operators editing rights over individual merchants' menus, orders or inventory. Existing [homepage](../src/app/page.tsx), [pricing](../src/app/pricing/page.tsx), [legal pages](../src/app/legal/page.tsx) and [merchant guide](../src/app/admin/guide/page.tsx) are reference surfaces; a database-backed content system is proposed, not verified as existing.

### J1 — Structured website content and publishing · M–L

Provide a narrow editor for approved content types: homepage sections/CTA, FAQs, help articles, release notes, contact/support information and selected page metadata. Use constrained structured blocks rather than arbitrary HTML, JavaScript, CSS or a drag-and-drop site builder. Keep operational secrets and billing rules outside content storage.

Workflow: draft → preview → review if required → scheduled/published → archived. Keep immutable revisions, author, reviewer, publication time, preview diff, audience and rollback-to-revision. A rollback publishes a new attributable revision. Draft previews require authorization and cannot become publicly cacheable or indexed. Validate links, required fields, safe media, alternative text and mobile layout before publication.

Start with FAQ/help/release notes, then expand marketing sections after the publishing boundary is proven. Public price amounts stay sourced from the billing catalog; marketing text must not create a second price or entitlement truth. Legal/policy content requires version/effective-date review and coordination with acceptance records before it becomes editable. Do not claim legal review occurred merely because an operator clicked Publish.

**Exit:** editors can preview a complete page, publish a reviewed revision and restore prior content; drafts remain private; catalog price changes cannot leave contradictory hard-coded prices; scheduling uses the shared durable runtime. Public-route/cache/security regression testing is mandatory for this later track.

### J2 — Acquisition, campaigns and conversion reporting · M–L

Connect approved attribution fields to the progression from website visit or qualified lead to signup, activation and verified first payment. Record source/medium/campaign or referral code, collection time, attribution model and unknown/unattributed bucket. Anonymous visitor analytics, if desired, need a separate collection/provider and consent/retention decision; current application records do not establish website traffic history.

Initially report known signup sources, existing promotion redemption and referral outcomes. Later add landing-page/CTA conversion with explicit denominators, bot/test exclusions, cross-device limitations and attribution windows. Do not claim causal uplift from observational comparisons. Cost-per-acquisition or return-on-spend requires verified campaign spend; no spend data means unavailable, not zero cost.

Add campaign records linking content revisions, promotion codes, audience intent, start/end, owner and results. Reuse existing promotions/referrals rather than duplicate checkout rules. Campaign planning does not authorize email delivery; outbound marketing needs a separately reviewed recipient/preference workflow.

**Exit:** campaign totals reconcile to underlying attributed records; unknown source remains visible; historical attribution is not fabricated; a promotion is never charged/applied differently because of a reporting edit.

### J3 — Pricing and offer planning · M after A1b; commercial writes separate

Extend Plans & Pricing with version history, provider mapping/readiness, effective dates, affected-account preview and a read-only simulator for monthly/multi-year/branch scenarios. Explicitly distinguish new-customer offer changes from existing-account repricing. Preview impacts using verified contracts where available and label all uncertainty.

No new tier, automatic repricing, proration, refund or provider-plan migration is authorized by this track. Those need a separate commercial decision and billing design. Release notes and marketing descriptions can link the approved catalog version. Promotions show expiry, eligibility and actual redemption performance; editing their analytics cannot rewrite redeemed terms.

**Exit:** owner can compare proposals without changing live prices; any later approved offer publication passes G1/K3 and provider validation, with effective date and audit evidence.

## 13. Track K — Service operations and governance

### K1 — Reliability workspace and incidents · M

Combine links to Fleet, Sync, Devices, Schema and Recovery in a reliability summary. Preserve independent signals: service availability, latency/error samples, queue health, reporter coverage and actual recovery readiness. Missing heartbeats alone are not proof of a platform outage. Display p50/p95 with sample size/window, and label measured uptime only when a documented independent probe exists.

Add incidents with severity, affected components/orgs, incident lead, start/detection times, status, timeline, linked signals/cases and next update. Suggested states: investigating, identified, monitoring, resolved. Record remediation and post-incident review. Link related Attention occurrences; resolving an incident does not falsely resolve still-failing source conditions.

Maintenance has affected scope, expected impact, schedule, owner, updates and completion. A public status page is optional and requires a sanitized publication workflow; internal org lists and diagnostics never flow into it automatically. Announcement delivery can publish approved maintenance notices through D3.

**Exit:** investigate a signal, establish affected scope, link cases, and close the incident with evidence. Test false alarms, partial outages, stale telemetry and continued failures after declared resolution.

### K2 — Jobs, integrations, releases and capacity · M–L

Provide job inventory and run history: purpose, owner, schedule, last start/success, duration, current lease, failure reason, attempt, backlog and next expected run. Include announcement publication, notifications, evidence ingestion, report generation and backups as each exists. Show a never-started job separately from a successful empty run. All controls are specific allowlisted operations; this is not a shell, SQL console or arbitrary webhook tool.

Integration cards show configuration presence, environment, last verified connectivity, relevant job/event health and sanitized errors. Configuration presence is not proof of connectivity. Never reveal service keys or accept arbitrary URLs that enable server-side network access. Provider/hosting telemetry requires an explicitly configured read-only source.

Release context records deployed version/environment/time where verifiable and reporter app versions where instrumented. Correlate incidents with releases without claiming causation. Show migration/schema status separately from deployment status. Remote terminal restart, data wipe and deployment rollback remain outside the first slice.

Capacity cards may later show verified database/storage/egress/job usage, limits, cost and trend, with source and billing period. No invented cost allocation or bill forecast when telemetry is absent. Define collection frequency and overhead before enabling probes.

**Exit:** operator distinguishes failed, delayed, never-started and disabled jobs, inspects a sanitized failure and follows a supported runbook. Retries use the owning subsystem's idempotency rules; financial replay still requires C3.

### K3 — Sensitive-change review and platform settings · M–L

Centralize non-secret settings: reporting timezone, metric display preferences, SLA policies, incident thresholds, notification preferences and report retention. Separate personal preferences from platform-wide rules and version shared settings. Keep policy publication under the existing policy lifecycle.

For designated high-impact future changes, add review requests with immutable proposed diff, target scope, reason, requester, reviewer, expiry and outcome. Example candidates: financial recovery, broad announcements, policy changes and future offer changes. Approval is not execution: the command rechecks permissions, current target version, policy and scope; changed proposals invalidate approval.

Default to distinct requester/reviewer when a two-person rule is enabled. A single-owner installation must use an explicitly documented mode with fresh authentication and recorded self-approval; do not pretend it has independent review. Bootstrap access remains visible in the operator inventory. Session controls or step-up authentication need explicit integration design and tests before claims of enforcement.

**Exit:** stale/revoked approvals cannot execute; edits require new review; requester cannot impersonate approver; audit shows proposal, decision and actual outcome separately. Routine read operations and personal preferences do not acquire unnecessary approval steps.

### K4 — Bounded internal automation · M–L, later

Start with fixed rule templates: assign an overdue case, create a follow-up for an expiring trial, notify on confirmed backup failure, or generate a scheduled report. Reuse D2/F incident and delivery state. Rules have owner, validated filters, schedule, previewed matches, enabled state, cooldown, run history, per-run cap and kill switch.

Support a dry-run mode that records planned internal effects without applying them. Prevent duplicate tasks and recursive triggering through effect keys and execution limits. Resolve current scopes at execution, and report invalid recipients/permissions instead of silently widening access.

No arbitrary scripts, autonomous billing/access changes, bulk suspension, AI-driven account decisions or external marketing sends. External notification rules use only F's separately configured channels and recipients.

**Exit:** dry-run and execution agree on a fixed fixture; retries/overlapping schedules do not duplicate work; disabled rules stop new work; a run can be explained from rule version and source evidence.

### New data and integration map for H–K

These are proposed logical records, not reserved table names or migrations. Split only where lifecycle, ownership or query needs justify it.

| Capability | Reuse | New evidence/storage needed | Availability rule |
|---|---|---|---|
| Home and reporting | G2/B1/A/C/D readers | Preferences, saved views, metric registry; optional report snapshots | Each widget declares its real source and permission |
| Account success | Organizations, cases, trials, grants, referral records | Assignments, tags, notes/tasks; precisely defined milestones/activity rollups | Unknown activity stays unknown |
| Content publishing | Existing public pages, D3 delivery patterns | Structured revisions, publication/review records, safe asset metadata if needed | Drafts private; only approved revisions public |
| Growth attribution | Promo/referral evidence, verified payments | Attribution fields, campaign records; optional visitor/spend integrations | No retroactive attribution or traffic claims |
| Reliability | Fleet/sync/device/schema, C4 | Incidents, maintenance and job-run evidence; optional external probes | Connectivity/uptime/cost require their own source |
| Review and automation | Operators, audit, policies, F | Approval requests, versioned rule definitions and execution/effect history | Approval cannot replace live authorization |

For every new durable record, define owner, tenant/platform scope, permission, retention/deletion behavior, index/query strategy, audit events and backup inclusion before implementation. Prefer bounded SQL rollups and periodic summaries to exporting raw tenant data into a new analytics store by default.

## 14. Sequence and gates

| Wave | Deliverable | Gate | Size |
|---|---|---|---|
| 0 | G0 baseline, C4 assessment, mutation/read inventory | Dated evidence and unknowns | S–M |
| 1a | G2/B1 bounded readers, C1 metadata viewer, H1 navigation/search/initial Home | Scope/completeness tests; honest legacy outcomes | M per slice |
| 1b | G1 case/account safety + D1 queue, I1 account-workspace organization | Atomic audit, concurrency, SLA evidence; no new unauthorized account fields | M–L |
| 1c | C4 coverage, ledger, isolated restore drill | Proven storage/coverage/identity recovery | M–L |
| 2 | D2 attention occurrences, D3 delivery, A1a estimate, I3 manual follow-ups, H1 watchlists | G1/G2/B1; scope/versioning; scheduling decision | M per slice |
| 3 | C0 core, then C2 and A1b | Ordering/races/resumable effects/history tests | L |
| 4 | A2/A3 analytics, I2 adoption, H2 reports, B3 exports, A4 referrals | Shared metric definitions, reliable history, scoped export | M–L per slice |
| Product expansion | I4 knowledge/feedback, J1 content, J2 campaigns, J3 offer planning | Explicit data/publishing/attribution gates; commercial writes separate | M–L per slice |
| Operational expansion | K1 incidents, K2 jobs/integrations, K3 reviews/settings, F alerts, D4 scope | Ready evidence/runtime/permissions; no need to wait for growth charts | M–L per slice |
| Later optional | H3 scenarios, K4 rule templates, merchant reply portal | Verified baselines; shared jobs and permissions; separate messaging scope | M–L |
| Optional high risk | C3 recovery, E access, global B2 migration | Independent go/no-go and staged enablement | L per slice |

Waves express priority, not artificial dependencies. Recovery and support can progress independently. Omit A1a if an estimate would mislead. Do not combine backup/billing/support into one migration merely to share a number.

### Product releases and scope cutlines

| Release | Owner-visible result | Deliberate cutline |
|---|---|---|
| R1 — Daily owner workspace | Clear navigation, useful Home, scoped search, consistent account detail, resolvable support queue, billing-event visibility and truthful recovery status | No historical finance claims, replay, website CMS or automated outreach |
| R2 — Account care and communication | Watchlists, internal follow-ups, segments, attention ownership, merchant notices, initial knowledge/feedback and explainable account signals where evidence exists | Missing usage signals remain unknown; no opaque health score or autonomous interventions |
| R3 — Business intelligence | Verified financial history, activation/retention/adoption reports, report library, authorized exports and referral exceptions | History appears only after coverage exists; no arbitrary analytics warehouse or SQL builder |
| R4 — Website and service administration | Structured website publishing, campaign evidence, reliability/jobs workspace, governed settings and supported alerts/reviews | Roll out each module independently; no blanket authority to edit tenants, deploy code or move money |

These releases group outcomes for planning, not fixed dates or a requirement to ship every listed module together. A job-health screen may ship before R3 when needed for announcement scheduling. Public content editing may proceed before finance history if J1's own gates pass. H3/K4 remain optional after these releases; their absence does not make the core console incomplete.

### Live implementation tracker

**Updated:** 2026-09-23 · **Wave 1a headline:** 9 of 9 tracked slices complete (**100%**) · **Wave 1 local engineering:** 13 of 13 tracked slices complete (**100%**) · **Overall named-slice view:** 14 of 34 fully complete (**41%**). These are deliverable counts, not lines of code or elapsed time; D3 is implemented but remains an enablement-gated slice until authenticated/mobile QA passes. I3 now has a local implementation foundation but is not counted complete until review, hosted migrations, and authenticated QA pass. PR #36 is merged to `main`; hosted migration `0088` is applied and verified. D2 is merged through PR #37, hosted `0089` and `0091` are applied, and the hosted attention smoke plus ACL checks pass. The interim C4 policy is selected and the verified export is copied to `BACKUPSSD`; production recovery evidence still has explicit hosted/encryption/UI gates.

| Slice | Status | Evidence / remaining gate |
|---|:---:|---|
| G2 shared read and permission contract | ✅ Complete for Wave 1 readers | Directory, Operations, Support, Audit, Billing, Search, Home, Fleet, Sync, Devices, and Schema readers expose bounded scope, freshness, availability, and unknown/partial states. Future readers inherit this contract; focused suites and the production build pass locally. |
| B1 Directory | ✅ Complete | `/platform/users` has database-side search, exact-count pagination, selected-page related reads, and completeness warnings. |
| B1 Operations and entitlements | ✅ Complete | `/platform/operations` has bounded workspace search/pagination, page-scoped trial/entitlement reads, safety caps, and explicit partial states. |
| B1 Support queue | ✅ Complete | `/platform/support` has server-side search/filtering, 50-row pagination, SLA indicators, and metadata-only scope. |
| B1 Unified Audit | ✅ Complete | Three-source keyset pagination, deterministic merge, URL filters, and source availability are implemented. |
| C1 Billing metadata viewer | ✅ Complete | `/platform/billing` exposes bounded receipt metadata with permission filtering and unknown outcomes preserved. |
| H1 Navigation | ✅ Complete | Platform navigation exposes grouped console destinations with responsive mobile behavior. |
| H1 Scoped global search | ✅ Complete | `/platform/search` routes authorized organization, profile, and support metadata with bounded results and incomplete-source states. |
| H1 Initial Home foundation | ✅ Complete | Home now uses exact aggregate count readers where possible, shows role preset and summary freshness, labels capped recent-account coverage, and preserves unknown counts. Full watchlists, personal work, and saved preferences remain later H1 slices. |
| G1 Atomic account safety | ✅ Complete | Suspension/restoration lock and version the organization row, write the audit in the same transaction, preserve actor/reason/policy/request evidence, and reject stale writes. Rollback-scoped SQL smoke covers the conflict path. |
| D1 Support lifecycle and SLA evidence | ✅ Complete | Case creation, assignment, status transitions, append-only notes, first actual operator response, resolution reason, version conflicts, event history, and audit writes are transaction-backed. The queue remains bounded and metadata-first. |
| I1 Organization workspace foundation | ✅ Wave 1 foundation | Organization detail joins access, billing, people, branches, support, referrals, audit, assignment, notes, and lifecycle history in one workspace without adding an unrestricted CRM store. Adoption milestones, account tasks, and communications remain later I1/I2 increments. |
| I3 Manual follow-up tasks | 🟡 Foundation in review / ⚠ hosted gate | Organization detail now has durable internal tasks with source, owner, due date, next step, outcome, lifecycle actions, optimistic version conflicts, append-only audit history, account-success permission checks, and backup coverage. Migration `0093` and source manifest/backup updates are ready on `codex/platform-i3-followups`; the rollback-scoped SQL smoke passes locally. Merge, hosted `0092` + `0093`, and authenticated operator QA remain. |
| C4 Backup coverage and restore evidence | ✅ Interim policy / ⚠ production gate | The allowlist covers all 59 current application tables, including D2 attention tables, records SHA-256 digests, declares the best-effort API boundary, and the current hosted export verified 59/59 tables, 1,485 rows, and 778,132 bytes. The verified checkpoint was copied to `BACKUPSSD` and re-verified from the destination; interim RPO ≤24h, RTO ≤8h, and 30-day retention are recorded. The Docker checkpoint plus throwaway-database restore drill remains valid for the 0088-era 57-table schema, and the local Auth/Storage interface rehearsal passed with zero residual fixtures. Encrypted separate-boundary storage, hosted scratch restore, and authenticated operator QA remain required before production recovery reliance; the decision packet is in `PRODUCTION_BACKUP_AND_RESTORE.md`. |
| D2 Attention occurrences | ✅ Merged + hosted | Migration `0089` adds durable source-keyed occurrences, condition fingerprints, source-owned resolution, acknowledgement, assignment, bounded snooze, version conflicts, recurrence, audit history, and service-role RPCs. PR #37 merged as `b670d4f`; hosted `0089` and ACL hardening `0091` are applied. Hosted reconciliation smoke passed with rollback and the D2 RPCs are executable only by `service_role`. Authenticated operator QA remains required. |
| D3 Merchant announcement delivery | ✅ Merged / ⚠ enablement gate | PR #43 (`4018f3b`) adds the authenticated `platform_announcements_for_current_tenant()` projection, owner-dashboard notices, audience isolation, safe internal/HTTPS actions, and strict start/expiry filtering. Hosted migration `0090` is present and the read-only boundary smoke confirms table privacy plus authenticated-only RPC execution. Future starts are operator-authorized publication windows; no automatic scheduler is promised. Authenticated tenant and mobile/tablet QA remain required before enablement. |

**Next gate:** Review and merge the I3 foundation, apply hosted `0092` and `0093`, and run authenticated organization-detail QA for create, assignment, due dates, conflicts, completion, cancellation, and reopen. Keep D3 tenant/mobile QA plus encrypted separate-boundary storage, hosted Auth/Storage scratch restore, and authenticated recovery/operator QA as explicit production-release gates.

### Definition of an informative, feature-rich release

- Every surfaced feature supports discover → inspect → act (where authorized) → verify outcome; navigation placeholders and nonfunctional buttons do not count as features.
- Each metric supplies an explanation, consistent drilldown, time basis and coverage; unavailable data stays explicit.
- Common tasks work through the normal interface without direct database access: account triage, case closure, follow-up assignment, announcement review and billing/recovery inspection.
- Detail pages show related context without exposing unrestricted tenant transactional data. Financial, service and communication state remain separate.
- Establish baselines for time to triage, unresolved-case age, follow-up completion, report adoption and stale/unknown data rates. Choose improvement targets after observing actual use. More widgets or more operator clicks are not success metrics.
- Each slice has a named product owner and engineering owner, a supported runbook, estimated size after data discovery, and documented reasons for any deferral.

Source currently includes migrations through `0093`; the hosted ledger is verified through `0091` while `0092` (the merged terminal-heartbeat reconciliation) and `0093` (I3 follow-up tasks) await the next linked push. Migrations `0089` and `0091` are the D2 delivery; `0090` is already present in the hosted ledger from the concurrent announcement-delivery push and is tracked locally for migration consistency. Allocate numbers only when implementation is ready, accounting for parallel work. Use additive schema, compatible readers, bounded resumable backfills, separate enablement, and backup coverage for every new durable table.

## 15. Verification and rollback

- **Reads:** fixture totals, filters/cursors, direct unauthorized access, scope isolation, partial/unavailable states, and scale benchmarks where relevant.
- **Writes:** SQL/ACL tests, audit-failure rollback, conflicts/retries, revoked actors, policy changes, and tenant-visible consistency.
- **Billing:** C0 failure/race matrix with provider-shaped fixtures; production replay is not a test.
- **Tenant delivery/access:** multiple profiles/tenants, forged identifiers, expiration, safe content, and browser/cache boundaries.
- **Recovery:** isolated restore, constraints/counts/financial checks and functioning identities. Export completion is insufficient.
- **Owner workspace:** role-specific Home/search, saved-view sharing, filters/Back navigation, denied drilldowns, keyboard access and tablet/mobile tasks.
- **Account success:** milestone correctness, delayed offline data, explainable risk flags, segment snapshots, bulk-task retries and note visibility.
- **Website:** private previews, safe rendering/media, reviewed revision publication, rollback, scheduling, catalog consistency and public-page/cache regressions.
- **Service/governance:** stale approvals, requester/reviewer separation where enabled, expired job leases, bounded retries, secret redaction and disabled-rule behavior.

Use end-to-end planning scenarios for acceptance: (1) a new merchant stalls before first sale and receives an internal follow-up; (2) a paying account with a grant has correct financial/access explanations; (3) a critical sync issue links an incident and support case without becoming an unsupported outage claim; (4) a website draft is reviewed, published and rolled back; (5) a scoped operator opens a shared report without gaining extra data; (6) a never-started backup job produces unknown/failed readiness rather than green status; (7) a sensitive proposal changes after approval and execution is refused. Implement only the scenarios belonging to the released slice.

Implementation slices run typecheck, lint, build, relevant suites, and RPC contracts where applicable. Preflight and hosted rollback-scoped smoke belong to deployment verification, not this documentation edit. Use local/staging failure injection; never seed scale fixtures or rehearse restore in production. Record actual commands/environment/results/gaps in `tasks.md`; update schema/setup/runbooks when their contracts change.

Deploy additive schema first and gate new writes/workers. On failure, disable the capability and revert compatible application behavior; retain evidence tables. Do not blindly undo financial effects: use audited compensation. Jobs/backfills resume safely.

**Stop conditions:** unexplained totals, missing audits, cross-scope exposure, duplicate effects, insufficient recovery coverage for affected data, or unsafe application rollback block the affected release. Independent work can proceed.

## 16. Decisions and recommended defaults

Decisions gate only dependent implementation. No implementation is implied by this review.

| Decision | Recommendation | Needed before |
|---|---|---|
| First release | Support closure, billing visibility, bounded reads, recovery | Wave 1 scheduling |
| Financial visibility | Owner/billing; explicit grants otherwise | G2/C1/A1 |
| Revenue presentation | Labeled estimate if useful; no invented history | A1a |
| Financial rules | Version eligibility, delinquency, discounts, currency, coverage | A1b |
| Support SLA | Elapsed hours initially; actual response evidence | D1 |
| Recovery | Owner selects RPO/RTO, storage, cadence after assessment | C4 sign-off |
| Scheduler | Durable jobs, leases, observability/retries | D3/C0 workers/F |
| Operator scope | Global only while explicitly acceptable; assignments before restricted hires | D4/E |
| Exports | Owner-gated metadata; offboarding separate | B3 |
| Support access | Diagnostics first; later approved read-only expiring access | E |
| Global caching | Defer until measured benefit justifies full-app QA | B2 optional project |
| Notifications | Decide provider, recipient/quiet-hour/retention rules after inventory | F |
| Product scope | Platform owner/operator console; merchant admin remains separate | H1 navigation |
| Dashboard personalization | Curated role presets and saved preferences first | H1 |
| Account health | Explainable facets and unknown states before any composite score | I2 |
| Website editing | FAQ/help/release notes first; constrained blocks; catalog remains price source | J1 |
| Visitor analytics | Start with known signup/promo/referral evidence; separately choose any visitor collection | J2 |
| Reviews | Configure specific high-impact actions; document single-owner versus two-person mode | K3 |
| Automation | Internal fixed templates with dry-run/limits; no autonomous financial actions | K4 |

## 17. Non-goals

- This plan does not authorize hosted inspection, migration deployment, or provider mutation; local implementation progress is recorded in the decision log below.
- No collection redesign, automatic refunds/cancellation, bulk replay, or silent entitlement repair. C0 improves reliability/evidence within existing billing behavior.
- No full offboarding/data-subject fulfillment or legal-compliance claim from metadata exports.
- No merchant reply portal, attachments, unrestricted payload viewer, full impersonation, or POS expansion in initial waves.
- No framework migration, generic workflow engine/event bus, or unlimited cache without demonstrated need.
- No unrestricted website builder, executable content editor, direct SQL/shell console, remote terminal wipe, or platform-controlled editing of merchant business records.
- No new payment provider, new commercial tiers, automatic existing-account repricing or ad-spend integration merely to populate proposed screens.
- No AI-generated risk decisions, background tenant surveillance or invented forecasts. Informative summaries must remain traceable to approved data.
- No weakening of private HTML, service-worker, or offline tenant-data boundaries.

## Decision log

| Date | Record | Rationale |
|---|---|---|
| 2026-09-22 | Original proposal drafted | Consolidated expansion under A–F. |
| 2026-09-22 | Source-reviewed revision; implementation remains unapproved | Corrected audit, webhook, revenue, caching, recovery, and scope assumptions; added foundations, evidence gates, explicit deferrals, and independent dependencies. |
| 2026-09-22 | Expanded into a complete platform-owner product proposal at owner request | Added Home/navigation/UX specifications, account success, reporting, website/growth management, service operations, governance and staged product releases. The later modules remain plan-only; H1 search is tracked separately below. |
| 2026-09-22 | Wave 1a started with H1 platform search and C1 billing evidence | Added `/platform/search` and `/platform/billing`, URL-preserved search/filter state, organization/profile/support-subject metadata results, provider receipt metadata, handler-marker filters, desktop/mobile navigation entry points, billing/support permission filtering, incomplete-source messaging, focused search tests, and full typecheck/lint/build verification. Raw payload search, payment reconciliation, replay, email search, saved views and watchlists remain deferred to their planned slices. |
| 2026-09-22 | Wave 1a B1 first bounded Directory slice | Moved `/platform/users` workspace search into the database query, added exact-count pagination with URL-preserved page state, limited related profile/store/employee reads to the visible organization page, replaced the previous in-memory 1,000-row ceiling, and surfaced unavailable or safety-capped related data. Authentication email enrichment uses one bounded admin user-list read; global search remains the route for people and support-case discovery. |
| 2026-09-22 | Wave 1a B1 unified Audit slice | Replaced the three independently capped audit reads with per-source keyset cursors and a deterministic merge across organization, operator, and announcement audit tables. Added URL-preserved server filters for metadata search, source, exact action, organization UUID, and time windows; added next-page continuation and source-specific unavailable states. Audit cards retain the existing read-only before/after inspection boundary. |
| 2026-09-22 | Wave 1a B1 support-read boundary | The shared active support-case reader now orders by due time plus ID, returns an exact/unknown total and continuation flag, resolves organization names only for returned cases, and labels the overview's 250-case sample when more active cases exist. No support descriptions or lifecycle mutations were added to the bounded overview read. |
| 2026-09-22 | Wave 1a B1 Support queue slice | Added `/platform/support` for Support and Owner operators with database-side subject/exact-organization search, status and priority filters, 50-row pagination, exact/unknown totals, SLA/urgent indicators, organization links, and unavailable organization-name messaging. The queue is metadata-only; support descriptions and mutation controls remain on the organization workflow. |
| 2026-09-22 | Wave 1a B1 Operations and entitlements slice | Replaced `/platform/operations`' all-directory read with URL-preserved workspace search and 50-row organization pagination; scoped profile, branch, employee, trial-feedback, entitlement, and trial-extension reads to the visible page; added page-scope labels and related-data completeness warnings; and added explicit entitlement-history and trial-feedback caps with `hasMore`/completeness warnings that route operators to the organization timeline. Empty pages probe schema availability without falling back to an unscoped entitlement read. Existing lifecycle writes, entitlement mutations, policy gates, and audit boundaries remain unchanged. Local typecheck, lint, production build, focused platform tests, and the rollback-scoped entitlement smoke passed. |
| 2026-09-22 | Wave 1a H1/G2 Home foundation | Added exact head/count aggregate reads for Home summary cards, role-preset and `asOf` context, unknown/unavailable aggregate states, and explicit coverage for the bounded recent-account sample. The Home still uses existing attention/detail readers; watchlists, assigned work, saved preferences, and historical trend reports remain separate H1/H2 slices. Local typecheck, lint, build, and diff checks passed. |
| 2026-09-22 | Wave 1b G1/D1 atomic lifecycle | Added migration 0088 with versioned organization safety, idempotent request keys, atomic support case creation, assignment, transitions, append-only notes/events, first-response evidence, and audit snapshots. Added support workspace controls, a rollback-scoped lifecycle smoke, RPC payload/permission contracts, and backup coverage for the new durable tables. |
| 2026-09-22 | Wave 1c C4 local recovery gate | Expanded backup coverage to all 57 current application tables, added SHA-256 manifest verification and explicit best-effort snapshot labeling, granted the service-role recovery reader access to the application schema, and completed a Docker checkpoint plus throwaway-database restore drill. Hosted/off-machine storage, Auth/Storage verification and RPO/RTO remain owner gates. |
| 2026-09-23 | Wave 1 merge and hosted migration | Merged PR #36 into `main` as `14ea251`, applied hosted migration `0088_platform_support_lifecycle.sql`, and verified the remote migration ledger, `platform_mutation_requests`, `support_case_events`, `support_case_notes`, and all five lifecycle RPCs. Off-machine backup policy, Auth/Storage recovery verification, RPO/RTO and authenticated operator QA remain open C4 gates. D2 Attention occurrences is the next active implementation slice. |
| 2026-09-23 | D2 Attention occurrences local implementation and PR | Added migration `0089_platform_attention_occurrences.sql`, source reconciliation with deterministic unknown-source handling, durable acknowledgement/assignment/snooze state, version conflicts, recurrence and append-only audit history, the `/platform/attention` workbench, an `attention_manage` permission, focused migration/RPC tests, and a rollback-scoped PostgreSQL smoke. Local typecheck, lint, production build, and D2 smoke passed; this entry records the pre-merge handoff and is superseded by the hosted verification entry below. |
| 2026-09-23 | D2 merge, hosted verification, and ledger reconciliation | Merged PR #37 as `b670d4f`, applied hosted `0089`, detected and closed the default `authenticated` EXECUTE grant with PR #38 / migration `0091` (`ad7183c`), and verified hosted tables, service-role-only RPC ACLs, rollback-scoped reconciliation/recurrence/action smoke, and zero residual fixtures. A concurrent announcement push had already applied `0090`; the exact migration is tracked here so future pushes do not fail on a remote-only version. |
