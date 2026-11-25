import { describe, expect, it } from "vitest";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { step } from "../core/world";
import { TICK_DT_S } from "../config/constants";
import { loadBalance } from "../config/balance";
import { DOWNTOWN_MAP } from "../map/downtown";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { holdPlayer } from "../player/hold";
import { setInput } from "../core/world";
import { NEUTRAL_INPUT } from "../net/input";
import { SAVE_MAX_BYTES, SaveBlockedError, captureRunSave, saveBlocker, type RunSave } from "./runSave";
import { SaveRestoreError, restoreRunSave, resumeSavedRun } from "./restore";
import { playToBuild } from "./saveFixtures";

const balance = loadBalance();
const meta = { runId: "11111111-1111-4111-8111-111111111111", district: "downtown", bannedSeats: [{ seatKey: "guest:abc", guestTokenHash: "abc" }] };
/** The written exclusion list (runSave.ts WORLD_SAVE_PLAN "excluded" keys that `snapshotWorld` carries). */
const EXCLUDED = ["pendingInputs", "inputs", "lastAppliedSeq", "pathing", "zombieHistory"] as const;
const comparable = (w: Parameters<typeof snapshotWorld>[0]) => {
  const s = snapshotWorld(w) as Record<string, unknown>;
  for (const k of EXCLUDED) delete s[k];
  return s;
};
const json = (s: RunSave): RunSave => JSON.parse(JSON.stringify(s)) as RunSave;

describe("Story 8.4 S1: a save is the build phase, exactly", () => {
  it("round trip: capture in a build phase → JSON → restore into a new World: snapshotWorld equal except the exclusion list", () => {
    const { world, seats } = playToBuild({ players: 3, waves: 4, buildings: 25 });
    expect(world.run.phase).toBe("build");
    expect(world.waves.number).toBe(4); // something really happened (brief: sims assert activity)
    expect(world.buildings.list.length).toBeGreaterThan(10);
    const save = json(captureRunSave(world, seats, meta));
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
    expect(r.digestChecked).toBe(true);
    expect(r.present.map((x) => x.player.id)).toEqual(["p0", "p1", "p2"]);
    expect(comparable(r.world)).toEqual(comparable(world));
    // and recapturing the restored World gives the same save (one format, one restore path)
    expect(json(captureRunSave(r.world, seats, meta))).toEqual(save);
  });

  it("keeps wallets, earned, weapons, gear, consumables, the card offer, every building field and the bans", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 2, buildings: 8 });
    const p0 = world.players.get("p0")!;
    p0.wallet = 777;
    p0.earned = 432;
    p0.consumable = Object.keys(balance.consumables.items)[0] as string;
    p0.consumableCount = 2;
    p0.gear = 1;
    const save = json(captureRunSave(world, seats, meta));
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
    const q = r.world.players.get("p0")!;
    expect([q.wallet, q.earned, q.consumable, q.consumableCount, q.gear]).toEqual([777, 432, p0.consumable, 2, 1]);
    expect(r.world.buildings.list).toEqual(world.buildings.list);
    expect(Array.from(r.world.shop.cards)).toEqual(Array.from(world.shop.cards));
    expect(Array.from(r.world.shop.rev)).toEqual(Array.from(world.shop.rev));
    expect(save.bannedSeats).toEqual(meta.bannedSeats);
    expect(save.seats.map((s) => s.kills)).toEqual([0, 3]);
  });

  it("brief 5: a restored run replays deterministically — two restores of one save, same inputs → the same full digest", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 3, buildings: 10 });
    const save = json(captureRunSave(world, seats, meta));
    const run = () => {
      const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
      resumeSavedRun(r.world);
      r.world.debug.godMode = true;
      let waves = 0;
      for (let t = 0; t < 2500; t++) {
        for (const id of r.world.players.keys()) setInput(r.world, id, { ...NEUTRAL_INPUT, seq: t + 1, fire: t % 3 === 0, aimX: 1, aimY: 0, moveX: Math.sin(t / 30), moveY: 0 });
        const before = r.world.waves.number;
        step(r.world, TICK_DT_S);
        if (r.world.waves.number > before) waves++;
      }
      return { digest: worldDigest(r.world), waves, wave: r.world.waves.number };
    };
    const a = run();
    const b = run();
    expect(a.waves).toBeGreaterThan(0); // the waves really continued
    expect(a.wave).toBeGreaterThan(save.wave);
    expect(b).toEqual(a);
  });

  it("a held seat is saved and comes back as an away seat (its own state)", () => {
    const { world, seats } = playToBuild({ players: 3, waves: 2, buildings: 5 });
    holdPlayer(world, "p1");
    const save = json(captureRunSave(world, seats, meta));
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP, present: (s) => s.playerId !== "p1" });
    expect([...r.world.players.keys()]).toEqual(["p0", "p2"]);
    expect(r.away.map((x) => x.player.id)).toEqual(["p1"]);
    expect(r.away[0]!.player).toEqual(world.heldPlayers.get("p1")!.player);
    expect(r.world.flameSlots.includes("p1")).toBe(false);
  });

  it("a remembered seat (not in the World) is saved from the room's copy", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 2 });
    const gone = { ...world.players.get("p1")!, wallet: 55 };
    world.players.delete("p1");
    (world.flameSlots as (string | null)[])[world.flameSlots.indexOf("p1")] = null;
    const save = captureRunSave(world, [seats[0]!, { ...seats[1]!, player: gone, buildIdx: 1 }], meta);
    expect(save.seats[1]!.buildIdx).toBe(1);
    const r = restoreRunSave(json(save), { balance, map: DOWNTOWN_MAP, present: (s) => s.playerId === "p0" });
    expect(r.away[0]!.player.wallet).toBe(55);
  });

  it("the vote is a calm phase too (E8-S12) and resumes into the vote with a fresh vote timer", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 1 });
    world.run.phase = "vote";
    world.run.buildTicksLeft = 0;
    world.run.voteTicksLeft = 3;
    const save = json(captureRunSave(world, seats, meta));
    expect(save.phase).toBe("vote");
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
    resumeSavedRun(r.world);
    expect(r.world.run.phase).toBe("vote");
    expect(r.world.run.voteTicksLeft).toBe(Math.round(balance.waves.evac.voteS / TICK_DT_S));
  });

  it("resume opens a fresh build timer, clears Ready, and every building counts as placed earlier (no take-back)", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 3 });
    world.run.buildTicksLeft = 1;
    for (const p of world.players.values()) p.buildReady = true;
    for (const b of world.buildings.list) b.paidThisBuild = b.paid;
    const r = restoreRunSave(json(captureRunSave(world, seats, meta)), { balance, map: DOWNTOWN_MAP });
    expect(r.world.run.buildTicksLeft).toBe(1); // exact first …
    resumeSavedRun(r.world);
    expect(r.world.run.buildTicksLeft).toBe(Math.round(balance.waves.buildPhaseS / TICK_DT_S)); // … then tonight's timer (E8-R4)
    expect([...r.world.players.values()].every((p) => !p.buildReady)).toBe(true);
    expect(r.world.buildings.list.every((b) => b.paidThisBuild === 0)).toBe(true);
  });
});

