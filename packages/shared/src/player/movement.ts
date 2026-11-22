import type { SystemFn } from "../core/systems";
import { updateDowned } from "./downed";
import { playerSpeed, tickSlow } from "./slow";

const MIN_VEC_LEN = 1e-6;

/**
 * Moves every alive player from their input (downed and out players stand still). Runs on the
 * server and in client prediction (Epic 2), so it uses only + − × ÷, sqrt, min and max: no
 * sin/cos/atan2, whose last bits can differ between JavaScript engines and would make prediction
 * drift. Prediction runs only this (`PREDICTION_SYSTEMS`): the downed rules are the server's.
 * Story 3.9: a slowed player moves at `playerSpeed`, and the slow counts down here (after the
 * move, for every status), so the predictor counts the same ticks as the server.
 */
export const movePlayers: SystemFn = (world, dtS) => {
  const baseSpeed = world.balance.player.speedMps;
  const { widthM, heightM } = world.map;
  for (const p of world.players.values()) {
    p.prevX = p.x;
    p.prevY = p.y;
    const speed = playerSpeed(baseSpeed, p);
    tickSlow(p);
    if (p.status !== "alive") continue;
    const input = world.inputs.get(p.id);
    if (!input) continue;

    let mx = input.moveX;
    let my = input.moveY;
    const moveLen = Math.sqrt(mx * mx + my * my);
    if (moveLen > 1) {
      mx /= moveLen; // the client normalizes; clamp defensively
      my /= moveLen;
    }
    const r = p.radiusM;
    p.x = Math.min(widthM - r, Math.max(r, p.x + mx * speed * dtS));
    p.y = Math.min(heightM - r, Math.max(r, p.y + my * speed * dtS));

    const aimLen = Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY);
    if (aimLen > MIN_VEC_LEN) {
      p.facingX = input.aimX / aimLen;
      p.facingY = input.aimY / aimLen;
    } else if (moveLen > MIN_VEC_LEN) {
      p.facingX = input.moveX / moveLen;
      p.facingY = input.moveY / moveLen;
    }
  }
};

/** The player system: movement, then the downed/revive rules (Story 2.8: last, so the order inside a tick stays fixed). */
export const updatePlayers: SystemFn = (world, dtS) => {
  movePlayers(world, dtS);
  updateDowned(world);
};
