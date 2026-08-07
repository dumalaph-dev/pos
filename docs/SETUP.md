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
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only — never ship to client** |

`.env.local` is gitignored. Set the same vars in Vercel (Project → Settings → Environment Variables) for preview + production.

`EMPLOYEE_INITIAL_PASSWORD` is the common temporary password that the administrator gives to staff. It must be at least 8 characters and stays server-only; employees are forced to replace it after their first successful Employee ID login.

`PLATFORM_ADMIN_EMAILS` is a comma-separated, server-only allowlist for the platform operator console at `/platform`. It should contain only the operator account(s) that may view cross-business metrics.

## 4. Database migrations
SQL lives in `supabase/migrations/` (run in order):
The latest migrations add store staff access keys, subscription tracking, the single Premium billing plan, and append-only privilege hardening: `0023_store_access_and_subscriptions.sql`, `0024_shifts_and_z_readings.sql`, `0025_premium_billing_plan.sql`, and `0026_authenticated_append_only_hardening.sql`.
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

**Apply them** either way:
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
- **Dashboard:** SQL Editor → paste each file in order → Run

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
Then in the app: **🖨 → Network → printer IP + port 9100 → Bridge host → Test**. Receipts print automatically after each sale (58/80mm); failures show a non-blocking **Retry print** toast and never block the sale. Bluetooth (Web Bluetooth) and USB (WebUSB) transports are also implemented for Chrome/Android and Chrome/Edge respectively. Sale receipts include the VAT split (VAT-inclusive prices; SC/PWD sales VAT-exempt) and "THIS IS NOT AN OFFICIAL RECEIPT" until BIR registration.

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
