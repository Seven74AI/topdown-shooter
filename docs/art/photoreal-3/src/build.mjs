// Builds docs/art/photoreal-3/compare.html (self-contained): page.html + build3.ts bundled with the game's art code and
// today's frames from the asset gallery export. Run from the repo root after `npm run gallery:export`:
//   node docs/art/photoreal-3/src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/photoreal-3/src/";
const r = await build({ entryPoints: [D + "build3.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const all = JSON.parse(readFileSync("tools/gallery/out/assets.json", "utf8"));
const current = Object.fromEntries(all.filter((a) => (a.group === "atlas_buildings" || a.name === "prop_barrier_a" || a.name === "prop_barrier_b")).map((a) => [a.name, a.url]));
const page = readFileSync(D + "page.html", "utf8").replace("/*@JS@*/", () => `var CURRENT=${JSON.stringify(current)};\n${js}`);
writeFileSync("docs/art/photoreal-3/compare.html", page);
console.log("compare.html", (page.length / 1024).toFixed(0), "KB");
