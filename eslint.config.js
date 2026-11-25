import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { builtinModules } from "node:module";
import { defineConfig } from "eslint/config";

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
const ENGINE_FREE = "packages/shared must stay engine-free (ADR-03).";

export default defineConfig(
  { ignores: ["**/dist/**", "**/node_modules/**", "_bmad/**", "_bmad-output/**", ".claude/**", "docs/art/**", "tools/gallery/out/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ["apps/client/src/**/*.{ts,tsx}"], languageOptions: { globals: globals.browser } },
  {
    files: ["apps/server/**/*.ts", "tools/**/*.ts", "*.config.{js,ts}", "apps/client/vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // ADR-03: the shared simulation is engine-free.
    files: ["packages/shared/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["phaser", "colyseus", "preact", ...nodeBuiltins].map((name) => ({
            name,
            message: ENGINE_FREE,
          })),
          patterns: [{ group: ["@colyseus/*", "phaser/*", "preact/*", "node:*"], message: ENGINE_FREE }],
        },
      ],
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "navigator",
          "location",
          "localStorage",
          "sessionStorage",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "performance",
          "fetch",
          "WebSocket",
          // Simulation timers count ticks (architecture › Networking › Time and determinism).
          "setTimeout",
          "setInterval",
          "process",
          "Buffer",
          "require",
          "global",
          "__dirname",
          "__filename",
        ].map((name) => ({ name, message: "No DOM/Node globals in packages/shared (ADR-03)." })),
      ],
      // Determinism (NFR10) — Story 1.2 relies on this rule existing.
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG (no Math.random in shared)." },
        { object: "Date", property: "now", message: "Use tick counters (no Date.now in shared)." },
      ],
    },
  },
);
