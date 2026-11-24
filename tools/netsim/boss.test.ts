/**
 * Story 6.5 (T7; F2, F4; brief 21c/d, 14): the bot player dances on the Behemoth's slam ring under
 * `?lag=150&jitter=20` (75 ± 10 ms each way) on the real server `RunController`, the client
 * `Predictor` predicting its own survivor. Every slam: the player is hit only when its NEWEST SERVER
 * position at the hit tick is inside 4.25 m (ring − edge grace) — never by where the client drew it
 * (no rewind for boss hits) — and the test sees both hits and misses near the edge, and slams where
 * the laggy client's drawn position and the server's disagreed (the server's always decided).
 */
import { describe, expect, it } from "vitest";
import { BOSS_STATE, NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, createRng, loadBalance, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";

const balance = loadBalance();
const ID = "p0";
const TICK_MS = TICK_DT_S * 1000;
const S = balance.boss.slam;
const EDGE = S.radiusM - balance.boss.edgeGraceM;

describe("Story 6.5 netsim: slams under ?lag=150&jitter=20", () => {
  it("10+ slams on the bot player: hit exactly when the server position at the hit tick is inside 4.25 m", () => {
    const rng = createRng(65);
    const ctrl = new RunController({ balance, seed: 1, map: PLACEHOLDER_MAP, players: [{ playerId: ID, slot: 0 }], pauseWaves: true, systems: { waves: () => {} } });
    const w = ctrl.world;
    const p = w.players.get(ID);
    if (!p) throw new Error("no player");
    p.hp = 1e9;
    p.maxHp = 1e9;
    w.run.phase = "wave";
    const b = w.boss;
    b.state = BOSS_STATE.WALK;
    b.x = 24;
    b.y = 16;
    b.hp = b.maxHp = 1e9;
    b.wave = w.waves.number;
    b.gapTicks = 0;
    const pred = new Predictor(balance, PLACEHOLDER_MAP, ID);
    p.x = 24 + 3.5;
    p.y = 16;
    pred.reconcile(0, p.x, p.y, "alive");
    const inFlight: { due: number; input: PlayerInput }[] = [];
    const states: { due: number; x: number; y: number; ack: number; bx: number; by: number; st: number }[] = [];
    let seq = 0;
    let hits = 0;
    let misses = 0;
    let disagreed = 0;
    let damaged = false;
    w.events.subscribe((e) => {
      if (e.type === "player.damaged" && e.tag === "boss") damaged = true;
    });
    for (let t = 0; t < 20 * 120; t++) {
      const now = t * TICK_MS;
      // The bot steps in and out across the ring edge (a slow wobble around 4.25 m from the centre).
      const want = EDGE + Math.sin(t * 0.09) * 0.9 + (rng.next() - 0.5) * 0.2;
      const d = Math.hypot(pred.x - b.x, pred.y - b.y);
      const mv = Math.max(-1, Math.min(1, (want - d) * 2));
      const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, moveX: mv, moveY: 0 };
      pred.applyLocal(input);
      inFlight.push({ due: now + 75 + rng.range(-10, 10), input });
      while (inFlight.length > 0 && (inFlight[0] as { due: number }).due <= now) ctrl.queueInput(ID, (inFlight.shift() as { input: PlayerInput }).input);
      const hitTick = b.state === BOSS_STATE.TELEGRAPH ? b.attack.hitTick : -1;
      damaged = false;
      const atHit = w.tick === hitTick;
      const clientD = Math.hypot(pred.x - b.attack.cx, pred.y - b.attack.cy);
      ctrl.tick();
      if (atHit) {
        // The server resolved this tick from the position its movement just produced (player system runs first).
        const serverD = Math.hypot(p.x - b.attack.cx, p.y - b.attack.cy);
        expect(damaged, `slam at ${hitTick}: server d ${serverD.toFixed(3)}`).toBe(serverD <= EDGE + 1e-9);
        if (damaged) hits++;
        else misses++;
        if (clientD <= EDGE !== serverD <= EDGE) disagreed++;
        p.knockTicks = 0; // keep dancing at the ring (the push is tested elsewhere)
      }
      states.push({ due: now + 75 + rng.range(-10, 10), x: p.x, y: p.y, ack: w.lastAppliedSeq.get(ID) ?? 0, bx: b.x, by: b.y, st: b.state });
      while (states.length > 0 && (states[0] as { due: number }).due <= now) {
        const s = states.shift() as (typeof states)[number];
        pred.reconcile(s.ack, s.x, s.y, "alive");
      }
      b.x = 24; // the boss stands (only the ring matters here)
      b.y = 16;
    }
    console.log(`[boss netsim] ${hits} hits, ${misses} misses, ${disagreed} slams where the laggy client's view and the server's disagreed (the server decided)`);
    expect(hits + misses).toBeGreaterThanOrEqual(10);
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });
});
