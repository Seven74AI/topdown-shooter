# Agent rules: topdown-shooter

Standing rules for every agent working in this repo: the main session, builders and reviewers. Project state and next steps are in `HANDOFF.md`; this file is only for how we work. Rules come from the designer unless noted. When a rule changes, edit it here (don't append a superseding note), and keep the date and the designer's words.

## 1. How the designer likes to work

- Plain English, short messages. They often answer "ok", "C" or a letter. Treat a bare "ok" as acceptance of all proposals in the previous message, and say so.
- **Facilitative mode:** propose concrete designs **with numbers** and a recommendation; they keep or change.
- They love **playable visual prototypes** over text descriptions. "No videos" for look proposals (stills only).
- Not deeply technical: explain technical choices by their effect on the game.
- They want progress, not ceremony; keep BMAD steps moving; parallelize with agents.
- Don't infer designer picks: "OK with the layout ordering" was NOT a pick of the recommended variants (session 9 mistake). Ask for codes. Ask where a decision is theirs.
- Red IS allowed in menu screens; in-play signals keep red = boss danger.
- Art is game code (drawn in code). Designer picks every new look from code-drawn proposals before the build. Meshy (api.meshy.ai) is connected but credits are low: references only, if at all.

## 2. Getting changes onto master

**Docs / BMAD-only changes** (`docs/**`, `_bmad/**`, `_bmad-output/**`, `.claude/**`, `*.md`) skip CI and are **pushed straight to master with no PR**. Nothing there is linted, typechecked or tested (`docs/art/**` is ignored by eslint). A change that also touches code is not docs-only.

**Code reaches master only through a PR** (designer 2026-11-25, "switch to PRs and apply that CI change"):
- The PR's GitHub Actions run is the gate: it tests the PR merged with current master, including the docker stack smoke test, which the local gate never runs.
- The builder runs `gate:fast` (below), pushes its branch, opens a PR against master (title `Story X.Y: …`) and sends the PR link in its hand-back. Reviewers review that branch.
- The main session merges with a merge commit once CI is green and the review is clean. It then sets sprint-status and the story's `Status: done` in a docs-only commit pushed straight to master.
- If master moved after a PR's last run and the stories overlap, rerun CI first. Non-overlapping stories merge on a green run.
- **Check the master CI run after every merge.** (2026-11-25: master was red from 09:28 to 13:10 because the local gate skipped two CI-only steps and nobody looked at Actions.)
- CI push runs happen on master only. A new PR push cancels the older PR run; master runs are never cancelled (`.github/workflows/ci.yml`).
- Branch protection: ruleset `master gate` on the default branch requires the `gate` check, blocks force pushes and restricts deletion. Repository admins bypass it, which keeps docs-only direct pushes working; every session pushes as the owner, so the discipline above still applies.

**CI jobs** (`docs/ci.md`): `static` (typecheck + lint), `release` (build + cheat scan), `test` (4 timing-balanced shards; shard 1 also runs the browser DOM checks; every shard fails if one test took over 30 s and lists its slowest 15 in the job summary, E8-A8), `postgres` (the real-PostgreSQL tests on a `postgres:16` service, E7-A1) and `docker` run in parallel. The **`gate` job is the one required check**: it fails unless all five succeeded. No test may take over 30 s: split it per case (`docs/ci.md`). Refresh `tools/ci/timings.json` from the shards' `test-report-*` artifacts when shards drift.

**Fast local loop, CI is the full gate** (designer 2026-11-25): builders run `npm run test:fast` / `npm run gate:fast` (typecheck + lint + the vitest `unit` project in parallel, then `release:check` = build + cheat scan; about 3.5 min) while working AND at hand-back, plus `npm run test:slow` / `npm run test:changed` for the slow areas they touch (sims, fuzz, bots, DOM checks). They do NOT run the full `npm run gate` locally. The hand-back gives the head commit, the gate:fast result and the PR's CI result; if CI is still running, the builder waits for it, fixes red, then hands back. Vitest uses 4 workers by default (`VITEST_MAX_WORKERS` overrides it; use 2–3 on a shared box).

**Consolidation batches** (designer 2026-11-25): when two or more APPROVED stories are waiting on each other, the main session makes one integration branch from master, merges each story in landing order (one merge commit per story, so one can be reverted alone) and opens ONE PR for the combined tree. Only trivial conflicts are resolved in the batch (imports, sprint-status, keep-both lists); a real code conflict goes back to the story's builder. A story that adds a Drizzle migration regenerates it on top of master first (never rename: Drizzle skips an older journal `when`). If the gate fails, drop the last story and re-gate to find the culprit.

## 3. The story loop and reviews

- **Per story:** `gds-create-story` (rich story file from the real code) → build → **independent review by a fresh agent** → fix every finding → mark done → merge. Review findings and fixes are recorded in each story file ("Senior Developer Review (AI)").
- **Use the gds skills** (`gds-dev-story`, `gds-code-review`, `gds-create-story`, `gds-retrospective`, `gds-correct-course`), **never `bmad-build` / `bmad-build-auto`**: they stop with "ambiguous config value implementation_artifacts" (bmm + gds both define it; `_bmad/scripts/render_skill.py` treats identical duplicates as ambiguous; still present in BMAD 6.12.4).
- **Fresh-agent review** in a separate cloud session on the merged tree (story branch merged with current master). Full three-layer `gds-code-review` for boss, events, vote and other game rules; a light review (one checker) for mostly visual stories.
- **Re-reviews:** every medium/high fix and every behaviour-changing fix (even for a low) gets a narrow re-review: only the fix commits, "try to exploit this", no fresh full gate. Re-reviews keep finding new issues created by fixes (6.5, 6.8, 6.9, 6.11), so tell builders to keep a fix minimal and to measure with stateful sweeps (0.01°) and oscillation, not whole-degree samples.
- **Re-review cap** (designer 2026-11-25, "Let's cap re review"): at most **two narrow re-review rounds per story**. After the second round, remaining fixes (lows, one-line or test-only fixes, mirrors of an already re-reviewed fix) are checked by the main session: read the diff, run the touched tests, log the check in the story file and the run log, and land. Exception: a new **high** finding still gets a fresh re-review.
- **E8-A1** (Epic 8 retro): a red test gets a deterministic repro (force the tick order, pin the seed, run under load) before anyone may call it flaky, and every "flaky" label goes into `_bmad-output/implementation-artifacts/deferred-work.md` with an owner.
- **E8-A3** (Epic 8 retro): reviewers check every "now copies/does X" claim in a task line or "Notes for the merge" against the diff (a diff citation or a probe per claim, listed in the review).
- Every sim/replay test must assert that something actually happened (a money sim once ran zero waves unnoticed). Expect whole-run sims to break when a new mechanic lands in the run's ending (6.1: wave 10 really spawned the boss and bot sims stalled).
- Verify anything visual in a real browser (Playwright + preinstalled Chromium); say plainly what wasn't verified.

## 4. Running builders and reviewers in parallel

- **Every builder and reviewer runs in its own cloud session** (`create_session`, branch `story-x-y`; prompt = the story file + the current epic brief + its decisions doc). **Tell each to `send_message` to `@parent` when done**: their final chat text does NOT reach the main session. Set a ~15 min `send_later` fallback check; read `list_events` if silent.
- **Start a story as soon as its real file overlap allows**, not by round: check the "Notes for the merge" of the stories it waits for. Run in parallel only stories that touch different code. Give each parallel builder its own netEvents kind range and readability-sheet number range up front. Merging small neighbouring stories into one builder saves time.
- Up to 3–4 builders at once (each in its own cloud session). At most **2 heavy jobs** (a builder or reviewer running tests or a browser) in the main container: 3–5 agents in one 4-core container ran 2–3× slower and timed out.
- Each story merges as soon as its review (and re-reviews) is clean; don't wait for the round.
- When master moves while a builder finishes, tell it to merge master and re-gate, and start the reviewer in parallel on the same merge.
- Crossed messages: an agent may finish before your correction arrives. Always ask it to ack corrections, and say "this overrides my previous message".
- Archive finished child sessions right away (the designer notices open ones). `archive_session` can be refused by the auto-mode classifier on the first try; retry later.
- Stopped agents resume from their transcripts (SendMessage to the agent id, or automatically).

## 5. Code rules the reviews keep finding (tell builders up front)

- Every texture drawn in code goes through `addGeneratedTexture` (Story 4.13: Android Chrome wipes canvases in the background; unregistered textures vanish after an app switch). `tools/checks/noUnregisteredTextures.test.ts` enforces it.
- Simulation timers count ticks (no float seconds). No per-frame / per-tick allocation. No gameplay numbers inline (balance JSON).
- Fire cooldown rule in `combat/firing.ts`. Edge flags (swap/consumable) fire once per input seq and `LocalSimHost` latches them.
- Phaser 4 ≠ Phaser 3: verify in `node_modules/phaser/types` (e.g. `setTint` + `setTintMode`). Phaser reuses scene objects on restart: reset state in `create`, pass restart data.
- Builders that touch rendering must read `render/city/*` (StreetView/CoverView/DecayView no longer exist).
- Tests of one mechanic pass `systems: { waves: () => {} }`. Keep timing asserts behind `PERF_ASSERT=1`, and record machine load with every speed number. `vitest.config.ts` has `testTimeout: 30_000`.
- Colyseus: never pass zod to `onMessage` (use `this.net.guard`); join refusals are `ServerError(526, reason)`; use `bootTestServer()`. The per-client message guard allows ~10 non-input messages per second (bucket of 10); a burst beyond it is dropped silently.
- Exact version pins (`.npmrc save-exact`).

## 6. Environment gotchas

- BMAD v6.12.4 (modules bmm + gds v0.7.2) is installed in the repo (`_bmad/`, `.claude/skills/`). The skills load only when the repo is the working directory.
- The cloud container intercepts TLS: Docker image builds that run `npm ci` fail locally (environment limit; CI builds them fine).
- Visual references (style labs, decay prototype) are linked in the brief folder; `style-lab-r3.html` has canvas code for the Dead City look.
- Python Playwright + Chromium are preinstalled. `window.__game.loop.sleep()/wake()` simulates a hidden tab.
- **Ports and processes:** never use `npm run dev` in a builder (fixed ports 5173/2567 clash); give each agent its own client/server ports (a temporary Vite config merging `apps/client/vite.config.ts` with a `/api` proxy) and stop processes by PID only (one builder's `pkill` killed others' servers).
- **Local worktrees** (when not using cloud sessions): the Agent tool's `isolation: "worktree"` is denied here, so create them by hand under `.claude/worktrees/` (gitignored): `git worktree add -b story-x-y .claude/worktrees/story-x-y <base>`. **Don't symlink the whole `node_modules`:** its `@topdown/*` entries are relative links, so a worktree would test against the MAIN checkout's packages (false greens). Make `node_modules` a real directory linking every entry of the main one except `@topdown`, plus absolute `@topdown/{client,server,shared}` links into the worktree, and its own real `.vitest-cache`, `.vite` and `.vite-temp` directories (shared caches give stale modules). Reviewers can run read-only in the main checkout (they mutate and revert files; don't commit while one runs: check `git status`). Check `git status` before committing a merge (an unstaged fix slipped out once).
