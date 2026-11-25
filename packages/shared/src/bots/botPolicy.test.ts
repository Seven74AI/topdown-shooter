import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { downPlayer } from "../player/downed";
import { teamSpawnPoint } from "../player/spawn";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt } from "../buildings/buildings";
import { setLoadout } from "../combat/loadout";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { setBuildReady, startBuild } from "../run/runStateMachine";
import { botConfigOf, botInput, botViewFromWorld, createBotView, type BotView } from "./botPolicy";

const balance = loadBalance();
const cfg = botConfigOf(balance);
const IDS = ["p0", "p1", "p2", "p3"] as const;

/** 4 bots in a World with the real systems (or `systems` replaced), driven by the policy each tick. */
function botTeam(seed: number, systems?: Parameters<typeof createWorld>[0]["systems"]) {
  const world = createWorld({ balance, seed, ...(systems ? { systems } : {}) });
  const at = { x: 0, y: 0 };
  IDS.forEach((id, slot) => {
    teamSpawnPoint(world, slot, at);
    addPlayer(world, id, at.x, at.y);
  });
  const views = IDS.map(() => createBotView());
  const inputs: PlayerInput[] = IDS.map(() => ({ ...NEUTRAL_INPUT }));
  let seq = 0;
  const tick = (): void => {
    seq++;
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i] as string;
      if (!world.players.has(id)) continue;
      botViewFromWorld(world, id, views[i] as BotView);
      botInput(views[i] as BotView, cfg, seq, inputs[i] as PlayerInput);
      setInput(world, id, inputs[i] as PlayerInput);
    }
    // Story 3.1: the bots tap Ready in every build phase.
    if (world.run.phase === "build") for (const id of IDS) setBuildReady(world, id, true);
    step(world, TICK_DT_S);
  };
  startBuild(world);
  return { world, tick };
}

const ticksOf = (s: number): number => Math.round(s / TICK_DT_S);

/** A cheap fingerprint of the World (positions, HP, waves) for the determinism check. */
function fingerprint(world: World): string {
  const parts: string[] = [String(world.tick), String(world.waves.number), String(world.zombies.aliveCount)];
  for (const id of IDS) {
    const p = world.players.get(id);
    if (p) parts.push(`${p.x.toFixed(6)},${p.y.toFixed(6)},${p.hp},${p.status}`);
  }
  return parts.join("|");
}

