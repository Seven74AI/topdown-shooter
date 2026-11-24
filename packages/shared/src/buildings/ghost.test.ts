import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld } from "../core/world";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { placementError } from "./buildings";
import { ghostError } from "./ghost";

/** Story 5.24 (BX-10): the server's relay check for teammates' ghosts (cosmetic, F7). */
const noop: SystemFn = () => {};
const balance = loadBalance();

function setup() {
  const world = createWorld({ balance, seed: 1, systems: { waves: noop } });
  addPlayer(world, "p0", 30, 16);
  addPlayer(world, "p1", 32, 16);
  startBuild(world);
  const p0 = world.players.get("p0") as PlayerState;
  /** A lattice index whose 1 × 1 footprint is centred about `m` metres away along x. */
  const at = (m: number): number => Math.round((p0.x + m) / BUILD_GRID_M);
  return { world, p0, at };
}

describe("ghostError (Story 5.24)", () => {
  it("relays a held barricade next to the sender in a build phase", () => {
    const { world, at, p0 } = setup();
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(2), gy: Math.round(p0.y / BUILD_GRID_M), rot: 0 })).toBeNull();
    expect(ghostError(world, "p0", { type: "", gx: 0, gy: 0, rot: 0 })).toBeNull(); // a clear
  });

  it("checks in order: unknown player, not standing (clears exempt), build phase, type, view", () => {
    const { world, p0, at } = setup();
    const gy = Math.round(p0.y / BUILD_GRID_M);
    expect(ghostError(world, "p9", { type: "wood_barricade", gx: at(2), gy, rot: 0 })).toBe("unknown_player");
    expect(ghostError(world, "p9", { type: "", gx: 0, gy: 0, rot: 0 })).toBe("unknown_player");
    p0.status = "downed";
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(2), gy, rot: 0 })).toBe("not_alive");
    expect(ghostError(world, "p0", { type: "", gx: 0, gy: 0, rot: 0 })).toBeNull(); // B9: a clear still goes
    p0.status = "alive";
    expect(ghostError(world, "p0", { type: "nope", gx: at(2), gy, rot: 0 })).toBe("unknown_type");
    // B4: the far side of the map (the view is 24 × 13.5 m wide at most, + 1 m)
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(14), gy, rot: 0 })).toBe("out_of_view");
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(-20), gy, rot: 0 })).toBe("out_of_view"); // the view is clamped at the map edge: it sees farther left
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(2), gy: gy + Math.round(9 / BUILD_GRID_M), rot: 0 })).toBe("out_of_view");
    // a pinned ghost near my view's edge still goes (12 m: the half width)
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(11), gy, rot: 0 })).toBeNull();
    // B3: never in a wave
    startWave(world);
    expect(ghostError(world, "p0", { type: "wood_barricade", gx: at(2), gy, rot: 0 })).toBe("not_build_phase");
    expect(ghostError(world, "p0", { type: "", gx: 0, gy: 0, rot: 0 })).toBe("not_build_phase");
  });

  it("B6 / F7: a ghost is relayed even where a placement is blocked (on a teammate): it is cosmetic", () => {
    const { world } = setup();
    const p1 = world.players.get("p1") as PlayerState;
    const g = { type: "wood_barricade", gx: Math.floor(p1.x / BUILD_GRID_M) - 1, gy: Math.floor(p1.y / BUILD_GRID_M) - 1, rot: 0 };
    expect(placementError(world, "p0", g)).not.toBeNull();
    expect(ghostError(world, "p0", g)).toBeNull();
  });
});
