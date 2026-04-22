import esbuild from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { createRequire } from "module";

const watch = process.argv.includes("--watch");
const prod = process.env.NODE_ENV === "production";
const require = createRequire(import.meta.url);

const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  minify: prod,
  sourcemap: !prod,
  logLevel: "info",
});

// Copy tree-sitter WASM files into dist/grammars/
const grammarDst = "dist/grammars";
mkdirSync(grammarDst, { recursive: true });

// Core parser WASM from web-tree-sitter
const treeSitterPkg = dirname(require.resolve("web-tree-sitter/package.json"));
const coreSrc = join(treeSitterPkg, "tree-sitter.wasm");
if (existsSync(coreSrc)) {
  copyFileSync(coreSrc, join(grammarDst, "tree-sitter.wasm"));
  console.log("Copied tree-sitter.wasm");
} else {
  console.warn("WARNING: tree-sitter.wasm not found at", coreSrc);
}

// Language WASMs from tree-sitter-wasms
const wasmsPkg = dirname(require.resolve("tree-sitter-wasms/package.json"));
const langWasms = [
  "tree-sitter-python.wasm",
  "tree-sitter-javascript.wasm",
  "tree-sitter-typescript.wasm",
  "tree-sitter-java.wasm",
  "tree-sitter-c.wasm",
];
for (const file of langWasms) {
  const src = join(wasmsPkg, "out", file);
  if (existsSync(src)) {
    copyFileSync(src, join(grammarDst, file));
    console.log(`Copied ${file}`);
  } else {
    console.warn(`WARNING: ${file} not found at`, src);
  }
}

// Legacy: copy from resources/grammars/ if caller placed custom WASMs there
const legacySrc = "resources/grammars";
if (existsSync(legacySrc)) {
  const allLegacy = [...langWasms, "tree-sitter.wasm"];
  for (const g of allLegacy) {
    const src = join(legacySrc, g);
    if (existsSync(src)) {
      copyFileSync(src, join(grammarDst, g));
    }
  }
}

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
