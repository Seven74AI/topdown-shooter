# tools/netaudit: network audit measurement scripts (2026-11)

**Not game code.** Nothing in `apps/` or `packages/` imports these files, and none of them is a test. They produced the numbers in [`docs/perf/network-audit-2026-11.md`](../../docs/perf/network-audit-2026-11.md); see its §8 for the exact commands.

| File | What it does |
|---|---|
| `lagProxy.ts` | TCP proxy between bots (or a browser) and a local server: ordered delay (RTT ± jitter), optional head-of-line stalls as a TCP-loss model, per-stream byte and timing report |
| `hitsLossSim.ts` | Copy of `tools/netsim/hitsSim.ts` (Story 2.7/2.12 harness) with one addition: `Options.loss` (HOL stalls both ways). The original harness is untouched |
| `runHits.ts` | Reversed hits (NFR5) with and without loss, using `hitsLossSim.ts` |
| `hordeEncodings.ts` | Horde stream bytes today vs delta / no-heading / far-at-10 Hz encodings, on real zombie movement from the server `RunController` |

If the Network pass (report §7, story N1) adds a loss switch to the real harness, merge `hitsLossSim.ts` into `tools/netsim/hitsSim.ts` and delete the copy.
