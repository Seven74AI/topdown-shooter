import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";

/** The cheat panel's lazy entry module name (Story 10.11). */
const ADMIN_CHUNK = "adminTools";

/** Story 10.4 (B5): Phaser's own long-lived chunk, so a deploy that doesn't change Phaser keeps the phone's cached copy. */
const VENDOR_PHASER = "vendor-phaser";

/** The placeholder in index.html that the loading screen's script replaces. */
const LOADER_MARK = "<!-- boot-loader-script -->";

/** Story 10.4 (B6): the first-load files of a built page: its module script, modulepreloads and stylesheets, in order. */
export function firstLoadPaths(html: string): string[] {
  const out: string[] = [];
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+\.(?:js|css))"[^>]*>/g;
  for (const m of html.matchAll(re)) if (!out.includes(m[1] as string)) out.push(m[1] as string);
  return out;
}

/** The loading screen's script without comments and indentation: the ES5 source as written (no minifier: it emits newer syntax). */
export function loaderScript(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\s\/\/ .*$/, "").trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n");
}

/**
 * Story 10.4 (B6): writes the loading screen's script into index.html, with (in a build) the list of first-load files and
 * their gzip sizes, so the bar fills as they arrive. Pages without the placeholder (the gallery) are left alone.
 */
function bootLoaderPlugin(): Plugin {
  const file = resolve(import.meta.dirname, "boot/bootLoader.js");
  const script = loaderScript(readFileSync(file, "utf8")); // ≤ 2 KB inline, ES5 (bootLoader.test.ts)
  return {
    name: "topdown-boot-loader",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!html.includes(LOADER_MARK)) return html;
        const base = process.env.BASE_PATH ?? "/";
        const files: [string, number][] = [];
        for (const path of ctx.bundle ? firstLoadPaths(html) : []) {
          const item = ctx.bundle?.[path.startsWith(base) ? path.slice(base.length) : path];
          if (!item) continue;
          const body = item.type === "chunk" ? item.code : item.source;
          files.push([path, gzipSync(body).length]);
        }
        const manifest = files.length ? `window.__BL_FILES=${JSON.stringify(files)};\n` : "";
        return html.replace(LOADER_MARK, `<script>\n${manifest}${script}\n</script>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [bootLoaderPlugin()],
  // GitHub Pages serves under /topdown-shooter/; the VPS (Story 2.2) serves at /.
  // Do not use "./": share links at /j/<code> (Story 2.1) would break relative asset paths.
  base: process.env.BASE_PATH ?? "/",
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    // The client always talks to `${location.origin}/api` (Story 2.1); Caddy does the same in production (2.2).
    proxy: {
      "/api": { target: "http://localhost:2567", ws: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    // The asset gallery (/gallery.html) is a second page so the designer can review every code-drawn asset.
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, "index.html"), gallery: resolve(import.meta.dirname, "gallery.html") },
      // Story 10.11 (AC 8): the admin-only cheat panel (`src/debug/adminTools.ts`) gets one fixed, neutral name,
      // `assets/admin-tools-<hash>.{js,css}`, which the release cheat scan exempts (and checks exists). Others: Vite's defaults.
      output: {
        manualChunks: (id) => (/[\\/]node_modules[\\/]phaser[\\/]/.test(id) ? VENDOR_PHASER : undefined),
        chunkFileNames: (c) => (c.name === ADMIN_CHUNK ? "assets/admin-tools-[hash].js" : "assets/[name]-[hash].js"),
        assetFileNames: (a) => (a.names.includes(`${ADMIN_CHUNK}.css`) ? "assets/admin-tools-[hash][extname]" : "assets/[name]-[hash][extname]"),
      },
    },
  }, // Phaser alone is ~1.38 MB min / ~362 KB gzip
});
