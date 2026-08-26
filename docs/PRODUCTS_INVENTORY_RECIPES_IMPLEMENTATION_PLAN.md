# Products and Inventory Recipes Implementation Plan

**Status:** Proposed for review  
**Scope:** Owner-facing Products and Inventory workflows, inventory data model, recipe-based stock consumption, migration, POS integration, and offline behavior  
**Implementation state:** Planning only; no implementation work is authorized by this document

## 1. Executive summary

The POS needs two separate concepts:

1. **Product** — the sellable item shown to a cashier or customer.
2. **Inventory item** — the countable stock used by the business.

A **recipe** connects the two. One product can use many inventory items, and one inventory item can be shared by many products.

Examples:

    Garlic Parmesan Wings ─┐
    Buffalo Wings          ├── use ── Chicken
    Chicken Tenders        ┘          Fries

    Margherita Pizza ──────┐
    Pepperoni Pizza         ├── use ── Dough
    Hawaiian Pizza          ┘

    Spanish Latte ─────────┐
    Mocha Latte             ├── use ── Coffee beans
    Vanilla Latte           ┘          Milk

The Products page remains the source of truth for what can be sold. The Inventory page becomes the source of truth for what is physically held and consumed. Sales deduct inventory through the recipe, while voids and refunds reverse the exact quantities recorded for the original sale.

## 2. Current state and implementation constraints

The current implementation has useful catalog and stock functionality, but stock is still product-based:

- The owner-facing catalog lives at [src/app/products/page.tsx](../src/app/products/page.tsx).
- [src/app/admin/products/page.tsx](../src/app/admin/products/page.tsx) redirects to the owner-facing Products workspace.
- Inventory currently lives at [src/app/admin/inventory/page.tsx](../src/app/admin/inventory/page.tsx).
- Product creation and editing are implemented in [src/components/admin/ProductCreateDialog.tsx](../src/components/admin/ProductCreateDialog.tsx), [src/components/admin/ProductEditDialog.tsx](../src/components/admin/ProductEditDialog.tsx), and [src/components/admin/ProductFields.tsx](../src/components/admin/ProductFields.tsx).
- Catalog mutations are handled by [src/app/admin/catalog/actions.ts](../src/app/admin/catalog/actions.ts).
- The current stock ledger is keyed to products through stock movements.
- POS sales currently deduct tracked product stock inside the order-placement flow.
- Void and refund flows currently return stock by looking at the original product record.
- The existing design direction is documented in [design.md](../design.md), [docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), and [docs/UI_SPEC.md](UI_SPEC.md).

This means the change must include the data and ledger layer. Updating only the product and inventory forms would leave sales, refunds, offline replay, and reporting inconsistent.

## 3. Goals

### Primary goals

- Let an owner create a product and configure its ingredients in the same guided flow.
- Let one inventory item be reused across many products.
- Deduct the correct ingredient quantities whenever a product is sold.
- Show the relationship from both directions:
  - Product → ingredients
  - Inventory item → products using it
- Keep stock receiving, waste, adjustment, and physical counting inventory-item based.
- Preserve historical stock and order correctness when recipes change.
- Maintain branch and organization isolation.
- Preserve the existing calm, operational visual language and tablet-friendly controls.

### Secondary goals

- Calculate recipe cost from inventory-item cost.
- Show product alerts when one of its ingredients is low or out of stock.
- Support existing packaged or finished products that should be counted directly.
- Keep the data model ready for modifiers, variants, batches, and sub-recipes later.

### Non-goals for the first release

- Ingredient-consuming modifiers such as extra cheese or extra espresso.
- Pizza size variants and complex option matrices.
- Batch preparation and yield tracking for dough, sauces, or prepped food.
- Lot, expiry, or serial-number tracking.
- Purchase orders and automated supplier replenishment.
- Multi-warehouse transfers.

These should remain future extensions, not reasons to complicate the first setup workflow.

## 4. Product inventory modes

The current standalone Track stock checkbox should be replaced with an explicit inventory behavior choice:

### 4.1 Track ingredients

For prepared products such as:

- Garlic Parmesan Wings
- Pizza
- Spanish Latte
- Mocha Latte

Selling the product deducts the configured recipe quantities.

### 4.2 Track finished stock

For products that already exist as countable finished units:

- Bottled water
- Packaged snacks
- Pre-made cakes
- Retail goods

Selling the product deducts the linked finished-good inventory item.

### 4.3 Do not track

For products where inventory is intentionally irrelevant:

- Service charges
- Custom products
- Items where the owner does not want stock accounting

### 4.4 Double-counting rule

