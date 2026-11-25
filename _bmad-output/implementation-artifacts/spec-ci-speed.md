---
title: 'CI: 4 timing-balanced shards, parallel jobs, Playwright, fast local loop'
type: 'chore'
created: '2026-11-25'
status: 'in-review'
baseline_commit: '73fb8fd'
context: ['{project-root}/HANDOFF.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CI is one serial job (typecheck → lint → 522 test files ≈ 9 min → build → cheat scan), docker waits for it, the DOM layout checks skip in CI (no `playwright` dependency), and builders only have the full ~9 min `npm test` locally.

**Approach:** the six designer-approved items: (1) `release` job (build + cheat scan) and `release:check` in `gate` before tests; (2) 4-shard LPT-balanced test matrix from committed `tools/ci/timings.json`, with `shard.mjs`, `update-timings.mjs`, JSON report artifacts, docs/ci.md; (3) parallel `static`/`release`/`test`/`docker` jobs + one `gate` job checking `needs.*.result`; (4) `playwright` root devDependency at the sessions' version, DOM checks pinned to one shard which installs chromium (cache ~/.cache/ms-playwright); (5) docker buildx + build-push-action with `type=gha` cache and `load: true`; (6) vitest `test.projects` `unit`/`slow`, scripts `test:fast`, `test:slow`, `test:changed`, `release:check`, `gate:fast`, `gate`, documented in HANDOFF §3.

## Boundaries & Constraints

**Always:** keep #7's triggers (push master only, pull_request, paths-ignore, PR-only cancel); keep the docker smoke test and throwaway secrets step; `npm test` runs both projects (every file); shards cover exactly vitest's file list, none dropped or doubled (proven by a test against `vitest list`); pin action versions; `npm ci` installs playwright; local runs keep using /opt/pw-browsers.

**Ask First:** anything that changes test content or counts beyond the DOM checks no longer skipping.

**Never:** shrink a fuzz/sim, skip/disable/quarantine a test, add fake clocks, run `playwright install` locally, use bmad-build.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Balanced | `shard.mjs i 4`, all files timed | LPT split; DOM files all on shard 1 | N/A |
| New file | file not in timings.json | assigned round-robin across shards | N/A |
| Deleted file | timings.json key with no file | ignored | N/A |
| Bad args | i∉1..n or n<1 | exit 2 with usage | stderr message |
| Substring filter | a path is a substring of another path | both kept on the same shard (vitest filters by substring) | N/A |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` -- the single CI workflow (check + docker today)
- `vitest.config.ts` -- include globs; gains `test.projects`
- `package.json` -- scripts + devDependencies
- `tools/checks/*DomLayout.test.ts` -- 7 DOM checks; `createRequire("playwright")`, `chromium.launch()` without options, skip when missing
- `tools/checks/noCheatsInRelease.test.ts` -- `REQUIRE_DIST=1` cheat scan
- `eslint.config.js` -- node globals for `tools/**/*.ts` only (add `.mjs`)
- `HANDOFF.md` §3, `docs/ci.md` (new)

## Tasks & Acceptance

**Execution:**
- [x] `package.json`/`package-lock.json` -- add `playwright@1.63.0` devDependency; add scripts -- items 1, 4, 6
- [x] `vitest.config.ts` -- `projects: unit` / `slow` (extends root) -- item 6
- [x] `tools/ci/shard.mjs`, `tools/ci/update-timings.mjs`, `tools/ci/timings.json`, `tools/ci/shard.test.ts` -- item 2
- [x] `.github/workflows/ci.yml` -- static, release, test matrix (4, fail-fast false, artifacts, DOM shard installs chromium + cache + skip guard), docker (buildx, gha cache), gate -- items 1–5
- [x] `eslint.config.js` -- node globals for `tools/**/*.mjs`
- [x] `docs/ci.md`, `HANDOFF.md` §3 -- document jobs, timings refresh, fast loop, VITEST_MAX_WORKERS

**Acceptance Criteria:**
- Given the 4 shard lists, when each is passed to `vitest list --filesOnly`, then their union equals the unfiltered list and they are pairwise disjoint.
- Given a PR, when CI runs, then `gate` succeeds only if static, release, test (all shards) and docker succeeded.
- Given the DOM shard in CI, when tests finish, then no `*DomLayout` test is skipped (a step fails otherwise).
- Given `npm test`, then the test count equals the pre-change full run.

## Design Notes

vitest CLI filters match by substring (`filterTestFiles`), so shard.mjs groups any file whose path contains another file's path onto that file's shard. Shard 1 holds the DOM checks; their timings count toward its load so LPT balances around them. `shard.mjs` reads the file list from `vitest list --filesOnly --json` (vitest's own include/exclude resolution) unless `SHARD_FILE_LIST` points to a saved list (the test uses that).

## Verification

**Commands:**
- `npm run gate` -- expected: green, test count = baseline
- `npx vitest run tools/ci/shard.test.ts` -- expected: pass
- CI on the PR -- expected: all jobs green; DOM checks pass (not skipped) on shard 1

## Review (step 4, 2026-11-25)

Three fresh reviewers (blind hunter, edge-case hunter, acceptance auditor). Auditor verdict: accept, no high. No intent_gap / bad_spec. Patched:
- 0 s files piled onto one shard (vitest's report times exclude import/collect/beforeAll) → `COST` per file, per browser test and for shard 1's Chromium install; shards now 135/129/129/130 files.
- update-timings: all-skipped files keep their old time; keys anchored to `apps|packages|tools/`; NaN times skipped; a folder contributes only `test-report-*.json`; clear error for a missing path.
- Browser tests detected by `playwright` in the source too, not only the name; `tools/ci/check-browser-ran.mjs` replaces the inline check.
- Workflow: empty-shard guard, quoted file array, `ignore-error=true` on the gha cache writes, `gate` loops over `toJSON(needs)`, Playwright cache key includes `ImageOS`.
- shard.mjs: realpath main-module check; strict integer args. `npm test` / `test:slow` / `test:changed` plain vitest, `VITEST_MAX_WORKERS` read in vitest.config.ts. `reports/` gitignored; stale cheat-scan wording fixed.
Rejected / not changed: tag pins vs SHA pins (tags verified with `git ls-remote`; exact release tags); untimed files round-robin (spec); Windows `test:fast`/`release:check` env syntax (spec form; Linux boxes). Documented only: a docs-only PR gets no `gate` check (docs-only changes go straight to master).
