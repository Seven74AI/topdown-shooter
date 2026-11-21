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

**https://hordes.sevend.io/**: the client and the game server, on the designer's VPS behind a Cloudflare Tunnel (Story 2.2). After a merge to `master` with CI green, it is deployed on the VPS with `deploy/deploy.sh`; see [`docs/deploy.md`](docs/deploy.md) for setup, deploy and rollback. GitHub Pages is no longer published (it cannot run the game server).

The game is served at `/`. `BASE_PATH` still sets Vite's `base` if a sub-path is ever needed; when loading files from `apps/client/public/`, build URLs with `import.meta.env.BASE_URL` (e.g. `` `${import.meta.env.BASE_URL}static/hero.png` ``). Unhashed public files must not live under `/assets/`: Caddy caches that folder for a year (see `deploy/Caddyfile`).

## Dependencies

Versions are pinned exactly (no `^`/`~`). Add packages with `npm i -E <pkg>`. TypeScript stays on 6.0.x until typescript-eslint supports 7.x.
