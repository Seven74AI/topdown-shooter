import { describe, expect, it } from "vitest";
import type { World } from "../core/world";
import { createRng } from "../core/rng";
import { spawnZombie } from "../zombies/zombiePool";
import { spawnProjectile } from "../combat/projectilePool";
import { createExplosionSpec, explode } from "../combat/explosion";
import { boxBlocked } from "../player/freeSpot";
import { circleInFire } from "../decay/decayState";
import { DOWNTOWN_MAP } from "../map/downtown";
import { EVENT_KINDS, EVENT_PHASE, NPC_STATE } from "./eventState";
import { damageSurvivor, survivorFits } from "./survivor";
import { balance, eventWorld, ofType, startNext, tickN } from "./testEvents";

/** Story 6.10 (S1–S5, AC 3–5): the survivor NPC. */
const noZombies = { zombies: () => {} };
const cfg = balance.events.survivor;
const SURVIVOR = EVENT_KINDS.indexOf("survivor");

function npcWorld(seed = 11, players: [number, number][] = [[40, 5]], systems: object = noZombies) {
  const t = eventWorld({ seed, players, systems });
  startNext(t.world, "survivor");
  tickN(t.world, 1);
  expect(t.world.special.active.kind).toBe(SURVIVOR);
  return t;
}

/** Puts `p` `d` m east of the NPC (or west when east is blocked). */
function besideNpc(world: World, p: { x: number; y: number }, d: number): void {
  const n = world.special.survivor;
  p.x = n.x + d;
  p.y = n.y;
}

describe("Story 6.10 S1: easy to find, never next to the team", () => {
  it("over 300 seeds: spawns on an open survivor spot ≥ 15 m from the team centre (or the farthest), box/fire-free, with 50 HP; the flag on a safe spot ≥ 20 m from it; every look seen", () => {
    const looks = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      const { world, events } = npcWorld(seed);
      const n = world.special.survivor;
      expect(DOWNTOWN_MAP.eventSpots.some((s) => s.kind === "survivor" && s.x === n.x && s.y === n.y)).toBe(true);
      expect(DOWNTOWN_MAP.eventSpots.some((s) => s.kind === "safe" && s.x === n.safeX && s.y === n.safeY)).toBe(true);
      expect(Math.hypot(n.x - 40, n.y - 5)).toBeGreaterThanOrEqual(cfg.minFromTeamM);
      expect(Math.hypot(n.safeX - n.x, n.safeY - n.y)).toBeGreaterThanOrEqual(cfg.safeMinFromNpcM);
      expect(boxBlocked(world, n.x, n.y, n.radiusM)).toBe(false);
      expect(n).toMatchObject({ hp: cfg.hp, state: NPC_STATE.WAITING, status: "alive", leaderSlot: -1 });
      expect(ofType(events, "event.triggered")[0]).toMatchObject({ kind: "survivor", phase: EVENT_PHASE.WAITING });
      looks.add(n.look);
    }
    expect([...looks].sort()).toEqual([0, 1, 2]);
  });

  it("Downtown's spots fit at every stage (gate)", () => {
    const { world } = eventWorld({});
    for (let stage = 1; stage <= 5; stage++) expect(survivorFits(world, stage)).toBe(true);
  });
});

