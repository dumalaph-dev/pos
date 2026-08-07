# Dumala POS — Theme UI style guide

This is the **main theme style guide** for Dumala POS. It was extracted from the marketing landing page (`src/app/page.tsx`) after that page was settled as the reference for the product's visual identity, and it is the source of truth for the `Default` admin theme.

Related documents:

- [design.md](../design.md) — product character and screen-by-screen layout contracts
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — the full token inventory and component rules

---

## 1. Character

Calm, warm, and operational. Cream paper, deep forest-green structure, warm gold action. The interface should feel like a well-run business, not a decorative dashboard: quiet surfaces, one clear action per view, generous tap targets, and motion that never makes anyone wait.

**Avoid:** cold enterprise blue, purple gradients, glassmorphism, heavy drop shadows, tiny tap targets, and any motion that delays a repeated action.

---

## 2. Palette

The landing palette is the same token set as `:root` in `src/app/globals.css`. Themes override these variables; nothing should hard-code a hex that duplicates a token.

### Neutrals — the paper stack

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `--bg` | `#f8f3eb` | Page background |
| Surface | `--surface` | `#fbf8f1` | Cards, panels |
| Panel | `--surface-panel` | `#f2ede1` | Recessed groups |
| Raised | `--surface-raised` | `#fffdf8` | Hover/active card, popovers |
| Border | `--border` | `#ddd8cc` | Default hairline |
| Strong border | `--border-strong` | `#c4cfc3` | Inputs, emphasis |

### Ink

| Role | Token | Value | Measured on `--surface` |
| --- | --- | --- | --- |
| Text | `--text` | `#102d21` | 13.39:1 |
| Muted | `--text-muted` | `#667269` | 4.74:1 |
| Subtle | `--text-subtle` | `#717f73` | 3.97:1 |

`--text-subtle` is deliberately darker here than the `:root` value (`#9ba69b`, which measures only 2.38:1 and fails at any size). Use it for supporting labels and hints, never for body copy.

### Brand

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Forest | `--primary` | `#173a2b` | Primary action, sidebar, active state |
| Forest hover | `--primary-hover` | `#0e2a20` | Primary hover |
| On forest | `--primary-fg` | `#fffaf1` | Text on forest |
| Forest soft | `--primary-soft` | `#dfe8dc` | Success chips, check bubbles |
| Gold | `--accent` | `#bc9657` | Secondary action, highlights, active nav pill |
| Gold hover | `--accent-hover` | `#a77c3f` | Gold hover |
| On gold | `--accent-fg` | `#173a2b` | Text on gold — always forest, never white |

Supporting landing tints, for gradients and decoration only: `#f6f0e4`, `#f4eee1`, `#f0e9da`, `#efe8d9`, `#fdfaf3`, and the deep forest `#123024` / `#1a422f` used for dark bands.

### Semantic

`--success: #4e7f57` · `--warning: #bc9657` · `--danger: #a9513d` · `--danger-soft: #f1ded5`

**Rule:** gold is an accent, never a semantic status. Warning shares the gold hue but must always carry a label.

---

## 3. Typography

IBM Plex Sans throughout (`--font-ui`), loaded in `src/app/layout.tsx`.

| Role | Treatment |
| --- | --- |
| Display / h1 | `font-black`, `leading-[0.94]`, `tracking-[-0.065em]` |
| Section h2 | `font-black`, `tracking-[-0.05em]` |
| Card h3 | `font-black`, `tracking-[-0.02em]` |
| Eyebrow | `text-xs font-bold uppercase tracking-[0.18em]`, in gold |
| Body | `leading-6` to `leading-7`, in `--text-muted` |
| Money / quantity | **Tabular numerals always** (`tabular-nums`) |

Tight negative tracking on headings and wide positive tracking on eyebrows is the signature pairing. The vintage serif treatment belongs only to the brand lockup artwork.

---

## 4. Shape and elevation

- **Radii:** `36px` stages · `24–28px` large panels · `16–22px` cards · `12px` buttons and inputs · `9999px` pills
- **Borders:** 1px, always a warm neutral — never grey
- **Shadows:** soft, warm, and green-tinted. `0 1px 2px rgba(16,45,33,.06)` at rest, `0 18px 38px rgba(35,48,37,.08)` on hover, `0 26px 60px rgba(23,58,43,.13)` for stages. Never black-based.

