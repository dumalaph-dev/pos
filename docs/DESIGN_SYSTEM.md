# Dumala POS — Design System

**Companion to:** [POS_PRD.md](POS_PRD.md) · [MVP.md](MVP.md)
**Reference:** the supplied POS mockup, now branded for Dumala POS — warm cream + deep forest green + warm gold. This document is the **canonical theme** — every screen matches it. The business name/logo is *store data*; the tokens below are the *product theme*.

> **Palette provenance:** the hex values below were **color-picked directly from `ui.png`** (dominant-color sampling of flat fills; glyph sampling for text). They are exact, not estimates.

> **Design intent:** warm, clear, calm, and practical. It should feel like a well-run business — not a cold enterprise dashboard. Cream canvas, forest-green structure, one warm-gold call-to-action. High contrast, generous whitespace, big tap targets.

---

## 1. Color Tokens

Values are the canonical palette derived from the reference. Fine-tune with a color picker against the source if pixel-exact matching is required; keep the token *names* stable.

### Neutrals (warm) — picked from `ui.png`
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F8F3EB` | App canvas / page background (cream) |
| `--surface` | `#FBF8F1` | Cards, product tiles |
| `--surface-panel` | `#F2EEE5` | Order panel (slightly warmer cream) |
| `--surface-raised` | `#FFFDF8` | Search input, popovers, modals |
| `--sidebar` | `#EDF1E9` | Category rail background (soft sage) |
| `--border` | `#DDDCD2` | Hairlines, card borders, dividers |
| `--border-strong` | `#C4CFC3` | Input borders, stepper outlines |
| `--text` | `#102D21` | Primary text (deep forest green) |
| `--text-muted` | `#667269` | Secondary text, labels, inactive icons |
| `--text-subtle` | `#9BA69B` | Placeholders, disabled |

### Brand — Dumala reference palette
| Token | Hex | Use |
|---|---|---|
| `--primary` | `#173A2B` | Forest green — active tab, active category, sidebar selection, emphasis |
| `--primary-hover` | `#0E2A20` | Hover/pressed on primary surfaces |
| `--primary-fg` | `#FFFAF1` | Text/icon on primary (cream) |
| `--primary-soft` | `#DFE8DC` | Tinted green backgrounds (hover on rail items) |
| `--accent` | `#BC9657` | Warm gold — **primary CTA, totals, and price accents** |
| `--accent-hover` | `#A77C3F` | CTA hover/pressed |
| `--accent-fg` | `#173A2B` | Text on accent |
| `--secondary-btn` | `#E8E8DD` | Secondary button fill; text = `--primary` |
| `--secondary-btn-hover` | `#DCE3D8` | Secondary hover |

### Semantic (reserved — never decorative)
| Token | Hex | Use |
|---|---|---|
| `--success` | `#4E7F57` | Payment success, in-stock, positive variance |
| `--warning` | `#BC9657` | Low stock, insufficient tender, offline-pending |
| `--danger` | `#A9513D` | Destructive: void, delete, remove line (trash icon) |
| `--danger-soft` | `#F1DED5` | Destructive hover background |

> **Accent and danger stay distinct.** Warm gold carries primary actions and totals; muted red carries destructive controls. Meaning is reinforced by the icon and context so the counter stays calm and readable.

### Offline / status pill (extends the reference)
| State | Background | Text | Note |
|---|---|---|---|
| Online | `--primary-soft` | `--primary` | calm, low-emphasis |
| Offline · N pending | `#EFE7D6` | `--text-muted` | neutral grey-cream, **never red** (PRD §9) |
| Syncing | `--primary-soft` | `--primary` | subtle pulse ≤150ms |

---

## 2. Typography

The reference reads as a warm humanist/geometric sans (rounded, friendly). Numbers are bold and tabular so totals don't jitter.

- **UI font:** `IBM Plex Sans` (primary), then the system sans fallback. It is self-hosted through `next/font`, readable at dashboard densities, and intentionally avoids the common AI-generated UI font defaults.
- **Numeric / money:** same family with `font-variant-numeric: tabular-nums` **always** on prices, totals, qty, and change.
- **Brand/logo:** a vintage display/serif is a *logo asset* (as in the mockup badge), not a UI font — do not use it for interface text.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display / TOTAL amount | 34–40px | 800 | The hero number in the cart, in `--accent` brick-red |
| H1 / screen title | 24px | 700 | e.g. "Current Order" is 20–22px/700 |
| H2 / section | 18px | 600 | |
| Body / product name | 15–16px | 500–600 | product tile name = 16/600 |
| Price on tile | 15px | 600 | `--text` |
| Label / secondary | 13–14px | 500 | `--text-muted`, slight tracking on ALL-CAPS labels |
| Button text | 15–16px | 700 | ALL-CAPS for CHARGE/SAVE (as reference) |
| Caption / meta | 12px | 500 | `--text-subtle` |

