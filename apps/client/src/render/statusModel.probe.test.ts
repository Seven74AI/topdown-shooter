import { describe, expect, it } from "vitest";
import {
  BOSS_STATE,
  BUILD_GRID_M,
  NEUTRAL_INPUT,
  openEvacVote,
  TICK_DT_S,
  addBuildingAt,
  addPlayer,
  createWorld,
  downPlayer,
  holdPlayer,
  killZombie,
  loadBalance,
  packTypeState,
  quantizePos,
  returnPlayer,
  setInput,
  setLoadout,
  spawnZombie,
  startExtract,
  startBuild,
  startWave,
  step,
  weaponStats,
  wireState,
  zombieNetId,
  type BossStateView,
  type BuildingStateView,
  type FlameStats,
  type PlayerInput,
  type ReadonlyMapView,
  type SimEvent,
  type SystemFn,
  type World,
  type ZombieTypeId,
} from "@topdown/shared";
import { HordeSample } from "../net/hordeBuffer";
import { mirrorZombies } from "../net/mirrorZombies";
import { mirrorBuildings } from "../net/mirrorBuildings";
import { mirrorBoss } from "../net/mirrorBoss";
import { AcidFx } from "./acidFx";
import { MolotovFires } from "./molotovFx";
import { ClientStatusSources, STATUS, STATUS_COUNT, StatusModel, NO_RING, ringFraction, worldStatusSources, type BodyStatus } from "./statusModel";

/**
 * Story 9.22 (AC 3, T2): THE PROBE. A server World runs scripted fights; every tick, a client mirror World is written
 * from exactly what the wire carries for that tick (the synced player fields as `syncState` writes them and the
 * NetSimHost copies them; the horde record: centimetre positions, type, state and the burning bit through the real
 * `mirrorZombies`; the buildings' synced `trap` state through the real `mirrorBuildings`; the boss record through the
 * real `mirrorBoss`; the server's events into the client's own `MolotovFires` / `AcidFx`; the flame cones from the
 * flamers' facing). The ONLINE model on the mirror is compared with the LOCAL model on the server World (the server's
 * truth, checked against the sim in `statusModel.test.ts`): per body and status, the longest on/off disagreement and
 * the largest ring difference (ticks).
 *
 * Limits (said plainly): this is the wire's content, not a Colyseus room (latency and patch batching are the
 * NetSimHost's own tests); zombies are compared at the same tick (the client draws them at the render tick, and the
 * model reads the same sample, so the comparison is like for like).
 */
const balance = loadBalance();
const noop: SystemFn = () => {};
const FT = weaponStats(balance, "flamethrower") as FlameStats;
/** `STATUS_PROBE_LOG=1` prints the probe's table (and each new worst ring case). */
const PROBE_LOG = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.STATUS_PROBE_LOG === "1";

interface Tally {
  /** Ticks the server truth had it on. */
  seen: number;
  /** Longest run of ticks the two disagreed on on/off (per body). */
  maxRun: number;
  /** Largest |left| difference while both on (ticks; rings only). */
  maxRing: number;
}
const NAMES = Object.keys(STATUS);

class Probe {
  readonly server: World;
  readonly mirror: World;
  readonly local: StatusModel;
  readonly online: StatusModel;
  readonly mol = new MolotovFires(balance);
  readonly acid: AcidFx;
  readonly src: ClientStatusSources;
  private readonly sample = new HordeSample();
  private readonly events: SimEvent[] = [];
  /** Keyed "players:STATUS" / "boss:STATUS" / "zombies:STATUS". */
  readonly tally = new Map<string, Tally>();
  private readonly zRun: Int32Array;
  private seqs = new Map<string, number>();

  constructor(systems: Record<string, SystemFn>) {
    this.server = createWorld({ balance, seed: 7, systems });
    this.mirror = createWorld({ balance, seed: 7, systems: {} });
    this.local = new StatusModel(balance, this.server.zombies.capacity);
    this.online = new StatusModel(balance, this.mirror.zombies.capacity);
    const spit = balance.zombies.types.spitter?.spit;
    this.acid = new AcidFx(balance.zombies.spitCaps.maxLiveSpits, balance.zombies.spitCaps.maxLivePuddles, spit?.speedMps ?? 1, spit?.puddleS ?? 0);
    this.src = new ClientStatusSources(balance, this.mol.areas, this.acid);
    this.server.events.subscribe((e) => this.events.push(e));
    this.zRun = new Int32Array(this.server.zombies.capacity * STATUS_COUNT);
    startBuild(this.server);
    startWave(this.server);
  }