describe("bot policy (Story 2.10)", () => {
  it("clears waves 1 and 2 with 4 bots and reaches wave 3 without a team wipe", () => {
    const { world, tick } = botTeam(0x2010);
    const limit = ticksOf(6 * 60);
    let downs = 0;
    world.events.subscribe((e) => {
      if (e.type === "player.downed") downs++;
    });
    while (world.tick < limit && !world.teamWiped && !(world.waves.number >= 3 && world.run.phase === "wave")) tick();
    expect(world.teamWiped).toBe(false);
    expect(world.waves.number).toBe(3);
    // With the bots.json defaults (no tuning needed) seed 0x2010 reaches wave 3 at tick 1109 with 0 downs.
    expect(downs).toBeLessThan(IDS.length);
  });

  it("copes with Crawlers too (Story 3.9 wave mix): waves 1 and 2 cleared without a team wipe", () => {
    const { world, tick } = botTeam(0x2010);
    world.debug.waveMix = ["walker", "crawler"];
    const limit = ticksOf(6 * 60);
    while (world.tick < limit && !world.teamWiped && !(world.waves.number >= 3 && world.run.phase === "wave")) tick();
    expect(world.teamWiped).toBe(false);
    expect(world.waves.number).toBe(3);
  });

  it("revives a downed teammate", () => {
    // No waves and no zombies: only the revive is tested.
    const { world, tick } = botTeam(7, { waves: () => {} });
    const downed = world.players.get("p3");
    if (!downed) throw new Error("no p3");
    downPlayer(world, downed);
    let revived = false;
    world.events.subscribe((e) => {
      if (e.type === "player.revived" && e.playerId === "p3") revived = true;
    });
    const limit = ticksOf(balance.player.reviveS + 3);
    while (world.tick < limit && !revived) tick();
    expect(revived).toBe(true);
    expect(world.players.get("p3")?.status).toBe("alive");
  });

  it("aims at the nearest zombie and fires only within range", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 10, 10);
    const view = createBotView();
    const out: PlayerInput = { ...NEUTRAL_INPUT };
    spawnZombie(world, "walker", 30, 10);
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 1, out);
    expect(out.aimX).toBeCloseTo(1);
    expect(out.fire).toBe(false); // 20 m away: beyond the Pistol's range
    spawnZombie(world, "walker", 10, 15);
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 2, out);
    expect(out.aimY).toBeCloseTo(1);
    expect(out.fire).toBe(true);
    expect(out.isMouse).toBe(false);
    expect(out.swap).toBe(false);
    expect(out.seq).toBe(2);
  });

  it("holds fire at a zombie behind a barricade and strafes to open a line; fires at a clear one instead", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 10, 10);
    expect(addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 9 / BUILD_GRID_M, gy: 11.5 / BUILD_GRID_M, rot: 0, hp: 200 })).not.toBeNull(); // [9, 11] × [11.5, 12]
    const view = createBotView();
    const out: PlayerInput = { ...NEUTRAL_INPUT };
    spawnZombie(world, "walker", 10, 13); // 3 m, behind the barricade
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 1, out);
    expect(view.shotZombie).toBeNull();
    expect(out.fire).toBe(false);
    expect(out.aimY).toBeCloseTo(1); // still facing it
    expect(Math.hypot(out.moveX, out.moveY)).toBeCloseTo(1); // strafing…
    expect(out.moveY).toBeCloseTo(0); // …sideways
    spawnZombie(world, "walker", 14, 10); // 4 m, in the open
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 2, out);
    expect(out.fire).toBe(true);
    expect(out.aimX).toBeCloseTo(1);
  });

  it("backs away from a zombie closer than keepDistanceM", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 10, 10);
    spawnZombie(world, "walker", 10 + cfg.keepDistanceM / 2, 10);
    const view = createBotView();
    const out: PlayerInput = { ...NEUTRAL_INPUT };
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 1, out);
    expect(out.moveX).toBeCloseTo(-1);
    expect(out.moveY).toBeCloseTo(0);
  });

  it("Story 5.6 review M2: closes in only on a Spitter holding its spot just out of range, never on a walking zombie", () => {
    const move = (type: "walker" | "spitter", dist: number, weapon: string, rush = false) => {
      const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
      const p = addPlayer(world, "p0", 10, 10);
      setLoadout(balance, p.loadout, [weapon, null]);
      const id = spawnZombie(world, type, 10 + dist, 10);
      if (rush) world.zombies.state[id] = ZOMBIE_STATE.RUSH;
      const view = createBotView();
      const out: PlayerInput = { ...NEUTRAL_INPUT };
      botViewFromWorld(world, "p0", view);
      botInput(view, cfg, 1, out);
      return out.moveX;
    };
    const shotgun = balance.weapons.shotgun?.rangeM ?? 0; // 5 m
    expect(move("spitter", shotgun + 1, "shotgun")).toBeCloseTo(1); // a Spitter at 6 m: step in
    expect(move("walker", shotgun + 1, "shotgun")).toBeCloseTo(0); // a Walker at 6 m comes by itself
    expect(move("spitter", shotgun + 1, "shotgun", true)).toBeCloseTo(1); // a rushing (marked) Spitter out of range: hunted (rule 4)
    expect(move("spitter", shotgun + 1 + (cfg.closeInExtraM ?? 0), "shotgun")).toBeCloseTo(0); // too far: no chase
    const pistol = balance.weapons.pistol?.rangeM ?? 0;
    expect(move("walker", pistol + 1, "pistol")).toBeCloseTo(0); // review M2: Pistol bots never chase Walkers
  });

  it("Epic 5 balance pass: hunts a marked last-rush zombie out of range (players see the marks), never one in range", () => {
    const move = (dist: number, rush: boolean) => {
      const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
      const p = addPlayer(world, "p0", 10, 10);
      setLoadout(balance, p.loadout, ["pistol", null]);
      const id = spawnZombie(world, "walker", 10 + dist, 10);
      if (rush) world.zombies.state[id] = ZOMBIE_STATE.RUSH;
      const view = createBotView();
      const out: PlayerInput = { ...NEUTRAL_INPUT };
      botViewFromWorld(world, "p0", view);
      botInput(view, cfg, 1, out);
      return out.moveX;
    };
    const pistol = balance.weapons.pistol?.rangeM ?? 0;
    expect(move(pistol + 6, true)).toBeCloseTo(1); // a marked rusher 15 m away: walk to it
    expect(move(pistol + 6, false)).toBeCloseTo(0); // an ordinary Walker: wait for it
    expect(move(pistol - 1, true)).toBeCloseTo(0); // in range: stand and shoot
  });

  it("regroups toward the team centre and stands still inside regroupDistM", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 5, 10);
    addPlayer(world, "p1", 25, 10);
    const view = createBotView();
    const out: PlayerInput = { ...NEUTRAL_INPUT };
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 1, out);
    expect(out.moveX).toBeCloseTo(1); // centre at x = 15, 10 m away
    const p0 = world.players.get("p0");
    if (p0) p0.x = 25 - cfg.regroupDistM; // centre (incl. me) is regroupDistM / 2 away
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 2, out);
    expect(out.moveX).toBe(0);
    expect(out.moveY).toBe(0);
  });

  it("does nothing while downed", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    const p = addPlayer(world, "p0", 10, 10);
    addPlayer(world, "p1", 11, 10);
    spawnZombie(world, "walker", 12, 10);
    downPlayer(world, p);
    const view = createBotView();
    const out: PlayerInput = { ...NEUTRAL_INPUT, fire: true, moveX: 1 };
    botViewFromWorld(world, "p0", view);
    botInput(view, cfg, 3, out);
    expect(out).toEqual({ ...NEUTRAL_INPUT, seq: 3 });
  });

  it("is deterministic: the same seed gives the same run", () => {
    const a = botTeam(42);
    const b = botTeam(42);
    for (let i = 0; i < ticksOf(45); i++) {
      a.tick();
      b.tick();
    }
    expect(fingerprint(a.world)).toBe(fingerprint(b.world));
  });
});

