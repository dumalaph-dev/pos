# Dumala POS UI reference

This is the working visual reference for future POS screens. The source of truth is the supplied UI reference, with the more detailed token inventory in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

**The main theme style guide is [docs/THEME_STYLE_GUIDE.md](docs/THEME_STYLE_GUIDE.md)** — palette, typography, shape, textures, motion, and component patterns, extracted from the landing page and shipped as the admin `Default` theme. Read it before styling any new surface.

## Product character

Calm, warm, and operational. The screen should feel like a well-run business: cream paper, deep forest-green structure, warm gold action, generous tap targets, and clear product photography. Keep the interface tactile and human without turning it into a decorative dashboard.

## Layout contract

- Top bar: compact 62px cashier strip by default. Clicking the strip expands an 88px navigation bar with the brand lockup, centered `POS / ORDERS` segmented control, utility actions (`Search`, `Hold`, `Receipts`, `More`), cashier profile, and a clear Hide control.
- Main body: three zones — category rail (~202px), product catalog (largest area), order panel (~34vw / 410px minimum).
- Category rail: soft sage sidebar fill, line icons, and 53px rows with an active forest-green pill.
- Catalog: compact 54px search field, four-column image-led product cards on desktop, scrollable content, `Grid / List` toggle pinned to the bottom. Collapse to two columns on narrow mobile widths.
- Order panel: receipt-paper cream surface with a scalloped top edge, `Current Order` header, adjacent `Dine In` and `Discount` controls, quantity steppers, totals, and `SAVE / CHARGE` actions. Only the line-item list may scroll; the summary and actions stay fixed. The optional order note is captured inside the Discount sheet.
- On narrow screens, the category rail becomes a horizontal scroller, the catalog stays above the order panel, and the order panel becomes a full-width section.

## Visual tokens

Use the existing CSS variables in `src/app/globals.css` and do not introduce a competing palette.

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--bg` | `#f5ecdf` |
| Surface | `--surface` | `#f8f4ec` |
| Sidebar | `--sidebar` | `#f1e8db` |
| Text | `--text` | `#2e1c10` |
| Muted text | `--text-muted` | `#8c7b67` |
| Roast brown | `--primary` | `#5b2a0a` |
| Brick CTA | `--accent` | `#9a2e13` |
| Secondary fill | `--secondary-btn` | `#ebdcc9` |
| Success | `--success` | `#3f7d53` |

Typography is IBM Plex Sans. Use tabular numerals for money and quantities. Keep headings bold and friendly; avoid condensed or display type for UI copy. The vintage serif treatment belongs only to the brand lockup.

## Component rules

- Product cards use a 16px radius, a 1px warm border, subtle shadow, flush 1.38:1 image, two-line product name, and whole-peso price in text color. Tap feedback is a quick `scale(.985)` press with a small hover lift on pointer devices.
- Quantity steppers are 108px × 52px, outlined in `--border-strong`, with gold minus/plus controls and tabular quantity.
- Primary action is always deep forest green with cream text. Secondary action is soft sage with forest-green text. Destructive actions use muted red iconography on transparent or pale red hover surfaces.
- Inputs are warm raised cream, 12–14px radius, and a soft forest-green focus ring. Search fields are the largest and calmest input on the screen.
- The order panel should feel like a paper ticket: quiet borders, dashed summary divider, generous whitespace, and one visually dominant total.
- The Current Order ticket uses compact `QTY / ITEM / AMOUNT` labels, dashed item rules, and receipt-aligned totals. Keep quantity controls visible and thumb-friendly inside the paper treatment; place the optional order note inside the Discount sheet rather than on the ticket.

## Motion and interaction

- Use 150–180ms ease transitions for buttons, tabs, cards, hover lift, and search focus. The compact header expands with a short 220ms translate/fade so the catalog gains space without making the navigation feel lost.
- Use 180–260ms for popovers and modal entry; use a soft scale/translate combination instead of a hard fade alone.
- Use a short success pop for saved orders and a restrained toast slide for feedback.
- Never delay repeated cashier actions with animation. Provide `:focus-visible`, keyboard-operable controls, disabled states, and a `prefers-reduced-motion` fallback.
- Preserve the POS loop: tap product → cart updates immediately → quantity/discount/payment feedback is local-first → success state → fresh order.

## Imagery

