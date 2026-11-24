import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), gallery: resolve(__dirname, "gallery.html") } },
  }, // Phaser alone is ~1.38 MB min / ~362 KB gzip
});
