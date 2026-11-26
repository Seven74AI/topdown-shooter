# CI and the local gate

Designer 2026-11-25 (CI speed-up, items 1–6). The workflow is `.github/workflows/ci.yml`.

## Triggers

Push runs on `master` only; every pull request runs; changes only under `docs/**`, `_bmad/**`, `_bmad-output/**`,
`.claude/**` or `**/*.md` skip CI; a new push to a PR cancels its older run (master runs are never cancelled).

## Jobs (all in parallel)

| Job | What | Typical time |
|-----|------|--------------|
| `static` | `npm ci`, typecheck, lint | ~2 min |
| `release` | `npm run release:check`: client build + `REQUIRE_DIST=1` cheat scan (Story 1.11). A cheat-string leak fails here in about a minute. | ~1–2 min |
| `test (shard i/4)` | 4-shard matrix, `fail-fast: false`. Each shard runs `npx vitest run $(node tools/ci/shard.mjs i 4)` and uploads its JSON report as the `test-report-i` artifact. | see the PR |
| `postgres` | Epic 7 retro E7-A1: a `postgres:16` service; runs `realPostgres*.test.ts` + `realPg.test.ts` with `TEST_DATABASE_URL` set, one file at a time (they share the database), then `tools/ci/check-all-passed.mjs` fails the job if any of the 32+ tests skipped. The test shards still skip these files (no URL there). | ~2 min |
| `docker` | buildx images with the GitHub Actions layer cache (`type=gha`, one scope per target, `load: true`), Caddyfile check, compose smoke test with throwaway secrets | ~3–6 min |
| `gate` | `needs` all five, `if: always()`; fails unless every one of them is `success` | seconds |

**`gate` is the single check to require** in branch protection. A PR that only touches the paths-ignore paths gets no CI run and so no `gate`
check; that is fine while docs / BMAD-only changes go straight to master (`AGENTS.md` §2), but such a PR would wait forever
on a required `gate`.

### Shards (`tools/ci/shard.mjs`)

`node tools/ci/shard.mjs <i> <n>` prints shard i's files (1-based), one per line:

- the file list is vitest's own (`vitest list --filesOnly --json`), so a shard only names files `npm test` runs;
- files are balanced by LPT (longest first onto the least-loaded shard) using `tools/ci/timings.json` ({file: seconds}).
  vitest's report times only the tests (import, collect and `beforeAll` are left out, so many files read 0 s), so
  `shard.mjs` adds `COST`: 0.5 s per file, 5 s per browser test (Vite + Chromium), 90 s on shard 1 for the Chromium
  install;
- files missing from `timings.json` go round-robin; entries for deleted files are ignored;
- every browser test (`*DomLayout.test.ts`, or any test file that loads `playwright`) goes to **shard 1**, the only
  shard that runs `npx playwright install --with-deps chromium` (browsers cached in `~/.cache/ms-playwright`, keyed on
  the runner image and the playwright version). After the tests, `node tools/ci/check-browser-ran.mjs` fails shard 1
  unless every browser test passed (a missing browser makes them skip, not fail);
- vitest matches CLI filters by substring, so a file whose path contains another file's path stays on that file's shard.

`tools/ci/shard.test.ts` proves, against `vitest list`, that the 4 shards are disjoint, cover every file, and that
each shard's command line selects exactly its own files.

### No test over 30 s (Epic 8 retro E8-A8)

Every test shard (and the `postgres` job) runs `node tools/ci/slowest.mjs <its report>` after the tests: it writes the
**slowest 15 tests** to the job summary and **fails the job if one test took over 30 s** (a warning annotation from
20 s, so a test is split before it reaches the limit). Split such a test per case, the way the fuzzes and sims were
split in the E8-A8 PR: an `it.each` per seed / layout / run, the shared counters in the `describe`, then one totals test
that first checks every case ran (`expect(casesRun).toBe(n)`) and then makes the old cross-case assertions. Real-time
bot tests are split into their steps on one room (`tools/bots/cut.test.ts`, `lateJoin.test.ts`).

Why a check over the CI report, not a lower per-test timeout: `testTimeout` (30 s) is a default that the slow tests
raise on purpose, because a timeout also fires on the builders' loaded shared boxes (load 8–16), where it would flake.
The report check runs only on the CI runners (one machine type), reads the time vitest measured, and names every
offender at once. The splits aim at ≤ ~15 s per test in CI, so a runner twice as slow still passes. Locally:
`node tools/ci/slowest.mjs reports/` over downloaded `test-report-*` artifacts, or over a local `--reporter=json` file.

### Refreshing the shard timings

Refresh when shards drift apart by more than a minute or two (new slow tests, big test changes):

1. Open a green CI run of the PR / master, download the four `test-report-1` … `test-report-4` artifacts into one
   folder, e.g. `reports/` (GitHub UI, or `gh run download <run-id> -p 'test-report-*' -D reports`).
2. `node tools/ci/update-timings.mjs reports/` (a folder contributes its `test-report-*.json` files) — rewrites `tools/ci/timings.json` (files missing from the reports, or whose tests all
   skipped, keep their old time; deleted files are dropped).
3. Commit `tools/ci/timings.json`.

Locally (any box; the split only needs relative times):
`npx vitest run --reporter=json --outputFile=reports/local.json && node tools/ci/update-timings.mjs reports/local.json`.

## Local loop (`package.json` scripts)

vitest has two projects (`vitest.config.ts`): **`slow`** = fuzzes (`*.fuzz`), whole-run sims (`*Sim`), `tools/bots`,
`tools/netsim`, `tools/netaudit`, the browser DOM checks (`*DomLayout`), `tickCost*`, `events/spots`, `replay`;
**`unit`** = everything else. `npm test` runs both (every file).

| Script | What |
|--------|------|
| `npm run test:fast` | `unit` only, `--maxWorkers=${VITEST_MAX_WORKERS:-4}` |
| `npm run test:slow` | `slow` only |
| `npm run test:changed` | tests touched by changes since `origin/master` (`--changed origin/master`) |
| `npm run release:check` | client build + `REQUIRE_DIST=1` cheat scan |
| `npm run gate:fast` | typecheck + lint + test:fast in parallel, then release:check |
| `npm run gate` | typecheck, lint, release:check, then the full `npm test` |

Builders use `test:fast` / `gate:fast` while working and at hand-back; the full suite runs in the PR's CI (designer 2026-11-25), so `npm run gate` locally is optional. Vitest defaults to 4 workers (`vitest.config.ts`). When several
sessions share one box, set `VITEST_MAX_WORKERS=2` (or 3): `test:fast` reads it (default 4), and `vitest.config.ts`
applies it to every other run when it is set (vitest's own default otherwise).

Measured 2026-11-25 on an idle 4-core cloud box: `npm run gate:fast` 202 s; full `npm test` 654 s.

Playwright is a root devDependency, so `npm ci` installs it. In the cloud sessions the browser is preinstalled in
`/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`); never run `playwright install` locally. Without a browser the DOM
checks skip locally (never fail).
