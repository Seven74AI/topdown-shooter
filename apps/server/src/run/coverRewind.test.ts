import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, PLACEHOLDER_MAP, loadBalance, setLoadout, spawnZombie, type CoverKind, type DistrictMap, type PlayerInput } from "@topdown/shared";
import { RunController } from "./RunController";

/**
 * Story 4.2 (brief line 6): a rewound shot (Story 2.12) obeys cover like a live one. The zombie
 * stood 3 m east of the shooter at the tick the client drew, then moved 2 m south; the shot is
 * tested at its view tick. With nothing between, the rewound shot hits (the control: proves the
 * rewind is really used, since the live zombie is off the line). With a car between, it never hits;
 * sandbags let it through.
 */
const balance = loadBalance();
const SEED = 42;

const input = (seq: number, o: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, seq, ...o });

function mapWith(kind: CoverKind | null): DistrictMap {
  if (!kind) return PLACEHOLDER_MAP;
  return { ...PLACEHOLDER_MAP, name: "cover-rewind", cover: [{ name: "c", kind, minStage: 1, minX: 11.5, minY: 15, maxX: 12, maxY: 17 }] };
}

function rewoundShot(kind: CoverKind | null): number {
  const c = new RunController({ balance, seed: SEED, players: [{ playerId: "p0", slot: 0 }], systems: { waves: () => {}, zombies: () => {} }, map: mapWith(kind) });
  const p = c.world.players.get("p0");
  if (!p) throw new Error("no p0");
  p.x = p.prevX = 10;
  p.y = p.prevY = 16;
  setLoadout(balance, p.loadout, ["hunting_rifle", null]);
  c.setRtt("p0", 150);
  const z = c.world.zombies;
  const zid = spawnZombie(c.world, "walker", 13, 16);
  let seq = 0;
  for (let t = 0; t < 4; t++) {
    c.queueInput("p0", input(++seq));
    c.tick();
  }
  z.y[zid] = (z.y[zid] as number) + 2; // it moved away after the tick the client drew (2)
  let hits = 0;
  c.queueInput("p0", input(seq + 1, { aimX: 1, aimY: 0, fire: true, isMouse: true, viewTick: 200 }));
  for (let t = 0; t < 4; t++) for (const e of c.tick()) if (e.type === "zombie.hit" && e.zombieId === zid) hits++;
  return hits;
}

describe("rewound shots vs cover (Story 4.2)", () => {
  it("nothing between: the rewound shot hits where the zombie was (control)", () => {
    expect(rewoundShot(null)).toBe(1);
  });

  it("a car or the bus between: the rewound shot stops at it; barrier and sandbags let it through", () => {
    expect(rewoundShot("car")).toBe(0);
    expect(rewoundShot("bus")).toBe(0);
    expect(rewoundShot("barrier")).toBe(1);
    expect(rewoundShot("sandbags")).toBe(1);
  });
});