Line-height: 1.2 for numbers/headings, 1.4–1.5 for body.

---

## 3. Shape, Elevation, Spacing

- **Radii:** cards/tiles `16px`, buttons `12px`, inputs `12px`, search & pills `9999px` (full), category-rail active item `12px`, product image corners inherit tile radius (top corners `16px`).
- **Borders:** 1px `--border` on cards; 1.5px `--border-strong` on inputs/steppers. Structure comes from **borders + warm fills, not heavy shadows.**
- **Elevation:** very subtle. Cards: `0 1px 2px rgba(59,42,30,0.05)`. Popovers/modals: `0 8px 24px rgba(59,42,30,0.12)`. No glassmorphism.
- **Spacing scale (px):** `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Default gaps: grid gutter 16–20, card padding 16, panel padding 20–24.
- **Receipt-scallop detail:** the order panel's top edge uses a subtle scalloped/perforated motif (repeating small half-circles in `--bg`) to evoke a receipt — decorative, ≤8px tall, optional but on-brand.

---

## 4. Layout — POS Sell Screen (matches reference exactly)

```
┌───────────────────────────────────────────────────────────────────────┐
│ TOP BAR  MARIO'S POS · Ready to sell · Open navigation                    │  62px
├──────────┬──────────────────────────────────────────┬───────────────────┤
│ CATEGORY │  🔍 Search products...                    │  Current Order  ▾ │
│  RAIL    │                                          │  ─────────────    │
│  ~200px  │  ┌─────┐ ┌─────┐ ┌─────┐                 │  − 1 + item  ₱..   │
│  All Items│  │ img │ │ img │ │ img │   PRODUCT GRID   │  − 2 + item  ₱..   │
│  Whole… │  │name │ │name │ │name │   (3 cols, hero) │                   │
│  Belly  │  │ ₱   │ │ ₱   │ │ ₱   │                 │  Dine In  Discount │
│  …      │  └─────┘ └─────┘ └─────┘                 │  Subtotal   ₱..   │
│          │                                          │  Discount   ₱0    │
│ [footer  │  ┌─────┐ ┌─────┐ ┌─────┐                 │  ══════════════   │
│  card]   │  ...                                     │  TOTAL   ₱6,920   │
│          │  [ ▦ Grid | ☰ List ]                     │  [ SAVE ][CHARGE] │
└──────────┴──────────────────────────────────────────┴───────────────────┘
   ~14%                  ~50% (main event)                    ~36%
