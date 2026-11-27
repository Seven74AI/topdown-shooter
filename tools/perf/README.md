# tools/perf

`fps.cjs` (Story 10.2) is the frame-rate pass script; the method is in `docs/perf/epic-10-fps.md`. It runs headless
Chromium at 844 × 390, DPR 2, with CDP CPU throttling at 1× and 4×. Each row: an 8 s warm-up after the character
bake, then a 12 s rAF count. Two rounds, with the order reversed in round 2. Scenes: `stage1` (`?stress=150`) and
`wave9` (`?stress=150&stressstage=5&blackout=10`).

Compare two trees from their release builds. Give each build as `label=dist:<dir>`: the script serves it itself on a
port the OS picks (10.4's `serveDist.cjs`, Caddy headers). Before measuring, it checks that the page served loads that
dist's own `assets/main-<hash>.js`. There is no `vite preview` to start or kill, and no port another server can hold.
(Review M2: a `kill` of the `npx` wrapper PID leaves `vite preview` holding its port, and a second `--strictPort`
server then fails silently. Two of 10.2's A/B rounds measured the wrong build that way.)

```sh
git worktree add .claude/worktrees/base master        # node_modules: see AGENTS.md §6 (no whole-folder symlink)
(cd .claude/worktrees/base/apps/client && npx vite build --outDir /tmp/dist-base --emptyOutDir)
(cd apps/client && npx vite build --outDir /tmp/dist-branch --emptyOutDir)
NODE_PATH=$(npm root -g) node tools/perf/fps.cjs base=dist:/tmp/dist-base branch=dist:/tmp/dist-branch 2
```

A target can carry its own extra URL switches after a `|` (`lowfx=dist:/tmp/dist-branch|&fx=low`). A plain
`label=http://…` URL is used as given, with no bundle check.

Env:
- `RATES=1,4` (CDP CPU throttling)
- `SCENES=stage1,wave9`
- `DPRS=2`
- `QUERY=&fx=low` (extra switches for every page)
- `RESOLUTION=balanced|fast` (the stored Resolution setting)
- `PROFILE=1` (top self-time functions at the last rate)
- `WARM_MS`, `COUNT_MS`

The script prints one JSON line per row. A row whose scene check fails (`errs`) is re-run once (`rerun`). Exported for
Story 10.3: `openPage`, `countFrames`, `frameStats`, `topSelf`, `serveTargets`, `mainBundleOf`, `SCENES`.