  input(id: string, extra: Partial<PlayerInput>): void {
    const seq = (this.seqs.get(id) ?? 0) + 1;
    this.seqs.set(id, seq);
    setInput(this.server, id, { ...NEUTRAL_INPUT, seq, ...extra });
  }

  private nextBuildingId = 1;
  place(x: number, y: number, type: string): void {
    addBuildingAt(this.server, { id: this.nextBuildingId++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 });
  }

  /** One server tick, the wire, both models, the comparison. */
  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      step(this.server, TICK_DT_S);
      this.wire();
      this.local.update(this.server, worldStatusSources);
      this.online.update(this.mirror, this.src);
      this.compare();
    }
  }

  private wire(): void {
    const s = this.server;
    const m = this.mirror;
    const nowS = s.tick * TICK_DT_S;
    for (const e of this.events) {
      this.mol.handle(e, nowS);
      this.acid.handle(e, nowS);
    }
    this.events.length = 0;
    this.mol.update(nowS);
    this.acid.update(nowS);
    m.tick = s.tick;
    m.run.phase = s.run.phase;
    // Players: the synced fields (syncState → NetSimHost).
    for (const p of s.players.values()) {
      const q = m.players.get(p.id) ?? addPlayer(m, p.id, p.x, p.y);
      q.x = p.x;
      q.y = p.y;
      q.radiusM = p.radiusM;
      q.status = p.status;
      q.hp = Math.ceil(p.hp);
      q.maxHp = p.maxHp;
      q.downedTicksLeft = p.downedTicksLeft;
      q.reviveNeedTicks = p.reviveNeedTicks;
      const progress = p.reviveTicks > 0 && p.reviveNeedTicks > 0 ? Math.min(255, Math.round((p.reviveTicks / p.reviveNeedTicks) * 255)) : 0;
      q.reviveTicks = Math.round((progress / 255) * (p.reviveNeedTicks > 0 ? p.reviveNeedTicks : 60));
      q.slowTicksLeft = p.slowTicksLeft;
      q.slowPct = p.slowPct;
      q.protectTicks = p.protectTicks;
    }
    for (const id of [...m.players.keys()]) if (!s.players.has(id)) m.players.delete(id);
    // Aboard the helicopter (`boarded`: not drawn).
    m.extract.boarded.clear();
    for (const id of s.extract.boarded) m.extract.boarded.add(id);
    // Zombies: the horde record (centimetres, type, state, burning bit) through the real mirror.
    const z = s.zombies;
    const out = this.sample;
    out.count = 0;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      out.netId[out.count] = zombieNetId(id, z.generation[id] as number);
      out.x[out.count] = quantizePos(z.x[id] as number) / 100;
      out.y[out.count] = quantizePos(z.y[id] as number) / 100;
      out.heading[out.count] = 0;
      out.typeState[out.count] = packTypeState(z.type[id] as number, wireState(z.state[id] as number, (z.igniteTicks[id] as number) > 0));
      out.count++;
    }
    mirrorZombies(out, m.zombies);
    // Buildings: the synced record (type, corner, rotation, ceil HP, trap state).
    const list = s.buildings.list;
    const views = new Map<string, BuildingStateView>();
    for (const b of list) views.set(String(b.id), { type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: Math.ceil(b.hp), trap: b.trapState });
    mirrorBuildings(views as ReadonlyMapView<BuildingStateView>, m);
    // The boss record.
    const b = s.boss;
    const a = b.attack;
    const bv: BossStateView = {
      state: b.state,
      x: b.x,
      y: b.y,
      heading: 0,
      hp: Math.ceil(b.hp),
      maxHp: b.maxHp,
      number: b.number,
      look: b.look,
      target: 255,
      enraged: b.enraged,
      atkId: a.id,
      atkKind: a.kind,
      atkStart: a.startTick,
      atkHit: a.hitTick,
      atkX: a.cx,
      atkY: a.cy,
      atkR: a.radiusM,
      atkEndX: a.cx + a.dirX * a.lenM,
      atkEndY: a.cy + a.dirY * a.lenM,
      atkCrash: a.crash,
      atkSrc: a.src,
      atkSrcX: a.srcX,
      atkSrcY: a.srcY,
    };
    mirrorBoss(m, bv);
    // Flame cones (the client draws a flamer's cone from its burst events and facing).
    let c = 0;
    for (const p of s.players.values()) {
      if (!p.flaming || c >= 4) continue;
      const off = p.radiusM + 0.1;
      this.src.setCone(c++, p.flameSlot, p.x + p.facingX * off, p.y + p.facingY * off, p.facingX, p.facingY, FT.rangeM, FT.coneDeg, FT.pulseS, FT.igniteS);
    }
    this.src.coneCount = c;
  }

  private t(key: string): Tally {
    let t = this.tally.get(key);
    if (!t) {
      t = { seen: 0, maxRun: 0, maxRing: 0 };
      this.tally.set(key, t);
    }
    return t;
  }

  /** Per body and status: the current run of disagreeing ticks. */
  private readonly runs = new Map<string, number>();

  private body(kind: string, i: number, a: BodyStatus, b: BodyStatus): void {
    for (let s = 0; s < STATUS_COUNT; s++) {
      const t = this.t(`${kind}:${NAMES[s]}`);
      const on = (a.mask & (1 << s)) !== 0;
      const on2 = (b.mask & (1 << s)) !== 0;
      if (on) t.seen++;
      const rk = `${kind}${i}:${s}`;
      const run = on !== on2 ? (this.runs.get(rk) ?? 0) + 1 : 0;
      this.runs.set(rk, run);
      t.maxRun = Math.max(t.maxRun, run);
      if (on && on2 && a.left[s] !== NO_RING) t.maxRing = Math.max(t.maxRing, Math.abs((a.left[s] as number) - (b.left[s] as number)));
    }
  }

  private compare(): void {
    for (let i = 0; i < this.local.playerCount; i++) this.body("players", i, this.local.players[i] as BodyStatus, this.online.players[i] as BodyStatus);
    this.body("boss", 0, this.local.boss, this.online.boss);
    const z = this.server.zombies;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      for (let s = 0; s < STATUS_COUNT; s++) {
        const t = this.t(`zombies:${NAMES[s]}`);
        const on = ((this.local.zMask[id] as number) & (1 << s)) !== 0;
        const on2 = (this.mirror.zombies.alivePos[id] as number) >= 0 && ((this.online.zMask[id] as number) & (1 << s)) !== 0;
        const r = id * STATUS_COUNT + s;
        if (on) t.seen++;
        if (on !== on2) {
          this.zRun[r] = (this.zRun[r] as number) + 1;
          t.maxRun = Math.max(t.maxRun, this.zRun[r] as number);
        } else this.zRun[r] = 0;
        if (on && on2 && this.local.zLeft[r] !== NO_RING) {
          const d = Math.abs((this.local.zLeft[r] as number) - (this.online.zLeft[r] as number));
          if (d > t.maxRing && PROBE_LOG) console.log(`worst ${NAMES[s]} tick ${this.server.tick} z${id} local ${this.local.zLeft[r]} online ${this.online.zLeft[r]}`);
          t.maxRing = Math.max(t.maxRing, d);
        }
      }
    }
  }

  get(key: string): Tally {
    return this.tally.get(key) ?? { seen: 0, maxRun: 0, maxRing: 0 };
  }

  report(label: string): string {
    const rows: string[] = [];
    for (const [k, t] of this.tally) if (t.seen > 0 || t.maxRun > 0) rows.push(`  ${k.padEnd(20)} seen ${String(t.seen).padStart(5)}  on/off ≤ ${t.maxRun}  ring ≤ ${t.maxRing}`);
    return `${label}\n${rows.join("\n")}`;
  }
}

