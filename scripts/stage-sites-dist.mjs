import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, ".open-next");
const dist = path.join(root, "dist");
const hosting = path.join(root, ".openai", "hosting.json");
const server = path.join(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(source, server, { recursive: true });
await cp(path.join(source, "assets"), path.join(dist, "assets"), { recursive: true });
await mkdir(path.join(dist, ".openai"), { recursive: true });
await cp(hosting, path.join(dist, ".openai", "hosting.json"));
await writeFile(
  path.join(server, "index.js"),
  'export { default } from "./worker.js";\n',
  "utf8",
);
