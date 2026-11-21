---
baseline_commit: bbac715aafd478c587d050386ab99630dfafee13
---

# Story 1.1: Project scaffold with a playable link

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the designer,
I want the project set up with its three parts (client, server, shared rules) and an automatic build I can open on my phone,
so that every later story lands in a clean, checked codebase and I can try each change from a link.

## Acceptance Criteria

1. **Fresh clone runs.** Given a fresh clone, when I run `npm install` then `npm run dev`, the client opens in a browser and shows a Phaser scene with the text **"topdown-shooter"**.
2. **Workspaces and scripts.** The workspaces `apps/client`, `apps/server`, `packages/shared` exist as in the architecture directory structure, with a root `tsconfig.base.json` and root scripts `dev`, `test`, `lint`, `typecheck`, `build`.
3. **Pinned stack.** `package.json` files and `package-lock.json` show these installed at **exact** versions (no `^`/`~`): Phaser 4.2.x, Preact 11.x, Vite 8.x, TypeScript **6.0.x (not 7.x)**, Vitest 5.x, ESLint + typescript-eslint, zod 4.x.
4. **Shared boundary lint.** `packages/shared` has an ESLint rule that forbids imports from `phaser`, `colyseus`, `@colyseus/*`, DOM globals and Node built-ins (ADR-03).
5. **CI on every push.** On a push to any branch, GitHub Actions runs typecheck, lint, tests and the client build; the job fails if any of them fails.
6. **Pages publish on `master`.** On a push to `master` where the build succeeds, the static client build is published to GitHub Pages by a GitHub Actions workflow, at a URL that opens on a phone (expected: `https://seven74ai.github.io/topdown-shooter/`).
7. **Pages unavailable → stop and report.** If Pages is unavailable for the repository, the story stops and reports it so the designer can decide (make the repo public, upgrade, or move the link to the VPS). *(Checked 2026-11-21: repo is **public**, Pages **not yet enabled** — see Dev Notes › GitHub Pages.)*
8. **Landscape-ready page.** The page has `viewport-fit=cover`, devicePixelRatio capped at 2, and a "rotate your phone" overlay in portrait (FR1).

## Tasks / Subtasks

- [ ] **Task 1: Root monorepo** (AC: 2, 3)
  - [x] Root `package.json`: `"name": "topdown-shooter"`, `"private": true`, `"type": "module"`, `"workspaces": ["apps/*", "packages/*"]`, `"engines": { "node": ">=22.12" }`
  - [x] `.nvmrc` containing `26` (architecture target: Node 26 LTS; CI reads it)
  - [ ] `.npmrc` with `save-exact=true` so every `npm i` pins exactly
  - [x] `.gitignore`: `node_modules/`, `dist/`, `*.tsbuildinfo`, `.vite/`, `coverage/`, `.DS_Store`
  - [x] `tsconfig.base.json` and `tsconfig.tools.json` (see Dev Notes › TypeScript)
  - [x] Root scripts (see Dev Notes › Scripts)
