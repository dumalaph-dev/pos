# Platform Owner Attention Inbox and Announcement Center

**Project:** Dumala POS  
**Status:** Phase 1, the announcement console slice, and owner-dashboard tenant delivery are implemented; migrations 0083–0085 are applied and verified in both the local Docker Supabase stack and the linked project, with delivery migration 0090 shipped for the next schema pass.
**Created:** 2026-09-15

## Purpose

Give platform owners one place to see work that needs a decision, then provide a controlled way to communicate important product and operational updates to merchants.

## Phase 1 — Needs-attention inbox

**Implementation status:** The read-first inbox is mounted on `/platform` and links to the existing resolution pages. It is backed by the current organization, entitlement, support, checkout, policy, and sync-health readers.

### Scope

The inbox is a read-first, cross-organization queue on the platform overview. It combines signals that already exist in the platform console:

- payment-risk states (`past_due`, `paused`, and `incomplete` subscriptions);
- trials and complimentary grants that expire within seven days;
- suspended organizations;
- urgent or overdue support cases when the operator can view support work;
- stale, missing, or failing branch sync telemetry;
- incomplete platform readiness checks, including unpublished policies and checkout setup.

### Interaction model

- show a count by severity and category;
- search by organization, branch, or issue text;
- filter by severity and category;
- link each item to the existing page that can resolve it;
- keep the first release read-only and preserve existing role permissions;
- show an explicit empty state and a data-availability warning when an underlying schema is missing.

### Acceptance criteria

1. An owner can understand the highest-risk work without opening every platform page.
2. Every item has a concrete next link or a clear reason it is informational.
3. Billing and read-only operators do not receive support-case details they cannot otherwise access.
4. No new tenant data is exposed; the inbox uses bounded platform metadata and existing audit boundaries.
5. Existing overview metrics and links continue to work when optional tables are unavailable.

## Phase 2 — Announcement center

**Implementation status:** The operator workspace and audited lifecycle actions are implemented at `/platform/announcements`. Migration `0085_platform_announcements.sql` is applied to the local and linked projects.

### Scope

Add a dedicated `/platform/announcements` workspace for drafting, scheduling, publishing, and retiring announcements. The first release should support:

- title, message, severity, and optional action URL;
- draft, scheduled, published, and archived states;
- start and expiry timestamps;
- audience targeting by all merchants, plan, or account status;
- preview before publish;
- publish and archive actions guarded by the existing platform operator permissions;
- an audit entry for every publish, edit, schedule, and archive action.

### Data model

Use a `platform_announcements` table with service-role access only. Store the audience as a validated type plus value so the targeting rules can grow without changing the announcement editor contract. Owner-dashboard delivery uses the authenticated `platform_announcements_for_current_tenant()` RPC, which derives the owner organization from `auth.uid()` and returns only published, currently active, audience-matched display fields; it never trusts client-supplied audience filters. The platform audit table and existing audit reader remain unchanged.

### Delivery surfaces

- platform console list and editor;
- owner dashboard notice card, delivered through the server-side audience-checked RPC;
- merchant-facing in-app notice area after tenant RLS and targeting checks are in place.

### Follow-up work

- add unread/read state per owner profile;
- add delivery and acknowledgement metrics;
- add maintenance-window templates;
- add a preview for mobile and small tablet widths;
- add a quiet-hours or notification preference policy before adding email or push delivery.

## Implementation order

1. Ship the read-first attention inbox using existing data sources.
2. Validate signal quality with real organization and branch telemetry.
3. Add the announcement schema and audited operator actions.
4. Build the announcement editor and publish workflow.
5. Add tenant delivery only after audience enforcement is covered by tests. **Complete:** migration `0090_platform_announcement_delivery.sql`, the authenticated reader, and the owner-dashboard notice card are implemented; unread/read state remains deferred.

## Verification record

- Local migration dry run is up to date after applying `0083`, `0084`, and `0085`.
- `npm run platform:announcements:validate:local` confirms both tables, RLS, service-role access, and the status/audit constraints.
- Linked schema smoke reports 85 applied migrations with latest version `0085`; the announcement boundary check passes with authenticated reads/inserts denied and service-role access enabled.
- The local announcement transaction smoke test verified draft insertion, audit insertion, audience fields, and rollback; no smoke rows remain persisted.
- `npm run test:platform-announcements` covers all-merchant, plan, and account-status isolation, strict publication/expiry boundaries, and the service-role table plus authenticated-RPC contract. The existing platform audit reader and announcement audit tables remain unchanged.
