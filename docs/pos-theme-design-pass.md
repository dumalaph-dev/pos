# POS theme design pass

The original catalog had 26 identities but repeated gradient cards, accent strips, and rounded order panels. This pass preserves the existing theme IDs, palettes, checkout workflow, and both reference themes (Retro Comic Market and 32-Bit System). It changes the visual construction of the other 24 themes.

## Art direction

| Theme ID | Direction |
| --- | --- |
| modern | Flat workspace tiles, crisp dividers, and a quiet checkout panel. |
| classic | Letterpress menu cards, double ink rules, and a heritage receipt. |
| soft | Soft inset photo wells and rounded studio cards with generous curves. |
| dark | Instrument-panel tiles, mint data rails, and a low-glare checkout. |
| coastal | Postcard photo frames, nautical double rules, and a sea-glass counter. |
| sunset | Arched market-stall cards and terracotta blocks with indigo rules. |
| botanical | Specimen-style photo mats, leaf corners, and a forest-green frame. |
| ledger | Squared ledger cells, monospaced figures, and ruled receipt sections. |
| lechon | Roast-house menu plaques with ember footers and a carved counter frame. |
| restaurant | Fine-dining menu mounts, serif titles, and double-rule order framing. |
| cafe | Bistro tile cards, gingham details, and a simple café order pad. |
| coffee | Roastery label cards, kraft-style rules, and stamped order sections. |
| latte | Open, unboxed product photography and hairline dividers for a minimal counter. |
| bakery | Patisserie display arches, delicate dotted rules, and a pastry-box frame. |
| planner | Index cards, notebook margins, and dotted separators for an organized counter. |
| chicken | Diner tiles, checkerboard trim, and punchy takeaway-box framing. |
| ramen | Neon sign frames, dark photo windows, and an illuminated ticket counter. |
| taqueria | Cut-paper frames, stitched dividers, and festive market-stall details. |
| sushi | Washi photo mounts, fine ink rules, and restrained vermilion details. |
| deco | Champagne double frames, geometric corners, and a cinematic supper-club menu. |
| paper | Newspaper photo blocks, editorial serif titles, and perforated receipt rules. |
| icecream | Scoop-shaped photo windows, rounded sundae cards, and a pastel counter. |
| candy | Taffy-wrapper stripes, lozenge controls, and bold confectionery framing. |
| christmas | Gift-tag cards, ribbon dividers, and an evergreen holiday order book. |

## Implementation

- `src/components/pos/PosThemeArt.css` shares card, image, category, and order framing between the register and both interactive previews.
- Theme thumbnails receive their own theme variables and reflect the revised card silhouettes.
- Theme descriptions explain the structural differences.
- The revised previews size product rows to their content, preventing photos from concealing labels and prices. List view uses compact corners.
- Narrow preview catalogs wrap search onto its own row using a container query.
- Revised register cards keep their position on hover and provide a visible keyboard outline. Image transitions respect reduced motion.
- Customer display styles and theme color variables are unchanged.

## Verification

TypeScript, targeted ESLint, and all six existing POS accessibility tests passed. Browser checks found no clipped product labels across the 24 revised themes in the desktop playground; tablet list view also passed label containment and page overflow checks.

The production bundle and TypeScript compilation succeeded. Full production build completion is blocked by the existing missing `NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE` and `NEXT_PUBLIC_LEGAL_DOCUMENT_VERSION` configuration. These values were not invented or changed.
