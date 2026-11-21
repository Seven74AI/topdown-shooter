# topdown-shooter

A mobile-first, landscape, top-down multiplayer shooter. npm-workspaces monorepo:

| Workspace | What it is |
| --- | --- |
| `apps/client` | Phaser 4 game + Preact UI overlay, built with Vite |
| `apps/server` | Game server — a stub for now; **the Colyseus server arrives in Story 2.1** |
| `packages/shared` | Engine-free simulation rules shared by client and server (no Phaser, Colyseus, DOM or Node — enforced by lint) |

## Prerequisites

- Node.js **≥ 22.12** (Node **26** recommended — see `.nvmrc`; CI uses it)
- npm (ships with Node)

## Commands

```sh
npm install        # install all workspaces
npm run dev        # client (Vite, http://localhost:5173, also on your LAN) + server stub
npm test           # Vitest, all workspaces
npm run lint       # ESLint, including the packages/shared boundary (ADR-03)
npm run typecheck  # tsc for client, server, shared and tools
npm run build      # static client build → apps/client/dist
```

`npm run dev` listens on all interfaces, so a phone on the same Wi-Fi can open the `Network:` URL Vite prints.

## Playable link

Every push to `master` that passes CI publishes the client to GitHub Pages:

**https://seven74ai.github.io/topdown-shooter/**

Pages serves the game under `/topdown-shooter/` (the build sets `BASE_PATH=/topdown-shooter/`); the VPS (Story 2.2) serves it at `/`. When loading files from `apps/client/public/`, build URLs with `import.meta.env.BASE_URL` (e.g. `` `${import.meta.env.BASE_URL}assets/hero.png` ``) so they work under both.

## Dependencies

Versions are pinned exactly (no `^`/`~`). Add packages with `npm i -E <pkg>`. TypeScript stays on 6.0.x until typescript-eslint supports 7.x.