- [x] **Task 2: `packages/shared`** (AC: 2, 4)
  - [x] `package.json`: `"name": "@topdown/shared"`, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }` (consumed as TS source, no build step), deps `zod` 4.6.7
  - [x] `tsconfig.json` extends base, `"lib": ["ES2023"]` (**no DOM**), `"types": []` (**no Node types**) — makes DOM/Node usage a type error as well as a lint error
  - [x] `src/config/constants.ts`: `export const GAME_TITLE = "topdown-shooter";` and `export const TICK_RATE_HZ = 20;` (game constants per architecture; no balance numbers yet)
  - [x] `src/index.ts` re-exports constants
  - [x] `src/config/constants.test.ts`: one smoke test (so `npm test` runs real tests, not "no test files")
  - [x] Empty domain folders are NOT needed — later stories create `core/`, `math/`, etc. Do not add placeholder files.
- [x] **Task 3: `apps/client`** (AC: 1, 3, 8)
  - [x] `package.json`: `"name": "@topdown/client"`, deps `phaser` 4.2.1, `preact` 11.2.0, `@topdown/shared` (`"*"`); devDeps `vite` 8.3.8
  - [x] `index.html` (see Dev Notes › Landscape page)
  - [x] `vite.config.ts` with `base` from env (see Dev Notes › Vite)
  - [x] `src/main.ts`: caps DPR, boots Phaser, mounts Preact overlay
  - [x] `src/scenes/BootScene.ts`: centered text `GAME_TITLE` imported from `@topdown/shared` (proves the cross-workspace import)
  - [x] `src/ui/RotateOverlay.tsx` + `src/ui/overlay.css`
  - [x] `tsconfig.json` (browser, JSX via Preact) and `tsconfig.node.json` (for `vite.config.ts` only)
- [x] **Task 4: `apps/server` stub** (AC: 2)
  - [x] `package.json`: `"name": "@topdown/server"`, deps `@topdown/shared`; devDeps `tsx` 4.23.15, `@types/node` (pin current 22-or-newer major)
  - [x] `src/index.ts`: prints `server stub: Colyseus arrives in Story 2.1` with `GAME_TITLE`, then keeps running under `tsx watch`
  - [x] **Do not install Colyseus yet** (see Dev Notes › Scope)
- [x] **Task 5: Lint** (AC: 4)
  - [x] Root `eslint.config.js` (flat config) with the shared-boundary block (see Dev Notes › ESLint)
  - [x] `tools/lint/sharedBoundary.test.ts`: runs ESLint programmatically on fixture code at a `packages/shared/src/...` path and asserts errors for `import "phaser"`, `import "colyseus"`, `import "@colyseus/schema"`, `import "fs"`, `import "node:fs"`, `window.x`, `document.body`, and no error for a clean file
- [x] **Task 6: Tests** (AC: 2, 5)
  - [x] Root `vitest.config.ts` including `packages/*/src/**/*.test.ts`, `apps/*/src/**/*.test.ts`, `tools/**/*.test.ts`
- [ ] **Task 7: CI + Pages workflow** (AC: 5, 6, 7)
  - [x] `.github/workflows/ci.yml` (see Dev Notes › GitHub Actions)
  - [ ] GitHub Pages source must be "GitHub Actions" (see Dev Notes › GitHub Pages) — **ask the designer before changing repo settings**
- [x] **Task 8: README.md** at root: prerequisites (Node ≥ 22.12, 26 recommended), the 5 commands, the Pages URL, and "Colyseus server arrives in Story 2.1"
- [x] **Task 9: Verify locally** (AC: 1–5, 8) — run every command in Dev Notes › Verification and record results in the Dev Agent Record

## Dev Notes

### Scope (read first)

- This is a **greenfield scaffold**. The repo today holds only `_bmad/`, `_bmad-output/`, `.claude/`, `HANDOFF.md`. There is no code to preserve. Do not touch `_bmad/`, `_bmad-output/` (except this story file's Dev Agent Record and sprint status) or `.claude/`.
- **In scope:** workspaces, toolchain, lint boundary, one smoke test, a Phaser scene with a title, rotate overlay, DPR cap, CI, Pages deploy.
- **Out of scope (later stories — do not build now):** World/step/RNG/balance/zod schemas (1.2), joysticks and camera (1.3), Colyseus server, pino, `/health` (2.1), Docker/Caddy/`deploy/` (2.2), web app manifest and home-screen install (10.5), `docs/`, `tools/bots`, `tools/maps`.
- **Colyseus:** the architecture's init snippet installs `colyseus`, `@colyseus/schema`, `@colyseus/sdk`. Story 1.1's AC pin list excludes them and nothing uses them until Story 2.1, so **leave them out** (unused deps would widen typecheck/lint surface and pull Node-only code near the client). Story 2.1 pins `colyseus` 0.18.12, `@colyseus/schema` 5.0.50, `@colyseus/sdk` 0.18.10 (npm, 2026-11-21).
- **Preact plugin:** do **not** add `@preact/preset-vite` (it needs `@babel/core` as a peer). Vite 8's built-in transformer honors tsconfig `"jsx": "react-jsx"` + `"jsxImportSource": "preact"` — verified with a scratch build on 2026-11-21.

### Pinned versions (npm, verified 2026-11-21)

Install with `npm i -E` (or rely on `.npmrc save-exact=true`). Exact, no ranges:

| Package | Version | Workspace | Note |
| --- | --- | --- | --- |
| phaser | 4.2.1 | client dep | ships its own types (`types/phaser.d.ts`) |
| preact | 11.2.0 | client dep | |
| vite | 8.3.8 | client devDep | Node `^20.19 \|\| >=22.12` |
| typescript | **6.0.3** | root devDep | latest is 7.0.2 — **do not use 7.x**: typescript-eslint 8.73.0 peer is `>=4.8.4 <6.1.0` |
| vitest | 5.1.1 | root devDep | Node `^22.12 \|\| ^24 \|\| >=26` |
| eslint | 10.15.0 | root devDep | |
| @eslint/js | 10.0.1 | root devDep | |
| typescript-eslint | 8.73.0 | root devDep | |
| globals | 17.14.0 | root devDep | browser/node globals for non-shared blocks |
| zod | 4.6.7 | shared dep | |
| tsx | 4.23.15 | server devDep | |
| concurrently | 10.0.7 | root devDep | runs client + server in `dev`; Node `>=22` |
| @types/node | pin the current version at install time | root devDep (used by server, vite config, tools) | |

Before installing, re-run `npm view <pkg> version` once; if a patch moved, take it **only within the same minor** and record it in Completion Notes. Never take TypeScript 6.1+ or 7.x.

The dev container has **Node 22.22.2** (not 26). That satisfies every engine above, which is why `engines` is `>=22.12` while `.nvmrc` says `26` for CI.

### TypeScript

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- `apps/client/tsconfig.json`: extends base; `"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"jsx": "react-jsx"`, `"jsxImportSource": "preact"`, `"types": ["vite/client"]`, `"include": ["src"]`.
- `apps/client/tsconfig.node.json`: extends base; `"types": ["node"]`, `"include": ["vite.config.ts"]`. Client typecheck runs both (`tsc -p tsconfig.json && tsc -p tsconfig.node.json`) so Node types never leak into browser code.
- `apps/server/tsconfig.json`: extends base; `"lib": ["ES2023"]`, `"types": ["node"]`, `"include": ["src"]`.
- `packages/shared/tsconfig.json`: extends base; `"lib": ["ES2023"]`, `"types": []`, `"include": ["src"]`.
- Root `tsconfig.tools.json`: extends base; `"lib": ["ES2023"]`, `"types": ["node"]`, `"include": ["tools", "vitest.config.ts"]` — otherwise `tools/` and the root config are never typechecked.
- `verbatimModuleSyntax` is on → use `import type { X }` for type-only imports.
- **Phaser import:** `import * as Phaser from "phaser";` — Phaser's types are `export = Phaser`, and the ESM build has named exports; this form typechecks under `verbatimModuleSyntax` without `esModuleInterop` (verified).
- Workspace imports use the package name (`import { GAME_TITLE } from "@topdown/shared"`), never relative paths across workspaces.

