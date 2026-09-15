import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const publicDir = path.join(projectRoot, "public");

/*
 * The app badge is a circular mark on a transparent square, supplied in two
 * sizes. The 150px file (really 155x155) is the canonical artwork and is used
 * where it is drawn at or below its native size — the favicon. Every larger
 * icon is downscaled from the 500px master instead: stretching 155px up to
 * 192px or 512px would visibly soften the ring and the screen detail.
 */
const SMALL_SOURCE = path.join(projectRoot, "assets", "brand", "app-icon-150.png");
const LARGE_SOURCE = path.join(projectRoot, "assets", "brand", "app-icon-500.png");
// The badge's own inner disc is white, so opaque icons use white bleed and the
// mark reads as one continuous tile rather than a disc sitting on a coloured square.
const WHITE = "#ffffff";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// `any` icons: the browser paints these unmasked (tab, install dialog, task
// switcher, desktop shortcut), so the circle keeps its transparent corners.
for (const size of [192, 512]) {
  await sharp(LARGE_SOURCE)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png()
    .toFile(path.join(publicDir, `icon-${size}x${size}.png`));
}

/*
 * `maskable` needs its own asset. Android applies an adaptive-icon mask to the
 * home-screen launcher and only guarantees the centred circle of diameter 80%
 * survives it; everything outside is the system's to crop.
 *
 * The badge's ink fills most of its 500px canvas (alpha bbox 452x467), and it
 * is the furthest ink from centre — the ring's lower edge and the gold wedge —
 * that has to clear the circle, not the bbox. Drawn into a 440px box that ink
 * measured at 102% of the 205px safe radius, so the canvas goes into a 420px
 * box instead (~97.5%, a little headroom). The canvas is opaque white so the
 * mask always has bleed to cut into.
 */
const MASKABLE_SIZE = 512;
const MASKABLE_SAFE_BOX = 420;
const pad = (MASKABLE_SIZE - MASKABLE_SAFE_BOX) / 2;

const markWithinSafeZone = await sharp(LARGE_SOURCE)
  .resize(MASKABLE_SAFE_BOX, MASKABLE_SAFE_BOX, { fit: "contain", background: TRANSPARENT })
  .png()
  .toBuffer();

await sharp(markWithinSafeZone)
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: WHITE })
  .flatten({ background: WHITE })
  .png()
  .toFile(path.join(publicDir, `icon-maskable-${MASKABLE_SIZE}x${MASKABLE_SIZE}.png`));

// iOS renders transparent pixels in a touch icon as black and rounds the
// corners itself, so the home-screen icon is flattened onto white at 180px.
await sharp(LARGE_SOURCE)
  .resize(180, 180, { fit: "contain", background: WHITE })
  .flatten({ background: WHITE })
  .png()
  .toFile(path.join(publicDir, "apple-touch-icon.png"));

/*
 * favicon.ico for the browser tab, from the 150px artwork. Sharp cannot write
 * ICO, but the format allows each entry to be a plain PNG stream: a 6-byte
 * ICONDIR, one 16-byte ICONDIRENTRY per image, then the PNG bytes.
 */
const FAVICON_SIZES = [16, 32, 48];
const images = await Promise.all(
  FAVICON_SIZES.map((size) =>
    sharp(SMALL_SOURCE)
      .resize(size, size, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer(),
  ),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = header.length + 16 * images.length;
const entries = images.map((png, index) => {
  const size = FAVICON_SIZES[index];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width (0 would mean 256)
  entry.writeUInt8(size, 1); // height
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

await writeFile(path.join(projectRoot, "src", "app", "favicon.ico"), Buffer.concat([header, ...entries, ...images]));
