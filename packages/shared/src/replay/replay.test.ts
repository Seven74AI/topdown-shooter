import { describe, expect, it } from "vitest";
import { runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import { shopStream } from "../core/seedStreams";
import type { World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { createInputLog, replayRun, type InputLog } from "./inputLog";

/**
 * Story 4.4 (NFR10): a bot run recorded with its input log, replayed from the same seed, reaches the
 * same World digest: spawns, kills, buildings, wave outcomes. Liveness (brief line 9): the run really
 * cleared waves, killed zombies, bought and built.
 */
const balance = loadBalance();
/**
 * Seed 3: its recorded run reaches wave 6 with Spitters spitting and acid hurting under both the old
 * and the new bullet rule (2026-11-23: barricades stop bullets; at seed 1 the bots now kill every
 * Spitter before it spits, so the 5.6 liveness check had nothing to see).
 */
const SEED = 3;
const PLAYERS = 2;

function record(): { log: InputLog; run: HeadlessRunLog; digest: number; kills: number } {
  const log = createInputLog(SEED, PLAYERS);
  let digest = 0;
  const run = runHeadless({
    balance,
    seed: SEED,
    players: PLAYERS,
    record: log,
    onEnd: (w) => {
      digest = worldDigest(w);
    },
  });
  const kills = run.kills.reduce((a, b) => a + b, 0) + run.turretKills;
  return { log, run, digest, kills };
}

/** Kills (per player, as `runHeadless` counts them, and by turrets) and wave ends seen while replaying. */
function counting(world: World): { kills: number[]; turretKills: number; wavesEnded: number[] } {
  const c = { kills: Array.from({ length: PLAYERS }, () => 0), turretKills: 0, wavesEnded: [] as number[] };
  world.events.subscribe((e: SimEvent) => {
    if (e.type === "zombie.killed") {
      if (e.buildingId !== undefined) c.turretKills++;
      else if (e.killerId !== null) {
        const k = Number(e.killerId.slice(1));
        c.kills[k] = (c.kills[k] as number) + 1;
      }
    } else if (e.type === "wave.ended") c.wavesEnded.push(e.number);
  });
  return c;
}

/** Whole-run replays take ~1–3 s alone; give them room when the machine is busy (gates flaked at load 7–13). */
const REPLAY_TIMEOUT_MS = 30_000;

describe("headless replay (Story 4.4, NFR10)", { timeout: REPLAY_TIMEOUT_MS }, () => {
  const rec = record();

  it("the recorded run really happened (waves ended, kills, buys, buildings)", () => {
    expect(rec.run.wavesCleared).toBeGreaterThanOrEqual(3);
    expect(rec.run.timedOut).toBe(false);
    expect(rec.kills).toBeGreaterThan(100);
    const kinds = new Set(rec.log.commands.map((c) => c.kind));
    // Story 5.13: weapons are bought as cards.
    expect([...kinds].sort()).toEqual(["buyCard", "input", "place", "ready"]);
    expect(rec.log.endTick).toBe(rec.run.ticks);
  });

  it("same seed + input log → the same snapshotWorld digest, kills and wave outcomes", () => {
    let count: ReturnType<typeof counting> | null = null;
    const w = replayRun(balance, rec.log, { afterStart: (world) => void (count = counting(world)) });
    const c = count as unknown as ReturnType<typeof counting>;
    expect(worldDigest(w)).toBe(rec.digest);
    expect(c.wavesEnded).toEqual(Array.from({ length: rec.run.wavesCleared }, (_, i) => i + 1));
    expect(c.kills).toEqual(rec.run.kills); // every kill again, by the same player
    expect(c.turretKills).toBe(rec.run.turretKills);
    expect(w.run.phase).toBe("results");
    expect(w.run.heldOut).toBe(rec.run.heldOut);
    expect(w.buildings.list.length).toBeGreaterThan(0);
  });

  it("Story 5.6: the replay has Spitters spitting and acid hurting (liveness), and the same digest covers them", () => {
    const c = { spits: 0, splashes: 0, acidHits: 0 };
    const w = replayRun(balance, rec.log, {
      afterStart: (world) =>
        void world.events.subscribe((e: SimEvent) => {
          if (e.type === "spitter.spat") c.spits++;
          else if (e.type === "acid.splashed") c.splashes++;
          else if (e.type === "player.damaged" && e.sourceZombieId === -3) c.acidHits++;
        }),
    });
    expect(worldDigest(w)).toBe(rec.digest);
    expect(rec.run.reached).toBeGreaterThanOrEqual(4); // Spitters join in wave 4
    expect(c.spits).toBeGreaterThanOrEqual(1);
    expect(c.splashes).toBeGreaterThanOrEqual(1);
    expect(c.acidHits).toBeGreaterThanOrEqual(1);
  });

  it("draws from the decay and shop streams change nothing but those streams", () => {
    let decayDraws = 0;
    const w = replayRun(balance, rec.log, {
      afterStart: (world) => {
        for (let i = 0; i < 1000; i++) world.streams.decay.next();
        decayDraws += 1000;
      },
      beforeTick: (world) => {
        world.streams.decay.int(0, 9); // what Story 4.5's decay timeline will do (and more)
        decayDraws++;
        if (world.run.phase === "build") shopStream(world, 1).next(); // a card shop rolling every tick (build only: L1)
      },
    });
    const base = replayRun(balance, rec.log);
    const a = snapshotWorld(w);
    const b = snapshotWorld(base);
    expect(decayDraws).toBeGreaterThan(1000 + 1000);
    expect(a.streams.decay).not.toEqual(b.streams.decay); // the draws really happened
    expect(a.streams.shop[1]).not.toEqual(b.streams.shop[1]);
    const strip = (s: typeof a) => ({ ...s, streams: { ...s.streams, decay: null, shop: null } });
    expect(strip(a)).toEqual(strip(b)); // spawns, zombies, kills, players, buildings, waves: identical
    expect(a.streams.spawns).toEqual(b.streams.spawns);
  });

  it("a different seed with the same input log gives a different run", () => {
    const w = replayRun(balance, { ...rec.log, seed: SEED + 1 });
    expect(worldDigest(w)).not.toBe(rec.digest);
  });

  it("the build commands matter: a log without them diverges", () => {
    const w = replayRun(balance, { ...rec.log, commands: rec.log.commands.filter((c) => c.kind === "input" || c.kind === "ready") });
    expect(worldDigest(w)).not.toBe(rec.digest);
  });

  it("Story 5.1: replay with an upgrade gives the same digest (and the level really rose)", () => {
    const LIST = ["smg", "upgrade:smg", "upgrade:smg", "wood_barricade"];
    const log = createInputLog(SEED, PLAYERS);
    let digest = 0;
    let levels: number[] = [];
    const run = runHeadless({
      balance,
      seed: SEED,
      players: PLAYERS,
      list: LIST,
      record: log,
      onEnd: (w) => {
        digest = worldDigest(w);
        levels = [...w.players.values()].map((p) => Math.max(p.loadout.slots[0].level, p.loadout.slots[1]?.level ?? 0));
      },
    });
    const ups = log.commands.filter((c) => c.kind === "upgrade");
    expect(ups.length).toBeGreaterThanOrEqual(2); // liveness: upgrades were bought and logged
    expect(run.upgrades.reduce((a, b) => a + b, 0)).toBe(ups.length);
    expect(Math.max(...levels)).toBeGreaterThan(1);
    const w = replayRun(balance, log);
    expect(worldDigest(w)).toBe(digest);
    expect(Math.max(...[...w.players.values()].map((p) => p.loadout.slots[1]?.level ?? 0))).toBeGreaterThan(1);
    // Without the upgrade commands the run diverges (the level is in the digest; damage differs).
    const w2 = replayRun(balance, { ...log, commands: log.commands.filter((c) => c.kind !== "upgrade") });
    expect(worldDigest(w2)).not.toBe(digest);
  });

  it("Story 5.11: replay with gear purchases gives the same digest (gear is in snapshotWorld); without them it diverges", () => {
    const LIST = ["body_armor_1", "running_shoes", "revive_kit"];
    const log = createInputLog(SEED, PLAYERS);
    let digest = 0;
    let masks: number[] = [];
    runHeadless({
      balance,
      seed: SEED,
      players: PLAYERS,
      list: LIST,
      record: log,
      onEnd: (w) => {
        digest = worldDigest(w);
        masks = [...w.players.values()].map((p) => p.gear);
      },
    });
    // Story 5.13: gear is bought as cards.
    const items = log.commands.filter((c) => c.kind === "buyCard" && balance.gear.items[c.item] !== undefined);
    expect(items.length).toBeGreaterThanOrEqual(2); // liveness: gear was bought and logged
    expect(masks.some((m) => m !== 0)).toBe(true);
    const w = replayRun(balance, log);
    expect(worldDigest(w)).toBe(digest);
    expect([...w.players.values()].map((p) => p.gear)).toEqual(masks);
    expect(snapshotWorld(w).players.some(([, p]) => (p as { gear: number }).gear !== 0)).toBe(true);
    const w2 = replayRun(balance, { ...log, commands: log.commands.filter((c) => c.kind !== "buyCard") });
    expect(worldDigest(w2)).not.toBe(digest);
  });

  it("Story 5.13 (F8): same seed + a log with card buys and rerolls → same digest; without the rerolls it diverges", () => {
    const LIST = ["smg", "wood_barricade", "running_shoes", "wood_barricade", "body_armor_1", "auto_turret", "shotgun", "revive_kit", "body_armor_2", "assault_rifle"];
    const log = createInputLog(SEED, PLAYERS);
    let digest = 0;
    const run = runHeadless({ balance, seed: SEED, players: PLAYERS, list: LIST, record: log, onEnd: (w) => void (digest = worldDigest(w)) });
    const cards = log.commands.filter((c) => c.kind === "buyCard");
    const rerolls = log.commands.filter((c) => c.kind === "reroll");
    expect(cards.length).toBeGreaterThanOrEqual(2); // liveness: cards were bought …
    expect(rerolls.length).toBeGreaterThanOrEqual(1); // … and paid rerolls happened
    expect(run.rerolls.reduce((a, b) => a + b, 0)).toBe(rerolls.length);
    expect(worldDigest(replayRun(balance, log))).toBe(digest);
    const w = replayRun(balance, { ...log, commands: log.commands.filter((c) => c.kind !== "reroll") });
    expect(worldDigest(w)).not.toBe(digest);
  });
});
