# Future expansion: menu upload to product drafts

Status: deferred. This document records the future design for reading a menu image or PDF and turning it into product drafts. It is not part of the current import enhancement.

## Decision

Keep menu OCR and automatic product creation out of the first release. The current product importer should first establish a predictable, reviewable text/spreadsheet contract. When menu extraction is revisited, it should produce drafts for review and then reuse the existing product-import validation path. It must not publish OCR guesses directly to the POS.

This plan complements [the broader local-first catalog plan](./FUTURE_EXPANSION_LOCAL_FIRST_CATALOG_PLAN.md), which covers high-SKU catalogs, barcode workflows, batching, and idempotent imports.

## Goal and boundaries

Given a restaurant menu image, scanned PDF, or text PDF, extract likely menu items, prices, units, categories, and optional descriptions. Show the result in an editable review table, highlight uncertain fields, and let an authorized admin approve the rows into the selected branch.

The first version should not attempt to infer recipes, ingredient costs, tax rules, modifiers, allergens, nutrition data, inventory quantities, or product photography. Those fields need explicit admin input or a separate workflow.

## Proposed flow

1. **Select and preflight in the browser.** Accept JPEG, PNG, WebP, and PDF. Check file type, size, page count, and image dimensions before processing. Do not upload the source document by default.
2. **Extract locally.** Use the PDF text layer when available. For image-only pages, render each page in the browser with [PDF.js](https://mozilla.github.io/pdf.js/) and run [Tesseract.js](https://github.com/naptha/tesseract.js/) in a Web Worker. This keeps the baseline path at zero API and server-processing cost.
3. **Normalize into drafts.** Convert OCR/text output into a stable row model: `name`, `price`, `unit`, `category`, `description`, `pricing_mode`, `inventory_mode`, and confidence/source spans. Keep the raw extracted text locally only for the active review session.
4. **Review before mutation.** Render a spreadsheet-like table with inline edits, row-level errors, confidence badges, and an explicit “skip row” control. Require the admin to resolve missing name/price/unit and invalid branch/category values. Default uncertain rows to skipped, not active.
5. **Commit through the catalog path.** Send only approved, edited rows to the existing server-side authorization and validation layer. For larger menus, use the batched/idempotent import design from the local-first catalog plan rather than one oversized Server Action request.
6. **Report and recover.** Show created, skipped, and failed rows with a downloadable error CSV. Never discard the user’s edited draft until the commit result is known.

## Extraction strategy

| Input | Baseline method | Fallback | Expected limitation |
| --- | --- | --- | --- |
| CSV, TXT, XLSX | Existing browser parser and text import | Manual editing | Not OCR; values still need validation |
| Text PDF | PDF.js text extraction | OCR only for missing regions | Layout order can be ambiguous |
| Scanned PDF | PDF.js page rendering plus Tesseract.js | Optional server/provider fallback | Slower on phones and low-quality scans |
| JPEG/PNG/WebP menu | Tesseract.js in a Worker | Optional server/provider fallback | Decorative fonts, columns, and prices can be misread |

OCR should be chunked by page or image region, with progress and cancellation. Avoid sending an entire multi-page menu through a single request or keeping multiple full-resolution bitmaps in memory.

## Product mapping rules

Required fields remain the current importer contract:

- `name`: trimmed, 2–120 characters.
- `price`: non-negative currency value, converted to centavos by the server.
- `unit`: a short selling unit such as `pcs`, `serving`, or `kg`.

Recommended defaults should be visible in the review UI rather than hidden in the extractor:

- selected branch: the admin’s current branch;
- `pricing_mode`: `fixed`;
- `inventory_mode`: `none` unless the admin explicitly enables direct stock tracking;
- `is_active`: false for low-confidence rows until reviewed;
- category and supplier: blank unless matched to an existing branch/organization record;
- image: no automatic product image assignment from a menu crop in the first release.

OCR output must retain the source text and confidence for each field so a reviewer can see why a value was suggested. A price such as `850` should never be silently interpreted as `₱850.00` without the app’s normal currency rules and a visible value in the review table.

## Zero-cost baseline

The default implementation should have no per-document API charge:

- Tesseract.js and PDF.js run in the customer’s browser and are open-source dependencies.
- Supabase remains responsible only for the final approved catalog rows and existing auth/data operations; do not store source menus unless the product later adds an explicit retention feature.
- No AI API key belongs in the browser. If an optional hosted fallback is added, it must be a separate, disabled-by-default adapter with quotas, privacy messaging, and a server-side key.
- Keep source files and intermediate OCR text out of logs, analytics, and error reporting.

“Free tier” still has practical limits: browser CPU/memory, download size, storage/egress quotas, provider pauses, and deployment terms can change. Verify current limits before enabling a hosted fallback. Possible reference points are [Supabase pricing](https://supabase.com/pricing), [Vercel Hobby limits](https://vercel.com/docs/plans/hobby), and [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/). These are deployment options, not requirements for the local-only baseline.

## Delivery phases

### Phase 0: stabilize the import contract

- Keep the required/optional column names documented and versioned.
- Share delimiter parsing, header aliases, server validation, and error wording between paste and file import.
- Add import fixtures for quoted commas, tabs, blank rows, currency symbols, and malformed values.

### Phase 1: local text extraction

- Add a client-only extraction module behind a feature flag.
- Try PDF text extraction first; fall back to OCR only when the text layer is absent or too sparse.
- Add worker lifecycle, cancellation, page progress, size limits, and a clear unsupported-file path.

### Phase 2: draft review

- Add an extraction review route/component that never writes automatically.
- Display confidence/source spans, editable fields, skipped rows, and row-level validation.
- Allow the reviewer to export the reviewed draft as CSV before committing.

### Phase 3: safe commit

- Reuse the server authorization checks for organization, branch, category, supplier, and inventory mode.
- Add an idempotency key and chunked writes before supporting large menus.
- Return per-row results rather than failing the whole menu at the first bad row.

### Phase 4: optional hosted fallback

- Measure local OCR failure cases first; only then evaluate a provider adapter.
- Keep the local path available and make privacy/cost behavior explicit per upload.
- Enforce quotas, request-size limits, timeouts, retries, and redaction on the server.

## Acceptance criteria

- A normal menu can be processed without any OCR/API/server-processing charge.
- No source menu leaves the browser on the local-only path.
- The UI never creates or activates an extracted row without an explicit admin confirmation.
- Every imported row passes the same server-side validation as a manually pasted product.
- A reviewer can correct, skip, export, retry, or abandon an extraction without losing edits.
- Failed rows identify the exact field and source row/page that needs attention.
- A large or slow document shows progress and can be cancelled without freezing the page.
- The feature is disabled cleanly on browsers that cannot run the selected worker/parser.

## Main risks and mitigations

- **OCR accuracy:** confidence thresholds, source previews, required review, and conservative defaults.
- **Two-column menus:** page-region detection and a review table; never assume reading order from raw OCR alone.
- **Large documents:** client-side limits, page-by-page processing, worker cleanup, and future batching.
- **Privacy:** local-only default, no source persistence, no raw OCR logs, and clear fallback consent.
- **Duplicate products:** future idempotency key plus duplicate warnings against branch name/SKU/barcode.
- **Free-tier drift:** isolate provider adapters and re-check quotas before release; hosted OCR is optional.

## Suggested future files

```text
src/components/admin/MenuExtractionReview.tsx
src/lib/menu-extraction/browser-pdf.ts
src/lib/menu-extraction/browser-ocr.ts
src/lib/menu-extraction/normalize-menu.ts
src/lib/menu-extraction/types.ts
src/app/admin/catalog/menu-extraction-actions.ts
```

The current change should remain focused on the text/spreadsheet importer and should not add any of these files until the review workflow and privacy decision are approved.