### Scripts

Root `package.json`:

```jsonc
"scripts": {
  "dev": "concurrently -n client,server -c cyan,magenta \"npm run dev -w @topdown/client\" \"npm run dev -w @topdown/server\"",
  "build": "npm run build -w @topdown/client",
  "typecheck": "npm run typecheck --workspaces --if-present && tsc -p tsconfig.tools.json",
  "lint": "eslint .",
  "test": "vitest run"
}
```

- client: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`, `"typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json"`
- server: `"dev": "tsx watch src/index.ts"`, `"typecheck": "tsc -p tsconfig.json"` (no server build in 1.1; Story 2.2 adds the Docker build)
- shared: `"typecheck": "tsc -p tsconfig.json"`
- `build` builds the client only — AC 5 says "the client build". Typecheck covers server and shared.

### Vite

`apps/client/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves under /topdown-shooter/; the VPS (Story 2.2) serves at /.
  base: process.env.BASE_PATH ?? "/",
  server: { host: true },               // reachable from a phone on the same Wi-Fi
  build: { chunkSizeWarningLimit: 1600 } // Phaser alone is ~1.38 MB min / ~362 KB gzip
});
```

- **Do not use `base: "./"`**: Story 2.1 serves share links at `/j/<code>`, where relative asset paths break.
- The Pages workflow sets `BASE_PATH=/topdown-shooter/`. Verified: `vite build --base=/topdown-shooter/` emits `src="/topdown-shooter/assets/…"`.
- Later stories load assets from `public/assets/…`; they must build URLs with `import.meta.env.BASE_URL` so they work under both bases. Note this in the README.

### Landscape page (AC 8, FR1)

`apps/client/index.html`:

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
- `<title>topdown-shooter</title>`, `<meta name="theme-color" content="#000000">`
- Body: `<div id="game"></div>` and `<div id="ui"></div>`, then `<script type="module" src="/src/main.ts"></script>`
- Global CSS: `html, body { margin:0; height:100%; background:#000; overflow:hidden; touch-action:none; overscroll-behavior:none; -webkit-user-select:none; user-select:none; }` and `#game, #ui { position:fixed; inset:0; }`; `#ui { pointer-events:none; }` (architecture: the Preact overlay passes touches through except on active screens).

**DPR cap (Phaser 4 has no `resolution` config option — verified in 4.2.1 types).** Render at `min(devicePixelRatio, 2)` by sizing the canvas in device pixels and zooming it back down:

```ts
// apps/client/src/main.ts
import * as Phaser from "phaser";
import { render, h } from "preact";
import { BootScene } from "./scenes/BootScene";
import { RotateOverlay } from "./ui/RotateOverlay";
import "./ui/overlay.css";

const MAX_DPR = 2; // architecture: Client Platform Budgets
const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#000000",
  width: Math.round(window.innerWidth * dpr()),
  height: Math.round(window.innerHeight * dpr()),
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  scene: [BootScene],
});

window.addEventListener("resize", () => {
  game.scale.resize(Math.round(window.innerWidth * dpr()), Math.round(window.innerHeight * dpr()));
  game.scale.setZoom(1 / dpr());
});

render(h(RotateOverlay, {}), document.getElementById("ui")!);
```

- Result: `canvas.width === round(innerWidth × min(dpr, 2))`, CSS size = viewport. A 3× phone renders at 2×.
- `BootScene` must center its text on `this.scale.width/2, this.scale.height/2` and re-center on `this.scale.on("resize", …)` (rotation). Font size should scale by `dpr()` so it reads the same on every phone (e.g. `32 * dpr()` px). Text color white. `MAX_DPR` is a platform constant, not a gameplay number, so it may live in client code.
- Keep the scene minimal — no camera/world setup; Story 1.3 owns the camera (24 × 13.5 m view).

**Rotate overlay:** `RotateOverlay.tsx` renders a full-screen `<div class="rotate-overlay">` with a phone glyph/emoji and "Rotate your phone". `overlay.css`:

```css
.rotate-overlay { display:none; }
@media (orientation: portrait) {
  .rotate-overlay {
    display:flex; position:fixed; inset:0; z-index:10; pointer-events:auto;
    align-items:center; justify-content:center; flex-direction:column; gap:16px;
    background:#000; color:#fff; font:600 20px/1.3 system-ui, sans-serif; text-align:center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
}
```

- CSS media query (not JS) so it reacts instantly on rotation and costs nothing. `pointer-events:auto` only while visible so it blocks play in portrait.
- Do **not** call `screen.orientation.lock()` (fails outside fullscreen on most browsers; Story 10.5 owns the manifest/fullscreen).

### ESLint (AC 4)

Root `eslint.config.js` (flat config, `defineConfig` from `"eslint/config"` — the current API; `tseslint.config()` is deprecated):

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { builtinModules } from "node:module";
import { defineConfig } from "eslint/config";

const nodeBuiltins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig(
  { ignores: ["**/dist/**", "**/node_modules/**", "_bmad/**", "_bmad-output/**", ".claude/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ["apps/client/src/**/*.{ts,tsx}"], languageOptions: { globals: globals.browser } },
  { files: ["apps/server/**/*.ts", "tools/**/*.ts", "*.config.{js,ts}", "apps/client/vite.config.ts"],
    languageOptions: { globals: globals.node } },
  {
    // ADR-03: the shared simulation is engine-free.
    files: ["packages/shared/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["phaser", "colyseus", "preact", ...nodeBuiltins].map((name) => ({
          name, message: "packages/shared must stay engine-free (ADR-03).",
        })),
        patterns: [{ group: ["@colyseus/*", "phaser/*", "preact/*", "node:*"],
          message: "packages/shared must stay engine-free (ADR-03)." }],
      }],
      "no-restricted-globals": ["error",
        ...["window", "document", "navigator", "location", "localStorage", "sessionStorage",
            "requestAnimationFrame", "cancelAnimationFrame", "performance", "fetch", "WebSocket",
            "setTimeout", "setInterval", "process", "Buffer", "require", "global", "__dirname", "__filename"]
          .map((name) => ({ name, message: "No DOM/Node globals in packages/shared (ADR-03)." }))],
      // Determinism (NFR10) — Story 1.2 relies on this rule existing.
      "no-restricted-properties": ["error",
        { object: "Math", property: "random", message: "Use the seeded RNG (no Math.random in shared)." },
        { object: "Date", property: "now", message: "Use tick counters (no Date.now in shared)." }],
    },
  },
);
```

- Test files inside `packages/shared` fall under the same rules — that is intended (Vitest's `import { test } from "vitest"` is not restricted).
- `setTimeout`/`setInterval` are restricted because simulation timers count ticks (architecture › Networking › Time and determinism).
- Untyped (non-type-aware) linting is enough for now; it keeps `npm run lint` fast.

**`tools/lint/sharedBoundary.test.ts`** — proves AC 4 rather than trusting config:

```ts
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });
const lintShared = async (code: string) =>
  (await eslint.lintText(code, { filePath: "packages/shared/src/__fixture__.ts" }))[0]!.messages
    .filter((m) => m.severity === 2).map((m) => m.ruleId);
