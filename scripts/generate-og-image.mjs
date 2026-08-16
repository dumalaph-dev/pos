import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/*
 * Builds the 1200x630 social share card at src/app/opengraph-image.png.
 *
 * The asset is generated once and committed, rather than rendered per request
 * with `next/og`. Two reasons: the root layout is `force-dynamic` (the nonce
 * CSP needs request-time rendering), which would drag a Satori render into
 * every crawler fetch of the image; and a committed PNG has no font-loading
 * failure mode in production. This mirrors how the PWA icons are produced —
 * see generate-pwa-icons.mjs.
 *
 * Re-run with `npm run og:image` after changing the brand lockup, the hero
 * render, or the headline below, then commit the result.
 */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const publicDir = path.join(projectRoot, "public");

const WIDTH = 1200;
const HEIGHT = 630;

// Landing page palette (src/app/page.tsx): cream ground, deep forest ink,
// warm gold accent. Cream rather than forest because brand-lockup.png is dark
// ink on transparency and would disappear on a dark ground.
const CREAM = "#f8f3eb";
const FOREST = "#15382a";
const GOLD = "#b18448";
const MUTED = "#526157";

const HEADLINE = "POS for cafes, restaurants";
const HEADLINE_2 = "and food businesses.";
const SUBLINE = "Fast checkout for your team. Clear records for you.";
const FOOTNOTE = "Works offline · Syncs to the cloud · 14-day free trial";

// Explicit stack rather than a single family: this runs on whatever machine
// builds the asset, and librsvg silently substitutes a default when a family is
// missing. Every entry here is a humanist sans close enough that a substitution
// changes the metrics, not the character of the card.
const FONT = "Segoe UI, Helvetica Neue, Helvetica, Arial, sans-serif";

const overlay = Buffer.from(`
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <!-- Gold rule under the lockup, echoing the hero's underline stroke. -->
  <rect x="72" y="214" width="86" height="6" rx="3" fill="${GOLD}"/>

  <text x="72" y="300" font-family="${FONT}" font-size="58" font-weight="700"
        letter-spacing="-1.8" fill="${FOREST}">${HEADLINE}</text>
  <text x="72" y="366" font-family="${FONT}" font-size="58" font-weight="700"
        letter-spacing="-1.8" fill="${FOREST}">${HEADLINE_2}</text>

  <text x="72" y="428" font-family="${FONT}" font-size="27" font-weight="400"
        fill="${MUTED}">${SUBLINE}</text>

  <rect x="72" y="486" width="560" height="1" fill="#ddd5c4"/>
  <text x="72" y="530" font-family="${FONT}" font-size="21" font-weight="600"
        letter-spacing="0.4" fill="${FOREST}">${FOOTNOTE}</text>
</svg>
`);

const lockup = await sharp(path.join(publicDir, "brand-lockup.png"))
  .resize({ width: 340 })
  .toBuffer();

// The device bleeds off the right edge: it reads as a product shot rather than
// a pasted thumbnail, and Facebook's feed crop takes from the edges.
const device = await sharp(path.join(publicDir, "hero-device.webp"))
  .resize({ width: 620 })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: WIDTH,
    height: HEIGHT,
    channels: 4,
    background: CREAM,
  },
})
  .composite([
    { input: device, top: 196, left: 664 },
    { input: lockup, top: 92, left: 72 },
    { input: overlay, top: 0, left: 0 },
  ])
  .png()
  .toFile(path.join(projectRoot, "src", "app", "opengraph-image.png"));

console.log("Wrote src/app/opengraph-image.png (1200x630)");
