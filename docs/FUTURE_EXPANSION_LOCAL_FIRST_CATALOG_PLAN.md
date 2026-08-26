# Future Expansion Plan: Local-First Catalog, Barcode, and Large-SKU POS

**Status:** Parked for future expansion; no implementation is implied by this document

**Date:** 2026-08-25

**Product:** Dumala POS

**Primary constraint:** Supabase Free tier during the pilot and early rollout

## 1. Decision summary

Dumala should expand from a small, image-led food POS into a shared POS engine that can support restaurants, sari-sari stores, groceries, convenience stores, pharmacies, and other high-SKU businesses.

The underlying product, inventory, order, and branch model should remain shared. The experience should change through business-vertical defaults and catalog presentation settings:

- Food businesses should default to an image grid or hybrid catalog.
- Grocery, convenience, and pharmacy businesses should default to a compact, name-first, barcode-first catalog.
- Product photos should be optional for all verticals.
- Barcode lookup should happen locally on the device and must not query Supabase per scan.
- Product metadata should be cached locally in IndexedDB/Dexie.
- Supabase should remain the authoritative shared copy for synchronization, reports, audit, and multi-device recovery.
- Product images should be compressed in the browser before upload, stored once, and loaded lazily.

This is local-first, not local-only. Data that must support reporting, branch synchronization, recovery, and audit still belongs on the server.

## 2. Goals

This expansion should allow the POS to:

1. Register and sell products by barcode.
2. Operate barcode lookup while the tablet is offline.
3. Import 1,000 or more products without submitting one server request per product.
4. Support products with no photo without creating a degraded or confusing POS experience.
5. Keep product metadata small enough for reliable local caching and delta synchronization.
6. Keep image storage and bandwidth within the Supabase Free-tier budget during the pilot.
7. Support branch-owned prices and inventory while allowing the same packaged product barcode in multiple branches.
8. Provide pharmacy-ready foundations without pretending that a barcode alone solves lot, expiry, prescription, or regulatory requirements.

## 3. Explicit non-goals

The first expansion should not attempt to:

- Automatically create a product from an unknown barcode without an owner-approved name, price, unit, and category.
- Depend on a third-party product database for every scan.
- Make product photos mandatory.
- Download every product image to every POS device.
- Create a separate Supabase project for every store or customer.
- Build a complete pharmacy regulatory or prescription workflow in the barcode slice.
- Store patient information in the product catalog or barcode payload.
- Replace the current offline-first sale and immutable order model.

## 4. Current foundation and gaps

### Already present

- `products.barcode` and `products.sku` already exist.
- Product create, edit, and CSV import forms already accept barcodes.
- POS sales use a Dexie outbox and sync to Supabase after the sale is completed.
- The branch catalog, profile, settings, and stock snapshot are already cached locally.
- Offline PIN unlock already protects the cached POS context.
- Admin read models already cache receipts, shifts, inventory, variance, and audit data.
- Inventory movements and physical counts already have an offline mutation outbox.
- Product images are already optimized in the browser before upload.
- Uploaded image storage already uses a long cache-control period.

### Gaps to resolve

- POS does not currently fetch `barcode` into its runtime product type.
- POS search currently focuses on product names rather than exact barcode lookup.
- The local catalog is currently stored as JSON snapshots rather than indexed product rows.
- Catalog/product mutations are not yet part of the admin offline mutation outbox.
- The current image limit is generous for a shared Free-tier project.
- The POS currently eagerly loads product images, which is not appropriate for a 1,000+ SKU catalog.
- Barcode uniqueness is currently organization-wide even though products and prices are branch-owned.
- The POS has no business-vertical catalog presentation mode.

Relevant current files:

- [`src/lib/offline.ts`](../src/lib/offline.ts) — Dexie catalog cache and POS outbox.
- [`src/components/pos/usePosSync.ts`](../src/components/pos/usePosSync.ts) — queued sale/audit synchronization.
- [`src/lib/admin/local-first-store.ts`](../src/lib/admin/local-first-store.ts) — admin read models and mutation outbox.
- [`src/components/admin/ProductImageUpload.tsx`](../src/components/admin/ProductImageUpload.tsx) — browser-side image optimization.
- [`src/lib/admin/image-storage.ts`](../src/lib/admin/image-storage.ts) — server-side validation and Storage upload.
- [`src/components/pos/SellScreen.tsx`](../src/components/pos/SellScreen.tsx) — current POS product rendering and image loading.
- [`supabase/migrations/0010_inventory_catalog_fields.sql`](../supabase/migrations/0010_inventory_catalog_fields.sql) — current SKU/barcode fields and indexes.
- [`supabase/migrations/0016_p4_branch_workflows.sql`](../supabase/migrations/0016_p4_branch_workflows.sql) — current menu-clone behavior.
- [`supabase/migrations/0017_product_images.sql`](../supabase/migrations/0017_product_images.sql) — product image bucket and policies.

## 5. Business verticals and catalog presentation

The product catalog should not be split into separate implementations for pharmacies, groceries, and restaurants. Instead, add a business vertical and a presentation policy.

### Proposed settings

Initially these can live inside the existing branch `settings.pos_config` JSON. A separate table is only needed if reporting or platform-level configuration requires it later.

```text
business_vertical:
  restaurant | cafe | bakery | sari_sari | grocery | convenience | pharmacy | other

catalog_display_mode:
  auto | image_grid | compact_list | hybrid

product_image_policy:
  optional | recommended | disabled
```

### Default behavior

| Vertical | Default layout | Image policy | Primary interaction |
|---|---|---|---|
| Restaurant / cafe | Image grid | Recommended | Tap product tile |
| Bakery / specialty food | Hybrid | Recommended | Tap tile or search |
| Sari-sari store | Hybrid or compact list | Optional | Search, tap, or scan |
| Grocery / convenience | Compact list | Optional | Scan or search |
| Pharmacy | Compact list | Optional | Scan or search by name/strength |
| Other | Auto | Optional | Owner-configured |

`auto` should use the branch catalog as a signal. A large active catalog, low photo coverage, or many barcode-enabled products should move the POS toward compact list mode. The owner must always be able to override the automatic choice.

### High-SKU POS behavior

For pharmacy, grocery, and convenience catalogs:

```text
Barcode → product name → strength/size/unit → price → stock
```

The POS should show a placeholder when no image exists. Scanning must never wait for or require an image request. Images should appear only in visible rows, optional tiles, or product details.

## 6. Product and inventory model

### Core product

Keep the current `products` table as the sellable SKU record. It should contain compact fields needed by the POS:

- `id`
- `store_id`
- `category_id`
- `name`
- `price`
- `pricing_mode`
- `unit`
- `track_stock`
- `is_active`
- `image_url` nullable
- `updated_at`

The barcode should remain text so leading zeroes are preserved.

### Multiple barcodes

The existing `products.barcode` field is acceptable as a primary-barcode migration step. For pharmacy and grocery expansion, introduce a separate `product_barcodes` table:

```text
product_barcodes
  id
  org_id
  store_id
  product_id
  code
  normalized_code
  code_type          -- primary, alternate, internal, pack, case
  unit_multiplier    -- optional, for pack/case workflows
  is_active
  created_at
```

The unique lookup key should be `(org_id, store_id, normalized_code)`. The same packaged barcode must be allowed in separate branches because the current product model is branch-owned and branch prices may differ.

Before applying this change, run a duplicate audit for existing barcodes. The old organization-wide index and clone behavior were designed to keep codes globally unique; they need to be updated for the branch-owned model.

### Pharmacy-specific inventory follow-up

Barcode registration should not be used as a substitute for pharmacy inventory controls. A later pharmacy slice should add:

- lot or batch number
- expiry date
- quantity per lot
- cost per lot
- receive/adjust/waste history by lot
- FEFO-style operational picking support where appropriate
- optional generic name, brand name, strength, dosage form, and pack size
- an explicit prescription-required operational flag, subject to product and legal review

