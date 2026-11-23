# Building UX rework (ideas)

Ideas branch `claude/idea-building-ux`. No game code changed.

| File | What it is |
| --- | --- |
| [party-notes.md](party-notes.md) | The roundtable (game designer, UX, game architect, game dev, a big-thumbs Android player): what hurts today, the options, where the room landed, what's still open |
| [ux-spec.md](ux-spec.md) | The chosen design: right-thumb cluster, carry + drag, sizes in CSS px, distances in metres, timings, reasons, fairness rules, key flows |
| [prototype.html](prototype.html) | Playable phone prototype: **Today** vs **A · Carry** vs **B · Carry + drag** on the real Downtown geometry at 48 px/m, with simulated lag and a teammate. Open the file in a browser, or the live copy: claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR |
| [draft-stories.md](draft-stories.md) | BX-1 to BX-11 with acceptance criteria, fairness rules and "beat the rule" lists, ready for `gds-correct-course` |
| [screens/](screens/) | Headless screenshots at 800 × 360 (2×) |

Recommendation: **B · Carry + drag**. Build BX-1 to BX-5 first: they're client-only and don't collide with Epic 5's server work.
