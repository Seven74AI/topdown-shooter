import { describe, expect, it } from "vitest";
import type { World } from "../core/world";
import { setLoadout } from "../combat/loadout";
import { weaponIds } from "../combat/weapons";
import { legalDecayMasks } from "../decay/decayState";
import { boxOrFireBlocked } from "../player/freeSpot";
import { DOWNTOWN_MAP } from "../map/downtown";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { eventHoldsWave } from "./specialEvents";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";
import { crateOutcome, giveCrateWeapon, type CrateOutcome } from "../economy/shop";
import { applyDecayStage } from "../decay/applyDecayStage";

/** Story 6.9 (G5–G8, AC 4–5): the supply crate. */
const noZombies = { zombies: () => {} };
const cfg = balance.events.supplyDrop;
const ticks = (s: number): number => Math.round(s * 20);
const TAKE = ticks(cfg.takeS);

function dropWorld(seed = 11, players: [number, number][] = [[24, 16]]) {
  const t = eventWorld({ seed, players, systems: noZombies });
  startNext(t.world, "supply_drop");
  tickN(t.world, 1);
  expect(t.world.special.active.kind).toBe(EVENT_KINDS.indexOf("supply_drop"));
  return t;
}

const crateWeapon = (world: World): string => weaponIds(balance)[world.special.supplyDrop.weapon] as string;

/** Lands the crate (the flare runs out) with the players parked far from it. */
function landed(seed = 11, players: [number, number][] = [[24, 16]]) {
  const t = dropWorld(seed, players);
  tickN(t.world, ticks(cfg.flareS));
  expect(t.world.special.active.phase).toBe(EVENT_PHASE.LANDED);
  return t;
}

const on = (world: World, p: { x: number; y: number }, off = 0): void => {
  p.x = world.special.active.x + off;
  p.y = world.special.active.y;
};

describe("Story 6.9 D12 / AC 4: where it lands and what is inside", () => {
  it("over 300 seeds: an open crate spot ≥ 12 m from the team centre, box/fire-free; every weapon of the list seen; level II", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const { world, events } = dropWorld(seed);
      const a = world.special.active;
      expect(DOWNTOWN_MAP.eventSpots.some((s) => s.kind === "crate" && s.x === a.x && s.y === a.y)).toBe(true);
      expect(Math.hypot(a.x - 24, a.y - 16)).toBeGreaterThanOrEqual(cfg.minFromTeamM);
      expect(boxOrFireBlocked(world, a.x, a.y, cfg.spotClearM)).toBe(false);
      expect(cfg.weapons).toContain(crateWeapon(world));
      expect(world.special.supplyDrop.level).toBe(cfg.level);
      expect(ofType(events, "event.triggered")[0]).toMatchObject({ kind: "supply_drop", phase: EVENT_PHASE.FLARE, x: a.x, y: a.y });
      seen.add(crateWeapon(world));
    }
    expect([...seen].sort()).toEqual([...cfg.weapons].sort());
  });

  it("every stage × every legal decay mask: the spot chosen is free of boxes, buildings and fire (fuzz, brief 7)", () => {
    let starts = 0;
    for (let stage = 1; stage <= 5; stage++) {
      for (const mask of legalDecayMasks(DOWNTOWN_MAP).slice(0, 8)) {
        for (const seed of [3, 7, 19]) {
          const t = eventWorld({ seed, players: [[24, 16]], systems: noZombies });
          applyDecayStage(t.world, stage, mask);
          startNext(t.world, "supply_drop");
          tickN(t.world, 1);
          if (t.world.special.active.kind < 0) continue;
          starts++;
          const a = t.world.special.active;
          expect(boxOrFireBlocked(t.world, a.x, a.y, cfg.spotClearM)).toBe(false);
        }
      }
    }
    expect(starts).toBeGreaterThan(50);
  });
});

