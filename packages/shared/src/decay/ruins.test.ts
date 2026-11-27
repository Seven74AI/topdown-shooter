import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, blockReason, buildingStats, footprint, placeBuilding, placementError, type Box, type Building } from "../buildings/buildings";
import { upgradeBuilding } from "../buildings/upgrade";
import { circleOverlapsBox } from "../buildings/collision";
import { lobBlockT, meleeLineClear, shotBlockT, shotLineClear } from "../combat/cover";
import { createExplosionSpec, explode } from "../combat/explosion";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { isRubble, rubblePiles } from "../map/obstacles";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { SPAWN_STATE, pickSpawnPoint, spawnPickCounters, spawnPointStates } from "../waves/spawnPick";
import { spawnZombie, isZombieAlive } from "../zombies/zombiePool";
import { applyDecayStage } from "./applyDecayStage";
import { gameplayDecayMasks } from "./decayState";
import { changeDecayStage, relocated } from "./decaySystem";
import { variantBit } from "./masks.testkit";

/**
 * Story 6.2 (Ruins, stage 4): every fairness rule of the story is one test here, on the real
 * Downtown data through the shared engine. Rubble is a `block` (a wall: solids + shotBlockers, not
 * lobBlockers), so every rule below comes from the existing code; these tests prove it.
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const MASK_ALLEY = [1, 2, 3].map((k) => (gameplayDecayMasks(DT).find((m) => (m >>> variantBit(DT, `ruins_alley_${k}`)) & 1) as number) >>> 0);
const box = (name: string): MapBox => DT.decay.find((m) => m.name === name) as MapBox;
const P3 = box("rubble_pile_3"); // 37–39 × 3–4.5 in the open gas forecourt
const MID_Y = (P3.minY + P3.maxY) / 2;
const MID_X = (P3.minX + P3.maxX) / 2;
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** A World at stage 4 with `mask` (alley k), the players at the team start; systems quiet. */
function ruins(mask: number, opts: { stage?: number; players?: number } = {}): World {
  const w = createWorld({ balance, seed: 7, map: DT, systems: { waves: () => {}, zombies: () => {} } });
  w.debug.godMode = true;
  const at = { x: 0, y: 0 };
  for (let s = 0; s < (opts.players ?? 1); s++) addPlayer(w, `p${s}`, teamSpawnPoint(w, s, at).x, at.y).wallet = 2000;
  w.decay.variants = mask;
  w.debug.decayStageByWave = Array(10).fill(opts.stage ?? 4); // startBuild keeps this stage
  applyDecayStage(w, opts.stage ?? 4, mask);
  return w;
}

