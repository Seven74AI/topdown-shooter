# Handoff: topdown-shooter

Session handoff written 2026-11-21. **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom. No file to attach.

## 1. The project in one paragraph

A 2D top-down **online co-op zombie horde shooter for 2–4 friends, played in a phone browser from a shared link** (no install). A run is 10 waves (~20–25 min): the district the team picked decays from a normal evening to total collapse (5 decay stages that change gameplay: cars as cover, fires, rubble, blackout). Between waves there is a 30 s build phase with a personal-wallet roguelike shop (weapons, gear, turrets, barricades). Wave 10 has a boss (the Behemoth), then an extract-or-stay vote; staying starts endless mode. Unlocks carry over between runs. Art direction: **"Dead City"** (gritty, realistic, rainy city at night). It is a passion project for the designer and their friend group, built with AI agents using the **BMAD method**.

## 2. BMAD progress

| Phase | Status | File |
| --- | --- | --- |
| Game Brief | ✅ final v1.0 | `_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md` (+ `addendum.md`, `.decision-log.md`) |
| GDD | ✅ final v1.0 | `_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md` (+ `epics.md`, `decision-log.md`) |
| Game Architecture | ✅ complete (9/9 steps) | `_bmad-output/planning-artifacts/game-architecture.md` |
| Epics & stories | ✅ complete (10 epics, 101 stories) | `_bmad-output/planning-artifacts/epics.md` |
| Implementation readiness | ✅ READY (0 critical, 5 major, 8 minor) | `_bmad-output/planning-artifacts/implementation-readiness-report-2026-11-21.md` |
| Sprint planning | ✅ `sprint-status.yaml` generated (all backlog) | `_bmad-output/implementation-artifacts/sprint-status.yaml` |
| Readiness fixes | ✅ applied (101 stories, new Story 2.11 in-run menu) | see "Resolutions" in the readiness report |
| **Story 1.1** | ✅ **done** — live at hordes.sevend.io + Pages | `_bmad-output/implementation-artifacts/1-1-project-scaffold-with-a-playable-link.md` |

Decision logs record every decision and why. Read them before changing anything.

## 3. Key decisions (details in the docs)

- **Design:** 4 pillars as decision rules: Horde chaos (more zombies, never tougher ones), Build your stand (never enough money), A city that falls (decay changes play), Better together. Twin-stick on touch, landscape, auto-fire while aiming, 8° aim assist. 2 weapon slots, 10 weapons, upgrades I–IV. 6 zombie types (Walker, Runner, Crawler, Spitter, Bloater, Brute) + Behemoth boss. Revive model. Personal wallets with anti-snowball rules. 6-card roguelike shop. 6 special events. Supplies meta-currency, capped Training boosts. Gore: blood + dismemberment (toggle).
- **Tech:** Phaser 4.2 client · Colyseus 0.18 server (`@colyseus/sdk` client) · TypeScript **6.0** (not 7.0: typescript-eslint unsupported yet) · Vite · Preact menus · npm-workspaces monorepo (`apps/client`, `apps/server`, `packages/shared`). Server-authoritative 20 Hz, local-player prediction, custom 8-byte-per-zombie binary horde stream (≤ 24 KB/s), flow-field pathfinding, Tiled maps with one layer group per decay stage, PostgreSQL 18 + Drizzle, Docker Compose + Caddy.
- **Hosting:** the designer's existing Linux VPS in Europe (6 vCPU, 12 GB RAM, ~23 GB free — this Hermes host); the game lives on **https://hordes.sevend.io/** (chosen 2026-11-21). Static client already served there via Cloudflare Tunnel `sevend-io-stream` → localhost:8080 (systemd `topdown-shooter.service`, Caddy `deploy/Caddyfile`).
- **Art production:** placeholder/AI art for Epics 1–8, hired artist + sound designer for Epic 9.
- **Milestone 1 (Epics 1–4):** prove online co-op with big hordes on phones (2–4 players, Downtown, 4 weapons incl. one per range, 3 zombie types, turret + barricade, shop, 5 waves, 3 decay stages).

## 4. Open items (non-blocking)

