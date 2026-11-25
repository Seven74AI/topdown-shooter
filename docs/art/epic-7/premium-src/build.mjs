// Builds docs/art/epic-7/premium-rewards.html (self-contained): page.html + the game's art bundle (../src/gameEntry.ts,
// read-only use of game code) + Oswald 500/600/700 woff2 as data URLs + kit.js, themes, page.js. Run from the repo root:
//   node docs/art/epic-7/premium-src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/epic-7/premium-src/";
const r = await build({ entryPoints: ["docs/art/epic-7/src/gameEntry.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none" });
const esc = (s) => s.replace(/<\/script/gi, "<\\/script");
const font = (w) => `@font-face{font-family:'Oswald';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${readFileSync(D + `fonts/oswald-latin-${w}-normal.woff2`).toString("base64")}) format('woff2')}`;
const js = ["kit.js", "content.js", "pr1.js", "pr2.js", "pr3.js", "page.js"].map((f) => readFileSync(D + f, "utf8")).join("\n");
const page = readFileSync(D + "page.html", "utf8")
  .replace("/*@FONTS@*/", () => [500, 600, 700].map(font).join("\n"))
  .replace("/*@GAME@*/", () => esc(r.outputFiles[0].text))
  .replace("/*@MAIN@*/", () => esc(js));
writeFileSync("docs/art/epic-7/premium-rewards.html", page);
console.log("premium-rewards.html", (page.length / 1024).toFixed(0), "KB");