describe("Story 6.2 F2: rubble is hard cover, like a car", () => {
  it("every rubble box is a wall: in solids and shotBlockers, never a lob blocker (not `building`)", () => {
    for (const mask of MASK_ALLEY) {
      const w = ruins(mask);
      const rubble = rubblePiles(w.obstacles, []);
      expect(rubble.map((b) => b.name).filter((n) => n.startsWith("rubble_pile"))).toEqual(["rubble_pile_1", "rubble_pile_2", "rubble_pile_3"]);
      expect(rubble.filter((b) => b.name.startsWith("rubble_alley_") && !b.name.endsWith("_corner"))).toHaveLength(1); // one alley per run
      for (const b of rubble) {
        expect(isRubble(b)).toBe(true);
        expect(w.obstacles.solids).toContain(b);
        expect(w.obstacles.shotBlockers).toContain(b);
        expect(w.obstacles.lobBlockers).not.toContain(b);
        expect(b.building).toBeUndefined();
      }
    }
    // Before stage 4: no rubble at all.
    expect(rubblePiles(ruins(MASK_ALLEY[0] as number, { stage: 3 }).obstacles, [])).toEqual([]);
  });

  it("a bullet stops at the pile's face, melee can't reach across, the lob flies over it", () => {
    const w = ruins(MASK_ALLEY[0] as number);
    const x0 = P3.minX - 2;
    const x1 = P3.maxX + 2;
    const t = shotBlockT(w, x0, MID_Y, x1, MID_Y);
    expect(x0 + t * (x1 - x0)).toBeCloseTo(P3.minX, 9); // the face
    expect(meleeLineClear(w, P3.minX - 0.5, MID_Y, P3.maxX + 0.5, MID_Y)).toBe(false);
    expect(meleeLineClear(w, P3.minX - 0.5, P3.minY - 1, P3.maxX + 0.5, P3.minY - 1)).toBe(true); // open ground beside it
    expect(lobBlockT(w, x0, MID_Y, x1, MID_Y)).toBe(-1); // F2: lobbed rounds fly over rubble
    // Spit, flames, acid, gas and fire zones use the centre line (`shotLineClear`): blocked too.
    expect(shotLineClear(w, x0, MID_Y, x1, MID_Y)).toBe(false);
    // Stage 3: the same line is open (the pile is new at stage 4).
    expect(shotBlockT(ruins(MASK_ALLEY[0] as number, { stage: 3 }), x0, MID_Y, x1, MID_Y)).toBe(-1);
  });

  it("a blast on one side of a pile does not hurt a zombie or a player behind it; one beside it in the open is hit", () => {
    const w = ruins(MASK_ALLEY[0] as number);
    startBuild(w);
    startWave(w);
    // Across the pile's short (1.5 m) side: the blast 0.4 m north of it, the bodies 0.4 m south (2.3 m: in range).
    const by = P3.minY - 0.4;
    const behind = spawnZombie(w, "walker", MID_X - 0.3, P3.maxY + 0.4);
    const open = spawnZombie(w, "walker", MID_X - 1.5, by);
    w.zombies.hp[behind] = w.zombies.hp[open] = 1000;
    const p0 = w.players.get("p0") as { x: number; y: number; prevX: number; prevY: number; hp: number };
    p0.x = p0.prevX = MID_X + 0.3;
    p0.y = p0.prevY = P3.maxY + 0.4;
    w.debug.godMode = false;
    const hp = p0.hp;
    expect(Math.hypot(MID_X - 0.3 - MID_X, P3.maxY + 0.4 - by)).toBeLessThan(2.5); // in range: only the pile shields them
    explode(w, { ...createExplosionSpec(), x: MID_X, y: by, radiusM: 2.5, zombieDamage: 100, playerDamage: 100, pushM: 0, kind: "grenade", sourcePlayerId: null, weapon: "grenade_launcher", quiet: true, grenadeId: 1 });
    expect(w.zombies.hp[behind]).toBe(1000);
    expect(p0.hp).toBe(hp);
    expect(w.zombies.hp[open]).toBe(900); // liveness: the blast really happened
    // Control: the same blast at stage 3 (no pile) reaches the body behind.
    const w3 = ruins(MASK_ALLEY[0] as number, { stage: 3 });
    startBuild(w3);
    startWave(w3);
    const z3 = spawnZombie(w3, "walker", MID_X - 0.3, P3.maxY + 0.4);
    w3.zombies.hp[z3] = 1000;
    explode(w3, { ...createExplosionSpec(), x: MID_X, y: by, radiusM: 2.5, zombieDamage: 100, playerDamage: 100, pushM: 0, kind: "grenade", sourcePlayerId: null, weapon: "grenade_launcher", quiet: true, grenadeId: 1 });
    expect(w3.zombies.hp[z3]).toBe(900);
  });
});

