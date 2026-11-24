/**
 * Story 6.5 (T7; F2, F4; brief 21c/d, 14): the bot player dances on the Behemoth's slam ring under
 * `?lag=150&jitter=20` (75 ± 10 ms each way) on the real server `RunController`, the client
 * `Predictor` predicting its own survivor. Every slam: the player is hit only when its NEWEST SERVER
 * position at the hit tick is inside 4.25 m (ring − edge grace) — never by where the client drew it
 * (no rewind for boss hits) — and the test sees both hits and misses near the edge, and slams where
 * the laggy client's drawn position and the server's disagreed (the server's always decided).
 *
 * Review L3: an older-position mutation (the resolver reading `prevX/prevY`) rarely shows here (the
 * bot seldom crosses the edge in the hit tick itself); `boss/slam.test.ts` › "F4: walks out on the hit
 * tick itself" is the test that pins the newest position.
 */
import { describe, expect, it } from "vitest";
import { BOSS_ATTACK, BOSS_STATE, NEUTRAL_INPUT, PLACEHOLDER_MAP, TICK_DT_S, createRng, loadBalance, recordBossThreat, type PlayerInput } from "@topdown/shared";
import { RunController } from "../../apps/server/src/run/RunController";
import { Predictor } from "../../apps/client/src/net/prediction";
import { fakeBoss } from "../../apps/client/src/net/fakeRoom";

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
    let damaged: boolean;
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
      const hitTick = (b.state as number) === BOSS_STATE.TELEGRAPH ? b.attack.hitTick : -1;
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
      b.cooldown.charge = 1e9; // Story 6.6: slams only here (charges and throws: the test below)
      b.cooldown.throw = 1e9;
    }
    console.log(`[boss netsim] ${hits} hits, ${misses} misses, ${disagreed} slams where the laggy client's view and the server's disagreed (the server decided)`);
    expect(hits + misses).toBeGreaterThanOrEqual(10);
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });
});

/**
 * Stories 6.6 (T7; F3, F7; brief 21c/d, 14): charges and throws at the laggy bot player. Charges: the
 * target (p1, server only) stands 9 m down the lane; the bot (p0, predicted, 75 ± 10 ms each way)
 * wobbles across the lane's 2.15 m hit band 6 m along it. Every charge: the bot is hit only with its
 * newest server position inside the band, and always when the boss passed it there; the sideways
 * shove is predicted through the knock fields (no snap). Throws: the bot walks back and forth; it is
 * hit exactly when its server position at the impact is inside 2.75 m of the fixed spot.
 */