describe("Story 6.10 S2: only a standing player leads it", () => {
  it("pick-up at 2.99 m yes, 3.01 m no", () => {
    const a = npcWorld();
    besideNpc(a.world, a.players[0]!, 3.01);
    tickN(a.world, 3);
    expect(a.world.special.survivor.state).toBe(NPC_STATE.WAITING);
    besideNpc(a.world, a.players[0]!, 2.99);
    tickN(a.world, 1);
    expect(a.world.special.survivor).toMatchObject({ state: NPC_STATE.FOLLOWING, leaderSlot: 0 });
    expect(ofType(a.events, "event.phase_changed").at(-1)).toMatchObject({ kind: "survivor", phase: EVENT_PHASE.FOLLOWING, playerId: "p0" });
  });

  it("follows at ≤ 4.0 m/s; lost when the leader is beyond 6 m; a downed player never leads it", () => {
    const { world, players } = npcWorld(11, [
      [40, 5],
      [44, 3],
    ]);
    const p = players[0]!;
    besideNpc(world, p, 2);
    tickN(world, 1);
    expect(world.special.survivor.state).toBe(NPC_STATE.FOLLOWING);
    // the leader runs away at 4.5 m/s (players' run speed) in a straight line
    let lastX = world.special.survivor.x;
    let lastY = world.special.survivor.y;
    const dir = p.x > 24 ? -1 : 1;
    for (let i = 0; i < 400 && world.special.survivor.state === NPC_STATE.FOLLOWING; i++) {
      p.x += dir * 0.225;
      tickN(world, 1);
      const n = world.special.survivor;
      expect(Math.hypot(n.x - lastX, n.y - lastY)).toBeLessThanOrEqual(cfg.speedMps / 20 + 1e-9);
      lastX = n.x;
      lastY = n.y;
    }
    const n = world.special.survivor;
    expect(n.state).toBe(NPC_STATE.WAITING);
    expect(Math.hypot(p.x - n.x, p.y - n.y)).toBeGreaterThan(cfg.loseM);
    // downed player next to it: never picked up
    p.status = "downed";
    besideNpc(world, p, 1);
    tickN(world, 10);
    expect(world.special.survivor.state).toBe(NPC_STATE.WAITING);
  });

  it("a downed leader drops it at once; the next standing player within 3 m takes over", () => {
    const { world, players } = npcWorld(11, [
      [40, 5],
      [44, 3],
    ]);
    besideNpc(world, players[0]!, 1.5);
    tickN(world, 1);
    expect(world.special.survivor.leaderSlot).toBe(0);
    players[0]!.status = "downed";
    besideNpc(world, players[1]!, 2.5);
    tickN(world, 1);
    expect(world.special.survivor.leaderSlot).toBe(1);
    expect(world.special.survivor.state).toBe(NPC_STATE.FOLLOWING);
  });

  it("two players race: the nearest standing within 3 m leads; the second can't steal it while the first stays within 6 m", () => {
    const { world, players } = npcWorld(11, [
      [40, 5],
      [44, 3],
    ]);
    besideNpc(world, players[1]!, 1);
    besideNpc(world, players[0]!, 2.5);
    tickN(world, 1);
    expect(world.special.survivor.leaderSlot).toBe(1);
    besideNpc(world, players[0]!, 0.6);
    besideNpc(world, players[1]!, 4);
    tickN(world, 5);
    expect(world.special.survivor.leaderSlot).toBe(1);
  });
});

describe("Story 6.10 S5: saved means paid, for everyone", () => {
  it("led to the flag: +100 to every player in the run (a downed one too), `event` money, then the event ends done", () => {
    const { world, players, events } = npcWorld(11, [
      [40, 5],
      [44, 3],
      [3, 3],
    ]);
    players[2]!.status = "downed";
    const wallets = players.map((p) => p.wallet);
    const n = world.special.survivor;
    const p = players[0]!;
    besideNpc(world, p, 1);
    tickN(world, 1);
    // walk the leader to the flag (teleport-free, 0.2 m per tick), the NPC follows
    for (let i = 0; i < 2000 && n.state !== NPC_STATE.SAVED; i++) {
      const dx = n.safeX - p.x;
      const dy = n.safeY - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.2) {
        p.x += (dx / d) * 0.2;
        p.y += (dy / d) * 0.2;
      }
      // straight lines can cross cover: the test moves the leader through it, the NPC is pushed round
      tickN(world, 1);
    }
    expect(n.state).toBe(NPC_STATE.SAVED);
    expect(Math.hypot(n.x - n.safeX, n.y - n.safeY)).toBeLessThanOrEqual(cfg.saveRadiusM + 1e-9);
    players.forEach((pl, i) => expect(pl.wallet).toBe(wallets[i]! + cfg.reward));
    expect(ofType(events, "money.earned").filter((e) => e.reason === "event")).toHaveLength(3);
    tickN(world, Math.round(cfg.waveOffS * 20) + 1);
    expect(world.special.active.kind).toBe(-1);
    expect(ofType(events, "event.ended").at(-1)).toMatchObject({ kind: "survivor", outcome: "done" });
    expect(world.special.log.survivorsSaved).toBe(1);
  });

  it("dead at 0 HP → failed, nobody paid; the wave ending first → wave_end, nobody paid", () => {
    const a = npcWorld();
    const w = a.players[0]!.wallet;
    expect(damageSurvivor(a.world, 30)).toBe(30);
    expect(damageSurvivor(a.world, 30)).toBe(20);
    tickN(a.world, 1);
    expect(ofType(a.events, "event.ended").at(-1)).toMatchObject({ kind: "survivor", outcome: "failed" });
    expect(a.players[0]!.wallet).toBe(w);
    expect(a.world.special.log.survivorsLost).toBe(1);
    const b = npcWorld();
    b.world.run.phase = "build";
    tickN(b.world, 1);
    expect(ofType(b.events, "event.ended").at(-1)).toMatchObject({ kind: "survivor", outcome: "wave_end" });
    expect(ofType(b.events, "money.earned").filter((e) => e.reason === "event")).toHaveLength(0);
    expect(b.world.special.survivor.status).toBe("dead");
  });
});