describe("Story 8.4: what can't be saved, and saves that can't be restored", () => {
  it("only a calm phase with empty pools is saved (mid-wave → SaveBlockedError)", () => {
    const { world, seats } = playToBuild({ players: 1, waves: 1, buildings: 0 });
    for (const p of world.players.values()) p.buildReady = true;
    for (let t = 0; t < 2000 && world.run.phase === "build"; t++) step(world, TICK_DT_S);
    expect(world.run.phase).toBe("wave");
    expect(saveBlocker(world)).toBe("phase_wave");
    expect(() => captureRunSave(world, seats, meta)).toThrow(SaveBlockedError);
  });

  it("every World seat must be listed (a missing seat is a bug, never a silent loss)", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 0 });
    expect(() => captureRunSave(world, [seats[0]!], meta)).toThrow(/has no seat/);
  });

  it("a tampered save fails the digest check; another map is refused", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 2 });
    const save = json(captureRunSave(world, seats, meta));
    const bad = json(save);
    (bad.seats[0]!.player as { wallet: number }).wallet = 999_999;
    expect(() => restoreRunSave(bad, { balance, map: DOWNTOWN_MAP })).toThrow(SaveRestoreError);
    expect(() => restoreRunSave(save, { balance, map: PLACEHOLDER_MAP })).toThrow(/map/);
  });

  it("E8-S9: an id the new balance no longer knows is dropped and its paid refunded (never blocks the resume)", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 4 });
    const save = json(captureRunSave(world, seats, meta));
    const b0 = save.world.buildings as { list: { type: string; ownerId: string; paid: number }[] };
    const victim = b0.list[0]!;
    victim.type = "gone_wall";
    const owner = save.seats.find((s) => s.playerId === victim.ownerId)!;
    const walletBefore = (owner.player as { wallet: number }).wallet;
    (save.seats[0]!.player as { loadout: { slots: { weapon: string }[] } }).loadout.slots[0]!.weapon = "laser";
    const dropped: string[] = [];
    const r = restoreRunSave({ ...save, balanceVersion: "older" }, { balance, map: DOWNTOWN_MAP, onDropped: (d) => dropped.push(`${d.kind}:${d.id}:${d.refund}`) });
    expect(r.digestChecked).toBe(false);
    expect(r.world.buildings.list.length).toBe(b0.list.length - 1);
    expect(r.world.players.get(victim.ownerId)!.wallet).toBe(walletBefore + victim.paid);
    expect(r.world.players.get("p0")!.loadout.slots[0]!.weapon).toBe("pistol");
    expect(dropped).toEqual(expect.arrayContaining([`building:gone_wall:${victim.paid}`, "weapon:laser:0"]));
  });
});

