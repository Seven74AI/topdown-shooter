// Builds docs/art/epic-7/looks.html (self-contained): page.html + the game's art bundle + the game's overlay.css
// (each phone frame is an iframe styled by the real overlay.css) + main.js. Run from the repo root:
//   node docs/art/epic-7/src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const D = "docs/art/epic-7/src/";
const r = await build({ entryPoints: [D + "gameEntry.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const esc = (s) => s.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("apps/client/src/ui/overlay.css", "utf8");
const page = readFileSync(D + "page.html", "utf8")
  .replace("/*@GAME@*/", () => esc(r.outputFiles[0].text))
  .replace("/*@OVERLAY@*/", () => esc(JSON.stringify(css)))
  .replace("/*@MAIN@*/", () => esc(readdirSync(D).filter((f) => /^main\d\.js$/.test(f)).sort().map((f) => readFileSync(D + f, "utf8")).join("\n")));
writeFileSync("docs/art/epic-7/looks.html", page);
console.log("looks.html", (page.length / 1024).toFixed(0), "KB");