describe("Story 6.2 F3: you can't build on rubble; a building it lands on is destroyed (Story 12.4: nothing back)", () => {
  it("placement on a pile is refused with cause solid (the client's line: \"Blocked by rubble\")", () => {
    const w = ruins(MASK_ALLEY[0] as number);
    startBuild(w);
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    let refused = 0;
    for (const pile of rubblePiles(w.obstacles, [])) {
      // Centred on the box (the alley's mouth end is within spawnClearM of its old spawn: reason "spawn" there).
      const gx = Math.floor(((pile.minX + pile.maxX) / 2 - wood.widthM / 2) / BUILD_GRID_M);
      const gy = Math.floor(((pile.minY + pile.maxY) / 2 - wood.depthM / 2) / BUILD_GRID_M);
      expect(placementError(w, "p0", { type: "wood_barricade", gx, gy, rot: 0 }), pile.name).toBe("blocked");
      const fp = footprint(wood, gx, gy, 0, { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Box);
      const r = blockReason(w, "p0", fp);
      expect(r?.cause, pile.name).toBe("solid");
      expect(isRubble(w.obstacles.solids[r?.index ?? -1] as MapBox), pile.name).toBe(true);
      refused++;
    }
    expect(refused).toBe(4); // 3 piles + alley 1
  });

  it("a barricade, a spike trap, a mine and a turret on the pile spots (built at stage 3) are destroyed at the stage-4 build start, nothing refunded (Story 12.4)", () => {
    const w = ruins(MASK_ALLEY[1] as number, { stage: 3 });
    startBuild(w);
    const placed: Building[] = [];
    const types = ["wood_barricade", "spike_trap", "mine", "auto_turret"];
    const piles = ["rubble_pile_1", "rubble_pile_2", "rubble_pile_3", "rubble_alley_2"].map(box);
    types.forEach((type, i) => {
      const pile = piles[i] as MapBox;
      const b = addBuildingAt(w, { id: 100 + i, type, ownerId: "p0", gx: Math.floor(pile.minX / BUILD_GRID_M), gy: Math.floor(pile.minY / BUILD_GRID_M), rot: 0, hp: 50 });
      expect(b, type).not.toBeNull();
      placed.push(b as Building);
    });
    const p0 = w.players.get("p0") as { wallet: number };
    const before = p0.wallet;
    const events: SimEvent[] = [];
    const off = w.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(w, 4)).toBe(true);
    step(w, TICK_DT_S); // events are delivered on the next step
    off();
    expect(w.buildings.list.filter((b) => placed.includes(b))).toEqual([]);
    // Story 12.4: lost, nothing back (was floor(price × 0.5) each).
    expect(of(events, "money.earned").filter((e) => e.reason === "refund")).toEqual([]);
    expect(p0.wallet - before).toBe(0);
    expect(of(events, "building.destroyed")).toHaveLength(4);
    expect(of(events, "building.destroyed").map((e) => e.cause)).toEqual(["collapse", "collapse", "collapse", "collapse"]);
  });
});

describe("Story 6.2 review L4, as changed by Story 12.4: nothing comes back, upgrades included", () => {
  it("an upgraded barricade (wood → reinforced) and a discounted trap on pile spots are lost: no refund at all (was floor(paid × 0.5))", () => {
    const w = ruins(MASK_ALLEY[0] as number, { stage: 3 });
    startBuild(w);
    const pile = box("rubble_pile_1");
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    // Placed and upgraded through the real paths (they keep 5.20's `paid`).
    const gx = Math.floor(((pile.minX + pile.maxX) / 2 - wood.widthM / 2) / BUILD_GRID_M);
    const gy = Math.floor(((pile.minY + pile.maxY) / 2 - wood.depthM / 2) / BUILD_GRID_M);
    const placed = placeBuilding(w, "p0", { type: "wood_barricade", gx, gy, rot: 0 });
    if (!placed.ok) throw new Error(placed.error);
    const up = upgradeBuilding(w, "p0", placed.value.id);
    if (!up.ok) throw new Error(up.error);
    const b = w.buildings.list.find((x) => x.id === placed.value.id) as Building;
    expect(b.type).toBe("reinforced_barricade");
    expect(b.paid).toBe(wood.price + (wood.upgradesTo?.price ?? 0)); // liveness: the upgrade was paid (40 + 50)
    // The balance cross-check makes a tier's price = everything paid to reach it, so today both rules give 45.
    // A building whose `paid` differs from its tier price (any future discount) proves which one is read:
    const other = addBuildingAt(w, { id: 900, type: "spike_trap", ownerId: "p0", gx: Math.floor(box("rubble_pile_2").minX / BUILD_GRID_M), gy: Math.floor(box("rubble_pile_2").minY / BUILD_GRID_M), rot: 0, hp: 50 }) as Building;
    other.paid = 30; // the spike trap's tier price is 80
    const p0 = w.players.get("p0") as { wallet: number };
    const before = p0.wallet;
    const events: SimEvent[] = [];
    const off = w.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(w, 4)).toBe(true);
    step(w, TICK_DT_S);
    off();
    expect(of(events, "building.destroyed").map((e) => e.buildingId).sort((x, y) => x - y)).toEqual([b.id, other.id].sort((x, y) => x - y));
    expect(of(events, "money.earned").filter((e) => e.reason === "refund")).toEqual([]);
    expect(p0.wallet - before).toBe(0);
  });
});