describe("Story 6.9 G6: only a standing player takes it, and only by standing on it", () => {
  it("nobody can take it during the flare, however long they stand on it", () => {
    const { world, players } = dropWorld();
    on(world, players[0]!);
    tickN(world, ticks(cfg.flareS) - 2);
    expect(world.special.active.phase).toBe(EVENT_PHASE.FLARE);
    expect(world.special.supplyDrop.claimTicks).toBe(0);
  });

  it("1 s (20 ticks) on it → taken: the weapon arrives, the event ends, no money moves", () => {
    const { world, players, events } = landed();
    const p = players[0]!;
    const money = p.wallet;
    on(world, p, 0.79);
    tickN(world, TAKE - 1);
    expect(world.special.active.kind).toBe(EVENT_KINDS.indexOf("supply_drop"));
    expect(world.special.supplyDrop.claimTicks).toBe(TAKE - 1);
    const w = crateWeapon(world);
    tickN(world, 1);
    expect(world.special.active.kind).toBe(-1);
    expect(p.loadout.slots[1]?.weapon).toBe(w);
    expect(p.loadout.slots[1]?.level).toBe(cfg.level);
    expect(p.loadout.active).toBe(0); // D9: you swap to it yourself
    expect(p.wallet).toBe(money);
    expect(ofType(events, "weapon.crate_taken")).toEqual([{ type: "weapon.crate_taken", playerId: "p0", weapon: w, slot: 1, level: cfg.level }]);
    expect(ofType(events, "event.phase_changed").some((e) => e.phase === EVENT_PHASE.TAKEN && e.playerId === "p0")).toBe(true);
    expect(world.special.log.cratesTaken).toBe(1);
  });

  it("0.81 m off never fills; stepping off at 19 ticks restarts the count", () => {
    const { world, players } = landed();
    const p = players[0]!;
    on(world, p, 0.81);
    tickN(world, TAKE * 2);
    expect(world.special.supplyDrop.claimTicks).toBe(0);
    on(world, p);
    tickN(world, TAKE - 1);
    on(world, p, 3);
    tickN(world, 1);
    expect(world.special.supplyDrop.claimTicks).toBe(0);
    on(world, p);
    tickN(world, TAKE - 1);
    expect(world.special.active.kind).toBe(EVENT_KINDS.indexOf("supply_drop"));
    tickN(world, 1);
    expect(world.special.active.kind).toBe(-1);
  });

  it("downed at 19 ticks: the claim resets and a downed player never claims", () => {
    const { world, players } = landed(11, [
      [24, 16],
      [3, 3], // a teammate far away keeps the run going
    ]);
    const p = players[0]!;
    on(world, p);
    tickN(world, TAKE - 1);
    p.status = "downed";
    tickN(world, TAKE * 2);
    expect(world.special.supplyDrop.claimSlot).toBe(-1);
    expect(world.special.active.kind).toBe(EVENT_KINDS.indexOf("supply_drop"));
  });

  it("review M1: one waits on the spot the whole flare, a lower slot steps on 2 ticks before it lands → the first arrival (slot 1) takes it", () => {
    const { world, players, events } = dropWorld(11, [
      [24, 16],
      [24, 18],
    ]);
    on(world, players[1]!);
    tickN(world, ticks(cfg.flareS) - 3);
    on(world, players[0]!, 0.2);
    tickN(world, 3 + TAKE + 1);
    expect(ofType(events, "weapon.crate_taken")[0]!.playerId).toBe("p1");
  });

  it("two players on it: the first keeps the claim and takes it; the second can't steal it by staying longer", () => {
    const { world, players, events } = landed(11, [
      [24, 16],
      [24, 18],
    ]);
    on(world, players[1]!);
    tickN(world, 5);
    on(world, players[0]!, 0.2);
    tickN(world, TAKE);
    expect(ofType(events, "weapon.crate_taken")[0]!.playerId).toBe("p1");
  });

  it("G8: untaken, it vanishes when the wave ends (lost) and can't be taken in the build phase; it never holds the wave", () => {
    const { world, players, events } = landed();
    expect(eventHoldsWave(world)).toBe(false);
    world.run.phase = "build";
    tickN(world, 1);
    expect(world.special.active.kind).toBe(-1);
    expect(ofType(events, "event.ended")[0]).toMatchObject({ kind: "supply_drop", outcome: "wave_end" });
    on(world, players[0]!);
    tickN(world, TAKE * 2);
    expect(ofType(events, "weapon.crate_taken")).toHaveLength(0);
  });
});

describe("Story 6.9 G7 / D8–D10: you know what you lose", () => {
  const out: CrateOutcome = { slot: -1, how: "refused" };

  it("empty second slot → there (the active slot stays); level I of it → II with a full magazine; ≥ II → refused", () => {
    const { world, players } = landed();
    const p = players[0]!;
    setLoadout(balance, p.loadout, ["smg", null]);
    expect(crateOutcome(p.loadout, "chainsaw", 2, out)).toMatchObject({ slot: 1, how: "empty" });
    setLoadout(balance, p.loadout, ["pistol", "chainsaw"]);
    p.loadout.slots[1]!.ammo = 0;
    expect(crateOutcome(p.loadout, "chainsaw", 2, out)).toMatchObject({ slot: 1, how: "upgrade" });
    expect(giveCrateWeapon(world, "p0", "assault_rifle", 2)).toBe(p.loadout.active); // both full: the active slot
    setLoadout(balance, p.loadout, ["pistol", "assault_rifle"]);
    p.loadout.slots[1]!.ammo = 1;
    expect(giveCrateWeapon(world, "p0", "assault_rifle", 2)).toBe(1);
    expect(p.loadout.slots[1]!.level).toBe(2);
    expect(p.loadout.slots[1]!.ammo).toBeGreaterThan(1);
    expect(crateOutcome(p.loadout, "assault_rifle", 2, out)).toMatchObject({ slot: -1, how: "refused" });
    p.loadout.slots[1]!.level = 3;
    expect(giveCrateWeapon(world, "p0", "assault_rifle", 2)).toBe(-1);
  });

  it("both slots full → the ACTIVE slot is replaced at level II (its upgrades lost; reload and swap cancelled)", () => {
    const { world, players } = landed();
    const p = players[0]!;
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    p.loadout.active = 1;
    p.loadout.slots[1]!.level = 3;
    p.loadout.slots[1]!.reloadTicks = 9;
    p.loadout.swapTicks = 4;
    expect(crateOutcome(p.loadout, "flamethrower", 2, out)).toMatchObject({ slot: 1, how: "replace" });
    expect(giveCrateWeapon(world, "p0", "flamethrower", 2)).toBe(1);
    expect(p.loadout.slots[1]).toMatchObject({ weapon: "flamethrower", level: 2, reloadTicks: 0 });
    expect(p.loadout.slots[0].weapon).toBe("pistol");
    expect(p.loadout.swapTicks).toBe(0);
  });

  it("a player who already has it at II can't fill the ring; a teammate then takes it", () => {
    const { world, players, events } = landed(11, [
      [24, 16],
      [24, 18],
    ]);
    const w = crateWeapon(world);
    setLoadout(balance, players[0]!.loadout, ["pistol", w]);
    players[0]!.loadout.slots[1]!.level = 2;
    on(world, players[0]!);
    tickN(world, TAKE * 2);
    expect(world.special.supplyDrop.claimTicks).toBe(0);
    on(world, players[1]!, 0.3);
    tickN(world, TAKE);
    expect(ofType(events, "weapon.crate_taken")[0]!.playerId).toBe("p1");
  });
});
