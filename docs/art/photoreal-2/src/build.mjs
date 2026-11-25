// Builds docs/art/photoreal-2/compare.html (self-contained): page.html + chars.ts bundled with the game's art code.
// Run from the repo root: node docs/art/photoreal-2/src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/photoreal-2/src/";
const r = await build({ entryPoints: [D + "chars.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(D + "page.html", "utf8").replace("/*@JS@*/", () => `var CURRENT={};\n${js}`);
writeFileSync("docs/art/photoreal-2/compare.html", page);
console.log("compare.html", (page.length / 1024).toFixed(0), "KB");