// it.each over: 'import "phaser";', 'import "colyseus";', 'import "@colyseus/schema";',
// 'import "fs";', 'import "node:fs";', 'export const w = window;', 'export const d = document.body;',
// 'export const r = Math.random();'  → expect at least one restricted-* rule id
// clean: 'export const x = 1;' → expect []
```

`lintText` with a `filePath` that doesn't exist on disk is fine — ESLint only uses it to match config blocks.

### Vitest

Root `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tools/**/*.test.ts"], environment: "node" },
});
```

Smoke test `packages/shared/src/config/constants.test.ts`: `expect(GAME_TITLE).toBe("topdown-shooter")` and `expect(TICK_RATE_HZ).toBe(20)`. Tests live next to code (`foo.ts` → `foo.test.ts`).

### GitHub Actions (AC 5, 6)

Latest action majors (checked via GitHub API 2026-11-21): `actions/checkout@v7`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`.

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: ["**"]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env: { BASE_PATH: /topdown-shooter/ }
      - if: github.event_name == 'push' && github.ref == 'refs/heads/master'
        uses: actions/upload-pages-artifact@v5
        with: { path: apps/client/dist }

  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'
    needs: check
    runs-on: ubuntu-latest
    permissions: { pages: write, id-token: write }
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    concurrency: { group: pages, cancel-in-progress: false }
    steps:
      - uses: actions/configure-pages@v6
      - id: deployment
        uses: actions/deploy-pages@v5
