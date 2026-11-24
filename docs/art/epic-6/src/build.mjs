// Builds docs/art/epic-6/looks.html (self-contained): page.html + the game's city art bundle + lib.js + main.js.
// Run from the repo root: node docs/art/epic-6/src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const D = "docs/art/epic-6/src/";
const r = await build({ entryPoints: [D + "cityEntry.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const city = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(D + "page.html", "utf8")
  .replace("/*@CITY@*/", () => city)
  .replace("/*@LIB@*/", () => readFileSync(D + "lib.js", "utf8"))
  .replace("/*@MAIN@*/", () => readdirSync(D).filter((f) => /^main\d\.js$/.test(f)).sort().map((f) => readFileSync(D + f, "utf8")).join("\n"));
writeFileSync("docs/art/epic-6/looks.html", page);
console.log("looks.html", (page.length / 1024).toFixed(0), "KB");
