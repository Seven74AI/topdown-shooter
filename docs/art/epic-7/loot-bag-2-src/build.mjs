// Builds docs/art/epic-7/loot-bag-2.html (self-contained). Run from the repo root: node docs/art/epic-7/loot-bag-2-src/build.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const D = "docs/art/epic-7/loot-bag-2-src/";
// read-only use of game code: eventArt's crate + smoke painters are module-private, so this page re-exports them
const exportPainters = { name: "export-painters", setup(b) { b.onLoad({ filter: /render[\\/]city[\\/]eventArt\.ts$/ }, (a) => ({ contents: readFileSync(a.path, "utf8") + "\nexport { drawCrate, drawPuff };\n", loader: "ts" })); } };
const r = await build({ entryPoints: [D + "entry.ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none", plugins: [exportPainters] });
const font = (w) => `@font-face{font-family:'Oswald';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${readFileSync(`docs/art/epic-7/premium-src/fonts/oswald-latin-${w}-normal.woff2`).toString("base64")}) format('woff2')}`;
const page = readFileSync(D + "page.html", "utf8").replace("/*@FONTS@*/", () => [600, 700].map(font).join("\n")).replace("/*@MAIN@*/", () => r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
writeFileSync("docs/art/epic-7/loot-bag-2.html", page);
console.log("loot-bag-2.html", (page.length / 1024).toFixed(0), "KB");
