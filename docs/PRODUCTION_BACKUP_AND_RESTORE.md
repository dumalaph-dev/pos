# Production backup and restore runbook

**Owner:** Dumala production operator
**Project:** Supabase `uzavkjftwcuixidxyopr`
**Last checked:** 2026-08-12 (Asia/Singapore)

## Verified posture

The linked Supabase CLI identifies the production project as `ACTIVE_HEALTHY` in `ap-southeast-2`, running Postgres `17.6.1.155`. The migration ledger is synchronized through `0043`.

The read-only backup check returned:

```json
{
  "walg_enabled": true,
  "pitr_enabled": false,
  "backups": [],
  "physical_backup_data": {}
}
```

Interpretation:

- The physical backup/WAL-G pipeline is enabled.
- Point-in-Time Recovery (PITR) is currently **disabled**.
- The CLI returned no listed backup entries, so the Dashboard `Database → Backups` page still needs an owner-level confirmation before the pilot.
- Do not claim the backup gate is green until a current restore point is visible in the Dashboard.

PITR is a paid Supabase add-on and requires a suitable compute size. Enabling it, changing retention, or initiating a restore is an infrastructure/billing decision; it is intentionally not performed by the application repository.

## Owner action before the pilot

1. Open the production project in the Supabase Dashboard.
2. Open `Database → Backups` and confirm that daily/physical backups have a current available restore point.
3. Open the Point-in-Time settings and enable PITR if the intended recovery point objective requires it.
4. Choose and record the retention period and the approximate recovery point objective in the incident contacts section below.
5. Capture the date/time of the latest visible recovery point in Singapore time and UTC.
6. Store a screenshot or Dashboard export in the restricted operations folder; do not commit it to Git.

## Restore decision

Use the least disruptive option that meets the incident:

- **Restore to a new project first** for rehearsal, investigation, or when the current production database must remain available. Supabase can copy the database and Auth data, but Storage objects, API keys, Auth settings, Realtime settings, and other project configuration require separate verification/reconfiguration.
- **Restore the production project** only after the owner approves downtime and confirms the recovery timestamp. The project is inaccessible during the restore.

Database backups do not restore product images or display-gallery Storage objects. Keep the Storage bucket inventory and any irreplaceable assets separately recoverable.

## Production restore steps

1. Record the incident, the desired recovery timestamp, the last known-good order number, and the business date. Use UTC in the incident record and note the Singapore-local equivalent.
2. Pause store operations and notify the cashier/owner. Do not accept new sales while the target project is inaccessible.
3. In Supabase Dashboard, open `Database → Backups`.
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