A product must use exactly one inventory mode. A recipe-tracked product must not also deduct a direct product stock balance.

Existing products with track_stock enabled should migrate to Finished stock. Existing products with track_stock disabled should migrate to Do not track. The owner can later switch an individual product to Track ingredients.

## 5. Domain model

### 5.1 Products

Products remain the sellable POS records. Existing product fields should remain where they are useful:

- Name
- Branch
- Category
- Price
- Pricing mode
- Selling unit
- Image
- SKU
- Barcode
- POS visibility
- Sort order

Add or derive:

- Inventory behavior: ingredients, finished stock, or not tracked
- Recipe status: ready, needs recipe, or not applicable
- Linked recipe version
- Direct inventory item ID for finished-stock products
- Calculated recipe cost where applicable

The product’s selling unit describes how a customer buys it. It does not define how its ingredients are stored.

### 5.2 Inventory items

Create a first-class inventory_items entity with:

- ID
- Organization ID
- Branch ID
- Name
- Item type: ingredient, packaging, or finished good
- Base unit
- Cost per base unit
- Minimum/reorder quantity
- Supplier
- Active status
- Created and updated timestamps

Examples:

- Chicken — kilograms
- Dough — kilograms
- Coffee beans — grams
- Milk — milliliters
- Fries — portions
- Cups — pieces

Inventory items are branch-scoped in the first release, matching the existing branch-scoped product and stock model. Stock must never leak between branches.

### 5.3 Units and conversions

Inventory quantities must use controlled units rather than arbitrary free text.

Recommended unit families:

- Weight: grams and kilograms
- Volume: milliliters and liters
- Count: pieces
- Portion: portions

Each inventory item should have one canonical base unit. The UI can accept friendly purchase/display units through a conversion factor. For example:

- 1 sack = 25 kg
- 1 case = 24 pieces
- 1 liter = 1,000 ml

Recipe quantities must resolve to the inventory item’s base unit before being saved or consumed.

### 5.4 Recipes

Use a versioned recipe structure:

**product_recipes**

- Product ID
- Branch ID
- Version number
- Active/effective status
- Created by
- Created at

**product_recipe_items**

- Recipe ID
- Inventory item ID
- Quantity per one product unit
- Resolved unit
- Optional waste percentage
- Sort order
- Optional preparation note

The same inventory item may appear in many recipes. Duplicate lines for the same inventory item within one recipe should be merged or rejected.

### 5.5 Historical consumption

Create an immutable order-item consumption record:

**order_item_consumptions**

- Order item ID
- Inventory item ID
- Consumed quantity
- Base unit
- Recipe ID and version
- Created at

This protects history when:

- A recipe changes
- An ingredient is renamed
- An ingredient is deactivated
- A supplier or cost changes
- A product is later switched to another inventory mode

Historical voids and refunds must use these recorded quantities rather than re-reading the current recipe.

### 5.6 Stock ledger

Generalize the existing stock movement model so movements refer to inventory items. Keep the existing product reference during migration for compatibility, then make inventory_item_id the long-term source of truth.

Movement types should continue to cover:

- Receive
- Sale consumption
- Waste
- Adjustment
- Physical-count adjustment
- Yield in/out where the existing workflow still needs it
- Reversal for voids/refunds

Inventory movements remain append-only and auditable.

## 6. Product creation and editing workflow

The current product form should become a guided setup flow rather than a single undifferentiated form.

### Step 1: Product details

Keep the current product basics:

- Branch
- Category
- Product name
- Price
- Pricing mode
- Selling unit
- Image
- SKU/barcode
- POS visibility
- Sort order

Move supplier, cost, and stock threshold fields out of the main product section when the product is recipe-tracked.

### Step 2: Inventory behavior

Show three choice cards:

- Track ingredients
- Track finished stock
- Do not track

Use plain descriptions:

> Track ingredients: selling this product uses one or more ingredients from Inventory.

> Track finished stock: selling this product reduces a countable finished item.

> Do not track: selling this product does not change inventory.

### Step 3: Recipe builder

For Track ingredients:

1. Search an existing inventory item.
2. Select the item.
3. Enter quantity per product unit.
4. Confirm the unit.
5. Optionally enter waste percentage or a preparation note.
6. Add more ingredients as needed.

Provide an inline Create inventory item action with the minimum fields:

- Name
- Item type
- Base unit
- Optional cost per unit
- Optional reorder threshold
- Optional supplier

The owner should not need to leave the product form to create a missing ingredient.

The builder should show a live summary:

    Garlic Parmesan Wings · recipe per 1 order

    Chicken       0.25 kg
    Fries         0.15 portion
    Garlic sauce  0.03 L

    Estimated ingredient cost: ₱…

