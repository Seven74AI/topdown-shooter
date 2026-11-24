// Builds docs/art/asset-fixes-1/looks.html (self-contained): page.html + entry.ts bundled with the game's art code.
// Run from the repo root: node docs/art/asset-fixes-1/src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/asset-fixes-1/src/";
const r = await build({ entryPoints: [D + "entry.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
// The current pictures, for side-by-side comparison (run `npm run gallery:export` first).
const want = ["atlas_downtown/prop_barrier_a", "boss_tele_disc/boss_tele_disc", "boss_fx/boss_fx_skull_a", "boss_fx/boss_fx_disc_a", "boss_fx/boss_icon_slam_a", "boss_fx/boss_icon_charge_a", "boss_fx/boss_icon_throw_a", "boss_fx/boss_decal_crack_a"];
const all = JSON.parse(readFileSync("tools/gallery/out/assets.json", "utf8"));
const current = Object.fromEntries(all.filter((a) => want.includes(a.id)).map((a) => [a.id, a.url]));
const page = readFileSync(D + "page.html", "utf8").replace("/*@JS@*/", () => `var CURRENT=${JSON.stringify(current)};\n${js}`);
writeFileSync("docs/art/asset-fixes-1/looks.html", page);
console.log("looks.html", (page.length / 1024).toFixed(0), "KB");
