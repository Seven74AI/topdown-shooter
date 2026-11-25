// Builds tools/gallery/out/take4-anim.js: take 4's animation for the asset review page (window.T4.mount).
// Run from the repo root: node docs/art/photoreal-2/src/build-t4lib.mjs
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
const r = await build({ entryPoints: ["docs/art/photoreal-2/src/t4lib.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
mkdirSync("tools/gallery/out", { recursive: true });
writeFileSync("tools/gallery/out/take4-anim.js", `var KEEP_OUTLINE = true;\n${r.outputFiles[0].text}`);
console.log("take4-anim.js", (r.outputFiles[0].text.length / 1024).toFixed(0), "KB");
