// 用 esbuild 把 TS 测试打包成 ESM（复用 Vite 的无扩展名解析），再交由 node 执行
import { build } from "esbuild";
import { writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const entry = resolve(root, process.argv[2]);
const outfile = resolve(here, ".test-bundle.mjs");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile,
  logLevel: "warning",
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outfile, { force: true });
}