```

- **Top bar** (`--surface`): a compact 62px cashier strip is the default state so the catalog gets the first viewport. The strip is one large keyboard-accessible button with the compact store mark, online/offline state, and `Open navigation`. Clicking it reveals an 88px bar with the circular brand lockup, centered segmented **POS / ORDERS** toggle (active = `--primary` fill, `--primary-fg` text; inactive = transparent, `--text-muted`), right utility icons with labels (Search, Hold, Receipts, More), profile chip, sign-out, and a `Hide` control. On mobile the expanded bar wraps utility actions below the primary row.
- **Category rail** (`--sidebar`): vertical list, each row = line icon + label. **Active** = `--primary` fill, `--primary-fg`, radius 12. **Inactive** = transparent, `--text` label, `--text-muted` icon; hover = `--primary-soft`. Rail stays slim (≤15% width) — products get the pixels.
- **Product area:** raised **search input** (`--surface-raised`, 54px, search icon) spanning the grid; **4-column product grid** of compact image-led tiles on desktop, with 2 columns on narrow mobile; **Grid/List** segmented toggle bottom-left (active = `--primary`).
- **Order panel** (`--surface-panel`, receipt-scallop top): header "Current Order" + adjacent "Dine In" and "Discount" controls + trash (danger) icon; only the line-item list scrolls; totals block; **SAVE** (secondary tan) + **CHARGE** (accent brick-red) side by side, CHARGE emphasized.

---

## 5. Component Specs

### Product tile
`--surface`, 1px `--border`, radius 16, padding 0 (image flush to top corners) then 12–16 text padding. Image 16:10-ish, `object-cover`. Name 16/600 `--text`; price 15/600 `--text`. Tap target ≥ 96px. A small circular **favorite/badge** chip may sit top-right (as in reference). **Weight items** get a `/kg` pill (see below) instead of a plain price. Pressed state: scale 0.98, ≤150ms.

### `/kg` weight badge (extends reference)
Small pill, `--primary-soft` bg, `--primary` text, 12/600, e.g. `₱850 / kg`. Tapping a weight tile opens the **kilo keypad modal** (not an increment).

### Order line row
Left: **stepper** — `[ − | n | + ]`, rounded 12, `--border-strong` outline, `−`/`+` in `--accent`/`--primary`, number tabular. Right: name (15/600) with `x{qty}` meta below (12/500 `--text-muted`), and line total (15/600, right-aligned, tabular). Remove = swipe or the row's ✕.

### Buttons
| Variant | Fill | Text | Use |
|---|---|---|---|
| **Primary CTA** | `--accent` | `--accent-fg` | CHARGE, Confirm payment |
| **Secondary** | `--secondary-btn` | `--primary` | SAVE, Hold, Cancel-safe |
| **Ghost/util** | transparent | `--text-muted` | top-bar utilities, list toggles |
| **Destructive** | transparent → `--danger-soft` hover | `--danger` | void, remove, delete |
| **Disabled** | `--secondary-btn` @ 50% | `--text-subtle` | insufficient tender, etc. |

Height ≥ 48px (CTA 56px), radius 12, weight 700, ALL-CAPS for CHARGE/SAVE.

### Inputs & dropdown
`--surface-raised`, 1.5px `--border-strong`, radius 12 (search = full), placeholder `--text-subtle`. Focus ring: 2px `--primary` at 30% + border → `--primary`. Dropdown ("Dine In") = same input style with caret; menu = `--surface-raised`, 8px shadow.

### Totals block
Subtotal / Discount rows: label `--text-muted`, value `--text`, 15/500. Divider (dashed, `--border`). **TOTAL**: label 16/700 `--text`; amount 34–40/800 in **`--accent`** (brick-red — matches the mockup's `₱6,920`), the hero of the cart. Change-due (payment screen) uses the same hero scale in `--success`.

---

## 6. Reference elements vs. PRD scope (resolve during build)

The mockup shows a couple of controls that touch functional scope — keep the **visual treatment**, map the **function** to the PRD:

| In mockup | Visual: keep | Function: per PRD |
|---|---|---|
| **"Dine In" dropdown** | Yes — order-type pill in the order header | PRD is walk-in/takeout only. Either hide it, or repurpose as **order note/type** (`Takeout` default). Not a dine-in service flow in v1. |
| **"Discount"** | Yes — compact control beside the order type | Opens **Senior/PWD & discount capture** (name + ID), *not* a customer directory (PRD §4). |
| **ORDERS tab** | Yes — segmented toggle | The POS order history / reprint list (PRD §6.4, §6.6). |
| **Hold / Receipts / More** | Yes | Hold = park order (max 10); Receipts = reprint; More = shift, sync, settings. |

Not shown in the mockup but required by the theme — style them in the same system: **offline pill** (§1), **weight keypad modal**, **discount states**, **payment modal**, **customer-facing display** (below).

---

## 7. Customer-Facing Display theme (PRD §6.8)

Same palette, **billboard scale** — read from 1.5m away.

- Background `--bg`; big centered content; minimal chrome.
- **Idle:** store logo + "FRESHLY ROASTED EVERYDAY / Salamat!" on `--surface`, warm.
- **Active:** line items list (18–20px), **running total** at 64–80px/800 `--text`.
- **Payment:** TOTAL + **CHANGE** at hero scale in `--success`.
- **Thank-you:** brand mark + "Salamat po!" then back to idle.
- No buttons, no inputs — it's passive.

---

## 8. Implementation tokens (drop-in)

**CSS variables** (`globals.css`):
```css
:root {
  --bg:#F8F3EB; --surface:#FBF8F1; --surface-panel:#F2EEE5; --surface-raised:#FFFDF8; --sidebar:#EDF1E9;
  --border:#DDDCD2; --border-strong:#C4CFC3;
  --text:#102D21; --text-muted:#667269; --text-subtle:#9BA69B;
  --primary:#173A2B; --primary-hover:#0E2A20; --primary-fg:#FFFAF1; --primary-soft:#DFE8DC;
  --accent:#BC9657; --accent-hover:#A77C3F; --accent-fg:#173A2B;
  --secondary-btn:#E8E8DD; --secondary-btn-hover:#DCE3D8;
  --success:#4E7F57; --warning:#BC9657; --danger:#A9513D; --danger-soft:#F1DED5;
  --radius-card:16px; --radius-btn:12px; --radius-pill:9999px;
  --shadow-card:0 1px 2px rgba(16,45,33,.06); --shadow-pop:0 8px 24px rgba(16,45,33,.13);
}
```

**Tailwind** (`tailwind.config` `theme.extend.colors`): map the same names (`bg`, `surface`, `primary`, `accent`, …) to the hexes above; set `fontFamily.sans = ['IBM Plex Sans','ui-sans-serif','system-ui','sans-serif']`; enable tabular nums via a `.tnums { font-variant-numeric: tabular-nums; }` utility applied to all money/qty.

**Motion:** transitions ≤150ms ease-out; only for state changes (press, tab switch, add-to-cart). No decorative animation on the sell screen (PRD §9).

**Dark theme:** deferred (P1). When built, keep the warmth — deep forest canvas, cream text, and the same warm-gold accent — not a cold grey dark mode.

---

## 9. Current implementation notes (2026-08)

The reference shell is now implemented in `src/components/pos/SellScreen.tsx` and `src/app/globals.css`.

- The live desktop proportions are a 62px compact top bar (88px while expanded), a ~202px category rail, a four-column catalog, and a right order panel with a 410px minimum width.
- The product grid uses local offline-safe placeholder photography from `public/food/`. Generated photos should be treated as replaceable catalog content, not brand assets.
- A fresh local install falls back to a preview catalog with the reference order seeded so the UI can be reviewed before Supabase has a cached menu. Real catalog data replaces it when available.
- Product-card hover lift, press scale, search focus, popover entry, toast entry, success confirmation, and reduced-motion behavior are part of the approved interaction language.
- `SAVE` keeps the existing hold/park behavior. `Discount` opens the existing Senior/PWD/custom discount capture flow. `Receipts` calls the existing reprint flow. `More` opens printer settings.
- The Current Order panel is a receipt ticket: `QTY / ITEM / AMOUNT` column labels, dashed line-item rules, and receipt-style summary separators. The line-item list owns the only scrollbar; the order summary and `SAVE / CHARGE` actions remain fixed. `Discount` opens the discount capture flow and the optional `Order note` field.
- Keep the screenshot's visual hierarchy when adding future screens: product imagery first, quiet controls second, one dominant action and one dominant number per surface.

## 10. Admin backoffice overview

The first backoffice surface is a responsive operations dashboard at `/admin`. It keeps the same warm cream canvas, roast-brown structure, and brick-red emphasis as the POS while shifting the hierarchy toward scanning and comparison:

- **Shell:** desktop sidebar with the active Overview state, current branch scope, and a direct Open POS action; compact top bar and the same sign-out treatment on smaller screens.
- **Summary cards:** today's sales, average ticket, active products, and team/branch context. Use tabular numerals and short supporting context rather than decorative charts.
- **Operations cards:** payment mix uses restrained horizontal bars; branch pulse shows active state, completed orders, and sales; recent orders use a horizontally scrollable semantic table; top items use a ranked list.
- **Data states:** every dashboard collection has loading, empty, partial-data warning, and route-level error treatments. Admin data remains server-rendered and follows Supabase RLS scope.
- **Motion:** 150ms card lift and width transitions are allowed for feedback; no auto-rotating charts or motion that delays a management task.

## 11. Admin inventory workspace

The first inventory surface is `/admin/inventory`, using the same warm backoffice shell with a ledger-first hierarchy:

- **Balance table:** branch + tracked product rows show derived on-hand quantity, unit, and a quiet Healthy / Low / Out state. The current low-stock signal is `≤ 2` units until per-product thresholds exist.
- **Movement form:** one focused action card records Stock in, Yield in, Yield out, Waste / spoilage, and signed Adjustment entries. Waste and adjustment require a reason; POS sales are never manually entered.
- **Audit trail:** recent movement rows keep the movement type, signed delta, unit cost, branch, product, time, and reason visible. Avoid hiding the ledger behind a modal when a direct table is more useful.
- **POS connection:** tracked product tiles show the cached/live balance and warn on low or out-of-recorded-stock taps. The sale remains tappable, matching the PRD rule that stock never blocks a sale.
- **Motion:** use the existing 150ms transitions for status, form focus, and table state. Avoid animated count-ups or motion that makes a stock count harder to verify.
