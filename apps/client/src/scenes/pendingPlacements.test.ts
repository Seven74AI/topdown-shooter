import { describe, expect, it } from "vitest";
import { addBuildingAt, addPlayer, buildingStats, createWorld, footprint, loadBalance, startBuild, startWave, type PlaceRequest, type World } from "@topdown/shared";
import { FADE_MS, GHOST_KEEP_MS, PENDING_POOL, PendingPlacements, REFUSE_ANIM_MS, newestBuildingId } from "./pendingPlacements";

/** Story 5.18: pending placements (wallet/cap maths, send gap, FIFO answers, timeouts, lifecycle). */
const balance = loadBalance();
const WOOD = "wood_barricade";
const PRICE = 40;

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
function sendAll(p: PendingPlacements, from: number, sent: PlaceRequest[]): number {
  let t = from;
  while (p.pump(t, (r) => sent.push({ ...r }))) t += 250;
  return t;
}

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
    sendAll(p, 0, []);
    build(w, req(10), 6, "p1"); // a teammate's at my spot: not mine
    p.update(w, "p0", 100);
    expect(p.count).toBe(1);
    build(w, req(10, 20, 1), 7); // mine, other rot
    p.update(w, "p0", 100);
    expect(p.count).toBe(1);
    build(w, req(10), 8);
    p.update(w, "p0", 100);
    expect([p.count, p.money, p.entries.filter((e) => e.live).length]).toEqual([0, 0, 0]);
  });

  it("an existing building at the spot (id not newer) never takes the box", () => {
    const w = world();
    build(w, req(10), 3);
    const p = new PendingPlacements();
    add(p, w, req(10)); // a red ghost sent anyway: the server will refuse it
    sendAll(p, 0, []);
    p.update(w, "p0", 100);
    expect(p.count).toBe(1);
    expect(p.refuse("blocked", 150)).toBe("shown");
    expect(p.count).toBe(0);
  });

  it("refusals go to the oldest unanswered box, after accepted ones became buildings (AC 8)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10)); // A: accepted
    add(p, w, req(14)); // B: refused
    add(p, w, req(18)); // C: accepted
    sendAll(p, 0, []);
    build(w, req(10), 1);
    build(w, req(18), 2);
    p.update(w, "p0", 600); // the patch after B's refusal: A and C are buildings
    expect(p.refuse("blocked", 600)).toBe("shown");
    const b = p.entries.find((e) => e.live);
    expect([b?.gx, b?.counted, b?.refusedMs]).toEqual([14, false, 600]);
    expect([p.count, p.money]).toEqual([0, 0]);
  });

  it("two boxes on one spot: the first becomes the building, the second takes the refusal", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    add(p, w, req(10));
    sendAll(p, 0, []);
    build(w, req(10), 1);
    p.update(w, "p0", 300);
    expect(p.count).toBe(1);
    const left = p.entries.find((e) => e.live && e.counted);
    expect(left?.order).toBe(2);
    expect(p.refuse("blocked", 300)).toBe("shown");
  });

  it("no answer in 2 s: the refusal look starts (money back); the late refusal goes to that ghost, not a newer box (D6, D7)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.pump(0, () => {});
    expect(p.update(w, "p0", 1999)).toBe(0);
    expect(p.update(w, "p0", 2000)).toBe(1);
    expect([p.count, p.money]).toEqual([0, 0]);
    add(p, w, req(20));
    p.pump(2000, () => {});
    expect(p.refuse("money", 2100)).toBe("ghost"); // the late refusal of the first box
    expect(p.count).toBe(1); // the newer box is still pending
    expect(p.refuse("blocked", 2200)).toBe("shown");
    expect(p.refuse("blocked", 2200)).toBe("none");
  });

  it("a timed-out box whose building arrives late goes quietly; ghosts are forgotten after 10 s", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    add(p, w, req(20));
    sendAll(p, 0, []);
    p.update(w, "p0", 2300); // both timed out
    expect(p.entries.filter((e) => e.live).length).toBe(2);
    build(w, req(10), 1);
    p.update(w, "p0", 2400);
    expect(p.entries.filter((e) => e.live).length).toBe(1);
    p.update(w, "p0", 250 + GHOST_KEEP_MS - 1);
    expect(p.entries.filter((e) => e.live).length).toBe(1);
    p.update(w, "p0", 250 + GHOST_KEEP_MS);
    expect(p.entries.filter((e) => e.live).length).toBe(0);
  });

  it("a refused box frees its slot when the 750 ms look ends", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.pump(0, () => {});
    p.refuse("blocked", 100);
    p.update(w, "p0", 100 + REFUSE_ANIM_MS - 1);
    expect(p.entries.filter((e) => e.live).length).toBe(1);
    p.update(w, "p0", 100 + REFUSE_ANIM_MS);
    expect(p.entries.filter((e) => e.live).length).toBe(0);
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
    p.update(w, "p0", 100);
    expect([p.count, p.money, p.entries.filter((e) => e.live).length]).toEqual([0, 0, 0]);
    expect(p.pump(1000, (r) => sent.push({ ...r }))).toBe(false);
    expect(sent.length).toBe(1);
    expect(p.refuse("not_build_phase", 200)).toBe("none"); // the late edge refusal just toasts
    // a hidden tab: the next build has a new wave number
    const w2 = world();
    add(p, w2, req(10));
    w2.waves.number = 3;
    p.update(w2, "p0", 300);
    expect(p.count).toBe(0);
  });

  it("the pool never drops a counted box: a full pool reuses the oldest ghost, else refuses the add", () => {
    const w = world();
    const p = new PendingPlacements();
    for (let i = 0; i < PENDING_POOL; i++) expect(add(p, w, req(i * 4))).toBe(true);
    expect(add(p, w, req(100))).toBe(false);
    sendAll(p, 0, []);
    p.update(w, "p0", 6000); // every box timed out: uncounted ghosts (still waiting for a late answer)
    expect(p.count).toBe(0);
    expect(add(p, w, req(100))).toBe(true);
    expect(p.count).toBe(1);
  });

  it("reset forgets the last matched id (a new run's ids start again)", () => {
    const w = world();
    const p = new PendingPlacements();
    add(p, w, req(10));
    p.pump(0, () => {});
    build(w, req(10), 9);
    p.update(w, "p0", 10);
    p.reset();
    const w2 = world();
    add(p, w2, req(10));
    p.pump(1000, () => {});
    build(w2, req(10), 1);
    p.update(w2, "p0", 1010);
    expect(p.count).toBe(0);
  });
});
