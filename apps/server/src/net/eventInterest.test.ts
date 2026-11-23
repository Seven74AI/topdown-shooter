import { describe, expect, it } from "vitest";
import { BUILD_GRID_M, NET_EVENT_KIND, addBuildingAt, createWorld, loadBalance, type NetEventContext, type SimEvent } from "@topdown/shared";
import { EventInterest } from "./eventInterest";

/** Story 3.6 review M2: turret shots and their non-killing hits go only to clients that can see them. */
const balance = loadBalance();
const ctx: NetEventContext = { balance, zombieNetId: (id) => id };

function setup() {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  // Turret at min corner (2, 2): centre (2.5, 2.5), far top-left. Views: (12, 8) sees it, (36, 24) doesn't.
  addBuildingAt(world, { id: 1, type: "auto_turret", ownerId: "p0", gx: 2 / BUILD_GRID_M, gy: 2 / BUILD_GRID_M, rot: 0, hp: 300 });
  return { world, interest: new EventInterest() };
}
const kinds = (ev: readonly (readonly number[])[]) => ev.map((t) => t[0]);

describe("EventInterest (Story 3.6 review M2)", () => {
  it("turret.fired and a non-killing turret hit reach only views that contain them; everything else reaches all, in order", () => {
    const { world, interest } = setup();
    const events: SimEvent[] = [
      { type: "wave.started", number: 1, size: 8 },
      { type: "turret.fired", buildingId: 1, x: 3, y: 2.5, dirX: 1, dirY: 0 },
      { type: "zombie.hit", zombieId: 4, x: 6, y: 2.5, dirX: 1, dirY: 0, damage: 3, weapon: "auto_turret", sourceId: null, buildingId: 1 },
      { type: "weapon.fired", playerId: "p1", weapon: "pistol", x: 40, y: 25, dirX: 1, dirY: 0 },
    ];
    interest.prepare(world, events, ctx);
    expect(interest.localCount).toBe(2);
    expect(kinds(interest.eventsFor(world, 12, 8))).toEqual([NET_EVENT_KIND.WAVE_STARTED, NET_EVENT_KIND.TURRET_FIRED, NET_EVENT_KIND.ZOMBIE_HIT, NET_EVENT_KIND.WEAPON_FIRED]);
    const far = interest.eventsFor(world, 36, 24);
    expect(kinds(far)).toEqual([NET_EVENT_KIND.WAVE_STARTED, NET_EVENT_KIND.WEAPON_FIRED]);
    expect(interest.eventsFor(world, 36, 25)).toBe(far); // one reused array, no allocation per client
  });

  it("a shot whose flight ends inside the view is sent even if the turret is outside it", () => {
    const { world, interest } = setup();
    // The far view (36, 24) covers x ≥ 20 (view clamped to the map, + 4 m margin). A turret centred at
    // x 15.5 is outside it; a shot east ends at x 25 (inside), a shot west at x 6 (outside).
    addBuildingAt(world, { id: 2, type: "auto_turret", ownerId: "p0", gx: 30, gy: 40, rot: 0, hp: 300 }); // centre (15.5, 20.5)
    interest.prepare(world, [{ type: "turret.fired", buildingId: 2, x: 16, y: 20.5, dirX: 1, dirY: 0 }], ctx); // ends at x 25
    expect(interest.eventsFor(world, 36, 24)).toHaveLength(1);
    interest.prepare(world, [{ type: "turret.fired", buildingId: 2, x: 15, y: 20.5, dirX: -1, dirY: 0 }], ctx); // ends at x 6
    expect(interest.eventsFor(world, 36, 24)).toHaveLength(0);
  });

  it("a killing turret hit stays global with its kill; a tick without local events is `all` itself", () => {
    const { world, interest } = setup();
    interest.prepare(
      world,
      [
        { type: "zombie.hit", zombieId: 4, x: 6, y: 2.5, dirX: 1, dirY: 0, damage: 3, weapon: "auto_turret", sourceId: null, buildingId: 1 },
        { type: "zombie.killed", zombieId: 4, killerId: "p0", x: 6, y: 2.5, weapon: "auto_turret", buildingId: 1 },
      ],
      ctx,
    );
    expect(interest.localCount).toBe(0);
    expect(interest.eventsFor(world, 36, 24)).toBe(interest.all);
    expect(kinds(interest.all)).toEqual([NET_EVENT_KIND.ZOMBIE_HIT, NET_EVENT_KIND.ZOMBIE_KILLED]);
  });

  it("Story 5.9: mine.exploded is local (its centre); building.upgraded is global", () => {
    const { world, interest } = setup();
    interest.prepare(
      world,
      [
        { type: "mine.exploded", buildingId: 9, x: 3, y: 3 },
        { type: "building.upgraded", buildingId: 5, playerId: "p0", cost: 50, toType: "reinforced_barricade", x: 40, y: 25 },
      ],
      ctx,
    );
    expect(interest.localCount).toBe(1);
    expect(kinds(interest.eventsFor(world, 12, 8))).toEqual([NET_EVENT_KIND.MINE_EXPLODED, NET_EVENT_KIND.BUILDING_UPGRADED]);
    expect(kinds(interest.eventsFor(world, 36, 24))).toEqual([NET_EVENT_KIND.BUILDING_UPGRADED]);
  });

  it("Story 5.6: spits and splashes are local (start or end in view); acid damage stays global", () => {
    const { world, interest } = setup();
    const events: SimEvent[] = [
      { type: "spitter.spat", zombieId: 3, spitId: 1, x: 3, y: 3, toX: 8, toY: 3 }, // top-left only
      { type: "spitter.spat", zombieId: 4, spitId: 2, x: 15, y: 20, toX: 21, toY: 20 }, // ends inside the far view
      { type: "acid.splashed", puddleId: 1, x: 8, y: 3, hitPlayerId: null },
      { type: "player.damaged", playerId: "p0", amount: 2, sourceZombieId: -3 },
    ];
    interest.prepare(world, events, ctx);
    expect(interest.localCount).toBe(3);
    expect(kinds(interest.eventsFor(world, 12, 8))).toEqual([NET_EVENT_KIND.SPITTER_SPAT, NET_EVENT_KIND.ACID_SPLASHED, NET_EVENT_KIND.PLAYER_DAMAGED]); // the second spit (y 20) is below this view
    expect(kinds(interest.eventsFor(world, 36, 24))).toEqual([NET_EVENT_KIND.SPITTER_SPAT, NET_EVENT_KIND.PLAYER_DAMAGED]);
  });
});

