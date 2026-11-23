import { quantizeHeading, ticksFor, type Building, type PlayerState as SimPlayer, type World } from "@topdown/shared";
import type { RunController } from "../../run/RunController";
import { BuildingState, type PlayerState, type RunState } from "./RunState";

/**
 * Copies the World into room state once per tick (Story 2.4), right after `controller.tick()`.
 * A field is assigned only when its value changed, so an idle player costs no patch bytes. Every
 * patch carries `tick` with the players' `x`, `y` and `ackSeq` of that same tick (the room patches
 * between ticks, never inside one).
 */
export function syncState(state: RunState, controller: RunController): void {
  const world = controller.world;
  pass.state = state;
  pass.controller = controller;
  pass.alive = 0;
  pass.reviveTicks = ticksFor(world.balance.player.reviveS);
  world.players.forEach(visitPlayer); // a module-level callback: no closure per tick
  const alive = pass.alive;
  pass.state = null;
  pass.controller = null;
  // Story 3.1: the run state machine's phase (build / wave / results); the room writes "lobby" itself.
  const phase = world.run.phase;
  if (phase !== "lobby" && state.phase !== phase) state.phase = phase;
  if (state.buildTicksLeft !== world.run.buildTicksLeft) state.buildTicksLeft = world.run.buildTicksLeft;
  if (state.tick !== world.tick) state.tick = world.tick;
  if (state.wave !== world.waves.number) state.wave = world.waves.number;
  if (state.remaining !== world.waves.remaining) state.remaining = world.waves.remaining;
  if (state.aliveCount !== alive) state.aliveCount = alive;
  if (state.runSeed !== world.seed) state.runSeed = world.seed; // Story 4.4: once per run
  // Story 4.5: the decay stage and the run's variants (on change only: a build start, once per run).
  if (state.decayVariants !== world.decay.variants) state.decayVariants = world.decay.variants;
  if (state.decayStage !== world.decay.stage) state.decayStage = world.decay.stage;
  if (state.decayFiresOut !== world.decay.firesOut) state.decayFiresOut = world.decay.firesOut; // Story 4.8
  syncBuildings(state, world);
}

/**
 * Story 3.4: the World's buildings → `state.buildings`. When `buildings.version` changed (a
 * placement, 3.5's destruction; Story 5.9: an upgrade's type change) entries are added, removed or retyped (allocation is fine then: rare); every
 * tick only HP is compared, and assigned when it changed. The schema entry per building id is kept
 * here, per room state, so the per-tick pass needs no string keys.
 */
interface BuildingSync {
  version: number;
  readonly entries: Map<number, BuildingState>;
}
const buildingSyncs = new WeakMap<RunState, BuildingSync>();

function syncBuildings(state: RunState, world: World): void {
  let sync = buildingSyncs.get(state);
  if (!sync) {
    sync = { version: -1, entries: new Map() };
    buildingSyncs.set(state, sync);
  }
  const list = world.buildings.list;
  if (sync.version !== world.buildings.version) {
    sync.version = world.buildings.version;
    const keep = new Set<number>();
    for (const b of list) {
      keep.add(b.id);
      const had = sync.entries.get(b.id);
      if (!had) {
        const s = new BuildingState({ type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: Math.ceil(b.hp) });
        state.buildings.set(String(b.id), s);
        sync.entries.set(b.id, s);
      } else if (had.type !== b.type) {
        had.type = b.type; // Story 5.9: an upgrade (same id and footprint; its new HP follows below)
      }
    }
    for (const id of [...sync.entries.keys()]) {
      if (keep.has(id)) continue;
      state.buildings.delete(String(id));
      sync.entries.delete(id);
    }
  }
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const s = sync.entries.get(b.id);
    const hp = Math.ceil(b.hp);
    if (s && s.hp !== hp) s.hp = hp;
  }
}

/** The sync pass in progress (synchronous, so one shared record is enough). */
const pass: { state: RunState | null; controller: RunController | null; alive: number; reviveTicks: number } = {
  state: null,
  controller: null,
  alive: 0,
  reviveTicks: 1,
};

function visitPlayer(p: SimPlayer): void {
  if (p.status === "alive") pass.alive++;
  const s = pass.state?.players.get(p.id);
  if (s && pass.controller) {
    syncPlayer(s, p, pass.controller.ackSeq(p.id));
    syncDowned(s, p, pass.controller.kills(p.id));
    syncWallet(s, p);
  }
}