```

- Each `run` step fails the job on non-zero exit → AC 5. `deploy` only runs after `check` passes → AC 6 "when the build succeeds".
- Commit `package-lock.json`; CI uses `npm ci`.
- Building with `BASE_PATH=/topdown-shooter/` on every branch is harmless and keeps one build path.

### GitHub Pages (AC 6, 7)

- Checked 2026-11-21 with `gh api repos/Seven74AI/topdown-shooter`: `"visibility": "public"`, `"has_pages": false`. So Pages **is available** (AC 7 stop condition does not apply), but it is **not enabled**.
- Pages must be set to **Source: GitHub Actions** (Settings → Pages → Build and deployment → Source). Without it, `deploy-pages` fails with a "Pages not enabled" / 404 error.
- `configure-pages`' `enablement: true` input does **not** work with the default `GITHUB_TOKEN`; don't rely on it.
- Enabling it is a repository-settings change: **ask the designer first.** Offer either (a) they click it in Settings, or (b) with their OK, run `gh api -X POST repos/Seven74AI/topdown-shooter/pages -f build_type=workflow`.
- If the repo has become private again, or Pages is refused, **stop and report** per AC 7 (options: make public, upgrade plan, or move the link to the VPS in Story 2.2).
- Expected URL: `https://seven74ai.github.io/topdown-shooter/`. A deploy needs a push to `master`; per the designer's workflow, commits/pushes happen only when they ask. If the deploy can't be observed in this story, say so plainly in Completion Notes instead of claiming AC 6.