Product imagery is local and offline-safe under `public/food/`. The current placeholder set was generated as warm, photorealistic Filipino food photography: roasted lechon, belly slices, paksiw, kawali, Java rice, and a generic sauce bottle. Keep future imagery square, close-cropped, appetizing, and free of readable logos or text. Real catalog `image_url` values may replace the placeholder map when available.

## Avoid

Cold enterprise blue, purple gradients, glassmorphism, heavy shadows, tiny tap targets, text-only catalog tiles, arbitrary icon styles, dense tables in the selling flow, and motion that makes a cashier wait.

## Admin catalog workspace

The `/products` workspace is the owner-facing source of truth for the POS menu:

- Keep the same cream canvas, forest-green structure, gold primary action, warm borders, and tabular money treatment as the POS and inventory screens.
- Organize the screen as `catalog metrics → add product / categories → editable product table`. The product table may scroll horizontally; the page itself should remain easy to scan.
- Product editing must make branch, category, price, unit, pricing mode, local image path, stock tracking, POS visibility, and sort order explicit.
- Category controls stay branch-specific. Disabled products and categories remain visible to admins so accidental removal is reversible.
- Managers can review the catalog but only organization admins can mutate it. Success and error states should return to the workspace with a short, human-readable message.
- Catalog changes refresh the POS and inventory routes; never block a cashier sale with a decorative transition or a stock-management workflow.

## Admin dashboard reference

The supplied admin reference image defines the backoffice shell used by `/admin`, `/products`, and `/admin/inventory`:

- Use a pale paper canvas with a quiet 220–238px left rail, circular house mark, branch context, grouped navigation, and a warm quick-actions card at the bottom.
- The dashboard hierarchy is `greeting → date/report controls → six KPI cards → sales/category/best-sellers → transactions/stock/today → branch/system status`.
- KPI cards are compact white-paper panels with one colored circular icon, a large tabular value, restrained supporting copy, and optional thin sparkline. Use roast brown, orange, green, purple, yellow, and red only as semantic accents.
- Charts are quiet and data-first: warm grid lines, brown line/area sales trend, horizontal category revenue bars, and short ranked/list panels. Empty and partial-data states must remain useful and human-readable.
- Tables use small uppercase column labels, generous row spacing, warm one-pixel dividers, and horizontal overflow only when the columns require it.
- Operations pages should keep the same paper-panel language: filter controls stay compact, summary metrics use semantic accent colors, and selected records open a receipt-style detail view without losing the active filters.
- Orders is the transaction register at `/admin/orders`: use the six-card status/volume header, compact search/status/payment/date controls, real item previews, RLS-scoped status and payment values, paginated rows, and a receipt detail view. Do not fabricate customer names, order types, pending states, or actions that are not represented by the current order schema.
- The Employees page uses the same directory rhythm: identity first, role and branch controls in the middle, active status and a clear save action at the edge. Access changes must be explicit, protected, and never use placeholder staff data.
- Sales is the performance workspace at `/admin/sales`: keep the reference hierarchy of six KPI cards, a daily trend, hourly heatmap, live alerts, best sellers, weekday bars, a period summary, and paginated transactions. Every number must derive from RLS-scoped orders, order items, catalog, and inventory records; do not invent customers, gross profit, or placeholder chart series when the schema cannot support them.
- Reports should feel analytical but calm: use compact period controls, paper panels, tabular figures, restrained bars, and direct CSV export. Keep payment totals as a readable comparison table rather than a decorative chart.
- Settings are split into organization, branch, and device sections. Organization identity is shared; receipt/tax fields belong to branches; printer transport and terminal prefixes belong to physical devices. Keep manager access read-only and make admin saves explicit.
- Promotions currently reports the POS discount types already supported by the order model. Use impact metrics, a calm daily discount bar chart, offer-mix cards, and an audit table; do not imply persistent campaign scheduling until a promotions table exists.
- Customers and Suppliers are live organization directories, not placeholder cards: keep contact details compact, show home-branch context, support active/inactive lifecycle status, and allow admins to edit while managers remain read-only.
- Expenses are a branch-scoped operating-cost ledger. Use date, category, payment method, reference, and notes fields; show period totals and largest/average entries; keep records auditable and make corrections explicit through editing rather than decorative delete controls.
- Header controls should remain compact: search, inventory alerts, help/status, current user, and report export. Every visible action must link to a working route or be clearly marked as coming next.