### Step 4: Finished-stock setup

For Track finished stock:

- Create or select the linked finished-good inventory item.
- Confirm its stock unit.
- Set opening stock through the normal receive workflow.
- Set reorder threshold, supplier, and unit cost on the inventory item.

### Step 5: Save rules

For a recipe-tracked product:

- Save and publish requires at least one recipe line.
- Save as draft is allowed, but the product remains hidden from POS and shows Needs recipe.
- The owner may explicitly choose Do not track instead of bypassing recipe setup.

Product creation and recipe creation should be atomic.

### 6.1 Editing an existing product

Use a wider dialog or drawer with tabs:

1. Product details
2. Recipe / inventory
3. Activity or history, if the current page can support it without excessive complexity

The recipe tab should show:

- Current recipe version
- Last updated date
- Ingredient lines
- Estimated cost
- Products that share the same ingredients indirectly through each inventory item

Display a clear note:

> Recipe changes apply to future sales. Previous sales keep their original consumption record.

### 6.2 Copying recipes

Provide a Copy recipe from another product action for products with similar bases:

- Copy a pizza recipe to another pizza
- Copy a latte recipe to another latte
- Copy a wings recipe to another flavor

The owner must review and save the copied quantities before publication.

## 7. Products page redesign

The Products page should answer: “What can customers buy, and is each item configured correctly?”

### 7.1 Header

Keep the existing paper/cream canvas, forest structure, warm gold action color, branch context, and compact operational controls.

Header actions:

- Add product
- Add category
- Import products
- Bulk update

### 7.2 Metrics

Recommended metrics:

- Active POS products
- Recipe-ready products
- Products needing setup
- Finished-stock products
- Products with ingredient alerts

### 7.3 Filters

- All products
- Recipe tracked
- Finished stock
- Not tracked
- Needs recipe
- Category
- POS visibility
- Search by name, SKU, or barcode

### 7.4 Product table

Recommended columns:

- Product
- Category
- Price
- Inventory behavior
- Recipe status
- Estimated cost
- POS visibility
- Actions

For recipe-tracked products, replace direct stock quantity with:

- Recipe ready
- Number of ingredients
- Ingredient alert if applicable

Example status labels:

- Recipe ready · 3 items
- Needs recipe
- Finished stock · 24 pcs
- Not tracked
- Low ingredient · Milk

### 7.5 Product row actions

- Edit product
- Edit recipe
- Duplicate product/recipe
- View linked inventory
- View sales report
- Archive or hide from POS

## 8. Inventory page redesign

The Inventory page should answer: “What stock do we have, what needs attention, and where is it used?”

### 8.1 Header actions

- Add inventory item
- Receive stock
- Record waste
- Adjust stock
- Count stock

### 8.2 Metrics

Recommended metrics:

- Total stock items
- Low-stock items
- Out-of-stock items
- Total inventory value
- Products with incomplete recipes

### 8.3 Inventory table

Recommended columns:

- Item
- Type
- On hand
- Unit
- Reorder at
- Cost
- Used in
- Status
- Actions

Example:

| Item | Type | On hand | Reorder at | Used in | Status |
|---|---|---:|---:|---:|---|
| Chicken | Ingredient | 12.5 kg | 5 kg | 3 products | In stock |
| Fries | Ingredient | 8 portions | 10 portions | 3 products | Low stock |
| Dough | Ingredient | 4 kg | 6 kg | 7 products | Low stock |
| Bottled Water | Finished good | 24 pcs | 12 pcs | 1 product | In stock |

### 8.4 Inventory item detail

Selecting an item should open a detail drawer or page with:

- Current on-hand quantity
- Base unit
- Cost
- Reorder threshold
- Supplier
- Recent movements
- Linked products
- Quantity used by each product
- Receive action
- Waste action
- Adjustment action
- Count action

For example, Fries should show:

    Used in:
    - Garlic Parmesan Wings · 0.15 portion
    - Buffalo Wings · 0.15 portion
    - Chicken Tenders · 0.15 portion

### 8.5 Inventory filters

- All items
- Ingredients
- Packaging
- Finished goods
- Low stock
- Out of stock
- Supplier
- Search

Product categories and inventory item types should remain separate concepts. A menu category such as Pizza should not automatically become an ingredient category.

## 9. Inventory and order behavior

### 9.1 Completed sale

For every completed order item:

    consumed quantity =
    recipe quantity per product unit × sold quantity

Example:

    3 Garlic Parmesan Wings
    Chicken: 0.25 kg × 3 = 0.75 kg consumed
    Fries:   0.15 portion × 3 = 0.45 portion consumed