- Working title (still "topdown-shooter").
- Before Story 2.2: a deploy key / SSH access for the VPS (subdomain resolved: hordes.sevend.io; static client already live there).
- GitHub Pages is live at https://seven74ai.github.io/topdown-shooter/ (Story 1.1 temporary link; superseded by hordes.sevend.io once Story 2.2 serves the full game).
- VPS access for Story 2.2: the Hermes host IS the target VPS (Story 1.1 static client already deployed there). The CLOUD BMAD container still has no access; Story 2.2's server deploy runs from Hermes, not the cloud container. Tailscale still suggested for designer SSH.
- Order of future districts (candidates: Hospital, Suburbs, Port, Subway, Mall, Military checkpoint; CCTV intro and Blood Moon cemetery as special content).
- Context7 MCP not installed yet: `claude mcp add context7 -- npx -y @upstash/context7-mcp`.

## 5. Visual references (published artifacts)

- Style lab round 1: https://claude.ai/artifact/G8N42QpzGjSPifo8tKJoXe
- Style lab round 2: https://claude.ai/artifact/8N79PkoxJdUUzQ79hkWzgZ
- Style lab round 3 (Dead City + zombie bestiary): https://claude.ai/artifact/RtHRcukvd4yHyKv5pmTtoX
- Dead City decay over 5 stages: https://claude.ai/artifact/BN9JyRUzE3ARtCd1UzV8Fj

Local copies live next to the brief (`style-lab*.html`, `dead-city-decay.html`). The round 3 file contains working canvas code for humanoid zombies, the six zombie types, and blackout lighting that can seed Epic 1 prototypes.

## 6. Environment gotchas from the first session

- **BMAD install** (already done, `_bmad/` and `.claude/skills/` are in the repo): v6.12.4 with modules `bmm` and `gds` (Game Dev Studio v0.7.2). If reinstalling, the GitHub token in the cloud env breaks the tag lookup; run with `env -u GITHUB_TOKEN -u GH_TOKEN npx -y bmad-method@6.12.4 install --directory . --modules bmm,gds --tools claude-code --pin gds=v0.7.2 -y`.
- **GitHub:** the repo needed the Claude GitHub app to be granted access before pushes worked; it is pushed now.
- The `.claude/skills` BMAD skills load only when the repo is the working directory.

## 6b. Story 1.1 prep (npm check 2026-11-21)

`gds-create-story 1.1` was started but not written. Versions verified on npm: phaser 4.2.1 · preact 11.2.0 · vite 8.3.8 · typescript **6.0.3** (latest is 7.0.2; typescript-eslint 8.73.0 needs `<6.1.0`, so pin 6.0.3) · vitest 5.1.1 (needs Node ^22.12 / ^24 / ≥26) · eslint 10.15.0 · @eslint/js 10.0.1 · zod 4.6.7 · tsx 4.23.15 · @preact/preset-vite 2.10.6 · concurrently 10.0.7 · colyseus 0.18.12 · @colyseus/sdk 0.18.10 · @colyseus/schema 5.0.50. Node 26.13.1 is the current LTS (architecture target); add `.nvmrc` = 26 and `engines`.

## 7. How the designer likes to work

- Plain English, short messages. They often answer "ok", "C" or a letter. Treat a bare "ok" as acceptance of all proposals in the previous message, and say so.
- **Facilitative mode:** propose concrete designs **with numbers** and a recommendation; they keep or change. Don't ask open-ended "what do you want" questions without a proposal.
- They love **playable visual prototypes** (the style labs worked very well) over text descriptions.
- Not deeply technical: explain technical choices by their effect on the game.
- They want progress, not ceremony; keep BMAD steps moving.

---

## Prompt for the new session

> I'm continuing my game project topdown-shooter. Read `HANDOFF.md` at the repo root and follow it. We use the BMAD method; brief, GDD, architecture, and Story 1.1 (scaffold) are done — Story 1.1 is live at hordes.sevend.io. Next step: `gds-create-story 1.2` then `gds-dev-story`. Keep working in facilitative mode as described in the handoff, and commit + push after each step.