These should be separate inventory and product-attribute concerns, not encoded in product photos.

## 7. Local-first catalog architecture

### Server and device responsibilities

```text
Supabase canonical catalog
        │ initial snapshot / compact delta
        ▼
Device IndexedDB catalog tables
        │
        ├── barcode map → cart and sale
        ├── local search → product selection
        └── mutation outbox → batched server sync
```

### Replace the JSON catalog snapshot

The current cache stores product arrays as JSON. For high-SKU catalogs, move to versioned Dexie tables:

```text
local_products
local_product_barcodes
local_categories
local_catalog_sync
local_product_media_cache   -- optional metadata only; image bytes remain best-effort cache
product_mutation_outbox
```

Recommended indexes include:

- scoped normalized barcode
- scoped SKU
- normalized name
- category
- active status
- `updated_at`

The local database should store all compact product metadata for the current branch. It should not download or parse image binaries as part of the catalog metadata snapshot.

### Exact local lookup

When the catalog loads, build an in-memory map or query the indexed local table:

```text
normalize scanned code
find current branch product
add fixed item to cart
or open weight entry for per-kg item
```

Unknown barcodes should show a clear registration/search action. The scan handler must not make a server request just to determine whether the code exists.

### Catalog synchronization

Add a branch catalog version or cursor based on `updated_at` plus tombstones for deactivated records.

- Initial device setup: one compact branch catalog snapshot.
- Normal reconnect: only added, changed, and deactivated rows.
- Product registration: update local tables immediately, then queue the server mutation.
- Branch switch or sign-out: clear or replace the scoped local data.
- New local product before reconnect: sync the product mutation before sales that reference its product ID.

## 8. Bulk product registration

The pharmacy and grocery onboarding path should be import-first, not form-first.

### Local import flow

1. Select a CSV or spreadsheet export on the owner/admin device.
2. Parse it in the browser.
3. Validate locally:
   - required name, unit, price, and branch
   - barcode normalization
   - duplicate barcodes within the branch
   - duplicate SKU values
   - valid pricing mode
   - valid category and supplier references
4. Display row-level errors before upload.
5. Stage valid rows in IndexedDB.
6. Allow the admin to review and edit staged rows.
7. Submit idempotent batches of approximately 200–500 rows.
8. Return only accepted counts, rejected row numbers, and conflict messages.
9. Mark successful local rows as synced.

### Server import contract

Use a bounded authenticated RPC or server endpoint rather than one Server Action per row.

Each batch should carry:

- `import_id`
- `batch_number`
- actor and branch scope
- client-generated product IDs
- row-level idempotency keys
- compact product fields only

The server must validate organization, branch, role, barcode uniqueness, and product ownership. Replaying the same batch must not create duplicate products.

Product photos should be uploaded separately and only after the metadata import is accepted. A product import must not fail just because a photo is absent.

## 9. Supabase Free-tier image plan