For per-kilogram products, recipe quantities should scale from the recorded weight where that product is sold by weight.

### 9.2 Void and refund

Voids and refunds must:

- Read the original order-item consumption snapshot.
- Add exact reversal movements.
- Preserve the original recipe version.
- Remain auditable.

The current product recipe must never be used to calculate a historical refund.

### 9.3 Online orders

Creating a pending online order should not consume stock. Consumption should happen when that order becomes a completed sale in the supported fulfillment/POS flow.

This avoids deducting stock for orders that are abandoned, rejected, or cancelled.

### 9.4 Low and negative stock

Keep the existing operational policy:

- Low stock shows a warning.
- Out of stock shows a stronger alert.
- The cashier is not automatically blocked from completing a sale.
- Negative stock is visible to the owner and included in inventory alerts.

A future branch setting may allow owners to block sales, but that should not be required for the first release.

### 9.5 Manual inventory actions

Receive, waste, adjustments, and physical counts operate on inventory items.

Each movement must include:

- Quantity
- Unit
- Unit cost where applicable
- Reason/reference for waste and adjustments
- Branch
- Actor
- Timestamp

## 10. Backend and RPC work

### 10.1 Schema

Add:

- inventory_items
- product_recipes
- product_recipe_items
- order_item_consumptions

Extend or generalize:

- stock_movements
- current stock read functions
- inventory read models
- variance/count records

Add indexes for:

- Branch and active inventory items
- Inventory item stock lookups
- Recipe by product
- Recipe lines by inventory item
- Consumption by order item
- Movement history by inventory item and timestamp

### 10.2 RLS and authorization

All new tables must inherit organization and branch isolation:

- Owners/admins can manage their organization.
- Managers can read and perform only the operations already allowed by the role model.
- Cashiers can use POS but cannot edit recipes or inventory definitions.
- Cross-organization and cross-branch references must fail server-side.

### 10.3 Atomic product and recipe writes

Use a transaction-backed RPC or equivalent server boundary for:

- Product creation with recipe
- Product update with recipe replacement/versioning
- Inline inventory-item creation and recipe linking
- Switching inventory modes

The server must validate:

- Product and inventory item belong to the same organization and branch.
- Recipe units match or convert to the inventory item base unit.
- Quantities are positive and within safe precision.
- Duplicate recipe lines are not created.
- A recipe-tracked product cannot publish without a valid recipe.

### 10.4 Sale integration

Update all paths that currently write product stock:

- POS order placement
- Offline order replay
- Online-order completion
- POS void
- Refund
- Manager-approved reversal

The current order local UUID/idempotency behavior must remain intact. A replay of an already-created order must not create a second consumption batch.

## 11. Migration plan

### 11.1 Data backfill

For every existing tracked product:

1. Create a linked inventory item.
2. Copy its stock unit.
3. Copy cost price, minimum stock, and supplier where available.
4. Mark the product as Finished stock.
5. Backfill existing stock movements to the linked inventory item.

For every existing untracked product:

1. Mark it as Do not track.
2. Preserve the existing product record unchanged otherwise.

Do not infer recipes from product names or categories.

### 11.2 Compatibility period

During rollout:

- Keep product_id on stock movements until all consumers are migrated.
- Keep legacy product stock fields readable.
- Update read models to prefer inventory item data.
- Add warnings for unsupported or incomplete schema states.
- Do not delete historical product movements.

### 11.3 Reconciliation

Before enabling recipe consumption:

- Compare old and new on-hand totals for every tracked product.
- Compare movement counts and movement totals.
- Verify branch totals.
- Verify inventory value where cost data exists.
- Record a migration audit event.

## 12. Offline and caching plan

The POS must receive enough catalog data to understand recipe consumption on a connected sync boundary:

- Product inventory mode
- Active recipe version
- Recipe lines
- Inventory item IDs and units
- Thresholds needed for alerts

Offline sales may be queued as they are today. When replayed:

- The order remains idempotent by local UUID.
- Consumption is generated once.
- A retry returns the existing order without creating duplicate movements.
- Recipe history used by the order is preserved.

Admin read models should cache:

- Inventory item directory
- Stock snapshots
- Inventory movements
- Product recipe summaries
- Recipe-linked product counts
- Variance/count records

## 13. Multi-branch behavior

The current product model is branch-scoped, so the first version should keep recipes and inventory items branch-scoped as well.

For menu cloning:

- Copy products to the destination branch.
- Copy recipe structure.
- Match destination inventory items by explicit owner choice or name/unit suggestion.
- Never share live stock balances across branches.