/** On/off within 2 ticks, rings within 1 (AC 3). */
function expectAgree(p: Probe, key: string, ring = true): void {
  const t = p.get(key);
  expect(t.seen, `${key}: the server truth showed it`).toBeGreaterThan(0);
  expect(t.maxRun, `${key}: on/off disagreement (ticks)`).toBeLessThanOrEqual(2);
  if (ring) expect(t.maxRing, `${key}: ring disagreement (ticks)`).toBeLessThanOrEqual(1);
}

const log = (s: string) => {
  if (PROBE_LOG) console.log(s);
};

describe("status probe: online model vs server truth (Story 9.22 AC 3)", () => {
  it("bear traps (Walkers, a Brute) and a spike trap on the horde's path", () => {
    const p = new Probe({ waves: noop });
    const p0 = addPlayer(p.server, "p0", 10.5, 46);
    p0.hp = 1e9;
    for (let x = 6; x <= 14; x += 2) p.place(x, 22, "bear_trap");
    for (let x = 6; x <= 14; x += 2) p.place(x, 30, "bear_trap");
    for (let i = 0; i < 12; i++) {
      const z = spawnZombie(p.server, i % 4 === 0 ? "brute" : "walker", 6.5 + (i % 5) * 2, 10 + Math.floor(i / 5) * 1.5);
      p.server.zombies.hp[z] = 1e6;
    }
    p.tick(400);
    log(p.report("traps"));
    expectAgree(p, "zombies:TRAPPED");
  });

  it("spike traps across the horde's path (Walkers, Runners, a Bloater)", () => {
    const p = new Probe({ waves: noop });
    addPlayer(p.server, "p0", 40, 46).hp = 1e9;
    p.place(36, 30, "spike_trap");
    p.place(38, 30, "spike_trap");
    p.place(40, 30, "spike_trap");
    p.place(42, 30, "spike_trap");
    const types: ZombieTypeId[] = ["walker", "runner", "walker", "bloater", "runner", "walker", "crawler"];
    for (let i = 0; i < types.length; i++) p.server.zombies.hp[spawnZombie(p.server, types[i] as ZombieTypeId, 37 + i, 16 + (i % 3))] = 1e6;
    p.tick(300);
    log(p.report("spikes"));
    expectAgree(p, "zombies:SLOWED", false);
  });

  it("a flamer: ignites, re-hits in the cone, the burn running out", () => {
    const p = new Probe({ waves: noop, zombies: noop });
    const p0 = addPlayer(p.server, "p0", 20, 20);
    p0.hp = 1e9;
    setLoadout(balance, p0.loadout, ["flamethrower", "pistol"]);
    for (let i = 0; i < 6; i++) p.server.zombies.hp[spawnZombie(p.server, "walker", 22 + i * 0.8, 20 + (i % 2) * 0.6)] = 1e6;
    p.server.zombies.hp[spawnZombie(p.server, "runner", 20, 24)] = 1e6; // never in the cone
    for (let k = 0; k < 3; k++) {
      p.input("p0", { fire: true, aimX: 1, aimY: 0 });
      p.tick(k === 1 ? 7 : 23); // bursts of different lengths (re-hits on and off the pulse)
      p.input("p0", { fire: false });
      p.tick(k === 2 ? 80 : 30);
    }
    log(p.report("flamer"));
    // B3: the horde bit is exact on/off; the ring follows the client's copy of the server's flame clocks.
    expectAgree(p, "zombies:BURNING");
  });

  it("a Crawler bite, a down and a revive, a return from a hold", () => {
    const p = new Probe({ waves: noop });
    const p0 = addPlayer(p.server, "p0", 30, 30);
    const p1 = addPlayer(p.server, "p1", 50, 30);
    addPlayer(p.server, "p2", 50, 50);
    p0.hp = p1.hp = 1e9;
    spawnZombie(p.server, "crawler", 30.6, 30);
    p.tick(60);
    p0.hp = 0;
    downPlayer(p.server, p0);
    p.tick(30);
    p1.x = 31;
    p1.y = 30;
    p.tick(40);
    holdPlayer(p.server, "p2");
    p.tick(balance.player.returnMinHoldTicks + 5);
    expect(returnPlayer(p.server, "p2")).toBe(true);
    p.tick(60);
    log(p.report("survivors"));
    expectAgree(p, "players:SLOWED");
    expectAgree(p, "players:DOWNED");
    expectAgree(p, "players:PROTECTED");
  });

  it("zones: a thrown Molotov, a Spitter's acid, a med station", () => {
    const p = new Probe({ waves: noop });
    const p0 = addPlayer(p.server, "p0", 30, 30);
    const p1 = addPlayer(p.server, "p1", 24, 30);
    p0.hp = 1e9;
    p1.hp = 1e9;
    p1.maxHp = 1e9;
    p1.consumable = "molotovs";
    p1.consumableCount = 2;
    p.input("p1", { aimX: 5, aimY: 0, isMouse: true, consumable: true });
    p.tick(1);
    p.input("p1", { aimX: 5, aimY: 0, isMouse: true });
    p.tick(10);
    // p0 walks out of the fire, east, then back in, then out.
    const walk = (dx: number, n: number) => {
      for (let i = 0; i < n; i++) {
        p.input("p0", { moveX: dx, moveY: 0 });
        p.tick();
      }
    };
    walk(1, 25);
    walk(-1, 25);
    walk(1, 40);
    // Acid: a Spitter at range; p0 stands, then walks off.
    p.input("p0", {});
    p.server.zombies.hp[spawnZombie(p.server, "spitter", 48, 30)] = 1e6;
    p.tick(120);
    walk(0, 0);
    for (let i = 0; i < 40; i++) {
      p.input("p0", { moveX: 0, moveY: 1 });
      p.tick();
    }
    // Heal: p1 hurt, walks through a med station's reach.
    p1.maxHp = 100;
    p1.hp = 40;
    p1.x = 5;
    p1.y = 10.5;
    p.place(10, 10, "med_station");
    for (let i = 0; i < 60; i++) {
      p.input("p1", { moveX: 1, moveY: 0 });
      p.tick();
    }
    // The last HP: the wire rounds HP up (a 99.75 shows 100), so the online heal icon ends when the synced HP is full.
    p1.x = 10.5;
    p1.hp = 98.6;
    for (let i = 0; i < 20; i++) {
      p.tick();
    }
    expect(p1.hp, "healed to full").toBe(p1.maxHp);
    // A Bloater bursting by p0: its gas slows (the 3.9 slot, refreshed while inside, + the linger).
    const bl = spawnZombie(p.server, "bloater", p0.x + 1, p0.y);
    killZombie(p.server, bl, null, "test");
    for (let i = 0; i < 80; i++) {
      p.input("p0", { moveX: i < 40 ? 0 : -1, moveY: 0 });
      p.tick();
    }
    expect(p.get("players:SLOWED").seen, "the gas slowed p0").toBeGreaterThan(0);
    log(p.report("zones"));
    expectAgree(p, "players:BURNING", false);
    expectAgree(p, "players:ACID", false);
    expectAgree(p, "players:HEALING", false);
    expectAgree(p, "players:SLOWED");
  });

  it("the evacuation: everyone standing protected (a downed survivor stands up), 12.75 s", () => {
    const p = new Probe({ waves: noop });
    const p0 = addPlayer(p.server, "p0", 20, 20);
    const p1 = addPlayer(p.server, "p1", 24, 20);
    p0.hp = p1.hp = 1e9;
    downPlayer(p.server, p1);
    p.tick(10);
    openEvacVote(p.server);
    startExtract(p.server);
    p.tick(5);
    const r = p.online.players[1] as BodyStatus;
    expect(r.has(STATUS.PROTECTED), "the downed survivor stood up, protected").toBe(true);
    // The calm is 255 ticks (12.75 s, the decisions doc): the ring drains from full like the sim's counter.
    expect(r.left[STATUS.PROTECTED]).toBe(p.server.players.get("p1")?.protectTicks);
    expect(ringFraction(r.left[STATUS.PROTECTED] as number, r.total[STATUS.PROTECTED] as number)).toBeGreaterThan(0.95);
    p.tick(200); // the walk to the pad
    log(p.report("evacuation"));
    expectAgree(p, "players:PROTECTED");
  });

  it("the Behemoth's stun after a crash", () => {
    const p = new Probe({ waves: noop, zombies: noop });
    addPlayer(p.server, "p0", 60, 60);
    const b = p.server.boss;
    b.state = BOSS_STATE.WALK;
    b.x = 20;
    b.y = 20;
    b.hp = b.maxHp = 6000;
    b.number = 1;
    b.gapTicks = 0;
    b.cooldown.slam = b.cooldown.charge = b.cooldown.throw = 1e9;
    p.tick(3);
    b.state = BOSS_STATE.STUN; // what a crash leaves (the charge's rush, telegraph.ts)
    b.stateTicks = 0;
    p.tick(80);
    log(p.report("boss"));
    expectAgree(p, "boss:STUNNED");
    // Set between two ticks here, so the stun clock has run one tick when first seen (a real crash sets it inside
    // the boss system: 40 seen; `statusModel.test.ts`); online it starts on that same patch: ring within 1.
    expect(p.get("boss:STUNNED").seen).toBe(39);
  });
});