describe("Story 6.2 F1/F4: the alley closes wall to wall; nobody is left inside it", () => {
  it("a player and a zombie standing in the collapsing alley at the build start are moved out; nobody inside a box", () => {
    for (const [k, mask] of MASK_ALLEY.entries()) {
      const w = ruins(mask, { stage: 3, players: 2 });
      const alley = box(`rubble_alley_${k + 1}`);
      const cx = (alley.minX + alley.maxX) / 2;
      const cy = (alley.minY + alley.maxY) / 2;
      const p1 = w.players.get("p1") as { x: number; y: number; prevX: number; prevY: number; radiusM: number };
      p1.x = p1.prevX = cx;
      p1.y = p1.prevY = cy;
      startBuild(w);
      startWave(w);
      const z = spawnZombie(w, "walker", cx, cy + 1.5);
      expect(changeDecayStage(w, 4)).toBe(true);
      expect(relocated.players, `alley ${k + 1}`).toBeGreaterThanOrEqual(1);
      expect(relocated.zombies + relocated.zombiesRemoved, `alley ${k + 1}`).toBeGreaterThanOrEqual(1);
      for (const p of w.players.values()) for (const s of w.obstacles.solids) expect(circleOverlapsBox(p.x, p.y, p.radiusM - 1e-6, s.minX, s.minY, s.maxX, s.maxY), `${p.id} in ${s.name}`).toBe(false);
      if (isZombieAlive(w.zombies, z)) {
        for (const s of w.obstacles.solids) expect(circleOverlapsBox(w.zombies.x[z] as number, w.zombies.y[z] as number, 0.3, s.minX, s.minY, s.maxX, s.maxY), `zombie in ${s.name}`).toBe(false);
      }
    }
  });

  it("alley 3's heap replaces the dumpster (two walls never overlap); alley 2 fills its corner pocket", () => {
    const w3 = ruins(MASK_ALLEY[2] as number);
    const names = w3.obstacles.walls.map((b) => b.name);
    expect(names).toContain("rubble_alley_3");
    expect(names).not.toContain("dumpster_alley_3");
    const w1 = ruins(MASK_ALLEY[0] as number);
    expect(w1.obstacles.walls.map((b) => b.name)).toContain("dumpster_alley_3"); // other alleys keep it
    const w2 = ruins(MASK_ALLEY[1] as number);
    expect(w2.obstacles.walls.map((b) => b.name).filter((n) => n.startsWith("rubble_alley"))).toEqual(["rubble_alley_2", "rubble_alley_2_corner"]);
  });
});

