# Production backup and restore runbook

**Owner:** Dumala production operator
**Project:** Supabase `uzavkjftwcuixidxyopr`
**Last checked:** 2026-08-15 (Asia/Singapore)

## Verified posture

The linked Supabase CLI identifies the production project as `ACTIVE_HEALTHY` in `ap-southeast-2`, running Postgres `17.6.1.155`.

The read-only backup check returned, unchanged on 2026-08-15:

```json
{
  "walg_enabled": true,
  "pitr_enabled": false,
  "backups": [],
  "physical_backup_data": {}
}
```

Interpretation, corrected 2026-08-15 after the owner confirmed the **Free** plan:

- `backups: []` is literal. Supabase does not take automated backups on the Free plan, so there is **no managed recovery point of any kind** for this project.
- Point-in-Time Recovery is **disabled and unavailable**. PITR is a paid add-on sold on top of Pro; enabling it requires upgrading the plan first.
- `walg_enabled: true` is a platform-internal flag and must not be read as "backups exist". It does not produce a restore point the owner can use.
- The earlier instruction to confirm a restore point in `Database → Backups` still stands, but on Free that page is expected to be empty. Confirming it is how the owner verifies the gap rather than how they close it.

Enabling PITR, upgrading the plan, changing retention, or initiating a restore is an infrastructure and billing decision; it is intentionally not performed by the application repository.

**Until the plan is upgraded, the scripted logical backup below is the only recovery path that exists.** Run it before the pilot and on a schedule during it.

## No-cost logical backup (`npm run backup:production`)

