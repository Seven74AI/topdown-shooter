import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { downPlayer } from "../player/downed";
import { teamSpawnPoint } from "../player/spawn";
import { spawnZombie } from "../zombies/zombiePool";
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
    step(world, TICK_DT_S);
  };
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
    while (world.tick < limit && !world.teamWiped && !(world.waves.number >= 3 && world.waves.phase === "active")) tick();
    expect(world.teamWiped).toBe(false);
    expect(world.waves.number).toBe(3);
    // With the bots.json defaults (no tuning needed) seed 0x2010 reaches wave 3 at tick 1109 with 0 downs.
    expect(downs).toBeLessThan(IDS.length);
  });

  it("copes with Crawlers too (Story 3.9 wave mix): waves 1 and 2 cleared without a team wipe", () => {
    const { world, tick } = botTeam(0x2010);
    world.debug.waveMix = ["walker", "crawler"];
    const limit = ticksOf(6 * 60);
    while (world.tick < limit && !world.teamWiped && !(world.waves.number >= 3 && world.waves.phase === "active")) tick();
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