describe("Story 8.4 AC 3: size (D10 about 50 KB)", () => {
  it(`a 4-player wave-10 build with 60 buildings is ≤ ${SAVE_MAX_BYTES} bytes`, () => {
    // The real cap is buildings.json › maxPerPlayer (6 → 24); 15 per player gives the story's 60 as a worst case.
    const big = { ...balance, buildings: { ...balance.buildings, maxPerPlayer: 15 } };
    const { world, seats } = playToBuild({ players: 4, waves: 10, buildings: 60, balance: big });
    expect(world.waves.number).toBe(10);
    expect(world.buildings.list.length).toBeGreaterThanOrEqual(55);
    expect(world.run.phase).toBe("vote"); // wave 10 opens the evacuation vote: a calm phase (E8-S12)
    const bytes = JSON.stringify(captureRunSave(world, seats, meta)).length;
    expect(bytes).toBeLessThanOrEqual(SAVE_MAX_BYTES);
  });
});


describe("review L: the S1 round trip with car fires, a boss record, endless counters, a blackout and a bag on the ground", () => {
  it("every one of them comes back exactly (snapshotWorld equal except the exclusion list)", async () => {
    const { applyDecayStage } = await import("../decay/applyDecayStage");
    const { world, seats } = playToBuild({ players: 2, waves: 3, buildings: 6 });
    // car fires: the stage with ignites, two lit with their clocks
    applyDecayStage(world, 3, world.decay.variants, 0);
    for (let i = 0; i < world.decay.fireEndWave.length; i++) world.decay.fireEndWave[i] = 5 + i;
    world.decay.burnTicks = 37;
    // a boss record (between its waves: alive state is the wave's, the record stays)
    Object.assign(world.boss, { number: 1, look: 2, wave: 3, hp: 1234, maxHp: 5000, enraged: true, crawlerTicks: 9, targetId: "p1", lastSwitchTick: 77 });
    world.boss.threat[3] = 2.5;
    // endless counters
    Object.assign(world.run, { endless: true, endlessEvent: "stampede", lastEndlessEvent: "car_alarm" });
    world.waves.hpMult = 1.25;
    // a blackout
    Object.assign(world.lights, { blackoutPct: 40, halfDark: true, powerFailure: true });
    // a bag lying out (dropped, not found)
    Object.assign(world.loot, { state: 1, x: 12.5, y: 8.25, dropTick: world.tick - 10, untilTick: world.tick + 300, variant: 2, killIndex: 14, killed: 14, counting: false });
    world.loot.banked.add("p1");
    expect(world.decay.fires.length).toBeGreaterThan(0); // the fires really burn
    const save = json(captureRunSave(world, seats, meta));
    const r = restoreRunSave(save, { balance, map: DOWNTOWN_MAP });
    expect(r.digestChecked).toBe(true);
    expect(comparable(r.world)).toEqual(comparable(world));
    expect(r.world.decay.fires.map((f) => f.name)).toEqual(world.decay.fires.map((f) => f.name));
    expect([...r.world.loot.banked]).toEqual(["p1"]);
  });

  it("an away seat's Ready / vote flags are cleared by resumeSavedRun too", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 1, buildings: 0 });
    world.players.get("p1")!.buildReady = true;
    world.players.get("p1")!.vote = 2;
    const r = restoreRunSave(json(captureRunSave(world, seats, meta)), { balance, map: DOWNTOWN_MAP, present: (s) => s.playerId === "p0" });
    resumeSavedRun(r.world, r.away.map((x) => x.player));
    expect([r.away[0]!.player.buildReady, r.away[0]!.player.vote]).toEqual([false, 0]);
  });

  it("decision 8.6-B8: another code version restores without the digest check; another map version is refused", () => {
    const { world, seats } = playToBuild({ players: 1, waves: 1, buildings: 2 });
    const save = json(captureRunSave(world, seats, { ...meta, codeVersion: "build-a" }));
    expect(restoreRunSave(save, { balance, map: DOWNTOWN_MAP, codeVersion: "build-a" }).digestChecked).toBe(true);
    expect(restoreRunSave(save, { balance, map: DOWNTOWN_MAP, codeVersion: "build-b" }).digestChecked).toBe(false);
    expect(() => restoreRunSave({ ...save, mapVersion: "older" }, { balance, map: DOWNTOWN_MAP })).toThrow(/map_version/);
  });
});
