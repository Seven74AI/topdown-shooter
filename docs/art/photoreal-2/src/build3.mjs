// Builds docs/art/photoreal-2/take3.html: page3.html + take3.ts (game code) + the Meshy reference pictures.
// Run from the repo root: node docs/art/photoreal-2/src/build3.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/photoreal-2/src/";
const r = await build({ entryPoints: [D + "take3.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const refs = Object.fromEntries(["zombie_walker", "zombie_brute", "survivor_pistol", "survivor_shotgun"].map((n) => [n, "data:image/jpeg;base64," + readFileSync(`docs/art/photoreal-2/refs/${n}.jpg`).toString("base64")]));
const page = readFileSync(D + "page3.html", "utf8").replace("/*@JS@*/", () => `var REFS=${JSON.stringify(refs)};\n${js}`);
writeFileSync("docs/art/photoreal-2/take3.html", page);
console.log("take3.html", (page.length / 1024).toFixed(0), "KB");
