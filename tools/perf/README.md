# tools/perf

`fps.cjs` (Story 10.2): the frame-rate pass script (method: `docs/perf/epic-10-fps.md`). Headless Chromium 844 × 390,
DPR 2, CDP CPU throttling 1× / 4×, 8 s warm-up after the character bake, 12 s rAF count, two rounds (order reversed in
round 2). Scenes: `stage1` (`?stress=150`) and `wave9` (`?stress=150&stressstage=5&blackout=10`).

Against two trees (release builds, own ports, stop by PID):

```sh
git worktree add .claude/worktrees/base master        # node_modules: see AGENTS.md §6 (no whole-folder symlink)
(cd .claude/worktrees/base/apps/client && npx vite build --outDir /tmp/dist-base)
(cd apps/client && npx vite build --outDir /tmp/dist-branch)
(cd apps/client && npx vite preview --outDir /tmp/dist-base --port 5321 --strictPort & echo $! > /tmp/base.pid)
(cd apps/client && npx vite preview --outDir /tmp/dist-branch --port 5322 --strictPort & echo $! > /tmp/branch.pid)
NODE_PATH=$(npm root -g) node tools/perf/fps.cjs base=http://127.0.0.1:5321 branch=http://127.0.0.1:5322 2
kill $(cat /tmp/base.pid) $(cat /tmp/branch.pid)
```

Env: `RATES=1,4`, `SCENES=stage1,wave9`, `DPRS=2`, `QUERY=&fx=low`, `PROFILE=1` (top self-time functions at the last
rate), `WARM_MS`, `COUNT_MS`. One JSON line per row; a row whose scene check fails (`errs`) is re-run once (`rerun`).
`openPage`, `countFrames`, `frameStats`, `topSelf` are exported for Story 10.3.
