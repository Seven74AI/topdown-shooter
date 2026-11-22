import {
  ZOMBIE_STATE,
  stateOfTypeState,
  typeOfTypeState,
  zombieGenerationOfNetId,
  zombieSlotOfNetId,
  type ZombiePool,
} from "@topdown/shared";
import type { HordeSample } from "./hordeBuffer";

/**
 * Writes the sampled horde into the mirror World's zombie pool (Story 2.5), so `ZombieView` and
 * `GameScene`'s rush markers read it unchanged: per slot `x = prevX`, `y = prevY` (already
 * interpolated: any alpha draws the same point), type, state, generation and heading; `aliveIds`,
 * `alivePos` and `aliveCount` rebuilt; slots not shown get `alivePos = −1` and `state = FREE`.
 * Only typed arrays are written: nothing is allocated.
 */
export function mirrorZombies(sample: HordeSample, pool: ZombiePool): void {
  for (let i = 0; i < pool.aliveCount; i++) {
    const id = pool.aliveIds[i] as number;
    pool.alivePos[id] = -1;
    pool.state[id] = ZOMBIE_STATE.FREE;
  }
  pool.aliveCount = 0;
  for (let k = 0; k < sample.count; k++) {
    const netId = sample.netId[k] as number;
    const slot = zombieSlotOfNetId(netId);
    if (slot >= pool.capacity || (pool.alivePos[slot] as number) >= 0) continue; // a slot is drawn once
    const x = sample.x[k] as number;
    const y = sample.y[k] as number;
    const ts = sample.typeState[k] as number;
    pool.x[slot] = x;
    pool.prevX[slot] = x;
    pool.y[slot] = y;
    pool.prevY[slot] = y;
    pool.type[slot] = typeOfTypeState(ts);
    pool.state[slot] = stateOfTypeState(ts);
    pool.generation[slot] = zombieGenerationOfNetId(netId);
    pool.heading[slot] = sample.heading[k] as number;
    pool.alivePos[slot] = pool.aliveCount;
    pool.aliveIds[pool.aliveCount++] = slot;
  }
}