/** Story 3.2: wallet and earned total (integers; assigned only when they change). */
function syncWallet(s: PlayerState, p: SimPlayer): void {
  if (s.wallet !== p.wallet) s.wallet = p.wallet;
  if (s.earned !== p.earned) s.earned = p.earned;
}

/** Story 2.8: countdown, revive progress (0–255) and kills; Story 3.1: build-phase Ready. */
function syncDowned(s: PlayerState, p: SimPlayer, kills: number): void {
  if (s.downedTicksLeft !== p.downedTicksLeft) s.downedTicksLeft = p.downedTicksLeft;
  const progress = Math.min(255, Math.round((p.reviveTicks / pass.reviveTicks) * 255));
  if (s.reviveProgress !== progress) s.reviveProgress = progress;
  if (s.kills !== kills) s.kills = kills;
  if (s.buildReady !== p.buildReady) s.buildReady = p.buildReady;
}

function syncPlayer(s: PlayerState, p: SimPlayer, ackSeq: number): void {
  // float32 on the wire: compare rounded, so sub-float32 drift never counts as a change.
  const x = Math.fround(p.x);
  const y = Math.fround(p.y);
  if (s.x !== x) s.x = x;
  if (s.y !== y) s.y = y;
  const heading = quantizeHeading(p.facingX, p.facingY);
  if (s.heading !== heading) s.heading = heading;
  const hp = Math.ceil(p.hp);
  if (s.hp !== hp) s.hp = hp;
  const maxHp = Math.ceil(p.maxHp);
  if (s.maxHp !== maxHp) s.maxHp = maxHp;
  if (s.status !== p.status) s.status = p.status;
  if (s.ackSeq !== ackSeq) s.ackSeq = ackSeq;
  const lo = p.loadout;
  if (s.active !== lo.active) s.active = lo.active;
  if (s.swapTicks !== lo.swapTicks) s.swapTicks = lo.swapTicks;
  const a = lo.slots[0];
  if (s.weapon0 !== a.weapon) s.weapon0 = a.weapon;
  if (s.ammo0 !== a.ammo) s.ammo0 = a.ammo;
  if (s.reloadTicks0 !== a.reloadTicks) s.reloadTicks0 = a.reloadTicks;
  const b = lo.slots[1];
  const weapon1 = b ? b.weapon : "";
  const ammo1 = b ? b.ammo : 0;
  const reload1 = b ? b.reloadTicks : 0;
  if (s.weapon1 !== weapon1) s.weapon1 = weapon1;
  if (s.ammo1 !== ammo1) s.ammo1 = ammo1;
  if (s.reloadTicks1 !== reload1) s.reloadTicks1 = reload1;
  if (s.slowTicks !== p.slowTicksLeft) s.slowTicks = p.slowTicksLeft; // Story 3.9
  if (s.slowPct !== p.slowPct) s.slowPct = p.slowPct;
}

/** Story 2.8 › `lobby.return`: every fight field and Ready flag back to its default; slot and name stay. */
export function resetRunFields(state: RunState): void {
  state.players.forEach(resetPlayer);
  state.tick = 0;
  state.wave = 0;
  state.remaining = 0;
  state.aliveCount = 0;
  state.resultWave = 0;
  state.resultHeldOut = false;
  state.buildTicksLeft = 0;
  state.runSeed = 0; // Story 4.4: the next run writes its own
  state.decayStage = 0; // Story 4.5
  state.decayVariants = 0;
  state.decayFiresOut = 0; // Story 4.8
  state.buildings.clear(); // Story 3.4: the next run starts with none
  buildingSyncs.delete(state);
}

function resetPlayer(s: PlayerState): void {
  s.ready = false;
  s.x = 0;
  s.y = 0;
  s.heading = 0;
  s.hp = 0;
  s.maxHp = 0;
  s.status = "alive";
  s.ackSeq = 0;
  s.active = 0;
  s.weapon0 = "";
  s.weapon1 = "";
  s.ammo0 = 0;
  s.ammo1 = 0;
  s.reloadTicks0 = 0;
  s.reloadTicks1 = 0;
  s.swapTicks = 0;
  s.downedTicksLeft = 0;
  s.reviveProgress = 0;
  s.kills = 0;
  s.buildReady = false;
  s.wallet = 0;
  s.earned = 0;
  s.slowTicks = 0;
  s.slowPct = 0;
}
