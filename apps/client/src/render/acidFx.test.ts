import { describe, expect, it } from "vitest";
import { AREA_KIND, TICK_DT_S, addPlayer, circleInAcid, createWorld, loadBalance, spawnZombie, step, type SimEvent } from "@topdown/shared";
import { AcidFx, GLOB_GRACE_S, acidRingRadiusM } from "./acidFx";
import { isAcidHit, isFireHit } from "./fireCue";
import { routeAcidHit, routeFireHit } from "./burnCue";
import { FireCue } from "./fireCue";

/** Story 5.6: the client's cosmetic spits and puddles (F7, AC 18) and the acid ≠ fire cue (D4). */
const balance = loadBalance();
const spit = balance.zombies.types.spitter?.spit;
if (!spit) throw new Error("no spit");
const caps = balance.zombies.spitCaps;
const fx = () => new AcidFx(caps.maxLiveSpits, caps.maxLivePuddles, spit.speedMps, spit.puddleS);

describe("AcidFx (cosmetic copy from events)", () => {
  it("a glob flies from the spat point toward its end at the spit speed; the splash ends it and puts the puddle at the server's point", () => {
    const a = fx();
    a.handle({ type: "spitter.spat", zombieId: 1, spitId: 7, x: 10, y: 10, toX: 14.5, toY: 10 }, 0);
    expect(a.globCount).toBe(1);
    expect(a.globProgress(0, 0.25)).toBeCloseTo((0.25 * spit.speedMps) / 4.5, 9);
    a.handle({ type: "acid.splashed", puddleId: 7, x: 12.03, y: 10, hitPlayerId: "p0" }, 0.23);
    expect([a.globCount, a.puddleCount]).toEqual([0, 1]);
    expect([a.puddleX[0], a.puddleY[0]]).toEqual([12.03, 10]);
    a.update(0.23 + spit.puddleS - 0.01);
    expect(a.puddleCount).toBe(1);
    a.update(0.23 + spit.puddleS);
    expect(a.puddleCount).toBe(0);
  });

  it("a glob whose splash never comes (filtered out) is gone after its flight + grace", () => {
    const a = fx();
    a.handle({ type: "spitter.spat", zombieId: 1, spitId: 1, x: 0, y: 0, toX: 9, toY: 0 }, 0); // 1 s flight
    a.update(1 + GLOB_GRACE_S - 0.01);
    expect(a.globCount).toBe(1);
    a.update(1 + GLOB_GRACE_S);
    expect(a.globCount).toBe(0);
  });

  it("build.started drops every glob and puddle (a hidden tab that slept across a build start shows nothing stale)", () => {
    const a = fx();
    // The burst a woken tab drains at once: a spit, its splash, then the build start.
    const burst: SimEvent[] = [
      { type: "spitter.spat", zombieId: 1, spitId: 1, x: 0, y: 0, toX: 3, toY: 0 },
      { type: "spitter.spat", zombieId: 2, spitId: 2, x: 5, y: 0, toX: 8, toY: 0 },
      { type: "acid.splashed", puddleId: 1, x: 3, y: 0, hitPlayerId: null },
      { type: "build.started", wave: 5 },
    ];
    for (const e of burst) a.handle(e, 100);
    expect([a.globCount, a.puddleCount]).toEqual([0, 0]);
  });

  it("caps: never more globs or puddles than the server's caps; the oldest puddle goes first", () => {
    const a = fx();
    for (let i = 0; i < caps.maxLivePuddles + 5; i++) a.handle({ type: "acid.splashed", puddleId: i, x: i, y: 0, hitPlayerId: null }, i * 0.01);
    expect(a.puddleCount).toBe(caps.maxLivePuddles);
    expect(Array.from(a.puddleId)).not.toContain(0);
    expect(Array.from(a.puddleId)).toContain(caps.maxLivePuddles + 4);
    for (let i = 0; i < caps.maxLiveSpits + 3; i++) a.handle({ type: "spitter.spat", zombieId: 0, spitId: 100 + i, x: 0, y: 0, toX: 5, toY: 0 }, i * 0.01);
    expect(a.globCount).toBe(caps.maxLiveSpits);
  });

  it("a late scene start (events only from then on) draws only puddles made after it", () => {
    // The server's World ran a spit before the client's scene existed; the client sees only the later one.
    const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(w, "p0", 30, 16).hp = 1e9;
    spawnZombie(w, "spitter", 25, 16);
    for (let t = 0; t < 30; t++) step(w, TICK_DT_S); // first spit and puddle: before the scene
    const a = fx();
    w.events.subscribe((e) => void a.handle(e, w.tick * TICK_DT_S));
    for (let t = 0; t < 70; t++) step(w, TICK_DT_S); // the second spit lands after the start
    expect(w.areas.count).toBeGreaterThanOrEqual(1);
    expect(a.puddleCount).toBe(1);
  });
});

describe("the drawn acid ring is the sim's rule (4.8 D16)", () => {
  it("touching the drawn ring ⇔ circleInAcid (a body whose edge reaches the ring is in acid)", () => {
    const w = createWorld({ balance, seed: 1 });
    w.areas.active[0] = 1;
    w.areas.kind[0] = AREA_KIND.ACID;
    w.areas.x[0] = 10;
    w.areas.y[0] = 10;
    w.areas.radiusM[0] = spit.puddleRadiusM;
    w.areas.count = 1;
    const R = acidRingRadiusM(spit.puddleRadiusM);
    const r = balance.player.radiusM;
    for (let deg = 0; deg < 360; deg += 30) {
      const ux = Math.cos((deg * Math.PI) / 180);
      const uy = Math.sin((deg * Math.PI) / 180);
      expect(circleInAcid(w, 10 + ux * (R + r - 0.001), 10 + uy * (R + r - 0.001), r)).toBe(true); // body edge just over the ring
      expect(circleInAcid(w, 10 + ux * (R + r + 0.01), 10 + uy * (R + r + 0.01), r)).toBe(false); // 1 cm clear of it
    }
  });
});

describe("acid has its own hurt cue (D4: never 'Burning')", () => {
  it("source −3 is acid, −1 is fire; each routes to its own cue", () => {
    const acid: SimEvent = { type: "player.damaged", playerId: "p0", amount: 2, sourceZombieId: -3, tag: "acid", sourcePlayerId: null };
    const fire: SimEvent = { type: "player.damaged", playerId: "p0", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: null };
    expect([isAcidHit(acid), isFireHit(acid), isAcidHit(fire), isFireHit(fire)]).toEqual([true, false, false, true]);
    const fc = new FireCue();
    const ac = new FireCue(600);
    const q = { fireHitAmounts: new Float32Array(4), fireHitSource: new Int8Array(4), fireHitCount: 0 };
    routeFireHit(acid, "p0", 0, fc, q);
    routeAcidHit(acid, "p0", 0, ac, q);
    expect(fc.burning("p0", 10)).toBe(false);
    expect(ac.burning("p0", 10)).toBe(true);
    expect(ac.burning("p0", 600)).toBe(false);
    expect(q.fireHitCount).toBe(1); // my "-2" pop
  });
});
