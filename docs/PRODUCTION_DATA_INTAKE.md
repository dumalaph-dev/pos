# Production menu and staff data intake

The live database still contains historical QA records. Real menu/staff data has not been supplied in the repository or workspace, so no QA catalog or employee records are deleted or overwritten by this change.

Current hosted QA snapshot (read-only, 2026-08-12): the active QA product is `Codex Image QA Product 20260806` (`CODEX-IMG-20260806`, PHP 123.45); `QA Weight Item 20260811` is already inactive. `EMP-0003` (`Codex QA Employee 20260808`) and `EMP-0004` (`Codex QA Approver 20260808`) are inactive. `EMP-0001` (Klein, admin) and `EMP-0002` (Juan Dela Cruz, cashier) are active and must not be changed as part of the QA cleanup without an explicit owner-approved replacement list.

## Menu intake template

Provide one row per real sellable product and one category name per category. Prices are entered in Philippine pesos in the handoff, then validated in the app/database as integer centavos.

| Field | Required | Notes |
|---|---:|---|
| `category` | yes | Exact category name; create/order categories first |
| `name` | yes | Customer-facing menu name |
| `sku` | recommended | Unique branch/org SKU or barcode |
| `pricing_mode` | yes | `fixed` or `per_kg` |
| `price_php` | yes | Positive price, two decimal places |
| `unit` | yes | `piece`, `order`, `kg`, etc. |
| `track_stock` | yes | `true` or `false` |
| `opening_stock` | conditional | Quantity and unit when stock is tracked |
| `min_stock` | conditional | Low-stock threshold |
| `image_reference` | optional | Approved existing asset or separately supplied Storage asset |
| `sort_order` | recommended | Menu tile order |

Before import, the owner approves a price sheet and confirms whether prices are organization-wide or branch-specific. Never use the QA product as a price placeholder for a real item.

## Staff intake template

Provide this through a restricted channel or a private password manager entry. Do not commit the completed file.

| Field | Required | Notes |
|---|---:|---|
| `full_name` | yes | Legal/display name |
| `employee_id` | yes | Unique Employee ID used at login |
| `email` | yes | Account invitation/login address |
| `role` | yes | `admin`, `manager`, or `cashier` |
| `branch` | yes | Exact branch assignment |
| `job_title` | recommended | Operations title |
| `schedule` | optional | Working days and start/end times |
| `pin_delivery` | yes | `set-in-admin` or `private-one-time-delivery`; never put the digits here |
| `initial_password_delivery` | yes | Private one-time delivery; force change at first sign-in |

PINs are secrets. Use the Admin employee flow to set or rotate them; only the salted/hashed verifier belongs in the database. Do not place raw PINs in CSV, Git, Vercel variables, monitoring logs, screenshots, or this document.

## Safe replacement runbook

1. Export or record the current production counts and take the owner-approved backup checkpoint.
2. Import/create real categories, products, prices, units, opening stock, and approved images.
3. Create real employees and assign branch/role access. Test each account with a forced password change and the correct branch scope.
4. Open `/pos` online on each terminal to refresh the catalog cache. Verify prices and per-kg behavior against the approved price sheet.
5. Run one approved real-menu sale and reconcile the receipt, Orders, and Reports views.
6. Archive the active disposable QA product (`Codex Image QA Product 20260806`) after confirming no operational dependency remains. Preserve its historical orders and audit records; leave the already-inactive `QA Weight Item 20260811` inactive.
7. Keep `EMP-0003` and other disposable QA employees inactive; do not reuse their Employee IDs or PINs for real staff.
8. Confirm there are no QA items in the active POS catalog, no QA accounts can sign in, and no pending offline outbox rows remain on the devices.

Deletion is not part of the replacement step: historical orders, reversals, reports, and audit rows are evidence and must remain intact. Archive/deactivate only the exact QA records after the owner approves the final list.

## Owner handoff required

The import gate is blocked only on the approved real menu/price sheet and the secure staff account/PIN handoff. Once those are supplied, use this runbook, record the before/after counts, and update `docs/tasks.md` with the date and acceptance evidence.
