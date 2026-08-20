# Production monitoring runbook

**Last updated:** 2026-08-12

Dumala POS does not require a paid third-party error-monitoring service. Production diagnostics use three layers:

1. **Vercel runtime errors:** `src/instrumentation.ts` emits a structured `server_request_error` event to stderr for Next.js request, render, action, or proxy failures. Vercel runtime logs can therefore show the path, method, route, error message, and digest.
2. **Application and browser diagnostics:** `src/lib/monitoring.ts` reports handled boundary errors and sync failures to the server log or browser console with a small context object. This is useful during support and device troubleshooting; it does not send data to an external paid service.
3. **Offline sync alerts:** order and audit outbox failures are counted, retried with backoff, shown in the POS sync pill, and made actionable with retry guidance. Repeated identical failures are deduplicated for five minutes so a disconnected till does not flood the console.

Run `npm run production:preflight` before a production deployment. It checks the production Supabase/site identity and, with the remote check enabled by the npm script, probes the live root, manifest, and service-worker endpoints. For a branch with online ordering enabled, also pass its public slug so the customer route and POS-install exclusion are checked:

```text
node scripts/production-preflight.mjs --remote --menu-slug dumala-main
```

The public-menu check confirms HTTP 200, the public menu shell, and the absence of the `Install Dumala PWA` label. It does not place an order or mutate production data. The preflight does not require a third-party monitoring account.

## Vercel production setup

1. Open the Dumala project in Vercel and open its production **Logs** view.
2. Confirm the production deployment is connected to the expected GitHub repository and production domain.
3. Configure the Vercel log access, retention, and notification options available on the current plan. Route actionable alerts to the owner/operator channel and assign one person to acknowledge them during the pilot week.
4. After deployment, open the production logs and confirm that a normal request does not emit a `server_request_error` event.
5. Exercise an intentional error only in a local or preview environment. Do not throw a test error in the live checkout.

Useful events to watch for include repeated `server_request_error` records, elevated Function/Runtime error rates, and handled `offline-sync` failures. Keep production and Preview environment variables separate; do not put employee PINs, payment secrets, full customer data, or Supabase service-role keys into logs or error context.

## Sync-failure response

1. Read the POS sync pill and note whether the pending count is an order queue, audit queue, or both.
2. Check the network and Supabase/Vercel status; use **Sync** once the connection is stable.
3. Do not clear browser storage or sign out while the pending count is non-zero.
4. Record the terminal, branch, local time, pending count, and the visible error message. Never record the offline PIN itself.
5. Escalate if the queue remains pending after the connection is healthy or if the same failure repeats across devices.

## Local verification

Use these checks before handoff:

```text
npm run typecheck
npm run lint
npm run build
npm run production:preflight
```

The build should succeed without third-party monitoring packages or monitoring environment variables. The production gate is still incomplete until Vercel log access/notifications and the physical device pilot checklist are confirmed by the owner.
