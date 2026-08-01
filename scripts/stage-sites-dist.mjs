import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, ".open-next");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await cp(source, dist, { recursive: true });
await mkdir(path.join(dist, "server"), { recursive: true });
await writeFile(
  path.join(dist, "server", "index.js"),
  'export { default } from "../worker.js";\n',
  "utf8",
);