describe("Story 5.7: zombie.brute_spawned", () => {
  it("is global (a team cue: every client gets it, wherever it is) and ~10 B on the wire", async () => {
    const { pack } = await import("msgpackr");
    const { EventInterest } = await import("./eventInterest");
    const { createWorld, loadBalance, encodeNetEvent } = await import("@topdown/shared");
    const balance = loadBalance();
    const world = createWorld({ balance, seed: 1 });
    const e = { type: "zombie.brute_spawned" as const, zombieId: 3, x: 0.6, y: 31.4, first: true };
    const ei = new EventInterest();
    ei.prepare(world, [e], { balance, zombieNetId: (id: number) => id });
    expect(ei.localCount).toBe(0);
    expect(ei.eventsFor(world, 46, 2)).toHaveLength(1); // a client on the far side of the map
    const bytes = pack(encodeNetEvent(e, { balance, zombieNetId: (id: number) => id | (7 << 8) })).length;
    console.info(`[bandwidth 5.7] brute_spawned: ${bytes} B per Brute spawn`);
    expect(bytes).toBeLessThanOrEqual(12);
  });

  it("Story 5.8: the swell, the burst and a blast's non-killing hits are local; a killing blast hit stays global with its kill", () => {
    const { world, interest } = setup();
    interest.prepare(
      world,
      [
        { type: "bloater.swell_started", zombieId: 3, x: 6, y: 3 },
        { type: "bloater.burst", x: 6, y: 3, chain: false },
        { type: "zombie.hit", zombieId: 5, x: 7, y: 3, dirX: 1, dirY: 0, damage: 40, weapon: "bloater_blast", sourceId: "p0" },
        { type: "zombie.hit", zombieId: 6, x: 5, y: 3, dirX: -1, dirY: 0, damage: 40, weapon: "bloater_blast", sourceId: "p0" },
        { type: "zombie.killed", zombieId: 6, killerId: "p0", x: 5, y: 3, weapon: "bloater_blast" },
      ],
      ctx,
    );
    expect(interest.localCount).toBe(3);
    expect(kinds(interest.eventsFor(world, 12, 8))).toHaveLength(5);
    expect(kinds(interest.eventsFor(world, 36, 24))).toEqual([NET_EVENT_KIND.ZOMBIE_HIT, NET_EVENT_KIND.ZOMBIE_KILLED]);
  });
});