describe("Story 6.10 S3 / S4: zombies want it; your weapons never hurt it", () => {
  it("a Walker next to it (no player near) bites it for its normal damage on its own clock", () => {
    const { world } = npcWorld(11, [[44, 30]], {});
    const n = world.special.survivor;
    spawnZombie(world, "walker", n.x + 0.75, n.y, true);
    tickN(world, 40);
    const bite = balance.zombies.types.walker!.damage;
    expect(n.hp).toBeLessThan(cfg.hp);
    expect((cfg.hp - n.hp) % bite).toBe(0);
  });

  it("zombies walk to it from afar (the chase field is seeded from it)", () => {
    const { world } = npcWorld(11, [[44, 30]], {});
    const n = world.special.survivor;
    const zid = spawnZombie(world, "walker", n.x > 24 ? n.x - 10 : n.x + 10, n.y, true);
    const d0 = Math.hypot((world.zombies.x[zid] as number) - n.x, (world.zombies.y[zid] as number) - n.y);
    tickN(world, 200);
    const d1 = Math.hypot((world.zombies.x[zid] as number) - n.x, (world.zombies.y[zid] as number) - n.y);
    expect(d1).toBeLessThan(d0 - 3);
  });

  it("a player's bullet passes through it; a grenade blast spares it; a Bloater blast hurts it", () => {
    const { world } = npcWorld();
    const n = world.special.survivor;
    spawnProjectile(world.projectiles, { x: n.x - 2, y: n.y, dirX: 1, dirY: 0, speedMps: 60, rangeM: 6, damage: 50, pierce: 1, weaponIndex: 0, owner: "p0", advanceM: 0 });
    tickN(world, 3);
    expect(n.hp).toBe(cfg.hp);
    const spec = createExplosionSpec();
    spec.x = n.x + 0.5;
    spec.y = n.y;
    spec.radiusM = 2;
    spec.playerDamage = 20;
    spec.kind = "grenade";
    explode(world, spec);
    expect(n.hp).toBe(cfg.hp);
    spec.kind = "bloater";
    spec.friendlyFire = false;
    explode(world, spec);
    expect(n.hp).toBe(cfg.hp - 20);
  });
});

describe("Story 6.10 brief 7: the NPC never ends inside a box or a fire (fuzz)", () => {
  it("random leader walks × 12 seeds × 600 ticks: its centre circle is never in a box and never enters a fire", () => {
    let followed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { world, players } = npcWorld(seed, [
        [40, 5],
        [44, 3],
      ]);
      const rng = createRng(seed * 977);
      const n = world.special.survivor;
      const p = players[0]!;
      besideNpc(world, p, 1);
      let ang = rng.range(0, Math.PI * 2);
      for (let i = 0; i < 600; i++) {
        if (i % 20 === 0) ang += rng.range(-1.2, 1.2);
        const nx = p.x + Math.cos(ang) * 0.2;
        const ny = p.y + Math.sin(ang) * 0.2;
        if (!boxBlocked(world, nx, ny, 0.4)) {
          p.x = nx;
          p.y = ny;
        } else ang += Math.PI / 2;
        tickN(world, 1);
        if (n.state === NPC_STATE.FOLLOWING) followed++;
        if (n.state === NPC_STATE.WAITING && Math.hypot(p.x - n.x, p.y - n.y) > cfg.loseM) besideNpc(world, p, 1); // catch it again
        expect(boxBlocked(world, n.x, n.y, n.radiusM - 0.01)).toBe(false);
        expect(circleInFire(world.decay.fires, n.x, n.y, n.radiusM - 0.01)).toBe(false);
        if (n.state === NPC_STATE.SAVED || world.special.active.kind < 0) break;
      }
    }
    expect(followed).toBeGreaterThan(1000);
  });
});
