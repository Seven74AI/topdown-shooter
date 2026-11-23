import type { SystemFn } from "../core/systems";
import { updateDowned } from "./downed";
import { playerSpeed, tickSlow, wielderSlowPct } from "./slow";
import { hasObstacles, pushOutOfBuildings, pushed } from "../buildings/collision";

const MIN_VEC_LEN = 1e-6;

/**
 * Moves every alive player from their input (downed and out players stand still). Runs on the
 * server and in client prediction (Epic 2), so it uses only + − × ÷, sqrt, min and max: no
 * sin/cos/atan2, whose last bits can differ between JavaScript engines and would make prediction
 * drift. Prediction runs only this (`PREDICTION_SYSTEMS`): the downed rules are the server's.
 * Story 3.9: a slowed player moves at `playerSpeed`, and the slow counts down here (after the
 * move, for every status), so the predictor counts the same ticks as the server.
 * Story 3.4: a moved survivor is pushed out of buildings (same rules in the predictor, whose World
 * mirrors the buildings from schema). Story 4.1: and out of the map's collision boxes (the
 * predictor's World is created with the same `DOWNTOWN_MAP`).
 */
export const movePlayers: SystemFn = (world, dtS) => {
  const baseSpeed = world.balance.player.speedMps;
  const { widthM, heightM } = world.map;
  for (const p of world.players.values()) {
    p.prevX = p.x;
    p.prevY = p.y;
    const input = world.inputs.get(p.id);
    // Story 5.2: the Chainsaw slows its wielder while attacking (multiplies with a bite slow).
    const speed = playerSpeed(baseSpeed, p, wielderSlowPct(world.balance, p, input));
    // A starved server tick (no input arrived: `weaponsPaused`, Story 2.7) doesn't count the slow
    // down either: like the weapon, it counts applied seqs, as the client's prediction does (3.9
    // review). Skipped inputs count it in RunController. Solo and prediction never pause.
    if (!p.weaponsPaused) tickSlow(p);
    if (p.status !== "alive") continue;
    if (!input) continue;

    let mx = input.moveX;
    let my = input.moveY;
    const moveLen = Math.sqrt(mx * mx + my * my);
    if (moveLen > 1) {
      mx /= moveLen; // the client normalizes; clamp defensively
      my /= moveLen;
    }
    const r = p.radiusM;
    const nx = p.x + mx * speed * dtS;
    const ny = p.y + my * speed * dtS;
    if (hasObstacles(world)) {
      // Story 3.4 (+ 4.1's map solids): obstacles and the map edge together (slide along faces; a slot narrower than the
      // body is impassable: the survivor stays where it was, review H1).
      pushOutOfBuildings(world, nx, ny, r, p.x, p.y);
      p.x = pushed.x;
      p.y = pushed.y;
    } else {
      p.x = Math.min(widthM - r, Math.max(r, nx));
      p.y = Math.min(heightM - r, Math.max(r, ny));
    }

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