describe("Story 6.2 F5: zombies never come out of rubble; the breaches open at stage 4", () => {
  const idx = (name: string) => DT.spawnPoints.findIndex((s) => s.name === name);
  it("the collapsed alley's mouth is CLOSED at stages 4–5 and OPEN at 1–3; the other mouths stay open; both breaches CLOSED at 1–3, OPEN at 4–5", () => {
    const out = new Uint8Array(DT.spawnPoints.length);
    for (const [k, mask] of MASK_ALLEY.entries()) {
      for (let stage = 1; stage <= 5; stage++) {
        const w = ruins(mask, { stage });
        spawnPointStates(w, out);
        for (let a = 1; a <= 3; a++) {
          const want = stage >= 4 && a === k + 1 ? SPAWN_STATE.CLOSED : SPAWN_STATE.OPEN;
          expect(out[idx(`alley_${a}_mouth`)], `alley ${k + 1} run, stage ${stage}, mouth ${a}`).toBe(want);
        }
        for (const b of ["breach_apartments", "breach_offices"]) expect(out[idx(b)], `${b} stage ${stage}`).toBe(stage >= 4 ? SPAWN_STATE.OPEN : SPAWN_STATE.CLOSED);
      }
    }
  });

  it("a breach is NEAR (not used) while a player stands on it", () => {
    const w = ruins(MASK_ALLEY[0] as number);
    const sp = DT.spawnPoints[idx("breach_offices")] as { x: number; y: number };
    const p0 = w.players.get("p0") as { x: number; y: number };
    p0.x = sp.x;
    p0.y = sp.y;
    const out = spawnPointStates(w, new Uint8Array(DT.spawnPoints.length));
    expect(out[idx("breach_offices")]).toBe(SPAWN_STATE.NEAR);
  });

  it("the buried cache is rebuilt once per obstacle change, never per pick; picks never return a buried point; breaches get used", () => {
    const w = ruins(MASK_ALLEY[0] as number);
    startBuild(w);
    startWave(w);
    pickSpawnPoint(w); // warm the cache for this World's obstacles
    const before = spawnPickCounters.buriedRebuilds;
    const used = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const pick = pickSpawnPoint(w);
      if (pick >= 0) used.add((DT.spawnPoints[pick] as { name: string }).name);
      w.tick++;
    }
    expect(spawnPickCounters.buriedRebuilds).toBe(before);
    expect(used.has("alley_1_mouth")).toBe(false);
    expect(used.has("breach_apartments") && used.has("breach_offices")).toBe(true);
    applyDecayStage(w, 5, MASK_ALLEY[0] as number); // a stage change: one rebuild
    pickSpawnPoint(w);
    expect(spawnPickCounters.buriedRebuilds).toBe(before + 1);
  });
});

describe("Story 6.2 zombies path round the rubble (flow fields)", () => {
  it("a Walker, a Runner and a Brute on the far side of a pile reach a player behind it", () => {
    const w = createWorld({ balance, seed: 3, map: DT, systems: { waves: () => {} } });
    w.debug.godMode = true;
    const p = addPlayer(w, "p0", P3.minX - 1.2, MID_Y);
    w.decay.variants = MASK_ALLEY[0] as number;
    applyDecayStage(w, 4, MASK_ALLEY[0] as number);
    startBuild(w);
    startWave(w);
    const ids = (["walker", "runner", "brute"] as const).map((t, i) => spawnZombie(w, t, P3.maxX + 1, P3.maxY + 1.5 + i * 0.1)); // behind the pile, off the kiosk
    const reached = new Set<number>();
    for (let t = 0; t < 20 * 30 && reached.size < ids.length; t++) {
      step(w, TICK_DT_S);
      for (const id of ids) if (Math.hypot((w.zombies.x[id] as number) - p.x, (w.zombies.y[id] as number) - p.y) < 2.2) reached.add(id);
    }
    expect(reached.size).toBe(3);
  });
});

