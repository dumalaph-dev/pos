import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, ".open-next");
const dist = path.join(root, "dist");
const hosting = path.join(root, ".openai", "hosting.json");

await rm(dist, { recursive: true, force: true });
await cp(source, dist, { recursive: true });
await mkdir(path.join(dist, "server"), { recursive: true });
await mkdir(path.join(dist, ".openai"), { recursive: true });
await cp(hosting, path.join(dist, ".openai", "hosting.json"));
await writeFile(
  path.join(dist, "server", "index.js"),
  'export { default } from "../worker.js";\n',
  "utf8",
);