### Verification (Task 9)

Run from a clean state (`rm -rf node_modules apps/*/node_modules packages/*/node_modules && npm install`) and record each result:

1. `npm run typecheck` → 0 errors (client both tsconfigs, server, shared)
2. `npm run lint` → 0 errors
3. `npm test` → constants smoke test + shared-boundary lint tests pass
4. `npm run build` and `BASE_PATH=/topdown-shooter/ npm run build` → succeed; second emits `/topdown-shooter/assets/...` in `apps/client/dist/index.html`
5. `npm run dev` → both `[client]` (Vite URL, default 5173) and `[server]` (stub line) appear; `curl -s localhost:5173 | grep viewport-fit=cover` matches
6. Negative check: temporarily add `import "phaser";` to a shared file → `npm run lint` fails; remove it
7. Exact pins: `grep -RnE '"[~^]' package.json apps/*/package.json packages/*/package.json` → no hits for dependencies; `npm ls typescript` shows 6.0.x only
8. Visual check of the Phaser text, DPR cap and rotate overlay needs a browser: if no headless browser is available, state that, and ask the designer to open the dev URL (or the Pages URL) on their phone in portrait and landscape.

### Project Structure Notes

Files created by this story (everything else in the architecture tree comes later):

```
.github/workflows/ci.yml
.gitignore  .npmrc  .nvmrc  README.md
package.json  package-lock.json  tsconfig.base.json  tsconfig.tools.json  eslint.config.js  vitest.config.ts
apps/client/{package.json, index.html, vite.config.ts, tsconfig.json, tsconfig.node.json}
apps/client/src/{main.ts, scenes/BootScene.ts, ui/RotateOverlay.tsx, ui/overlay.css}
apps/server/{package.json, tsconfig.json}  apps/server/src/index.ts
packages/shared/{package.json, tsconfig.json}
packages/shared/src/{index.ts, config/constants.ts, config/constants.test.ts}
tools/lint/sharedBoundary.test.ts
```

