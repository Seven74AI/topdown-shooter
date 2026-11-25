import { describe, expect, it } from "vitest";
import { runHeadless } from "../bots/headlessRun";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { TICK_RATE_HZ } from "../config/constants";
import { canonicalJson, fnv1a32 } from "../core/hash";
import type { SimEvent } from "../core/simEvents";
import type { World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { LOOT_BAG, forceLootPlan } from "./lootBag";

/**
 * Story 7.12 (AC 13, brief 9 liveness, B7): the real run with every system and bots. A forced plan
 * (the `devLoot` switch: wave 3, kill share 0.3) really drops the bag at that wave's planned kill,
 * where that zombie died (or the nearest clear spot), and a bot walking to it really takes it.
 * B7 "cosmetic only": the same seed and inputs with the bag taken at once vs never taken → the same
 * fight (zombies, players, waves, buildings: the snapshot without `loot`).
 */
const balance = loadBalance();
const MAX_TICKS = 8 * 60 * TICK_RATE_HZ; // past wave 3 (each wave ≈ 1–1.5 min + a 30 s build)

describe("Story 7.12: the bag in a real run", () => {
  it("liveness: a forced plan drops the bag at the planned kill of wave 3 and a bot takes it", () => {
    for (const seed of [3, 8]) {
      const kills: { x: number; y: number }[] = [];
      let size = 0;
      let inWave = false;
      let dropped: Extract<SimEvent, { type: "loot.dropped" }> | null = null;
      let found: Extract<SimEvent, { type: "loot.found" }> | null = null;
      let killsAtDrop = -1;
      let world: World | null = null;
      runHeadless({
        balance,
        seed,
        players: 2,
        god: true,
        seekLoot: true,
        maxTicks: MAX_TICKS,
        setup: (w) => {
          world = w;
          forceLootPlan(w, 3, 0.3);
          w.events.subscribe((e) => {
            if (e.type === "wave.started") {
              inWave = e.number === 3;
              if (inWave) size = e.size;
            } else if (e.type === "wave.ended") inWave = false;
            else if (e.type === "zombie.killed" && inWave) kills.push({ x: e.x, y: e.y });
            else if (e.type === "loot.dropped") {
              dropped = e;
              killsAtDrop = kills.length;
            } else if (e.type === "loot.found") found = e;
          });
        },
      });
      const w = world as unknown as World;
      const killIndex = 1 + Math.floor(0.3 * size);
      expect(dropped, `seed ${seed}`).not.toBeNull();
      expect(killsAtDrop).toBe(killIndex);
      const d = dropped as unknown as Extract<SimEvent, { type: "loot.dropped" }>;
      const k = kills[killIndex - 1] as { x: number; y: number };
      expect(Math.hypot(d.x - k.x, d.y - k.y)).toBeLessThanOrEqual(balance.loot.spotStepM * balance.loot.spotRings);
      expect(found, `seed ${seed}: a bot took it`).toEqual({ type: "loot.found", playerId: "p0", wave: 3 });
      expect(w.loot.state).toBe(LOOT_BAG.FOUND);
      expect(w.loot.foundBy).toBe("p0");
    }
  }, 240_000);

  it("B7: the bag changes nothing in the fight (taken at once vs never taken → the same World but `loot`)", () => {
    const fight = (pickRadiusM: number) => {
      const b = loadBalance(withOverrides(bundledBalanceFiles(), [["loot", "pickRadiusM", pickRadiusM]]));
      let digest = 0;
      let state = -1;
      runHeadless({
        balance: b,
        seed: 5,
        players: 2,
        god: true,
        maxTicks: MAX_TICKS,
        setup: (w) => forceLootPlan(w, 3, 0.2),
        onEnd: (w) => {
          state = w.loot.state;
          const snap: Partial<ReturnType<typeof snapshotWorld>> = snapshotWorld(w);
          delete snap.loot; // the bag itself differs (taken vs expired)
          delete snap.balanceVersion; // the two balances differ only in pickRadiusM
          digest = fnv1a32(canonicalJson(snap));
        },
      });
      return { digest, state };
    };
    const taken = fight(5);
    const never = fight(0.001);
    expect(taken.state).toBe(LOOT_BAG.FOUND); // liveness: one run really took it…
    expect(never.state).toBe(LOOT_BAG.GONE); // …and the other really let it expire
    expect(taken.digest).toBe(never.digest);
  }, 240_000);
});