describe("Story 6.2: the run picks one alley and one material; old seeds keep their cars and fires", () => {
  /** Seeds 1–256's variant masks on the map before Story 6.2 (origin/master at d41add5): bits 0–8. */
  const OLD = [
    347, 243, 423, 238, 365, 399, 399, 366, 237, 363, 219, 235, 427, 414, 377, 349, 363, 380, 215, 413, 437, 237, 359, 438, 365, 411, 215, 437, 441, 343, 245, 243, 374, 335, 219, 411, 429, 347, 407, 359, 441, 359, 430,
    335, 429, 430, 245, 215, 252, 366, 252, 359, 373, 437, 349, 411, 414, 250, 245, 250, 349, 399, 365, 363, 438, 435, 380, 246, 429, 245, 374, 427, 380, 246, 377, 407, 359, 373, 347, 238, 246, 347, 435, 423, 378, 377,
    435, 399, 252, 222, 380, 335, 347, 423, 411, 411, 380, 411, 237, 444, 249, 366, 438, 222, 250, 380, 373, 441, 365, 365, 245, 231, 442, 374, 245, 427, 414, 444, 249, 374, 444, 438, 429, 442, 371, 343, 427, 221, 437,
    250, 429, 423, 438, 430, 231, 347, 429, 373, 359, 350, 373, 231, 246, 371, 349, 363, 359, 343, 250, 429, 222, 250, 366, 429, 435, 238, 437, 343, 365, 343, 423, 374, 250, 347, 427, 366, 371, 438, 343, 219, 407, 423,
    438, 442, 411, 252, 365, 374, 252, 407, 365, 441, 441, 423, 350, 365, 413, 441, 221, 437, 423, 411, 429, 411, 413, 359, 347, 252, 411, 363, 243, 237, 437, 378, 413, 423, 335, 429, 430, 413, 429, 350, 207, 347, 245,
    373, 249, 349, 427, 222, 366, 335, 437, 430, 215, 378, 347, 350, 215, 442, 235, 363, 380, 215, 237, 411, 407, 219, 414, 435, 380, 252, 413, 347, 407, 430, 246, 411, 411, 349, 219, 374, 371, 365, 377, 413,
  ];
  it("seeds 1–256: bits 0–8 equal the pre-6.2 picks; exactly one alley, one material and one weather style per run; every candidate occurs", () => {
    expect(OLD).toHaveLength(256);
    const groups = { ruins_alley: [9, 10, 11], ruins_look: [12, 13, 14], collapse_style: [15, 16, 17, 18] } as const;
    for (const [g, bits] of Object.entries(groups)) expect(bits.map((b) => DT.decayVariants[b]?.group)).toEqual(bits.map(() => g));
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 256; seed++) {
      const m = createWorld({ balance, seed, map: DT }).decay.variants;
      expect(m & 0x1ff, `seed ${seed}`).toBe(OLD[seed - 1]);
      for (const bits of Object.values(groups)) {
        const on = bits.filter((b) => (m >>> b) & 1);
        expect(on, `seed ${seed}`).toHaveLength(1);
        seen.set(on[0] as number, (seen.get(on[0] as number) ?? 0) + 1);
      }
    }
    expect([...seen.keys()].sort((a, b) => a - b)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("looks never change the sim: same obstacles, fires and spawns whatever look bits are set", () => {
    const base = MASK_ALLEY[0] as number;
    const a = ruins(base, { stage: 5 });
    const b = ruins((base | (1 << 13) | (1 << 17)) >>> 0, { stage: 5 });
    expect(b.obstacles.solids.map((s) => s.name)).toEqual(a.obstacles.solids.map((s) => s.name));
    expect(b.obstacles.shotBlockers.length).toBe(a.obstacles.shotBlockers.length);
    expect(b.decay.fires.map((f) => f.name)).toEqual(a.decay.fires.map((f) => f.name));
    expect(DT.decay.filter((m) => m.action === "look").every((m) => m.minX === m.maxX && m.minY === m.maxY)).toBe(true);
  });
});
