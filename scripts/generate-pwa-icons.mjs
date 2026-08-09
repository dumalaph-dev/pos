import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
// Keep install icons aligned with the current Dumala branding. The badge is a
// transparent, non-square lockup, so Sharp adds a cream canvas while preserving
// the mark's proportions and produces the square sizes browsers require.
const source = path.join(projectRoot, "public", "badge.png");

for (const size of [192, 512]) {
  await sharp(source)
    .resize(size, size, {
      fit: "contain",
      background: "#f8f3eb",
    })
    .flatten({ background: "#f8f3eb" })
    .png()
    .toFile(path.join(projectRoot, "public", `icon-${size}x${size}.png`));
}
