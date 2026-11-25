// Story 8.1 smoke only (local, NOT committed): the client on port 5811 with /api → the server on 2812.
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, defineConfig({ server: { port: 5811, strictPort: true, host: "127.0.0.1", proxy: { "/api": { target: "http://localhost:2812", ws: true, rewrite: (p: string) => p.replace(/^\/api/, "") } } } }));