describe("Story 6.5: bots fight the Behemoth", () => {
  it("the boss is a target measured to its body's edge; in range with a clear line it is shot; out of range the bot walks to it; never backs off its body", async () => {
    const { BOSS_STATE } = await import("../boss/bossState");
    const balance = loadBalance();
    const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(w, "p0", 10, 16);
    w.run.phase = "wave";
    w.boss.state = BOSS_STATE.WALK;
    w.boss.x = 10 + balance.boss.radiusM + 5;
    w.boss.y = 16;
    const v = createBotView();
    botViewFromWorld(w, "p0", v);
    expect(v.nearestZombie).toMatchObject({ boss: true, rushing: true });
    expect(v.nearestZombie?.distM).toBeCloseTo(5, 6);
    expect(v.shotZombie).not.toBeNull(); // pistol 9 m ≥ 5 m to its edge
    w.boss.x = 10 + balance.boss.radiusM + 1; // inside keepDistanceM of its edge: no back-off
    botViewFromWorld(w, "p0", v);
    const out = { ...NEUTRAL_INPUT };
    botInput(v, botConfigOf(balance), 1, out);
    expect(out.moveX).toBeGreaterThanOrEqual(0);
    w.boss.x = 40; // out of range: walk to it
    botViewFromWorld(w, "p0", v);
    botInput(v, botConfigOf(balance), 2, out);
    expect(out.moveX).toBeGreaterThan(0);
  });
});

describe("fix bloater-car-corner (review round 2): the hunt never routes a bot through a slot it doesn't fit", () => {
  it("two barricades 0.5 m apart (one nav cell): the bot hunting the Behemoth beyond them is never sent into the slot", async () => {
    const { BOSS_STATE } = await import("../boss/bossState");
    const w = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    // [10, 14] × [10, 10.5] and [10, 14] × [11, 11.5]: a 0.5 m slot at y ∈ [10.5, 11]; a survivor is 0.8 m wide.
    let id = 1;
    for (const [x, y] of [[10, 10], [12, 10], [10, 11], [12, 11]] as const) addBuildingAt(w, { id: id++, type: "metal_barricade", ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: 1e9 });
    addPlayer(w, "p0", 9.4, 10.75); // at the slot's west mouth
    w.run.phase = "wave";
    w.boss.state = BOSS_STATE.WALK;
    w.boss.x = 30;
    w.boss.y = 10.75;
    step(w, TICK_DT_S); // the nav grid picks the buildings up
    const v = createBotView();
    botViewFromWorld(w, "p0", v);
    expect(v.nearestZombie).toMatchObject({ boss: true, rushing: true });
    expect(v.huntStepX !== 0 || v.huntStepY !== 0, "liveness: the hunt gave a way").toBe(true);
    const tx = 9.4 + v.huntStepX;
    const ty = 10.75 + v.huntStepY;
    const intoSlot = tx > 10 && ty > 10.5 && ty < 11;
    expect(intoSlot, `carrot (${tx.toFixed(2)}, ${ty.toFixed(2)}) is in the slot`).toBe(false);
  });
});
