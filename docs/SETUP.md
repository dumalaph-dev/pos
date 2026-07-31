# Lechon POS — Setup & Runbook

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
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **server only — never ship to client** |

`.env.local` is gitignored. Set the same vars in Vercel (Project → Settings → Environment Variables) for preview + production.

## 4. Database migrations
SQL lives in `supabase/migrations/` (run in order):
1. `0001_schema.sql` — tables, enums, indexes
2. `0002_rls.sql` — grants, helper functions, RLS policies, append-only triggers
3. `0003_functions.sql` — `clone_menu` (multi-branch)

**Apply them** either way:
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`
- **Dashboard:** SQL Editor → paste each file in order → Run

**Connect the hosted project** (this project: ref `uzavkjftwcuixidxyopr`):
```bash
npx supabase login                                  # one-time browser flow
npx supabase link --project-ref uzavkjftwcuixidxyopr  # prompts for the DB password
npx supabase db push                                # applies 0001–0003 in order
```
> `supabase db push` runs **migrations only** — never `seed.sql` (local-dev fixture data stays local). Never run `supabase db reset` against a hosted project.

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
   insert into organizations (name) values ('Rico''s Lechon House') returning id; -- note org_id
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

## 7. Build & deploy
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
