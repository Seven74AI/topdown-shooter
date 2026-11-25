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
| `docker` | buildx images with the GitHub Actions layer cache (`type=gha`, one scope per target, `load: true`), Caddyfile check, compose smoke test with throwaway secrets | ~3–6 min |
| `gate` | `needs` all four, `if: always()`; fails unless every one of them is `success` | seconds |

**`gate` is the single check to require** in branch protection. A PR that only touches the paths-ignore paths gets no CI run and so no `gate`
check; that is fine while docs / BMAD-only changes go straight to master (HANDOFF §3), but such a PR would wait forever
on a required `gate`.

### Shards (`tools/ci/shard.mjs`)

`node tools/ci/shard.mjs <i> <n>` prints shard i's files (1-based), one per line:

- the file list is vitest's own (`vitest list --filesOnly --json`), so a shard only names files `npm test` runs;
- files are balanced by LPT (longest first onto the least-loaded shard) using `tools/ci/timings.json` ({file: seconds});
- files missing from `timings.json` go round-robin; entries for deleted files are ignored;
- every `*DomLayout.test.ts` (browser DOM checks) goes to **shard 1**, the only shard that runs
  `npx playwright install --with-deps chromium` (browsers cached in `~/.cache/ms-playwright`, keyed on the playwright
  version). A step after the tests fails shard 1 if any DOM check did not pass (a missing browser makes them skip);
- vitest matches CLI filters by substring, so a file whose path contains another file's path stays on that file's shard.

`tools/ci/shard.test.ts` proves, against `vitest list`, that the 4 shards are disjoint, cover every file, and that
each shard's command line selects exactly its own files.

### Refreshing the shard timings

Refresh when shards drift apart by more than a minute or two (new slow tests, big test changes):

1. Open a green CI run of the PR / master, download the four `test-report-1` … `test-report-4` artifacts into one
   folder, e.g. `reports/` (GitHub UI, or `gh run download <run-id> -p 'test-report-*' -D reports`).
2. `node tools/ci/update-timings.mjs reports/` (a folder contributes its `test-report-*.json` files) — rewrites `tools/ci/timings.json` (files missing from the reports keep
   their old time; deleted files are dropped).
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

Builders use `test:fast` / `gate:fast` while working and run the full `npm run gate` once, at hand-back. When several
sessions share one box, set `VITEST_MAX_WORKERS=2` (or 3): `test:fast` reads it (default 4), and `vitest.config.ts`
applies it to every other run when it is set (vitest's own default otherwise).

Measured 2026-11-25 on an idle 4-core cloud box: `npm run gate:fast` 202 s; full `npm test` 654 s.

Playwright is a root devDependency, so `npm ci` installs it. In the cloud sessions the browser is preinstalled in
`/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH`); never run `playwright install` locally. Without a browser the DOM
checks skip locally (never fail).
