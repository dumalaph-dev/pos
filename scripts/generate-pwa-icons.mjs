import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
// Keep install icons aligned with the current Dumala branding. The badge is a
// transparent, non-square lockup, so Sharp adds a cream canvas while preserving
// the mark's proportions and produces the square sizes browsers require.
const source = path.join(projectRoot, "public", "badge.png");
const CREAM = "#f8f3eb";

// `any` icons: the browser paints these unmasked (tab, install dialog, task
// switcher), so the mark is allowed to run to the edge of the canvas.
for (const size of [192, 512]) {
  await sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: CREAM,
    })
    .flatten({ background: CREAM })
    .png()
    .toFile(path.join(projectRoot, "public", `icon-${size}x${size}.png`));
}

/*
 * `maskable` needs its own asset. Android applies an adaptive-icon mask to the
 * home-screen launcher and only guarantees the centred circle of diameter 80%
 * survives it; everything outside is the system's to crop. Reusing the `any`
 * icon here put 40.5% of the mark's ink outside that circle, with the furthest
 * ink at 130% of the safe radius — on the pilot tablet's home screen the D's
 * right curve, the top-left flag and the bottom gold wedge all get clipped.
 *
 * So the mark is drawn into a 312px box centred on the 512px canvas. 312 is
 * 61% of the canvas, derived from the measured 130% overshoot (0.8/1.3 ≈ 0.61)
 * plus a little headroom, and it is the ink — not the bounding box — that has
 * to clear the circle, because the corners of this mark are mostly empty.
 * The canvas is opaque cream so the mask always has bleed to cut into.
 */
const MASKABLE_SIZE = 512;
const MASKABLE_SAFE_BOX = 312;
const pad = (MASKABLE_SIZE - MASKABLE_SAFE_BOX) / 2;

const markWithinSafeZone = await sharp(source)
  .resize(MASKABLE_SAFE_BOX, MASKABLE_SAFE_BOX, {
    fit: "contain",
    background: CREAM,
  })
  .flatten({ background: CREAM })
  .toBuffer();

await sharp(markWithinSafeZone)
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: CREAM })
  .png()
  .toFile(path.join(projectRoot, "public", `icon-maskable-${MASKABLE_SIZE}x${MASKABLE_SIZE}.png`));
