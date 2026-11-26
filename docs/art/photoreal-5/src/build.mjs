// Builds docs/art/photoreal-5/compare.html (self-contained): page.html + fx5.ts bundled with the game's FX art code.
//   node docs/art/photoreal-5/src/build.mjs            (from the repo root)
// The game's `canvasTexture.ts` is swapped for `textureShim.ts`, so its `ensure…()` builders paint onto plain
// canvases the page can show (the "Now" column is the game's own paint code, unchanged).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const D = "docs/art/photoreal-5/src/";
const shim = {
  name: "texture-shim",
  setup(b) {
    b.onResolve({ filter: /(^|\/)canvasTexture$/ }, () => ({ path: resolve(D + "textureShim.ts") }));
    // Vite `?url` assets (the street props image): not needed on the page (the city code falls back to drawing).
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: "url-stub" }));
    b.onLoad({ filter: /.*/, namespace: "url-stub" }, () => ({ contents: 'export default "";', loader: "js" }));
  },
};
const entry = process.argv[2] ?? "fx5";
const out = process.argv[3] ?? "compare";
const r = await build({ entryPoints: [D + entry + ".ts"], bundle: true, format: "iife", minify: true, platform: "browser", target: "es2022", write: false, legalComments: "none", loader: { ".png": "dataurl" }, plugins: [shim], external: ["phaser"] });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(D + (process.argv[4] ?? "page.html"), "utf8").replace("/*@JS@*/", () => js);
writeFileSync(`docs/art/photoreal-5/${out}.html`, page);
console.log(`${out}.html`, (page.length / 1024).toFixed(0), "KB");