---

## 5. Textures

Backgrounds are layered as a single `background-image` stack on the section itself — never an overlay element, which would risk painting over content. Ink texture is `rgba(23,58,43,α)`; on forest surfaces use `rgba(255,250,241,α)`. Keep α between **0.04 and 0.075** so the texture reads as material, not pattern.

| Texture | Recipe |
| --- | --- |
| Paper grain | SVG `feTurbulence` data URI, 140px tile |
| Dot grid | `radial-gradient(ink 1px, transparent 1px)` @ 22px |
| Line grid | two `linear-gradient` 1px rules @ 46–68px |
| Diagonal hatch | `repeating-linear-gradient(135deg, ink 0 1px, transparent 1px 9–12px)` |
| Concentric rings | `repeating-radial-gradient(circle at …, ink 0 1px, transparent 1px 32–40px)` |

Adjacent sections must not repeat a texture, and the two forest bands use different ones.

---

## 6. Motion

Standard easing is `cubic-bezier(0.22, 1, 0.36, 1)` (`--lp-ease`).

| Interaction | Duration |
| --- | --- |
| Buttons, tabs, nav, hover lift | 150–300ms |
| Cards, popovers, accordions | 300–420ms |
| Scroll reveal | 720ms, staggered 60–110ms |
| Ambient drift, float, ring spin | 8–34s, infinite |

**Non-negotiables:**

- Hover lift is `translateY(-3px)` to `-6px`, never scale on large surfaces.
- Press feedback is `scale(.985)`.
- Every animation has a `prefers-reduced-motion: reduce` fallback that disables it — reveals must resolve to visible, never stay hidden.
- Never delay a repeated cashier action with animation.

Signature motifs: a gold underline that draws in under a headline, a sheen sweep across primary buttons, a nav underline that scales from the left, and travelling dots along a dashed track to show two surfaces syncing.

---

## 7. Component patterns

- **Primary button** — forest fill, cream text, 12px radius, sheen sweep on hover, arrow translates 4px.
- **Secondary button** — gold fill with forest text, or soft sage with forest text.
- **Card** — 1px warm border, `--surface` fill, hover lifts to `--surface-raised` and grows a gold top rule from the left.
- **Eyebrow + heading + lede** — the standard section opener, centered for full-width sections and left-aligned when paired with supporting copy on the right.
- **Icon tile** — 40–56px, forest fill, gold glyph, 14–18px radius; tilts `-5deg` on card hover.
- **Pill / badge** — forest fill with cream text, or bordered with muted text. Uppercase, `tracking-[0.14em]`.
- **Accordion** — native `<details>`; hide the marker, rotate a bordered chevron 180° when open, and lift the panel to `--surface-raised`.
- **Focus** — always `outline-2 outline-offset-4`, gold on forest surfaces and forest on cream ones. Never remove it.

---

## 8. Accessibility

Measured contrast for the `Default` theme (WCAG 2.1, sRGB):

| Pair | Ratio |
| --- | --- |
| Body text on surface | 13.39:1 |
| Muted text on surface | 4.74:1 |
| Subtle text on surface | 3.97:1 |
| Primary button (`--primary-fg` on `--primary`) | 12.05:1 |
| Gold button (`--accent-fg` on `--accent`) | 4.56:1 |
| Sidebar body text on the forest rail | 10.99:1 |
| Sidebar muted text on the forest rail | 6.90:1 |
| Sidebar labels on the forest rail | 4.96:1 |
| Active nav pill (forest on gold) | 5.51:1 |

Rules:

- Gold `#bc9657` is **decorative or background only** — it does not pass as small text on cream. Text on gold is always forest `#173a2b`.
- On forest surfaces use `#e8efe6` for body and `#aec3b3` for muted copy.
- Never signal state by colour alone; pair with a label, icon, or shape.
- Re-measure any token change against its real surface before shipping it.

---

## 9. Applying the theme

The admin dashboard consumes this guide through the **`Default`** theme in
`src/lib/admin/branding.ts` (`ADMIN_THEME_OPTIONS`), whose tokens live in the
`[data-admin-theme="default"]` block of `src/app/globals.css`.

`Default` is the fallback theme for any organization that has not chosen one. The `Classic`, `Light`, `Dark`, and `Retro` themes are independent and must not be edited when this guide changes — adjust `Default` only.
