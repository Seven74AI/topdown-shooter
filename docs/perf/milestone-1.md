# Milestone 1 phone numbers (Story 4.10: NFR1, NFR3–NFR5)

Filled in during the Milestone 1 playtest (`docs/playtests/milestone-1.md`, Parts 2 and 3). This is the **phone baseline for Epic 5**: new weapons, zombies and effects must not drop below these numbers (EPIC 5 BRIEF line 12).

Build: `master` @ _(commit Hermes deployed)_ · Date: _ · Players: _

## Targets

| Ref | Target | Where the number comes from |
| --- | --- | --- |
| NFR1 | 60 FPS average, never below 30 (checked for real in Epic 10). For Milestone 1: **avg ≥ 50, worst second ≥ 30** | stress test (Part 2), `FPS avg / min` in Network results |
| NFR3 | players see the same thing: no teleports or jumps reported | form answers, `snaps` |
| NFR4 | average download **≤ 30 KB/s** per phone over a wave | Network results `avg down` |
| NFR5 | reversed hits **< 5 %** of apparent hits | Network results `reversed / apparent` |

How the numbers are measured (KB = 1024 bytes of WebSocket payload, ping = the server's round trip, reversed = shots that looked like hits but the server said missed): see `docs/perf/epic-2-network.md` › Method.

## Part 2: stress test, 150 Walkers, solo (`?stress=150`)

Paste each phone's Copy results text below the table.

| device | browser | avg FPS | min FPS | worst second | % < 30 | tick avg / max ms | render ms | target met? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

Earlier results (Epic 1 look, before 4.9's Dead City art): iPhone 15 Pro 60 avg / 38.5 min; Honor 10 58.3 avg, worst second 39, rare ~160 ms hitches (`epic-1-stress.md`). **Compare these:** the 4.9 look adds lights, rain and shadows.

## Part 3: online run A, 4 phones over 4G (`?debug=1`)

One row per phone **per wave copied** (at least waves 4 and 5). Each pasted text ends with a ready-made row: replace `(device)` and `(4G / Wi-Fi + …)`.

| wave (stage) | device | browser | network | avg / peak down KB/s | up KB/s | avg / p95 ping ms | reversed / apparent hits | FPS avg / min | snaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 (Panic) | (phone 1, host) | | | | | | | | |
| 4 (Panic) | (phone 2) | | | | | | | | |
| 4 (Panic) | (phone 3) | | | | | | | | |
| 4 (Panic) | (phone 4) | | | | | | | | |
| 5 (Breakdown) | (phone 1, host) | | | | | | | | |
| 5 (Breakdown) | (phone 2) | | | | | | | | |
| 5 (Breakdown) | (phone 3) | | | | | | | | |
| 5 (Breakdown) | (phone 4) | | | | | | | | |

Phones on Wi-Fi with `&lag=150&jitter=20`: _

### Pasted results

_(paste every Copy results text here, labelled with phone and wave)_

## Server (Hermes, optional)

After the session, Hermes can paste the server's per-wave lines:

```bash
docker compose -f deploy/docker-compose.yml logs server | grep -E "net_stats|tick_stats|horde_stats" | tail -60
```

| wave | tick avg / max ms | slow ticks | avgOutKBps per player | hordeKBps | peak alive |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Reading (designer + main session, after the session)

- NFR1 (speed): _
- NFR3 (same picture): _
- NFR4 (bandwidth): _
- NFR5 (reversed hits): _
- Slowest phone and stage: _ → baseline for Epic 5.
