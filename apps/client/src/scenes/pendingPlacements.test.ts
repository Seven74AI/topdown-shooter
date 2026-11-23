import { describe, expect, it } from "vitest";
import { addBuildingAt, addPlayer, buildingStats, createWorld, footprint, loadBalance, startBuild, startWave, type PlaceRequest, type World } from "@topdown/shared";
import { FADE_MS, GHOST_KEEP_MS, MAX_FRAME_GAP_MS, PENDING_POOL, PendingPlacements, REFUSE_ANIM_MS, newestBuildingId } from "./pendingPlacements";

/** Story 5.18: pending placements (wallet/cap maths, send gap, FIFO answers, timeouts, lifecycle). */
const balance = loadBalance();
const WOOD = "wood_barricade";
const PRICE = 40;
const FRAME = 16;

function world(): World {
  const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(w, "p0", 20, 16);
  addPlayer(w, "p1", 30, 16);
  startBuild(w);
  return w;
}

const req = (gx: number, gy = 20, rot = 0): PlaceRequest => ({ type: WOOD, gx, gy, rot });
function boxOf(r: PlaceRequest) {
  const s = buildingStats(balance, r.type);
  if (!s) throw new Error("type");
  return footprint(s, r.gx, r.gy, r.rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
}
function add(p: PendingPlacements, w: World, r: PlaceRequest): boolean {
  return p.add(r, PRICE, boxOf(r), newestBuildingId(w), w.run.phase, w.waves.number);
}
/** The server accepted `r` for `owner` with building id `id`. */
function build(w: World, r: PlaceRequest, id: number, owner = "p0"): void {
  addBuildingAt(w, { id, type: r.type, ownerId: owner, gx: r.gx, gy: r.gy, rot: r.rot as 0, hp: 100 });
}
/** Running frames (16 ms) from `from` to `to` (ms) with timeouts on; returns how many boxes timed out. */
function run(p: PendingPlacements, w: World, from: number, to: number): number {
  let n = 0;
  for (let t = from; t <= to; t += FRAME) n += p.update(w, "p0", t, true);
  return n;
}
function sendAll(p: PendingPlacements, w: World, from: number): number {
  let t = from;
  while (p.pump(t, () => {})) {
    run(p, w, t + FRAME, t + 250 - FRAME);
    t += 250;
  }
  return t;
}
const live = (p: PendingPlacements) => p.entries.filter((e) => e.live).length;

describe("Story 5.18: PendingPlacements", () => {
  it("each box is on the cap and off the shown wallet until answered (AC 5)", () => {
    const w = world();
    const p = new PendingPlacements();
    expect([p.count, p.money]).toEqual([0, 0]);
    add(p, w, req(10));
    add(p, w, req(14));
    expect([p.count, p.money]).toEqual([2, 80]);
    expect(p.overlaps(boxOf(req(11)))).toBe(true); // overlaps the first box
    expect(p.overlaps(boxOf(req(18)))).toBe(false); // end to end with the second: touching, not overlapping
  });

  it("sends at most one box per call and ≥ 250 ms apart (≤ 4/s, AC 6), oldest first", () => {
    const w = world();
    const p = new PendingPlacements();
    const sent: PlaceRequest[] = [];
    for (let i = 0; i < 3; i++) add(p, w, req(10 + 4 * i));
    const send = (r: PlaceRequest) => sent.push({ ...r });
    expect(p.pump(1000, send)).toBe(true);
    expect(p.pump(1000, send)).toBe(false);
    expect(p.pump(1249, send)).toBe(false);
    expect(p.pump(1250, send)).toBe(true);
    expect(p.pump(1500, send)).toBe(true);
    expect(p.pump(2000, send)).toBe(false); // nothing queued
    expect(sent.map((r) => r.gx)).toEqual([10, 14, 18]);
    expect(p.count).toBe(3); // sent boxes still count until answered
  });

  it("a box becomes my building: same spot and type, owner me, an id newer than I knew (AC 7)", () => {
    const w = world();
    build(w, req(40), 5); // an older building of mine at another spot
    const p = new PendingPlacements();
    add(p, w, req(10));
    sendAll(p, w, 0);
    build(w, req(10), 6, "p1"); // a teammate's at my spot: not mine
    p.update(w, "p0", 300, true);
    expect(p.count).toBe(1);
    build(w, req(10, 20, 1), 7); // mine, other rot
    p.update(w, "p0", 316, true);
    expect(p.count).toBe(1);
    build(w, req(10), 8);
    p.update(w, "p0", 332, false); // matching runs without timeouts too
    expect([p.count, p.money, live(p)]).toEqual([0, 0, 0]);
  });

  it("an existing building at the spot (id not newer) never takes the box", () => {
    const w = world();
    build(w, req(10), 3);
    const p = new PendingPlacements();
    add(p, w, req(10)); // a red ghost sent anyway: the server will refuse it
    sendAll(p, w, 0);
    p.update(w, "p0", 300, true);
    expect(p.count).toBe(1);
    expect(p.refuse("blocked", 316)).toBe("shown");
    expect(p.count).toBe(0);
  });

  it("refusals go to the oldest unanswered box, after accepted ones became buildings (AC 8)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10)); // A: accepted
    add(p, w, req(14)); // B: refused
    add(p, w, req(18)); // C: accepted
    const t = sendAll(p, w, 0);
    build(w, req(10), 1);
    build(w, req(18), 2);
    p.update(w, "p0", t, true); // the patch after B's refusal: A and C are buildings
    expect(p.refuse("blocked", t)).toBe("shown");
    const b = p.entries.find((e) => e.live);
    expect([b?.gx, b?.counted, b?.refusedMs]).toEqual([14, false, t]);
    expect([p.count, p.money]).toEqual([0, 0]);
  });

  it("two boxes on one spot: the first becomes the building, the second takes the refusal", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    add(p, w, req(10));
    const t = sendAll(p, w, 0);
    build(w, req(10), 1);
    p.update(w, "p0", t, true);
    expect(p.count).toBe(1);
    expect(p.entries.find((e) => e.live && e.counted)?.order).toBe(2);
    expect(p.refuse("blocked", t)).toBe("shown");
  });

  it("no answer in 2 s of running frames: the refusal look starts (money back); the late refusal goes to that ghost, not a newer box (D6, D7)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.update(w, "p0", 0, true);
    p.pump(0, () => {});
    expect(run(p, w, FRAME, 1984)).toBe(0);
    expect(run(p, w, 2000, 2000)).toBe(1);
    expect([p.count, p.money]).toEqual([0, 0]);
    add(p, w, req(20));
    p.pump(2000, () => {});
    expect(p.refuse("money", 2100)).toBe("ghost"); // the late refusal of the first box
    expect(p.count).toBe(1); // the newer box is still pending
    expect(p.refuse("blocked", 2200)).toBe("shown");
    expect(p.refuse("blocked", 2200)).toBe("none");
  });

  it("review M1: a hidden tab or a hitch (one long frame gap) never times a box out; only running frames count, and only with timeouts on", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.update(w, "p0", 0, true);
    p.pump(0, () => {});
    expect(p.update(w, "p0", 3000, true)).toBe(0); // woken after 3 s: +100 ms of running time only
    expect(p.clockMs).toBe(MAX_FRAME_GAP_MS);
    expect(p.count).toBe(1);
    build(w, req(10), 1); // the state applied on the woken frame answers it
    p.update(w, "p0", 3016, true);
    expect([p.count, live(p)]).toEqual([0, 0]);
    // without timeouts (the frame's first update, before the host step) nothing times out however long
    add(p, w, req(20));
    p.pump(4000, () => {});
    for (let t = 4016; t < 7000; t += FRAME) expect(p.update(w, "p0", t, false)).toBe(0);
    expect(p.count).toBe(1);
    expect(p.update(w, "p0", 7016, true)).toBe(1);
  });

  it("review M1 / B3: a hidden tab across a build start clears the boxes on the woken frame, with no timeout first", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.update(w, "p0", 0, true);
    p.pump(0, () => {});
    startWave(w); // the tab slept through the build's end
    w.waves.number += 1;
    expect(p.update(w, "p0", 40_000, false)).toBe(0); // the woken frame's first update clears
    expect([p.count, p.money, live(p)]).toEqual([0, 0, 0]);
    expect(p.update(w, "p0", 40_016, true)).toBe(0);
  });

  it("a timed-out box whose building arrives late goes quietly; ghosts are forgotten 10 s (running) after their timeout", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    add(p, w, req(20));
    let t = sendAll(p, w, 0);
    t += 2000;
    run(p, w, 250, t); // both timed out
    expect(live(p)).toBe(2);
    build(w, req(10), 1);
    p.update(w, "p0", t + FRAME, true);
    expect(live(p)).toBe(1);
    const ghost = p.entries.find((e) => e.live);
    const timeout = ghost?.timeoutClock ?? 0;
    expect(timeout - (ghost?.sentClock ?? 0)).toBeGreaterThanOrEqual(2000); // review L2: the keep counts from the timeout, not the send
    for (let tt = t + 2 * FRAME; p.clockMs - timeout < GHOST_KEEP_MS - FRAME; tt += FRAME) p.update(w, "p0", tt, true);
    expect(live(p)).toBe(1); // still waiting ~12 s after its send
    run(p, w, t + 20_000, t + 20_000 + 2 * FRAME);
    expect(live(p)).toBe(0);
  });

  it("review L1: once a ghost is forgotten while still awaiting, refusals only toast (pick no box) until no box awaits", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.update(w, "p0", 0, true);
    p.pump(0, () => {});
    let t = 0;
    while (live(p) > 0) {
      t += FRAME;
      p.update(w, "p0", t, true); // times out, then is forgotten (its answer never came)
    }
    expect(p.matching).toBe(true); // nothing awaits any more: pairing is safe again
    add(p, w, req(20));
    add(p, w, req(30));
    p.pump(t, () => {});
    p.pump(t + 250, () => {});
    // the second box's ghost is forgotten while the first still awaits
    const second = p.entries.find((e) => e.live && e.gx === 30);
    if (!second) throw new Error("box");
    second.counted = false; // as after its timeout…
    p.count--;
    p.money -= PRICE;
    second.timeoutClock = p.clockMs - GHOST_KEEP_MS;
    p.update(w, "p0", t + 266, true);
    expect(p.matching).toBe(false);
    expect(p.refuse("blocked", t + 300)).toBe("none"); // toast only: the first box isn't guessed
    expect(p.count).toBe(1);
    build(w, req(20), 1); // its building comes: nothing awaits → pairing on again
    p.update(w, "p0", t + 316, true);
    expect([p.matching, p.count]).toEqual([true, 0]);
  });

  it("review L1: a refusal the host dropped switches pairing off while boxes await", () => {
    const w = world();
    const p = new PendingPlacements();
    p.lost();
    expect(p.matching).toBe(true); // nothing awaits: nothing to protect
    add(p, w, req(10));
    p.pump(0, () => {});
    p.lost();
    expect(p.refuse("blocked", 10)).toBe("none");
    expect(p.count).toBe(1);
  });

  it("a refused box frees its slot when the 750 ms look ends", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.pump(0, () => {});
    p.refuse("blocked", 100);
    p.update(w, "p0", 100 + REFUSE_ANIM_MS - 1, true);
    expect(live(p)).toBe(1);
    p.update(w, "p0", 100 + REFUSE_ANIM_MS, true);
    expect(live(p)).toBe(0);
    expect(REFUSE_ANIM_MS).toBe(450 + FADE_MS);
  });

  it("a phase change or a new wave number clears every box; queued ones are never sent (AC 9)", () => {
    const w = world();
    const p = new PendingPlacements();
    const sent: PlaceRequest[] = [];
    add(p, w, req(10));
    add(p, w, req(14));
    p.pump(0, (r) => sent.push({ ...r }));
    startWave(w);
    p.update(w, "p0", 100, false);
    expect([p.count, p.money, live(p)]).toEqual([0, 0, 0]);
    expect(p.pump(1000, (r) => sent.push({ ...r }))).toBe(false);
    expect(sent.length).toBe(1);
    expect(p.refuse("not_build_phase", 200)).toBe("none"); // the late edge refusal just toasts
    const w2 = world();
    add(p, w2, req(10));
    w2.waves.number = 3; // a hidden tab: the next build has a new wave number
    p.update(w2, "p0", 300, false);
    expect(p.count).toBe(0);
  });

  it("review L2: the pool fits 2 × maxPerPlayer + 4 (≥ 16); a full pool reuses the oldest uncounted box, never a counted one", () => {
    const p = new PendingPlacements();
    expect(p.entries.length).toBe(PENDING_POOL);
    p.configure(2000, 250, 6);
    expect(p.entries.length).toBe(PENDING_POOL);
    p.configure(2000, 250, 30);
    expect(p.entries.length).toBe(64);
    const w = world();
    const q = new PendingPlacements();
    for (let i = 0; i < PENDING_POOL; i++) expect(add(q, w, req(i * 4))).toBe(true);
    expect(add(q, w, req(100))).toBe(false);
    q.entries[3]!.counted = false; // as after a refusal look
    q.count--;
    expect(add(q, w, req(100))).toBe(true);
    expect(q.count).toBe(PENDING_POOL);
  });

  it("reset forgets the last matched id (a new run's ids start again)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.pump(0, () => {});
    build(w, req(10), 9);
    p.update(w, "p0", 10, true);
    p.reset();
    const w2 = world();
    add(p, w2, req(10));
    p.pump(1000, () => {});
    build(w2, req(10), 1);
    p.update(w2, "p0", 1010, true);
    expect(p.count).toBe(0);
  });
});