`scripts/backup-production.mjs` exports every application table to NDJSON — one file per table, one JSON object per line — into a timestamped folder under `backups/` (gitignored; the rows are the store's entire ledger and must never be committed).

```bash
npm run backup:production
```

Write somewhere other than the working disk with `--out`:

```bash
node scripts/backup-production.mjs --out D:/dumala-backups
```

It reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`, never prints the key, and exits non-zero if any of `organizations`, `stores`, `products`, `orders`, `order_items`, `stock_movements`, `audit_logs`, `shifts`, or `z_readings` fails — a partial export is never reported as a recovery point. Each run writes a `manifest.json` with per-table row counts.

It reads through the API rather than `pg_dump` on purpose: `supabase db dump` runs pg_dump inside Docker, and neither Docker nor a native pg_dump is installed on the operator workstation. A backup that only runs when Docker cooperates is not a backup.

**Covered:** every row of all 35 application tables.

**Not covered, and why that is acceptable:**

| Excluded | Recovery path |
|---|---|
| Schema, functions, RLS policies | `supabase/migrations` in Git is the source of truth; replay it |
| `auth.users` | Re-provision employee logins through the Employees UI; `profiles` and `employee_records` preserve who each account belongs to |
| Storage objects (product images, display gallery) | Re-uploadable; bundled `/food` art ships in the repo |
| Project config, API keys, Auth/Realtime settings | Reconfigured by hand, as in any Supabase restore |

### Restore from a logical backup

1. Create the target Supabase project and record its ref.
2. Apply the schema: `npx supabase db push --linked`. Confirm the ledger matches the migration set the backup was taken against (`manifest.json` records the run timestamp; match it to the migration state in Git at that commit).
3. Load each `*.ndjson` **in the order listed in `manifest.json`** — it is ordered parents-first so foreign keys resolve. Insert with the service role key so RLS does not reject the load.
4. Append-only tables (`orders`, `order_items`, `stock_movements`, `audit_logs`, `z_readings`) are protected by triggers that block UPDATE and DELETE. Load them into an empty project; do not attempt to merge into a project that already holds rows.
5. Re-provision employee Auth users, then re-upload Storage objects.
6. Run the verification checklist in "Production restore steps" below before reopening the till.

### Backup cadence for the pilot

| When | Action |
|---|---|
| Before the pilot starts | One run, copied off the machine, restore rehearsed once into a scratch project |
| Each pilot day, after close | One run after the Z-reading, so a day's sales are never more than one shift at risk |
| Before any migration push | One run, so a bad migration is recoverable |

A backup that has never been restored is a hypothesis, not a backup. Rehearse step 1-5 once into a scratch project before the pilot week.

## Owner action before the pilot

The plan decides which of these applies. Step 1 is how you confirm which one you are in.

1. Open the production project in the Supabase Dashboard and check the plan under `Settings → Billing`, then open `Database → Backups`.

**If the project is on Free (its state as of 2026-08-15):**

2. Expect the Backups page to be empty. That is the platform behaviour on Free, not a fault to troubleshoot.
3. Decide the recovery point objective. Managed backups require upgrading to Pro (which adds daily backups at 7-day retention); PITR is a further paid add-on on top of Pro. Both are billing decisions and neither can be enabled from this repository.
4. Whether or not you upgrade, run `npm run backup:production` on the cadence in the table above — an upgrade only starts protecting you from the moment it is enabled, and PITR never protects against losing the project itself.

**Once the project is on Pro:**

5. Confirm daily backups show a current available restore point.
6. Open the Point-in-Time settings and enable PITR if the intended recovery point objective requires it.
7. Choose and record the retention period and the approximate recovery point objective in the incident contacts section below.
8. Capture the date/time of the latest visible recovery point in Singapore time and UTC.
9. Verify it took effect from the CLI — `pitr_enabled` should now read `true`:

```bash
npx supabase backups list --project-ref uzavkjftwcuixidxyopr
```

10. Store a screenshot or Dashboard export in the restricted operations folder; do not commit it to Git.

## Restore decision

Use the least disruptive option that meets the incident:

- **Restore to a new project first** for rehearsal, investigation, or when the current production database must remain available. Supabase can copy the database and Auth data, but Storage objects, API keys, Auth settings, Realtime settings, and other project configuration require separate verification/reconfiguration.
- **Restore the production project** only after the owner approves downtime and confirms the recovery timestamp. The project is inaccessible during the restore.

Database backups do not restore product images or display-gallery Storage objects. Keep the Storage bucket inventory and any irreplaceable assets separately recoverable.

## Production restore steps

1. Record the incident, the desired recovery timestamp, the last known-good order number, and the business date. Use UTC in the incident record and note the Singapore-local equivalent.
2. Pause store operations and notify the cashier/owner. Do not accept new sales while the target project is inaccessible.
3. In Supabase Dashboard, open `Database → Backups`. **On the Free plan this page is empty — there is no managed restore point.** Use "Restore from a logical backup" above with the most recent `backups/` run instead, and skip to step 7.
4. Select the closest daily backup before the target time, or select a valid point on the PITR timeline once PITR is enabled.
5. Review the warning, confirm the downtime window, and start the restore.
6. Wait for Supabase to report completion. Do not redeploy or run migrations during the restore.
7. Verify the project before reopening the till:
   - project is healthy and the application can authenticate;
   - migration ledger and required tables/functions are present;
   - RLS and authenticated access still match the production policy;
   - the latest known-good order and report totals are present;
   - product images and display-gallery assets are available in Storage;
   - Realtime/display pairing and device rows are intact;
   - Vercel production still points at the intended Supabase project.
8. Reconcile orders created immediately before the incident. Because offline orders are idempotent by `local_uuid`, do not manually duplicate a queued sale; allow the device to retry after the database is confirmed healthy.
9. Record the restore timestamp, validation results, missing assets, and any manual corrections. Reopen operations only after the owner signs off.

## Optional Management API check

With a short-lived Supabase access token that has backup permissions, list available backups without printing the token:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<short-lived-token>"
$projectRef = "uzavkjftwcuixidxyopr"
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN" } `
  -Uri "https://api.supabase.com/v1/projects/$projectRef/database/backups"
```

Only call the PITR restore endpoint after the owner approves the exact Unix recovery timestamp and downtime. The Supabase Dashboard remains the preferred path because it presents the recovery window and confirmation warning.

## Incident contacts and decisions

Fill this section in the restricted operations copy, not in the public repository:

| Item | Value |
|---|---|
| Supabase project owner | |
| Recovery point objective | |
| Recovery time objective | |
| Latest confirmed restore point (Singapore) | |
| Latest confirmed restore point (UTC) | |
| Supabase escalation contact | |
| Dumala operations contact | |
| Last restore rehearsal | |
