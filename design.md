# Mario's Lechon House POS UI reference

This is the working visual reference for future POS screens. The source of truth is the supplied [UI reference image](ui.png), with the more detailed token inventory in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## Product character

Warm, artisanal, calm, and operational. The screen should feel like a well-run lechon house: cream paper, roasted brown structure, brick-red action, generous tap targets, and appetizing product photography. Keep the interface tactile and human without turning it into a decorative dashboard.

## Layout contract

- Top bar: compact 62px cashier strip by default. Clicking the strip expands an 88px navigation bar with the brand lockup, centered `POS / ORDERS` segmented control, utility actions (`Search`, `Hold`, `Receipts`, `More`), cashier profile, and a clear Hide control.
- Main body: three zones — category rail (~202px), product catalog (largest area), order panel (~34vw / 410px minimum).
- Category rail: warm sidebar fill, line icons, and 53px rows with an active roast-brown pill.
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

Typography is Plus Jakarta Sans. Use tabular numerals for money and quantities. Keep headings bold and friendly; avoid condensed or display type for UI copy. The vintage serif treatment belongs only to the brand lockup.

## Component rules

- Product cards use a 16px radius, a 1px warm border, subtle shadow, flush 1.38:1 image, two-line product name, and whole-peso price in text color. Tap feedback is a quick `scale(.985)` press with a small hover lift on pointer devices.
- Quantity steppers are 108px × 52px, outlined in `--border-strong`, with brick-red minus/plus controls and tabular quantity.
- Primary action is always brick red with cream text. Secondary action is tan with roast-brown text. Destructive actions use brick red iconography on transparent or pale red hover surfaces.
- Inputs are warm raised cream, 12–14px radius, and a soft roast-brown focus ring. Search fields are the largest and calmest input on the screen.
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