If the owner wants a shared ingredient catalog later, that can be added as an organization-level template layer above branch-specific stock.

## 14. Implementation phases

### Phase 0: Contract and design approval

Deliverables:

- Approved terminology
- Approved inventory modes
- Approved units
- Approved stock behavior
- Approved migration rules

Exit criteria:

- No unresolved decision would change the data model.

### Phase 1: Data and ledger foundation

Deliverables:

- New schema migration
- RLS policies
- Unit validation
- Inventory-item CRUD boundaries
- Recipe CRUD boundaries
- Generic stock movement support
- Consumption snapshot support
- Updated read models and types

Tests:

- Organization and branch isolation
- Recipe validation
- Unit conversion
- Atomic writes
- Movement append-only behavior

### Phase 2: Product setup workflow

Deliverables:

- Three inventory behavior choices
- Recipe builder
- Inline inventory-item creation
- Draft/ready recipe states
- Recipe cost calculation
- Recipe copy flow
- Product table status and filters

Tests:

- Create recipe product
- Create direct-stock product
- Create untracked product
- Prevent publishing without a recipe
- Edit recipe and create a new version

### Phase 3: Inventory workspace

Deliverables:

- Inventory-item table
- Ingredient/packaging/finished-good filters
- Linked product counts
- Inventory item detail view
- Receive/waste/adjust/count actions
- Low and out-of-stock states

Tests:

- Receive stock
- Record waste
- Adjust stock
- Complete physical count
- Navigate from inventory item to products and back

### Phase 4: POS and order integration

Deliverables:

- Recipe consumption on completed sale
- Finished-stock consumption
- Void/refund reversal from snapshots
- Online-order completion behavior
- Offline replay behavior
- Ingredient alert behavior

Tests:

- Single-product sale
- Multi-product sale sharing one ingredient
- Weighted sale
- Low stock
- Negative stock
- Void
- Refund
- Retry/idempotency
- Online order cancellation before completion

### Phase 5: Backfill, reconciliation, and rollout

Deliverables:

- Existing product-to-inventory backfill
- Stock reconciliation report
- Migration audit record
- Seed/example recipes
- Owner-facing setup guidance
- Production monitoring for ledger errors

Rollout:

1. Deploy schema and compatibility support.
2. Backfill and reconcile.
3. Deploy owner setup UI.
4. Enable recipe consumption for configured products.
5. Monitor stock movement and reversal errors.
6. Remove legacy product-stock writes after confirmation.

## 15. Acceptance criteria

### Relationship behavior

- One Fries inventory item can be linked to Garlic Parmesan Wings, Buffalo Wings, and Chicken Tenders.
- One Dough inventory item can be linked to every pizza product in a branch.
- One Milk inventory item can be linked to multiple latte products.
- Inventory detail shows every linked product and its recipe quantity.
- Product detail shows every inventory item it consumes.

### Calculation behavior

- Selling three products deducts three times the per-unit recipe quantity.
- Shared ingredients accumulate correctly across different products.
- Per-kilogram products use the recorded weight.
- Waste percentages are applied consistently if enabled.

### Historical correctness

- Recipe edits do not rewrite prior sales.
- Voids and refunds reverse the original consumption quantities.
- Deactivating an inventory item does not break historical orders.
- Retried offline orders do not double-consume stock.

### UX behavior

- An owner can create a product and its first recipe without leaving the flow.
- Missing inventory items can be created inline.
- Recipe-tracked products clearly show Ready or Needs recipe.
- Inventory items show linked product counts.
- Empty, loading, error, read-only, low-stock, and out-of-stock states are implemented.
- Controls remain accessible by keyboard and usable on tablet widths.

### Data integrity

- Existing tracked product stock is unchanged after migration.
- All new writes are organization- and branch-scoped.
- Inventory movements remain auditable and append-only.
- No product can deduct both a recipe and a direct stock balance.

## 16. Recommended decisions for approval

The implementation should proceed with these defaults:

1. Inventory items are branch-specific.
2. Product modes are Track ingredients, Track finished stock, and Do not track.
3. Recipe-tracked products require a recipe before POS publication.
4. Stock is consumed on completed sales.
5. Voids and refunds reverse immutable consumption snapshots.
6. Low and out-of-stock products warn but do not automatically block sales.
7. Inventory items use controlled base units and conversions.
8. Existing tracked products migrate as Finished stock.

After approval, implementation should begin with Phase 1: schema, ledger, authorization, and read-model contracts. The UI should be built against that stable contract so the owner-facing pages and POS behavior share the same inventory semantics.
