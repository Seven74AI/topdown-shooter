# tools/netaudit: network audit measurement scripts (2026-11)

**Not game code.** Nothing in `apps/` or `packages/` imports these files, and none of them is a test. They produced the numbers in [`docs/perf/network-audit-2026-11.md`](../../docs/perf/network-audit-2026-11.md); see its §8 for the exact commands.

| File | What it does |
|---|---|
| `lagProxy.ts` | TCP proxy between bots (or a browser) and a local server: ordered delay (RTT ± jitter), optional head-of-line stalls as a TCP-loss model, per-stream byte and timing report |
| `runHits.ts` | Reversed hits (NFR5) with and without loss, using the real harness `tools/netsim/hitsSim.ts` (`Options.loss`) and the server's `REWIND_CAP_TICKS` |
| `lagLine.ts` | Story 8.8: the lossy TCP line (ordered delay ± jitter, head-of-line stalls both ways, in-order half-close) used in-process by `npm run bots -- --lag --jitter --loss --stall` and by `lagProxy.ts` |
| `smoke2tab.cjs` | Story 8.8 (brief addendum 34): two Playwright tabs + 2 bots on the lossy line, hidden tab across build start / event / boss telegraph / vote; steps in its header |
| `hordeEncodings.ts` | Horde stream bytes today vs delta / no-heading / far-at-10 Hz encodings, on real zombie movement from the server `RunController` |

Story 8.8 merged the audit's harness copy `hitsLossSim.ts` back into `tools/netsim/hitsSim.ts` (`Options.loss`: ordered head-of-line stalls, both directions, counted in `Result.stalls`) and deleted it: there is one harness (Network pass brief line 20).
