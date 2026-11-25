// Builds docs/art/photoreal-2/all.html: page-all.html + all.ts (game code, take 3 for every character frame).
// Run from the repo root: node docs/art/photoreal-2/src/build-all.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/photoreal-2/src/";
const r = await build({ entryPoints: [D + "all.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(D + "page-all.html", "utf8").replace("/*@JS@*/", () => js);
writeFileSync("docs/art/photoreal-2/all.html", page);
console.log("all.html", (page.length / 1024).toFixed(0), "KB");
