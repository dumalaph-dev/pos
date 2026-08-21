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

`PLATFORM_ADMIN_EMAILS` is a comma-separated, server-only allowlist for the platform operator console at `/platform`. It should contain only the operator account(s) that may view cross-business metrics.

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
