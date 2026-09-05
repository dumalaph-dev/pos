# Dumala POS — Setup & Runbook

**Companion to:** [ARCHITECTURE.md](ARCHITECTURE.md) · [SCHEMA.md](SCHEMA.md) · [tasks.md](tasks.md)
Local dev, Supabase provisioning, migrations, and deploy. The stack is Next.js 16 (App Router, TS) + Tailwind v4 + Supabase.

---

## 1. Prerequisites
- Node ≥ 20 (repo built on v22), npm ≥ 10
- A [Supabase](https://supabase.com) project (free tier is fine to start)
- A [Vercel](https://vercel.com) account for deploy
- *(optional)* [Supabase CLI](https://supabase.com/docs/guides/cli) for running migrations from the terminal

## 2. Install & run locally
```bash
npm install
cp .env.example .env.local   # then fill in values (step 3)
npm run dev                  # http://localhost:3000
```
The home page (`/`) is a foundation smoke test — it renders the palette and the money util **without** Supabase, so it works before step 3.

## 3. Environment variables
Fill `.env.local` from Supabase → **Settings → API**:
| Var | Where | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public app origin for email-confirmation redirects (required on deployed environments) | client + server |
| `NEXT_PUBLIC_PUBLIC_MENU_ROOT_DOMAIN` | root domain for customer menu hostnames such as `branch.dumala.store` (defaults to `dumala.store`) | client + server |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | client + server |
| `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY` | PayMongo public key for browser-side payment-method tokenization | client + server |
| `PAYMONGO_SECRET_KEY` | PayMongo secret API key for server-side plan/customer/subscription calls | **server only** |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook signing secret | **server only** |
| `PAYMONGO_API_BASE_URL` | PayMongo API origin (defaults to `https://api.paymongo.com`) | server |
| `PAYMONGO_SUBSCRIPTIONS_ENABLED` | explicit server-side activation flag (`false` until tested) | server |
| `PAYMONGO_QRPH_CHECKOUT_ENABLED` | temporary one-time QR Ph checkout flag (defaults to `true`) | server |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only — never ship to client** |

`.env.local` is gitignored. Set the same vars in Vercel (Project → Settings → Environment Variables) for preview + production.

For a local PayMongo test, use matching `pk_test_...` and `sk_test_...` keys. Create a separate enabled test-mode webhook endpoint, copy its signing secret into `.env.local` as `PAYMONGO_WEBHOOK_SECRET`, then run `npm run paymongo:preflight`. The preflight prints only safe mode and status information; it never prints keys, webhook secrets, or API response bodies.

PayMongo Subscriptions require separate account activation and a subscription-capable payment method. If the preflight reports HTTP 403 for the Subscriptions plan API or no supported methods, ask PayMongo to enable Subscriptions for the organization and enable Visa/Mastercard card subscriptions or Maya subscriptions. QR Ph alone cannot start a recurring subscription.

When the account only has QR Ph enabled, the billing page uses the temporary hosted checkout automatically. It creates a one-time prepaid access period through PayMongo Hosted Checkout, then activates the organization after PayMongo confirms payment through the signed `checkout_session.payment.paid` webhook or a server-side checkout-status check. It does not auto-renew; set `PAYMONGO_QRPH_CHECKOUT_ENABLED=false` after recurring Maya/card billing is ready. Apply `0036_temporary_qrph_checkout.sql` before using this path.

For a successful subscription activation in PayMongo test mode, use `4120000000000007`, any future expiry, and a three-digit CVC; choose **Authorize** if the test prompt appears. Use `5234000000000106` and choose **Fail** to exercise failed activation, or `5123000000000001` to exercise a successful first payment followed by a recurring-payment failure.

`EMPLOYEE_INITIAL_PASSWORD` is the common temporary password that the administrator gives to staff. It must be at least 8 characters and stays server-only; employees are forced to replace it after their first successful Employee ID login.

`PLATFORM_ADMIN_EMAILS` is a comma-separated, server-only bootstrap allowlist for the platform operator console at `/platform`. Every listed address resolves as an `owner` before the managed `platform_operators` table is consulted, so it remains the recovery path if the table is empty or an operator is locked out. Bootstrap owners cannot be changed or revoked from the Operators page; invite the other real Auth account(s) there with the narrowest role they need.

PayMongo recurring billing uses `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY` in the
browser only for tokenizing card details, while `PAYMONGO_SECRET_KEY` and
`PAYMONGO_WEBHOOK_SECRET` remain server-only. Set
`PAYMONGO_SUBSCRIPTIONS_ENABLED=false` until PayMongo has activated
Subscriptions for the account and the test webhook endpoint is configured.
Set it to `true` only for the controlled checkout test after the preflight
passes. The app never sends raw card details to its
server. Configure the PayMongo webhook URL as
`<your-site-origin>/api/paymongo/webhook` and subscribe to these events:
`checkout_session.payment.paid`, `payment.paid`, `payment.failed`, `subscription.activated`,
`subscription.past_due`, `subscription.unpaid`, `subscription.updated`,
`subscription.invoice.paid`, and `subscription.invoice.payment_failed`.

## 4. Database migrations
SQL lives in `supabase/migrations/` (run in order):
The latest migrations add store staff access keys, subscription tracking, the
platform operations catalog, POS and display workflows, the online ordering
queue, customer-facing menu subdomains, and RPC contract hardening. Apply all
files in numeric order; the current end of the sequence is
`0055_online_ordering.sql` through `0061_cashier_online_order_queue.sql`,
followed by `0062_public_menu_subdomains.sql` and
`0063_online_ordering_protection.sql` through
`0067_verify_phone_rpc_acl_fix.sql`.
1. `0001_schema.sql` — tables, enums, indexes
2. `0002_rls.sql` — grants, helper functions, RLS policies, append-only triggers
3. `0003_functions.sql` — `clone_menu` (multi-branch)
4. `0004_lockdown.sql` — public grants and privilege lockdown
5. `0005_place_order.sql` — online order transaction and stock wiring
6. `0006_sync_idempotency.sql` — idempotent order sync constraints
7. `0007_inventory_wiring.sql` — stock movement RPC and POS inventory ledger
8. `0008_admin_query_indexes.sql` — backoffice query indexes
9. `0009_admin_business_records.sql` — customers, suppliers, and expenses
10. `0010_inventory_catalog_fields.sql` — SKU, barcode, cost, minimum-stock, and supplier fields; **must run after `0009`**

11. `0011_employee_workspace.sql` - employee directory, roles, attendance, payroll, and leave records
12. `0012_employee_id_login.sql` - first-login password-change flag and employee-code lookup index
13. `0013_current_stock_rpc.sql` - current stock aggregation RPC
14. `0014_latency_indexes.sql` - backoffice latency indexes
15. `0015_admin_navigation_latency.sql` - admin navigation indexes
16. `0016_p4_branch_workflows.sql` - branch workflow and clone metadata
17. `0017_product_images.sql` - public product photo bucket and admin storage policies
18. `0018_inventory_workflows.sql` - inventory workflow records and policies
19. `0019_manager_inventory_counts_read.sql` - manager inventory-count read access
20. `0020_order_actions.sql` - order action records and policies
21. `0021_product_price_audit.sql` - product price audit records
22. `0022_owner_signup.sql` - self-service store-owner workspace creation
23. `0023_store_access_and_subscriptions.sql` - staff access links and subscription tracking fields
24. `0024_shifts_and_z_readings.sql` - shifts and Z-reading records
25. `0025_premium_billing_plan.sql` - safely backfill organizations and enforce Premium-only billing
26. `0026_authenticated_append_only_hardening.sql` - remove authenticated UPDATE/DELETE access from orders, order items, stock movements, and audit logs; retain only SELECT/INSERT for POS flows
27. `0027_platform_operations.sql` - editable monthly/annual pricing options, platform billing/support policies, account suspension fields, and provider event idempotency storage
28. `0028_support_cases.sql` - service-role-only support cases, SLA due-time indexes, and platform support workflow storage
29. `0029_support_cases_privileges.sql` - remove inherited tenant grants from the service-role-only support-case table
30. `0030_suspended_account_rls.sql` — make active organization/store helper contexts unavailable to suspended users while preserving their own organization status row
31. `0031_enable_annual_billing_offers.sql` — make the default 1-, 2-, and 3-year pricing options visible to customers; the platform owner can still edit or disable them
32. `0032_admin_pin_discount_policy.sql` — enforce Admin PIN approval for above-threshold custom discounts
33. `0033_human_staff_login_slugs.sql` — add human-readable staff login routes
34. `0034_pos_void_manager_approval.sql` — add manager-approved POS void reversals
35. `0035_fix_shift_sequence_rls.sql` — fix shift sequence access for the authenticated POS path
36. `0036_temporary_qrph_checkout.sql` — record one-time QR Ph access periods and pending hosted checkout sessions
37. `0037_subscription_billing_variant.sql` — remember the selected local billing option for the current-plan display

38. `0038_trial_lifecycle_and_feedback.sql` — store trial dates and owner feedback
39. `0039_trial_feedback_workflow.sql` — add platform follow-up controls for trial feedback
40. `0040_platform_promotions.sql` — store global promotion codes and paid redemption history for checkout performance reporting
41. `0041_trial_expiry_access.sql` - persist expired trials as `paused`, remove expired tenant RLS context, and keep owner Billing/feedback access available
42–54. Display, admin offline/performance, employee access, platform grants, and referral migrations
55. `0055_online_ordering.sql` — public menu, online order settings, and customer order storage
56. `0056_online_order_pos_handoff.sql` — POS queue handoff fields and access
57. `0057_atomic_online_order_placement.sql` — atomic public order placement
58. `0058_lockdown_online_order_handoff.sql` — restrict queue handoff mutations
59. `0059_online_order_delivery.sql` — delivery fulfillment fields and settings
60. `0060_readable_online_order_numbers.sql` — readable customer order numbers
61. `0061_cashier_online_order_queue.sql` — cashier queue actions and status transitions
62. `0062_public_menu_subdomains.sql` — assign each active branch a unique customer-facing menu subdomain
63. `0063_online_ordering_protection.sql` — online availability, scheduling, pricing, and abuse-protection RPCs
64. `0064_rpc_contract_hardening.sql` — refresh PostgREST after hosted DDL and remove anonymous RPC execution
65. `0065_rpc_acl_normalization.sql` — remove inherited PUBLIC execution and restore application RPC grants
66. `0066_service_rpc_acl_fix.sql` — keep server-only RPCs unavailable to authenticated browser clients
67. `0067_verify_phone_rpc_acl_fix.sql` — keep phone-code verification service-role-only
68–74. Branch billing/entitlement, automatic shift reports, recipe inventory, and employee access migrations
75. `0075_extend_organization_trial.sql` — platform-owned trial extension: the `extend_organization_trial` RPC, the `platform_trial_extensions` ledger, and the lifetime cap on operator-added trial days
76. `0076_restrict_platform_trial_rpc.sql` — explicitly remove direct browser-role EXECUTE grants from both platform trial functions
77. `0077_platform_operators.sql` — service-role-only platform operator membership, role permissions, audited invite/reactivate/role-change/revoke RPCs, and final-owner protection
78. `0078_adjust_platform_access_grant.sql` — inline entitlement directory support, in-place grant adjustment, and a single before/after audit row
79. `0079_scope_admin_performance_to_organizations.sql` — preserve performance samples while attributing future authenticated samples to their server-resolved organization; legacy rows remain unattributed
80. `0080_sync_health_snapshots.sql` — retain the latest bounded POS, audit, and admin-mutation queue heartbeat per organization, branch, local terminal key, and queue; browser reads remain denied
81. `0081_sync_health_enhanced_metrics.sql` — add exact `stuck_count` and a monotonic, server-stamped `last_successful_sync_at` to the sync heartbeat without rewriting existing snapshots
82. `0082_admin_latency_scoping.sql` — split admin navigation timing into optional `ttfb_ms`, `transfer_ms`, and `browser_settle_ms`, and add branch-scoped read paths (`current_stock`/`current_inventory_stock` two-argument overloads, `admin_sales_period_totals`, `admin_products_top_items`, and a partial completed-orders index)
83. `0083_scoped_read_rpc_acl_hardening.sql` — restore the 0064/0065 invariant for RPCs added since: remove `public`/`anon` EXECUTE from the seven scoped read/count RPCs and make the unguarded `seed_default_employee_roles` writer service-role-only. ACL-only; no body, table, policy, or row changes
84. `0084_schema_drift_readout.sql` — service-role-only `platform_schema_migrations()` reader returning migration version and name (never the `statements` SQL text), so the console can compare the shipped migrations against the applied ledger

**Apply them** either way:
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
- **Dashboard:** SQL Editor → paste each file in order → Run

### Trial expiry verification

Run the deterministic boundary checks without a database:

```bash
npm run test:trial
```

After linking a project and applying migration `0041`, run the rollback-scoped
database smoke fixture:

```bash
npm run trial:validate
```

The checks cover the exact trial-end timestamp, persisted `paused` state,
tenant access denial, owner Billing access, and immediate access restoration
after a successful PayMongo activation. The SQL fixture inserts no lasting
rows.

### Trial extension verification

Run the deterministic bounds and eligibility checks without a database:

```bash
npm run test:platform-trial
```

After applying migrations `0075` and `0076`, run the rollback-scoped database smoke
fixture:

```bash
npm run platform:trial:validate
```

The checks cover the extension arithmetic for a live and a lapsed trial, the
ledger and audit rows, refusal of paying and ended subscriptions, refusal of a
pause that carries PayMongo provider records, revival of a trial-expired pause
including its tenant RLS context, suspension, the day and reason bounds, the
180-day lifetime cap, and that an authenticated tenant client cannot read
`platform_trial_extensions` or execute either platform trial function. The SQL
fixture inserts no lasting rows.

### Platform entitlement verification

Run the deterministic directory, filter, timeline, and migration-boundary checks:

```bash
npm run test:platform-entitlements
npm run test:rpc-contracts
```

After applying migration `0078`, run the rollback-scoped database smoke fixture:

```bash
npm run platform:entitlements:validate
```

The fixture adjusts one active grant forward and backward in place, asserts the
window arithmetic and exactly one before/after audit row per adjustment, refuses
an invalid shortening, verifies browser-role table/RPC denial, and rolls back all
fixtures. Then open `/platform/operations` as a platform operator and verify the
entitlement search/filter cards, inline controls, expiry signals, organization
timeline, and the existing grant/revoke flows against a deliberately selected
test organization. If exercising a real hosted grant, capture the end-date change
and the single `platform.access_grant.adjusted` audit row; do not use a service-role
key in the browser or task log.

### Platform operator verification

Run the role matrix and migration-boundary checks without a database:

```bash
npm run test:platform-operators
npm run test:rpc-contracts
```

After linking the intended project, preview and apply the migration through the
same CLI workflow used by the other platform changes:

```bash
npx --yes supabase@2.114.0 db push --linked --dry-run
npx --yes supabase@2.114.0 db push --linked --yes
```

Then sign in to `/platform` with a bootstrap owner, open **Operators**, and
invite an existing real second Auth account. Use that account to verify its
assigned role can read the console but only perform its documented mutations;
check the page after invite, role change, and revoke for the corresponding
audit entries. Revoke the disposable managed membership after the pass. Do not
put an Auth password or service-role key in the repository or task log.

### Platform audit verification

The cross-organization audit viewer is read-only and requires the same
server-side `console_read` platform-operator check as the rest of the console.
It reads only platform-actor events: `audit_logs` rows whose action matches
`platform.%` and the operator-membership audit table introduced by migration
`0077`. It does not query tenant order, customer, staff, or device activity.

Run the deterministic filter and query-boundary checks:

```bash
npm run test:platform-audit
npm run test:rpc-contracts
```

Against the linked project, run the read-only smoke:

```bash
npm run platform:audit:validate
```

Then open `/platform/audit` as a platform operator and verify search, source,
action, organization, and time-window filters, organization links, and the
expandable before/after snapshots. The smoke query performs no writes and does
not create fixtures. Migration `0077` must be applied for operator-membership
events to appear; organization platform events remain available independently.

### Platform fleet health verification

The fleet viewer is a read-only cross-organization performance surface. It
aggregates `admin_performance_samples` server-side into p50/p95 interaction
duration, error rate, sample freshness, and surface breakdowns. It does not
return raw tenant orders, customers, staff, devices, or other operational
records.

Run the deterministic viewer and contract checks:

```bash
npm run test:platform-fleet
npm run test:rpc-contracts
```

Preview and apply migration `0079` through the established linked workflow:

```bash
npx --yes supabase@2.114.0 db push --linked --dry-run
npx --yes supabase@2.114.0 db push --linked --yes
npm run platform:fleet:validate
```

The migration adds nullable `admin_performance_samples.org_id` plus its
organization index and requires future authenticated samples to use the
server-resolved profile organization when attribution is present. Null remains
allowed for rollout compatibility; existing samples are not backfilled or
deleted. The read-only smoke reports total, attributed, unattributed, error,
and latest-sample counts without creating fixtures.

Then open `/platform/fleet` as a platform operator. Check the `24h`, `7d`,
`30d`, and `60d` windows, organization search, status filter, organization
links, and expandable surface breakdowns. `Needs attention` begins at a 5% error
rate; `stale` means the latest sample is over 24 hours old; `no telemetry` means
there is no sample in the selected window. Existing hosted history may appear
under **Unattributed history** until new authenticated samples are collected.

### Platform sync and outbox health verification

The sync viewer is a read-only cross-organization surface at `/platform/sync`.
Because the POS and admin outboxes live in each browser's IndexedDB, active
terminals report only bounded counters for `POS orders`, `Audit events`, and
`Admin changes`; order, customer, staff, and mutation payloads never leave the
terminal. The server resolves the organization from the authenticated profile
and validates the branch before upserting the current heartbeat.

Run the deterministic aggregation and boundary checks:

```bash
npm run test:platform-sync
npm run test:rpc-contracts
```

Preview and apply migrations `0080` and `0081` through the established local or
linked workflow, then run the read-only smoke:

```bash
npx --yes supabase@2.114.0 db push --local --dry-run
npx --yes supabase@2.114.0 db push --local --yes
npx --yes supabase@2.114.0 db query --local --file scripts/platform-sync-health-smoke.sql --output json

npx --yes supabase@2.114.0 db push --linked --dry-run
npx --yes supabase@2.114.0 db push --linked --yes
npm run platform:sync:validate
```

The table has one current row per organization, branch, terminal key, and
queue, with `pending_count`, `failed_count`, `conflict_count`, exact
`stuck_count`, `oldest_pending_at`, `last_successful_sync_at`, `online`, and
server `recorded_at`. RLS allows only authenticated branch-scoped
insert/update; browser SELECT and DELETE are denied, while the platform reader
uses the service role. Existing data is not rewritten, backfilled, or deleted.
The smoke performs no writes and reports schema/constraint/trigger presence,
reporting stores/devices, current queue depth, stuck depth, failures,
conflicts, last success, and latest heartbeat.

Then open `/platform/sync` as a platform operator. Search by organization or
branch, select a queue, freshness, or health status, and expand a branch's
aggregate queue details. `Needs attention` means a failed/conflict item, an
offline reporter, or an exact stuck item; `stale` means no heartbeat for over
30 minutes; `no telemetry` means the active branch has not reported. The page
has no retry, delete, or tenant-data controls. A real POS or admin session will
populate its branch rows after the enhanced client is deployed and reports its
first heartbeat.

### Admin latency scoping verification

Migration `0082` serves two related goals. It splits the admin navigation
timing that Fleet Health reports, and it bounds the two heaviest admin reads so
that the latency being measured actually goes down.

The timing split is additive and optional. `admin_performance_samples` gains
nullable `ttfb_ms`, `transfer_ms`, and `browser_settle_ms`, each bounded to
0–120000 by its own check constraint. The reporting route treats them as
optional and retries the insert without them when a deployment has not yet
applied the migration, so telemetry never blocks on rollout order; the fleet
reader does the mirror of this on read and labels the split metrics unavailable
rather than failing. No URL, record ID, or tenant payload is added.

The read scoping is a set of branch-aware overloads. `current_stock` and
`current_inventory_stock` keep their one-argument signatures for existing
callers and gain `(p_org_id, p_store_id)` overloads, so Products and Inventory
no longer aggregate every branch's stock ledger to render one branch.
`admin_sales_period_totals` returns only the two period totals the Products
page needs instead of every order header and line item, and
`admin_products_top_items` adds the per-item order count that
`admin_sales_top_items` deliberately does not return, leaving the Sales page
contract unchanged. All four are `stable`, `security invoker`, and therefore
still bound by the caller's RLS; `current_inventory_stock` keeps its own
`auth_is_admin() or i.store_id = auth_store_id()` branch guard. The partial
index `orders_completed_org_store_created_idx` covers the completed,
non-reversal orders these reads scan.

Run the deterministic contract and aggregation checks:

```bash
npm run test:rpc-contracts
npm run test:platform-fleet
```

`scripts/rpc-contracts.test.ts` asserts both overload arities for
`current_stock` and `current_inventory_stock`, so a caller that drops back to
the unscoped signature is caught in CI.

Apply and verify through the established linked workflow:

```bash
npx --yes supabase@2.114.0 db push --linked --dry-run
npx --yes supabase@2.114.0 db push --linked --yes
npx --yes supabase@2.114.0 migration list --linked
```

A read-only check should report the three nullable timing columns with their
three check constraints, both arities of each stock function, the two new
Products RPCs with `authenticated` EXECUTE, and the partial orders index.
Existing samples are neither rewritten nor backfilled: rows recorded before the
migration keep null timing fields and remain valid for the overall P50/P95.

**Hosted state (2026-09-05).** `migration list --linked` reports local and
remote matching through `0082`, so the migration was already applied. The
read-only hosted check confirms `ledger_max` `0082`; `ttfb_ms`,
`transfer_ms`, and `browser_settle_ms` present as `integer` with 3 check
constraints; `org_id` still present from `0079`; all six function signatures
present, `stable`, `security invoker`, with `authenticated` EXECUTE — both
arities of `current_stock` and `current_inventory_stock` plus
`admin_sales_period_totals` and `admin_products_top_items`; and
`orders_completed_org_store_created_idx` created as the expected partial index.
The sample table holds 643 rows, unchanged from the pre-`0079` count, with 0
attributed and 0 carrying the new timing fields, latest
`2026-08-29T14:23:04`. That zero is expected rather than a defect: no
authenticated admin session has been recorded since before `0079` shipped, so
attribution and the timing split have had no traffic to capture. The first
authenticated admin navigation after this deployment is what fills them.

**Anon EXECUTE gap found during this pass, fixed by `0083`.** The close-out
smoke checks the anon boundary as well as the schema, and it found that
`0082` had repeated a mistake `0065` exists to prevent. `0065` removed
`PUBLIC`/`anon` EXECUTE from the application RPCs by enumerating them *by
name*. Functions created afterwards never inherited that hardening, and
overloads are separate functions, so the one-argument `current_stock` is
hardened while everything added since is not:

| RPC | Added by | anon EXECUTE before `0083` |
| --- | --- | --- |
| `current_stock(uuid)` | pre-`0065` | no — covered by `0065` |
| `current_stock(uuid, uuid)` | `0082` | yes |
| `current_inventory_stock(uuid)` | `0073` | yes |
| `current_inventory_stock(uuid, uuid)` | `0082` | yes |
| `inventory_item_expected_stock(uuid, uuid, timestamptz)` | `0073` | yes |
| `record_inventory_item_count(uuid, date, jsonb)` | `0073` | yes |
| `admin_sales_period_totals(...)` | `0082` | yes |
| `admin_products_top_items(...)` | `0082` | yes |
| `seed_default_employee_roles(uuid)` | `0049` | yes |

The read RPCs are not a data leak on their own. They are `security invoker`,
so the table grants from `0004`/`0026` still stop the call. A hosted probe
with the public anon key confirms this: `current_stock` and
`admin_sales_period_totals` both return HTTP 401 `42501 permission denied for
table stock_movements` / `orders`. The function ACL was the layer that failed;
the table ACL is what held.

`seed_default_employee_roles` is the real exposure, because `security
definer` bypasses exactly that table grant. It has no internal caller check,
and it inserts the four default employee roles for whatever `p_org_id` it is
given. Its only caller is the equally `security definer` trigger
`seed_default_employee_roles_on_organization`, which runs as the function
owner and so needs no EXECUTE grant on the role it invokes — there is no
application call site at all. `0083` makes it service-role-only.
`record_inventory_item_count` is also `security definer` but does guard
itself with `auth_is_admin()`, so it was defended in depth; it is hardened
anyway.

Verify the boundary before and after applying `0083`:

```bash
npm run admin:latency:validate
```

`anon_execute_boundary` must report `false` for all nine signatures once
`0083` is applied, and `anon_callable_rpc_count` should fall from 18.

**Hosted state (2026-09-05).** `0083` is applied. `ledger_max` is `0083`,
`anon_execute_boundary` is `false` for all nine signatures,
`anon_callable_rpc_count` is 10, and `authenticated` EXECUTE is retained on
all six scoped read functions. The anon probe that previously reached the table
now stops at the function: HTTP 401 `42501 permission denied for function
current_stock`. The live site, the `/menu/demo` public menu, and the
`/platform/fleet` login redirect were all re-checked afterwards and are
unaffected — the public menu reads stock through `current_stock` on the
service-role client, which `0083` grants explicitly. Note that the first push
attempt failed on an ambiguous `oid` across the joined catalogs and was
rejected atomically; qualifying it to `p.oid` and re-pushing applied cleanly.

**Not covered by `0083`, deliberately.** The same sweep found ten other
anon-executable non-trigger functions — the `auth_*` profile helpers,
`organization_has_current_access_grant`, `shift_variance_threshold`,
`build_staff_login_slug`, `staff_login_slug_part`, and
`subscription_access_is_current`. Several of these are invoked *inside* RLS
policies, and a policy that calls a function the querying role cannot execute
fails the whole query, so revoking them could break the anon-facing public menu
and staff-login routes. That needs its own policy-by-policy check and its own
verification pass rather than being folded into this one.

### Platform schema drift verification

The schema-drift surface at `/platform/schema` answers the question that has
been hand-typed into [tasks.md](tasks.md) after every hosted pass — "local X =
remote X" — by reading it off the database instead.

A note on the wording in the plan. Every organization shares one Postgres
database and is isolated by RLS, so there is exactly one migration ledger and
one applied position for the whole fleet. No organization can sit on a
different ledger position; the page states this rather than implying a
per-tenant ledger that does not exist. The per-organization dimension that
*is* real is whether the data a migration introduced actually reached each
tenant, which the page reports separately as backfill readiness.

The comparison has two sides, and the second is the one worth watching:

- **Pending** — a migration ships in this deployment but the database never
  applied it. The deployment is ahead, and everything depending on it is
  silently absent.
- **Unknown remote** — the database applied a version this deployment does not
  carry. That is an out-of-band apply or a migration file deleted after it
  shipped, and the next `db push` will compare against a ledger this build
  cannot explain.
- **Renamed** — the version matches but the name does not. Renaming a migration
  file after it is applied does not change the ledger row, so it is reported
  rather than treated as equal.

The list of migrations this deployment ships is generated, not hand-kept:

```bash
npm run schema:manifest   # regenerate src/lib/platform-schema-manifest.ts
npm run test:platform-schema
```

`scripts/platform-schema-drift.test.ts` fails when the generated manifest
drifts from `supabase/migrations`, so adding a migration without regenerating
is caught in CI rather than showing a false "in sync" on the console.

Apply and verify through the established linked workflow:

```bash
npx --yes supabase@2.114.0 db push --linked --dry-run
npx --yes supabase@2.114.0 db push --linked --yes
npm run platform:schema:validate
```

The smoke asserts the reader exists, that `anon` and `authenticated` cannot
execute it while `service_role` can, and that its return type does not include
`statements` — that column holds the full SQL text of every migration and is
never selected. It also reports the ledger position and the backfill counts the
page shows, and performs no writes.

Then open `/platform/schema` as a platform operator. It is read-only: there is
no apply, retry, or rollback control, by design. Fixing drift stays a
deliberate `db push` from a workstation.

Store owners can register from `/signup`. The flow uses Supabase Auth and the
`0022_owner_signup.sql` trigger to create a private organization, first branch,
and admin profile atomically. Set `NEXT_PUBLIC_SITE_URL` to the Vercel origin
and add `<your-site-origin>/auth/callback` to Supabase Authentication URL
Configuration Redirect URLs. If email confirmations are enabled, the owner
must confirm the email before opening the admin workspace.

**Connect the hosted project** (this project: ref `uzavkjftwcuixidxyopr`):
```bash
npx supabase login                                  # one-time browser flow
npx supabase link --project-ref uzavkjftwcuixidxyopr  # prompts for the DB password
npx supabase db push                                # applies all pending migrations in order
```
> `supabase db push` runs **migrations only** — never `seed.sql` (local-dev fixture data stays local). Never run `supabase db reset` against a hosted project.

### Hosted hardening verification — 2026-08-07

The hosted project (`uzavkjftwcuixidxyopr`) was checked before applying the
hardening migration. The four append-only tables had direct full DML grants for
`authenticated` (`arwdDxtm`), so the existing `0002` `GRANT SELECT, INSERT`
was not sufficient on the hosted default privilege configuration.

After applying `0026_authenticated_append_only_hardening.sql`, verify the
effective table privileges with the Supabase SQL Editor or the linked CLI:

```sql
select
  table_name,
  has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') as can_select,
  has_table_privilege('authenticated', 'public.' || table_name, 'INSERT') as can_insert,
  has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE') as can_update,
  has_table_privilege('authenticated', 'public.' || table_name, 'DELETE') as can_delete
from (values
  ('orders'),
  ('order_items'),
  ('stock_movements'),
  ('audit_logs')
) as tables(table_name)
order by table_name;
```

Expected result for every row: `can_select = true`, `can_insert = true`,
`can_update = false`, and `can_delete = false`. Confirm the migration history
also contains `0026`, then run the authenticated POS smoke paths: `place_order`
(sale + idempotent replay), `record_order_action` (void/refund reversal),
inventory movement/yield/count RPCs, and audit-log inserts. These RPCs remain
available because they only require the retained SELECT/INSERT table access
(or, for the reversal RPC, execute access to its `SECURITY DEFINER` function).

Hosted verification completed on 2026-08-07: `npx supabase db push --linked
--yes` applied pending `0025` and `0026`; the migration ledger contains both
versions. The privilege query returned `true, true, false, false` for all four
tables, and the RPC check returned `EXECUTE = true` for `place_order`,
`record_order_action`, `record_stock_movement`, `record_yield_entry`, and
`record_inventory_count`. A rollback-scoped authenticated smoke test passed
for sale/idempotent replay, void reversal, stock movement, yield, inventory
count, and their audit writes; post-test hosted counts remained 2 orders, 2
order items, 2 stock movements, and 8 audit logs, with zero smoke rows left.

Local verification also passed on 2026-08-07 after Docker was restarted. A
scoped clean rebuild of the local `pos` stack applied migrations `0001` through
`0026` and the seed fixture. The same privilege query returned
`true, true, false, false` for all four tables; all five POS RPCs retained
authenticated `EXECUTE`; and `node scripts/rls-fixture.mjs` passed all 18 RLS
assertions. A rollback-scoped local smoke test passed sale/idempotent replay,
void reversal, manual stock movement, yield, inventory count, and audit writes;
the final local fixture had no smoke orders or products and retained only its
expected fixture rows.

Hosted platform-operations verification completed on 2026-08-07: the linked
project now contains migrations `0027` through `0030`. Its seeded billing and
support policy rows are both `draft` version 1, so checkout, suspension, and
support mutations remain locked until the operator defines and publishes those
rules. The platform console reports the support-case table as unavailable until
`0028_support_cases.sql` and its privilege hardening are applied.

**Validate locally first (no account needed):** the CLI applies `supabase/migrations/` automatically when the local stack starts:
```bash
npx --yes supabase@latest start --exclude logflare,vector,storage-api,imgproxy,postgres-meta,studio
```
The `--exclude` list is required on Docker Desktop for Windows (analytics/storage/studio containers never become healthy there — see Troubleshooting). Result: API at `http://127.0.0.1:54321`, DB at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

> After applying, confirm RLS: every table in **Table Editor** should show "RLS enabled".

## 5. Seed the first org + users
Auth users are created through Supabase Auth (not raw SQL). Minimum to log in:
1. **Authentication → Users → Add user** (email + password) for the owner.
2. In SQL Editor, create the org, a branch, and the owner profile:
   ```sql
   insert into organizations (name) values ('Your Business') returning id; -- note org_id
   insert into stores (org_id, name, address) values ('<org_id>', 'Main Branch', '...') returning id; -- note store_id
   insert into profiles (id, org_id, store_id, full_name, role)
   values ('<auth.uid of owner>', '<org_id>', '<store_id>', 'Owner', 'admin');
   ```
3. Add products/categories for the branch (or via the backoffice once P6 lands).

## 6. RLS test fixture (do before building features — TEST_PLAN §1)
Create **2 orgs × 2 branches × {admin, cashier}** and assert isolation (see [TEST_PLAN.md](TEST_PLAN.md)). Run assertions as each user via the Supabase client with that user's JWT — not as the service role (which bypasses RLS).

**Automated** (local dev): `supabase/seed.sql` seeds 2 orgs × 2 branches, devices, and a per-branch menu (auto-applied on `supabase start` / `db reset`). Then:
```bash
node scripts/rls-fixture.mjs   # creates the 6 fixture users + profiles, asserts §1 (18 checks)
```
Fixture users: `admin-a|cashier-a1|cashier-a2@fixture.test` (Org Alpha) and `admin-b|cashier-b1|cashier-b2@fixture.test` (Org Beta), password `fixture123`. Admins are org-wide; cashiers are per-branch (matches the RLS model).

## 7. Printing (P3)
Browsers can't open raw TCP sockets, so LAN printing goes through a tiny local bridge:
```bash
node scripts/printer-bridge.mjs   # run on an always-on device on the printer's network
```
Then in the app: **🖨 → Network → printer IP + port 9100 → Bridge host → Test**. Receipts print automatically after each sale (52/58/80mm); failures show a non-blocking **Retry print** toast and never block the sale. Bluetooth (Web Bluetooth) and USB (WebUSB) transports are also implemented for Chrome/Android and Chrome/Edge respectively. Sale receipts include the VAT split (VAT-inclusive prices; SC/PWD sales VAT-exempt) and "THIS IS NOT AN OFFICIAL RECEIPT" until BIR registration.

The bridge listens on port `8787` by default. If it is changed, start it with `BRIDGE_PORT=<port>` and enter the same bridge port in POS printer settings.

### Printer validation command

Run the repeatable local preflight from the repository root. It starts a local bridge when needed, sends an ESC/POS slip, forces an unreachable-printer failure, then retries after bringing the TCP sink back:

```bash
npm run printer:validate:mock
```

For the store printer, use its LAN address. The bridge must already be running when it is on another device; a loopback bridge is started automatically if needed:

```bash
node --experimental-strip-types scripts/validate-printer.mjs --printer-ip 192.168.1.50 --bridge-host 192.168.1.20 --paper-width 80
```

A real-printer pass means the bridge acknowledged the ESC/POS bytes at `ip:port`; observe the physical slip and confirm the header, `PRINTER-TEST`, VAT, total, and non-official-receipt notice. Use `--skip-retry` only when the bridge is remote and the local failure/retry check cannot be run there.

## 8. Build & deploy
```bash
npm run build     # production build (also typechecks)
npm run start     # run the production build locally
```
**Deploy:** push to GitHub, import into Vercel, set env vars, deploy. Use a **separate Supabase project** for production vs. dev; apply the same migrations there and re-verify RLS with the fixture.

### Customer menu subdomains

The Vercel project should contain the wildcard domain `*.dumala.store`. Because
`dumala.store` is delegated to Vercel DNS, no separate wildcard DNS record is
needed in Cloudflare. Apply `0062_public_menu_subdomains.sql` before deploying
the application changes; it adds and backfills the branch subdomain column and
enforces uniqueness. Each branch can then choose its address from
**Admin → Online ordering → Custom menu address**. A link such as
`https://morning-ritual.dumala.store` is routed by Vercel to the branch menu,
while legacy `/menu/<staff-login-slug>` links continue to work.

If Vercel continues to show **Proxy Status Unknown** for the wildcard domain,
refresh it after the wildcard hostname has been tested. A working concrete
hostname and an HTTP 200 response from Vercel are the meaningful checks; do not
put Cloudflare’s orange-cloud reverse proxy in front of Vercel for this setup.

## 8. Project layout
```
src/
  app/            routes (/, layout, globals.css)  — /pos /admin /display land in later phases
  lib/
    money.ts      centavo helpers (INTERFACES §1)
    supabase/     client.ts (browser) · server.ts · middleware.ts (session helper)
  proxy.ts        session refresh + route guards (Next 16 proxy convention)
supabase/
  migrations/     0001_schema · 0002_rls · 0003_functions
docs/             all specs (PRD, MVP, SCHEMA, ARCHITECTURE, INTERFACES, UI_SPEC, TEST_PLAN, DESIGN_SYSTEM, tasks)
ui.png            design reference (color source for DESIGN_SYSTEM)
```

## 9. Troubleshooting
- **`supabase db reset` → auth returns `502 An invalid response was received from the upstream server`:** the reset restarts the auth container but kong keeps the old container IP. Fix: `docker restart supabase_kong_pos` (then rerun the fixture).
- **`supabase start` exits with `container is not ready: unhealthy` (analytics/storage/studio) on Windows:** those containers need the Docker daemon exposed on `tcp://localhost:2375`. Either enable that in Docker Desktop → Settings → General → "Expose daemon on tcp://localhost:2375 without TLS" (then restart Docker Desktop), or just run with the excludes above — the DB, auth, and REST API are all you need for local dev.
- **App runs but auth does nothing:** env vars unset — middleware no-ops by design until Supabase is configured (see `src/lib/supabase/middleware.ts`).
- **`permission denied for table ...`:** the `authenticated` grants in `0002_rls.sql` didn't run, or you're querying a table with no matching policy for that user.
- **Everything is visible across orgs:** you're using the service_role key (bypasses RLS). Test with real user JWTs.
- **Theme looks unstyled:** ensure `globals.css` is imported in `src/app/layout.tsx` and Tailwind v4 `@tailwindcss/postcss` is in `postcss.config.mjs`.