- Naming: modules `camelCase.ts`; one-class/component files `PascalCase.ts(x)` (`BootScene.ts`, `RotateOverlay.tsx`); constants `UPPER_SNAKE_CASE`.
- Variance from architecture: `tools/lint/` is new (the tree lists `tools/bots`, `tools/maps`); it holds repo-tooling tests that must not live in `packages/shared` because they import Node/ESLint. Package names use the `@topdown/` scope (architecture doesn't name them).
- `BootScene` is the architecture's first scene (Boot → Preload → Game). Later stories add `PreloadScene`, `GameScene`, `HudScene` and may turn BootScene into a pure loader — keep it tiny.

### Project Context Rules

No `project-context.md` exists yet. Rules from the architecture that apply now:

- `packages/shared` imports nothing from Phaser, Colyseus, DOM or Node (ADR-03) — enforced by this story's lint + tsconfig.
- No `Math.random()` / `Date.now()` in shared (NFR10).
- No gameplay number inline; balance lives in `packages/shared/src/config/balance/*.json` (from Story 1.2). Constants like `TICK_RATE_HZ` go in `config/constants.ts`.
- Rendering code never changes simulation state.
- Tests next to source.
- Context7 MCP is not installed (`claude mcp add context7 -- npx -y @upstash/context7-mcp`); if unavailable, check APIs against the installed `node_modules/*/types` rather than memory — Phaser 4 differs from Phaser 3 (e.g. no `resolution` game config).

### References

- Story and ACs: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Project scaffold with a playable link]
- Stack + versions: [Source: _bmad-output/planning-artifacts/game-architecture.md#Selected Stack], [#Decision Summary]; [Source: HANDOFF.md#6b. Story 1.1 prep]
- Directory structure, naming: [Source: game-architecture.md#Directory Structure], [#Naming Conventions]
- Boundaries (ADR-03): [Source: game-architecture.md#Architectural Boundaries], [#Architecture Decision Records]
- Platform budgets (DPR ≤ 2, viewport-fit, rotate overlay, pointer-events): [Source: game-architecture.md#Client Platform Budgets]
- Dev scripts and Node target: [Source: game-architecture.md#Development Environment]
- FR1, NFR8: [Source: epics.md#Functional Requirements], [#NonFunctional Requirements]
- Pages decision and blocker: [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-11-21.md#Q5], resolutions table; [Source: HANDOFF.md#4. Open items]
- Story 2.1 (Colyseus, `/j/<code>`), 2.2 (VPS replaces Pages), 10.5 (manifest): [Source: epics.md]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Red → green: `constants.test.ts` failed (module missing) before `constants.ts`; `sharedBoundary.test.ts` failed 16/16 before `eslint.config.js`, then passed.
- Writing `.npmrc` with the Write tool was **denied by the harness permission check** ("sensitive file"). I did not try to get around it. Every install used `npm i -E` instead, so all pins are still exact.
- `gh api repos/Seven74AI/topdown-shooter` (2026-11-21): `visibility: public`, `has_pages: false`; `GET …/pages` → 404. Pages is available but not enabled.
- Action majors re-checked via GitHub API: checkout v7.0.1, setup-node v7.1.0, configure-pages v6.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1. These match the Dev Notes.
- `npm view` (2026-11-21): every pinned version is unchanged from the Dev Notes table. `@types/node` is pinned at 26.6.6.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:** npm-workspaces monorepo (`apps/client`, `apps/server`, `packages/shared`), strict TS 6.0.3 configs (shared has no DOM/Node libs; client splits browser vs `vite.config.ts`; `tsconfig.tools.json` covers `tools/` + `vitest.config.ts`), Phaser 4.2.1 BootScene with the centered `GAME_TITLE` from `@topdown/shared`, DPR cap via device-pixel canvas + `1/dpr` zoom, Preact rotate overlay (CSS media query), server stub under `tsx watch`, flat ESLint config with the ADR-03/NFR10 shared boundary, root Vitest config, CI + Pages workflow, README.
- **Deviations from Dev Notes (small, deliberate):**
  - `MAX_DPR`/`dpr()` live in `apps/client/src/display.ts`, not in `main.ts`. `BootScene` also needs `dpr()`, and importing it from `main.ts` would create a circular import. This also made the cap unit-testable (`display.test.ts`).
  - `@types/node` is a **root** devDep (per the Pinned versions table: "used by server, vite config, tools"), not a server devDep as Task 4's text says. The server resolves it through hoisting, and typecheck passes.
  - The boundary test covers more than the minimum: `phaser/*`, `preact`, `process`, `setTimeout`, `Date.now`. It also asserts that vitest is allowed in shared tests and that the boundary does not apply to client code.
  - `main.ts` guards `#ui` with `if (ui)` instead of a non-null `!`, to avoid the lint warning.
- **Verification (Task 9), from a clean `rm -rf node_modules … && npm install`:**
  1. `npm run typecheck` → exit 0, 0 TS errors (client both tsconfigs, server, shared, tools).
  2. `npm run lint` → exit 0, 0 problems.
  3. `npm test` → 3 files, 25 tests passed (constants 2, display/DPR 7, shared boundary 16).
  4. `npm run build` → ok (JS 1,379.88 kB / 362.43 kB gzip, under the 1600 kB warning limit); `BASE_PATH=/topdown-shooter/ npm run build` → `dist/index.html` has `src="/topdown-shooter/assets/index-….js"` and `href="/topdown-shooter/assets/index-….css"`.
  5. `npm run dev` → `[client] VITE v8.3.8 ready … Local: http://localhost:5173/` (+ Network URLs) and `[server] [topdown-shooter] server stub: Colyseus arrives in Story 2.1`; `curl -s localhost:5173 | grep viewport-fit=cover` matched.
  6. Negative check: appending `import "phaser";` to `packages/shared/src/index.ts` → `npm run lint` exit 1 (`no-restricted-imports … engine-free (ADR-03)`). After reverting: exit 0, file identical.
  7. `grep -RnE '"[~^]' package.json apps/*/package.json packages/*/package.json` → no hits; `npm ls typescript --all` → only `typescript@6.0.3`. Installed: phaser 4.2.1, preact 11.2.0, vite 8.3.8, vitest 5.1.1, eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.73.0, globals 17.14.0, zod 4.6.7, tsx 4.23.15, concurrently 10.0.7, @types/node 26.6.6. Colyseus is not installed.
  8. Visual check with Playwright's cached `chrome-headless-shell` against `vite preview`, `--force-device-scale-factor=3`. Landscape 844×390 shows the centered white "topdown-shooter" title, and the canvas is `width=1688 height=780`, CSS `844×390`. That means 2× rendering on a 3× device, so the DPR cap works. Portrait 390×844 shows the full-screen "📱↻ Rotate your phone" overlay. **This was not checked on a real phone**: the designer should open the dev URL or the Pages URL in portrait and landscape.
- **Open: needs the designer (the two unchecked subtasks):**
  - **`.npmrc` (Task 1):** the harness blocked creating it. Designer: create `.npmrc` at the repo root containing `save-exact=true`, or allow the write. Until then, use `npm i -E`; the README says so.
  - **Pages source (Task 7):** I did not change repo settings. Pages is available (public repo), so the AC 7 stop condition does **not** apply. Designer: either set Settings → Pages → Source = "GitHub Actions", or approve `gh api -X POST repos/Seven74AI/topdown-shooter/pages -f build_type=workflow`.
  - **AC 5/6 not observed in this story.** Nothing was committed or pushed (orchestrator instruction), so no CI run or Pages deploy has happened yet. The workflow YAML parses and runs the same commands verified locally. Expected URL after the first green push to `master` with Pages enabled: https://seven74ai.github.io/topdown-shooter/

### File List

- `.github/workflows/ci.yml` (new)
- `.gitignore` (new)
- `.nvmrc` (new)
- `README.md` (new)
- `package.json` (new)
- `package-lock.json` (new)
- `tsconfig.base.json` (new)
- `tsconfig.tools.json` (new)
- `eslint.config.js` (new)
- `vitest.config.ts` (new)
- `apps/client/package.json` (new)
- `apps/client/index.html` (new)
- `apps/client/vite.config.ts` (new)
- `apps/client/tsconfig.json` (new)
- `apps/client/tsconfig.node.json` (new)
- `apps/client/src/main.ts` (new)
- `apps/client/src/display.ts` (new)
- `apps/client/src/display.test.ts` (new)
- `apps/client/src/scenes/BootScene.ts` (new)
- `apps/client/src/ui/RotateOverlay.tsx` (new)
- `apps/client/src/ui/overlay.css` (new)
- `apps/server/package.json` (new)
- `apps/server/tsconfig.json` (new)
- `apps/server/src/index.ts` (new)
- `packages/shared/package.json` (new)
- `packages/shared/tsconfig.json` (new)
- `packages/shared/src/index.ts` (new)
- `packages/shared/src/config/constants.ts` (new)
- `packages/shared/src/config/constants.test.ts` (new)
- `tools/lint/sharedBoundary.test.ts` (new)
- `_bmad-output/implementation-artifacts/1-1-project-scaffold-with-a-playable-link.md` (modified: frontmatter, tasks, Dev Agent Record, status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified: story status)
- Not created: `.npmrc` (write blocked; see Completion Notes)

## Change Log

- 2026-11-21: Story 1.1 implemented: monorepo scaffold, Phaser BootScene, DPR cap, rotate overlay, server stub, shared lint boundary, Vitest, CI + Pages workflow, README. 25 tests passing. Still open: `.npmrc` (write blocked) and enabling Pages (needs designer approval).
