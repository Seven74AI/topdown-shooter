import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves under /topdown-shooter/; the VPS (Story 2.2) serves at /.
  // Do not use "./": share links at /j/<code> (Story 2.1) would break relative asset paths.
  base: process.env.BASE_PATH ?? "/",
  server: { host: true }, // reachable from a phone on the same Wi-Fi
  build: { chunkSizeWarningLimit: 1600 }, // Phaser alone is ~1.38 MB min / ~362 KB gzip
});