describe("Story 6.6 netsim: charges and throws under ?lag=150&jitter=20", () => {
  it("10+ charges and 10+ throws on the bot player: decided by the server position, the shove predicted", () => {
    const rng = createRng(66);
    const ctrl = new RunController({
      balance,
      seed: 1,
      map: PLACEHOLDER_MAP,
      players: [
        { playerId: ID, slot: 0 },
        { playerId: "p1", slot: 1 },
      ],
      pauseWaves: true,
      systems: { waves: () => {} },
    });
    const w = ctrl.world;
    const p = w.players.get(ID);
    const t1 = w.players.get("p1");
    if (!p || !t1) throw new Error("no players");
    for (const q of [p, t1]) {
      q.hp = 1e9;
      q.maxHp = 1e9;
    }
    w.run.phase = "wave";
    const b = w.boss;
    const home = (): void => {
      b.state = BOSS_STATE.WALK;
      b.x = 12;
      b.y = 16;
      b.gapTicks = 0;
      b.cooldown.slam = 1e9;
    };
    home();
    b.hp = b.maxHp = 1e9;
    b.wave = w.waves.number;
    b.number = 1;
    t1.x = 21;
    t1.y = 16;
    const pred = new Predictor(balance, PLACEHOLDER_MAP, ID);
    p.x = 18;
    p.y = 18;
    pred.reconcile(0, p.x, p.y, "alive");
    const inFlight: { due: number; input: PlayerInput }[] = [];
    const states: { due: number; x: number; y: number; ack: number; kt: number; kx: number; ky: number; km: number; bx: number; by: number; st: number }[] = [];
    let seq = 0;
    const HALF = balance.boss.charge.laneWidthM / 2 - balance.boss.edgeGraceM;
    const TR = balance.boss.throw.radiusM - balance.boss.edgeGraceM;
    const c = { charges: 0, hits: 0, misses: 0, throws: 0, tHits: 0, tMisses: 0 };
    let damagedNow = false;
    let chargeHit = false;
    let mustHit = false;
    let prevAlong = 0;
    w.events.subscribe((e) => {
      if (e.type === "player.damaged" && e.tag === "boss" && e.playerId === ID) damagedNow = true;
    });
    let phase: "charge" | "throw" = "charge";
    for (let t = 0; t < 20 * 240 && (c.charges < 12 || c.throws < 12); t++) {
      const now = t * TICK_MS;
      if (phase === "charge" && c.charges >= 12) {
        phase = "throw";
        t1.status = "out"; // the bot alone: it is the throw's farthest player
        b.cooldown.charge = 1e9;
      }
      // The bot's wish: charges — wobble across the band 6 m along the lane; throws — walk back and forth 10–16 m away.
      let mx = 0;
      let my = 0;
      if (phase === "charge") {
        const want = 16 + HALF + Math.sin(t * 0.21) * 0.8 + (rng.next() - 0.5) * 0.3;
        my = Math.max(-1, Math.min(1, (want - pred.y) * 2));
        mx = Math.max(-1, Math.min(1, (18 - pred.x) * 2));
      } else {
        mx = Math.sin(t * 0.07) > 0 ? 1 : -1;
        if (pred.x > 30) mx = -1;
        if (pred.x < 22) mx = 1;
      }
      const input: PlayerInput = { ...NEUTRAL_INPUT, seq: ++seq, moveX: mx, moveY: my };
      pred.applyLocal(input);
      pred.frame(TICK_DT_S); // the client decays its visual offset every frame
      inFlight.push({ due: now + 75 + rng.range(-10, 10), input });
      while (inFlight.length > 0 && (inFlight[0] as { due: number }).due <= now) ctrl.queueInput(ID, (inFlight.shift() as { input: PlayerInput }).input);
      recordBossThreat(w, phase === "charge" ? "p1" : ID, 1000);
      const wasState = b.state as number;
      const a = b.attack;
      const impactNow = a.kind === BOSS_ATTACK.THROW && a.live && w.tick === a.hitTick;
      damagedNow = false;
      ctrl.tick();
      // Charges: check each rush tick by the newest server position.
      if ((b.state as number) === BOSS_STATE.RUSH || (wasState === BOSS_STATE.RUSH && a.kind === BOSS_ATTACK.CHARGE)) {
        const along = (b.x - a.cx) * a.dirX + (b.y - a.cy) * a.dirY;
        const pa = (p.x - a.cx) * a.dirX + (p.y - a.cy) * a.dirY;
        const perp = Math.abs(-(p.x - a.cx) * a.dirY + (p.y - a.cy) * a.dirX);
        if (damagedNow) {
          expect(perp, `charge ${c.charges}: hit outside the band`).toBeLessThanOrEqual(HALF + 1e-6);
          chargeHit = true;
        }
        if (pa >= prevAlong - 1e-9 && pa <= along + 1e-9 && perp <= HALF - 1e-6) mustHit = true;
        prevAlong = along;
      } else if (wasState === BOSS_STATE.TELEGRAPH && a.kind === BOSS_ATTACK.CHARGE) prevAlong = 0;
      if (wasState === BOSS_STATE.RUSH && (b.state as number) !== BOSS_STATE.RUSH) {
        c.charges++;
        if (mustHit) expect(chargeHit, `charge ${c.charges}: passed the bot inside the band but missed`).toBe(true);
        if (chargeHit) c.hits++;
        else c.misses++;
        chargeHit = false;
        mustHit = false;
      }
      if (impactNow) {
        const d = Math.hypot(p.x - a.cx, p.y - a.cy);
        expect(damagedNow, `throw ${c.throws}: server d ${d.toFixed(3)}`).toBe(d <= TR + 1e-9);
        c.throws++;
        if (damagedNow) c.tHits++;
        else c.tMisses++;
      }
      states.push({ due: now + 75 + rng.range(-10, 10), x: p.x, y: p.y, ack: w.lastAppliedSeq.get(ID) ?? 0, kt: p.knockTicks, kx: p.knockDx, ky: p.knockDy, km: p.knockStepMm, bx: b.x, by: b.y, st: b.state });
      while (states.length > 0 && (states[0] as { due: number }).due <= now) {
        const s = states.shift() as (typeof states)[number];
        pred.syncBoss(fakeBoss({ state: s.st, x: s.bx, y: s.by })); // as NetSimHost does before every reconcile
        pred.reconcile(s.ack, s.x, s.y, "alive", 0, 0, s.kt, s.kx, s.ky, s.km);
      }
      // Back home after each attack (the next one starts at once).
      if ((b.state as number) === BOSS_STATE.WALK || (b.state as number) === BOSS_STATE.RECOVER || (b.state as number) === BOSS_STATE.STUN) {
        if (!b.attack.live) {
          home();
          if (phase === "charge") b.cooldown.charge = 0;
          else b.cooldown.throw = 0;
        }
      }
    }
    console.log(`[boss netsim 6.6] charges ${c.charges} (${c.hits} hit / ${c.misses} missed), throws ${c.throws} (${c.tHits} hit / ${c.tMisses} missed); prediction snaps ${pred.stats.snaps}, knock slides ${pred.stats.knockSlides}`);
    expect(c.charges).toBeGreaterThanOrEqual(10);
    expect(c.throws).toBeGreaterThanOrEqual(10);
    expect(c.hits).toBeGreaterThan(0);
    expect(c.misses).toBeGreaterThan(0);
    expect(c.tHits).toBeGreaterThan(0);
    expect(c.tMisses).toBeGreaterThan(0);
    expect(pred.stats.snaps).toBe(0); // the shove slides on the client too (no correction ≥ the snap distance)
  });
});
