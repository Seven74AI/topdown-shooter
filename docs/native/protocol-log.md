# Net protocol log

One row per `NET_PROTOCOL_VERSION` bump (`packages/shared/src/net/messages.ts`). **Rule NR-3** (AGENTS.md §7, 2026-11-28): the story that bumps the version adds its row here in the same PR.

Why the log exists: the iOS app (Epic 13) can't be reloaded the way a browser tab can, and an App Store update takes 1–3 days to pass Apple's review. Story 13.5 builds a window of supported versions from this log. Epic 13 starts only after **14 days with no bump**.

"Old client OK?" asks whether a client one version older could still have played against this server if the server had kept the old path. **No** means the change can't be made compatible cheaply.

| Version | Story | Merged | What changed | Old client OK? |
| --- | --- | --- | --- | --- |
| 1 | — | before 2026-11-25 | No version sent in the join (implicit) | — |
| 2 | 8.10 | 2026-11-25 | Delta horde stream (keyframes + deltas) | No (binary horde format) |
| 3 | 8.11 | 2026-11-25 | Binary input (`BYTES.INPUT`, `net/input.ts`) | Possible (server could keep the JSON input path) |
| 4 | 8.13 | 2026-11-26 | Tick ack in the binary input | Possible (the ack is optional for the horde skip) |
| 5 | 12.2 | 2026-11-26/27 | `extract` phase, `boarded` / `liftedAtTick`, extraction events (X6) | No (new run phase in the room state) |
| 6 | 10.12 | 2026-11-27 | `admin.cheat` message (B5) | Yes (only admins send it) |

Next free number: **7** (reserved by Epic 11). **Last bump: 2026-11-27.** The 14-day gate is met on 2026-12-11 if nothing bumps before then.
