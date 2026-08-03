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

// Static assets are published from dist/assets; keeping the copied server
// duplicate would make Cloudflare count the same images toward Worker size.
await rm(path.join(server, "assets"), { recursive: true, force: true });

// Next traces this 4 MiB metrics table even when the app does not use
// next/font. Keeping the unused trace-only file would push the Cloudflare
// Worker over its 10 MiB upload limit.
await rm(
  path.join(
    server,
    "server-functions",
    "default",
    "node_modules",
    "next",
    "dist",
    "server",
    "capsize-font-metrics.json",
  ),
  { force: true },
);

await mkdir(path.join(dist, ".openai"), { recursive: true });
await cp(hosting, path.join(dist, ".openai", "hosting.json"));
await writeFile(
  path.join(server, "index.js"),
  'export { default } from "./worker.js";\n',
  "utf8",
);
