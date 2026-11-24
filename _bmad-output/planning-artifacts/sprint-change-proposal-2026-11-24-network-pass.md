# Sprint Change Proposal: Network pass (2026-11-24)

Mode: batch. Scope: **Moderate** (backlog reorganisation: four new stories, one story pulled forward; planning text only, no code). Approved by the designer ("Okay, let's do that", accepting the recommendation in `docs/perf/network-audit-2026-11.md` §7).

## 1. Issue

The network audit (`docs/perf/network-audit-2026-11.md`, branch `network-audit`) measured the game with 4 bots at 150 ms ± 10 ms, with and without a TCP-loss model:

- **Bandwidth:** NFR4 is met (6–11 KB/s average per phone). The worst case of 150 zombies in one view is ≈ 25.5 KB/s, and Epic 6's stampede (180 in view) breaks the brief's 24 KB/s horde budget.
- **Reversed hits:** NFR5 fails on a lossy line, with kiting Runners at **7.6 % / 11.9 %** for 1 % / 2 % loss. The cause is the 300 ms rewind: after a TCP stall, shots arrive older than the window. A one-off test with 500 ms gave 2.0 % / 1.3 %.
- **Picture:** NFR3 is at risk. On a lossy line about 1 in 100 frames arrives 240–290 ms after the previous one, against a 150 ms render-delay ceiling, so the picture freezes and then jumps.
- **Disconnects:** NFR9 is at high risk. There is no reconnect, and the transport drops a silent phone after ~6–9 s. iOS Safari can also hang reconnects after the page was in the background (WebKit bug 308073).

## 2. Impact

- **Epic 8:**
  - New Stories **8.8–8.11** at its front (the Network pass).
  - **8.1** pulled forward into the pass, with extended ACs: guest-token matching before Epic 7, a 3 s no-data watchdog, the iOS reload fallback, transport ping tolerance of 12–15 s, and an 8 s cut test.
  - The rest of Epic 8 (8.2–8.7) stays after Epic 7.
- **Epic order:** 6 → Network pass → 7 → rest of 8 → 10 (`epics.md` › Epic List; NFR coverage line updated).
- **Epic 6:** a note in **Story 6.8** (Bandwidth): assert the stampede-plus-horde-in-one-view worst case against 24 KB/s, and either cap the view at 150 or land after 8.10. No other Epic 6 story changes.
- **Architecture** (`game-architecture.md`): the hit-validation row, lag-compensation line and horde-stream budget line get Network pass notes (500 ms rewind, adaptive delay, delta horde stream).
- **GDD / UX / narrative:** none. The "Connection lost, reconnecting…" text is already in 8.1.
- **Code today:** none changed. Measurement scripts are in `tools/netaudit/` (not game code).

## 3. Approach

Direct adjustment: add stories within the existing plan. The pass needs no accounts, because 8.1 matches a phone by its guest token (Story 2.3).

| Story | Content | Effort | Order |
|---|---|---|---|
| 8.8 My shots count on a bad 4G line | 500 ms rewind; lossy-line switch (`&loss=1`, bots, harness) | S | 1 (∥ 8.9) |
| 8.9 Smooth through hiccups | delay 100–250 ms from lateness; ≤ 1.1× catch-up; clock never backwards; client slow-down drains the input queue | M | 1 (∥ 8.8) |
| 8.1 Reconnect within 2 minutes (extended) | 120 s seat hold + watchdog + iOS reload + ping tolerance | L | 2 |
| 8.10 Half-size horde stream | delta vs previous frame, heading on the client, far at 10 Hz, 1 s keyframes; backpressure measurement | M | 3 |
| 8.11 One packet per tick (optional) | patch from the tick, one write per tick, binary input | S–M | 4 |

Then the designer's 4-phone 4G test (Story 2.10 plan) is the check, with Wi-Fi phones on `&loss=1`.

**Risk:** medium. 8.9 and 8.10 change feel and the wire format, which is why they carry harness numbers as ACs. 8.8 is low risk. **Timeline:** about 4–5 builder sessions after Epic 6.

## 4. Changes

| Artifact | Change |
|---|---|
| `epics.md` | NFR coverage line; Epic List order + Epic 8 summary; Epic 8 intro (dependency exception); "Network pass" block with Stories 8.8–8.11 before 8.1; 8.1 + 5 ACs |
| `sprint-status.yaml` | `8-8…`, `8-9…`, `8-10…`, `8-11-…-optional` added (backlog), build-order comment, 8.1 tagged "network pass 3" |
| `6-8-special-events-car-alarm-and-stampede.md` | Bandwidth: worst-case assertion note |
| `game-architecture.md` | notes on rewind (8.8), adaptive delay (8.9), delta horde stream (8.10) |

## 5. Handoff

- **Main session:** merge branch `network-audit` (docs, planning text, `tools/netaudit/`) into master **before Story 6.8's builder starts**, so 6.8 sees its note. Run the full gate (docs-only merges included, HANDOFF §3).
- **After Epic 6 and its retro:** `gds-create-story` for 8.8 and 8.9 (parallel cloud sessions; different files), then 8.1, 8.10, 8.11, each with a fresh-agent review as usual.
- **Success criteria:** the ACs' harness numbers, i.e.:
  - reversed hits < 5 % on the lossy line;
  - ≤ 1 freeze per 30 s;
  - horde ≤ 10 KB/s at ~118 in view;
  - an 8 s cut mid-wave rejoins with gear.

  Then the 4-phone test reports NFR3–5 and a run reaching wave 10 (NFR9).
