
## From spec-always-full-speed-setting (2026-11-25 review)

- **In-run menu sub-views don't move keyboard focus** (`apps/client/src/ui/InRunMenu.tsx`, Players and Settings views): `autofocus` on Back only works for the first focus in the page, so opening a sub-view leaves focus on `<body>` (outside the `aria-modal` dialog). Fix once for every view: focus the first control from a ref on mount. Existing pattern; not caused by the Settings view.

## From the 2026-11-26 readiness check
- **9.14 FU1:** a street-props image download that FAILS after Boot has shut down never settles, because Phaser's LoaderPlugin.shutdown calls removeAllListeners. The state stays "loading", so every run silently uses the code props (B8) and the warning never prints. Fix: hear failure on the game TextureManager or the XHR, not the scene loader.
- **8.10 B6:** RTT-based horde skip + keyframe on very slow lines (64 kbit/s queues frames up to 4.7 s). No owner yet (readiness Q9).
- **Pending-kill zombie unhittable** idea (readiness Q9): log only.
- **N-1:** `docs/perf/epic-2-network.md` is stale against the Network pass. Re-check that REVERSED_HIT_SLACK_MS 300 still fits the 600 ms rewind.
