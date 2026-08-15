import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Converts the bundled demo/starter catalog art in `public/food` to WebP.
 *
 * The source art is 1254x1254 PNG (~2.3 MB each). Two consumers make that
 * expensive rather than merely wasteful:
 *
 *   1. The POS product grid renders these with `unoptimized` (SellScreen.tsx),
 *      because `/_next/image` needs a server round trip and the tiles have to
 *      render offline. The raw file is what reaches the tablet.
 *   2. `public/sw.js` cache-firsts `/food/`, so every tile a cashier sees is
 *      stored permanently in Cache Storage on the device.
 *
 * 900px is the largest size any consumer actually paints: the customer-display
 * promo rail is the biggest at 42vw, ~806px on a 1920 screen. Product tiles top
 * out near 460px at 2x DPR, so they downscale from here with room to spare.
 *
 * Legacy `.png` paths stay live through the rewrite in `next.config.ts` —
 * `products.image_url` and `display_promotions.image_url` rows created before
 * this conversion still point at the old names.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const foodDir = path.join(projectRoot, "public", "food");

const MAX_EDGE = 900;
const QUALITY = 80;

const entries = await fs.readdir(foodDir);
const sources = entries.filter((name) => name.toLowerCase().endsWith(".png")).sort();

if (sources.length === 0) {
  console.log("No PNG sources in public/food — already converted.");
  process.exit(0);
}

let sourceBytes = 0;
let outputBytes = 0;

for (const name of sources) {
  const sourcePath = path.join(foodDir, name);
  const outputPath = path.join(foodDir, `${path.basename(name, path.extname(name))}.webp`);

  const before = (await fs.stat(sourcePath)).size;
  await sharp(sourcePath)
    // `inside` never upscales, so smaller art added later passes through at its
    // own size instead of being inflated to 900px.
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(outputPath);
  const after = (await fs.stat(outputPath)).size;

  sourceBytes += before;
  outputBytes += after;
  console.log(
    `${name.padEnd(36)} ${(before / 1024).toFixed(0).padStart(6)} KB -> ${(after / 1024).toFixed(0).padStart(5)} KB`,
  );
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(
  `\n${sources.length} images: ${mb(sourceBytes)} MB -> ${mb(outputBytes)} MB `
    + `(${(100 - (outputBytes / sourceBytes) * 100).toFixed(1)}% smaller)`,
);
console.log("Run with --prune to delete the PNG sources once the WebP output looks right.");

if (process.argv.includes("--prune")) {
  await Promise.all(sources.map((name) => fs.unlink(path.join(foodDir, name))));
  console.log(`\nDeleted ${sources.length} PNG sources.`);
}