The Supabase Free plan currently includes 1 GB of file storage, 500 MB of database size, and 5 GB each of cached and uncached egress. These are project-level constraints shared by the stores and organizations in the project. See the [Supabase pricing page](https://supabase.com/pricing), [billing documentation](https://supabase.com/docs/guides/platform/billing-on-supabase), and [egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

Supabase image resizing/transformations are currently enabled for Pro and above, so the Free-tier design should not depend on runtime Supabase transformations. See [Supabase Storage image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations).

### Current implementation

The current uploader already:

- resizes in the browser
- attempts WebP first
- falls back to JPEG
- does not upload the original file
- caps the optimized file at approximately 900 KB
- stores the uploaded file under the organization path
- applies a one-year cache-control policy

The 900 KB cap is too high for a shared Free-tier project. At that maximum, 1,000 images could consume roughly 900 MB before display-gallery assets, replacements, or orphaned files are considered.

### Revised image policy

For product photos:

- WebP first.
- JPEG fallback only when WebP encoding is unavailable.
- Maximum dimension: 640–800px.
- Target average size: 100–150 KB.
- Hard maximum size: 250 KB.
- No original upload retained.
- One active stored image per product.
- Product images optional.
- No separate full-size and thumbnail variants on the Free tier.
- Keep long cache-control for immutable image paths.
- Delete the previous file on replacement.
- Periodically identify and remove orphaned storage objects.

For 1,000 products, a 250 KB hard maximum is approximately 250 MB. This leaves useful headroom for product metadata, display-gallery images, and other organizations. It is still not safe to promise a 1,000-photo catalog for every customer on one Free-tier project without an application-level quota.

### Image loading policy

The device should cache product metadata for every active SKU, but image loading should be demand-driven:

- Load images only for visible rows or tiles.
- Lazy-load below-the-fold images.
- Do not eagerly load all images in a high-SKU catalog.
- Do not request an image during barcode lookup.
- Use a neutral placeholder when there is no image.
- For pharmacy/grocery mode, prefer compact list view by default.

The current POS image rendering uses eager loading and should be revised before a 1,000+ SKU rollout.

### Quota policy

Add project-aware and organization-aware media limits:

- Reserve 20–30% of the project file-storage quota as safety headroom.
- Track active product image bytes by organization.
- Include display-gallery assets in the same budget.
- Show storage usage and remaining quota in admin settings.
- Block new uploads before the project is at risk.
- Explain that removing an image does not remove the product.
- Offer an upgrade or external media-storage path when the Free-tier budget is exhausted.

## 10. POS presentation and image behavior

### Image-led mode

For restaurants, cafes, bakeries, and small food catalogs:

- use image grid as the default
- show prominent product tiles
- keep search and barcode support available
- lazy-load lower rows
- allow products without images to use branded placeholders

### Metadata-first mode

For pharmacies, groceries, convenience stores, and other high-SKU catalogs:

- use compact list mode by default
- make barcode scan and search prominent
- show name, strength/size, unit, price, and stock
- keep the image column optional or hidden
- support category filters and fast keyboard input
- do not make a product photo part of registration requirements

### Hybrid mode

Hybrid mode can show the first visible products as tiles while retaining a dense list/search experience. This is useful for sari-sari stores with a mixed catalog of packaged goods and prepared items.

## 11. Sync, conflicts, and security

- Keep one shared multi-tenant Supabase project during the pilot.
- Continue enforcing organization and branch isolation with RLS.
- Scope every local cache and outbox record by user, organization, branch, and device where applicable.
- Normalize barcodes for lookup while preserving the original display value.
- Do not allow a barcode lookup to search across branches when the POS is branch-bound.
- Make product imports and product changes auditable.
- Do not log every scan or raw barcode unless there is a specific operational need.
- Use client-generated product IDs for offline registration.
- Sync catalog mutations before orders that depend on newly created products.
- Show conflicts to an admin instead of silently overwriting price, barcode, or branch ownership.
- Keep sensitive pharmacy workflows online-authoritative until their conflict and authorization rules are explicitly defined.

## 12. Implementation phases

### Phase 0 — Decision and measurement

- Approve the vertical/presentation model.
- Confirm Free-tier storage and egress budgets.
- Record current catalog payload sizes and image loading behavior.
- Audit existing barcode duplicates and image storage objects.
- Define the first pilot vertical: grocery, pharmacy, or convenience.

### Phase 1 — Barcode-ready POS

- Include barcode in the POS product query and `PosProduct` type.
- Add exact local barcode lookup.
- Add keyboard-wedge scanner support.
- Add scan-to-register to the existing product editor.
- Handle fixed-price and per-kg products correctly.
- Add unknown-barcode feedback.
- Change high-SKU image loading from eager to lazy.
- Add compact list mode behind a feature flag.

### Phase 2 — Local catalog tables and delta sync

- Replace the JSON catalog snapshot with indexed Dexie tables.
- Add `updated_at`/catalog versioning and tombstones.
- Add local barcode and SKU indexes.
- Add compact catalog projections.
- Implement reconnect delta synchronization.
- Preserve current sign-out, branch-scope, and cache-cleanup protections.

### Phase 3 — Bulk registration

- Add browser-side CSV/spreadsheet validation.
- Stage import rows locally.
- Add idempotent batched product-import RPC.
- Add resumable progress and row-level error reporting.
- Sync product mutations before dependent sales.
- Keep product imports restricted to admin/manager roles.

### Phase 4 — Free-tier image controls

- Reduce product image limit from 900 KB to a 250 KB hard maximum.
- Reduce maximum image dimension to 640–800px.
- Keep WebP-first client-side processing.
- Add storage usage accounting and quotas.
- Add orphaned-image cleanup.
- Make product image optional in every vertical.
- Add image usage metrics without logging sensitive product data.

### Phase 5 — Pharmacy and advanced inventory

- Add multiple barcodes per product.
- Add lot/expiry inventory records.
- Add pharmacy-specific product attributes.
- Define operational controls for prescription-required items.
- Add expiry and recall reports.
- Complete separate legal/compliance review before marketing pharmacy-specific compliance claims.

### Phase 6 — Scale decision

Move beyond the Free-tier media strategy only when measured usage justifies it:

- upgrade Supabase storage/egress plan, or
- move media to a dedicated object-storage/CDN provider while keeping product metadata and transactional data in Supabase.

The product model should keep `image_url` provider-neutral so this transition does not require a catalog rewrite.

## 13. Acceptance criteria

### Local-first catalog

- A device can cache at least 1,000 compact product records for its branch.
- A known barcode resolves offline without a network request.
- A barcode scan does not require a product image to be present.
- A price change made while offline preserves the existing order price snapshot.
- A reconnect downloads only catalog changes after the device’s cursor.

### Bulk import

- An import of 1,000 products does not produce 1,000 individual server submissions.
- Duplicate barcodes are reported before or during import.
- Replaying an import batch does not create duplicates.
- A failed batch can resume without restarting the entire import.
- The user receives row-level errors and a final accepted/rejected count.

### Image and Free-tier protection

- Original photos never reach Supabase Storage.
- New product images are WebP-first and below the hard size limit.
- Product image uploads stop before the project-level budget is exhausted.
- High-SKU POS mode does not eagerly request all product images.
- Replacing an image removes the previous active object.
- An image-less product remains fully sellable and searchable.

### Vertical presentation

- Restaurants can use image grid mode.
- Pharmacy/grocery catalogs default to compact list mode.
- Owners can override the default mode.
- The underlying product and inventory records remain compatible across modes.

### Security and operational correctness

- Barcode lookups cannot cross branch or organization boundaries.
- Only authorized roles can register or change products.
- Offline catalog mutations are auditable and conflict-visible.
- Product synchronization occurs before dependent order synchronization.
- Sign-out removes scoped private local data according to the existing cache policy.

## 14. Metrics to add before rollout

Track aggregate operational metrics, not raw customer/product data:

- local barcode scans
- unknown barcode count
- local barcode lookup latency
- catalog snapshot bytes
- catalog delta bytes
- catalog sync frequency
- product import batch size and failure rate
- pending catalog mutations
- product image upload bytes
- average and p95 product image size
- active image storage bytes
- orphaned image count
- image request count by POS mode
- cached versus uncached image delivery where available

These measurements will tell us whether the Free tier remains viable and which limit is actually binding: storage, egress, database size, or operational complexity.

## 15. Final recommendation

Park the expansion as a shared platform capability, not a separate pharmacy or grocery product.

The first future implementation should be the compact local catalog and barcode slice. It should be followed by bulk import and delta synchronization before adding pharmacy-specific inventory complexity.

For the Supabase Free-tier pilot, the non-negotiable rules are:

1. Metadata-first local catalog.
2. No server request per scan.
3. Batch product imports.
4. Optional photos.
5. Browser-side WebP compression.
6. 250 KB hard image limit.
7. Lazy image loading.
8. Project and organization media quotas.
9. One shared canonical server copy, not local-only data.
10. Upgrade or external media storage only after measured usage requires it.
