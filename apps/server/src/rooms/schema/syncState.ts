import { LOOT_BAG, CONSUMABLE_NONE, EVENT_KIND_NONE_WIRE, EVENT_NONE, bossSlotOf, consumableIndex, quantizeHeading, type Balance, type Building, type PlayerState as SimPlayer, type World } from "@topdown/shared";
import type { RunController } from "../../run/RunController";
import { BossState, BuildingState, type PlayerState, type RunState } from "./RunState";

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
  world.players.forEach(visitPlayer); // a module-level callback: no closure per tick
  if (world.heldPlayers.size > 0) world.heldPlayers.forEach(visitHeld); // Story 8.1
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
  // Story 6.3: the light state's two synced flags (on change only: a blackout starting or ending).
  if (state.blackoutPct !== world.lights.blackoutPct) state.blackoutPct = world.lights.blackoutPct;
  if (state.halfDark !== world.lights.halfDark) state.halfDark = world.lights.halfDark;
  if (state.voteTicksLeft !== world.run.voteTicksLeft) state.voteTicksLeft = world.run.voteTicksLeft; // Story 6.11
  if (state.endless !== world.run.endless) state.endless = world.run.endless; // Story 6.12
  syncBuildings(state, world);
  syncBoss(state, world); // Story 6.5
  syncSpecialEvent(state, world); // Story 6.8
  syncLootBag(state, world); // Story 7.12
}

/** Story 7.12: the loot bag's record, on change only (drop, pick-up, expiry: a few patches per run). */
function syncLootBag(state: RunState, world: World): void {
  const l = world.loot;
  if (state.lootBagState === l.state) return; // the record changes only with the state
  if (l.state === LOOT_BAG.OUT) {
    state.lootBagX = l.x;
    state.lootBagY = l.y;
    state.lootBagUntilTick = l.untilTick;
    state.lootBagVariant = l.variant;
  }
  state.lootBagState = l.state;
}

/** Story 6.8: the active event, field by field on change only (an idle record costs no bytes). */
function syncSpecialEvent(state: RunState, world: World): void {
  const a = world.special.active;
  const kind = a.kind === EVENT_NONE ? EVENT_KIND_NONE_WIRE : a.kind;
  if (state.eventKind !== kind) state.eventKind = kind;
  if (kind === EVENT_KIND_NONE_WIRE) return; // the last event's fields stay (no bytes); the kind says none
  if (state.eventPhase !== a.phase) state.eventPhase = a.phase;
  if (state.eventStartTick !== a.startTick) state.eventStartTick = a.startTick;
  if (state.eventPhaseTick !== a.phaseTick) state.eventPhaseTick = a.phaseTick;
  const x = Math.round(a.x * 100);
  const y = Math.round(a.y * 100);
  if (state.eventX !== x) state.eventX = x;
  if (state.eventY !== y) state.eventY = y;
  const lane = a.lane < 0 ? 255 : a.lane;
  if (state.eventLane !== lane) state.eventLane = lane;
  // Story 6.9: the crate (weapon, claim).
  const d = world.special.supplyDrop;
  const cw = d.weapon < 0 ? 255 : d.weapon;
  if (state.crateWeapon !== cw) state.crateWeapon = cw;
  const cs = d.claimSlot < 0 ? 255 : d.claimSlot;
  if (state.crateClaimSlot !== cs) state.crateClaimSlot = cs;
  const ct = Math.min(255, d.claimTicks);
  if (state.crateClaimTicks !== ct) state.crateClaimTicks = ct;
  // Story 6.10: the survivor NPC and its flag (≈ 20 Hz while it moves; nothing while it waits).
  const n = world.special.survivor;
  const nx = Math.round(n.x * 100);
  const ny = Math.round(n.y * 100);
  if (state.npcX !== nx) state.npcX = nx;
  if (state.npcY !== ny) state.npcY = ny;
  const hp = Math.max(0, Math.min(255, Math.round(n.hp)));
  if (state.npcHp !== hp) state.npcHp = hp;
  if (state.npcState !== n.state) state.npcState = n.state;
  if (state.npcLook !== n.look) state.npcLook = n.look;
  const ls = n.leaderSlot < 0 ? 255 : n.leaderSlot;
  if (state.npcLeaderSlot !== ls) state.npcLeaderSlot = ls;
  const sx = Math.round(n.safeX * 100);
  const sy = Math.round(n.safeY * 100);
  if (state.safeX !== sx) state.safeX = sx;
  if (state.safeY !== sy) state.safeY = sy;
}

/** Story 6.5: the boss record, field by field on change only (an idle record costs no bytes). */
function syncBoss(state: RunState, world: World): void {
  if (!state.boss) state.boss = new BossState();
  const s = state.boss;
  const b = world.boss;
  if (s.state !== b.state) s.state = b.state;
  if (s.x !== Math.fround(b.x)) s.x = b.x;
  if (s.y !== Math.fround(b.y)) s.y = b.y;
  const heading = quantizeHeading(Math.cos(b.facing), Math.sin(b.facing));
  if (s.heading !== heading) s.heading = heading;
  const hp = Math.max(0, Math.ceil(b.hp));
  if (s.hp !== hp) s.hp = hp;
  if (s.maxHp !== b.maxHp) s.maxHp = b.maxHp;
  if (s.number !== b.number) s.number = b.number;
  if (s.look !== b.look) s.look = b.look;
  const slot = bossSlotOf(world, b.targetId);
  const target = slot < 0 ? 255 : slot;
  if (s.target !== target) s.target = target;
  if (s.enraged !== b.enraged) s.enraged = b.enraged;
  const a = b.attack;
  if (s.atkId !== a.id) s.atkId = a.id;
  if (s.atkKind !== a.kind) s.atkKind = a.kind;
  if (s.atkStart !== a.startTick) s.atkStart = a.startTick;
  if (s.atkHit !== a.hitTick) s.atkHit = a.hitTick;
  if (s.atkX !== Math.fround(a.cx)) s.atkX = a.cx;
  if (s.atkY !== Math.fround(a.cy)) s.atkY = a.cy;
  if (s.atkR !== Math.fround(a.radiusM)) s.atkR = a.radiusM;
  // Story 6.6: once per attack (the stop point is exact: f32 of the server's numbers).
  const ex = a.cx + a.dirX * a.lenM;
  const ey = a.cy + a.dirY * a.lenM;
  if (s.atkEndX !== Math.fround(ex)) s.atkEndX = ex;
  if (s.atkEndY !== Math.fround(ey)) s.atkEndY = ey;
  if (s.atkCrash !== a.crash) s.atkCrash = a.crash;
  if (s.atkSrc !== a.src) s.atkSrc = a.src;
  if (s.atkSrcX !== Math.fround(a.srcX)) s.atkSrcX = a.srcX;
  if (s.atkSrcY !== Math.fround(a.srcY)) s.atkSrcY = a.srcY;
}

/**
 * Story 3.4: the World's buildings → `state.buildings`. When `buildings.version` changed (a
 * placement, 3.5's destruction; Story 5.9: an upgrade's type change; Story 5.22: a move's new spot) entries are added, removed or retyped (allocation is fine then: rare); every
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
        const s = new BuildingState({ type: b.type, owner: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot, hp: Math.ceil(b.hp), trap: b.trapState });
        state.buildings.set(String(b.id), s);
        sync.entries.set(b.id, s);
      } else if (had.type !== b.type) {
        had.type = b.type; // Story 5.9: an upgrade (same id and footprint; its new HP follows below)
      }
      if (had && had.trap !== b.trapState) had.trap = b.trapState; // Story 5.14: the jaws (every change bumps version)
      if (had) {
        // Story 5.22: a move changes the spot in place (same id; `relocateBuilding` bumps version).
        if (had.gx !== b.gx) had.gx = b.gx;
        if (had.gy !== b.gy) had.gy = b.gy;
        if (had.rot !== b.rot) had.rot = b.rot;
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
const pass: { state: RunState | null; controller: RunController | null; alive: number } = {
  state: null,
  controller: null,
  alive: 0,
};

function visitPlayer(p: SimPlayer): void {
  if (p.status === "alive") pass.alive++;
  const s = pass.state?.players.get(p.id);
  if (s && pass.controller) {
    syncPlayer(s, p, pass.controller.ackSeq(p.id));
    syncDowned(s, p, pass.controller.kills(p.id));
    syncWallet(s, p);
    syncConsumable(s, p, pass.controller.world.balance);
    // Story 8.9: the queue depth my client paces its steps by (room state, not World state).
    const queued = Math.min(255, pass.controller.queuedAtTick(p.id));
    if (s.inputQueued !== queued) s.inputQueued = queued;
  }
}

/** Story 5.12: the quick-use slot (index + count; assigned only when they change: a purchase or a use). */
function syncConsumable(s: PlayerState, p: SimPlayer, balance: Balance): void {
  const index = consumableIndex(balance, p.consumable);
  if (s.consumable !== index) s.consumable = index;
  if (s.consumableCount !== p.consumableCount) s.consumableCount = p.consumableCount;
}

/** Story 3.2: wallet and earned total (integers; assigned only when they change). */
function syncWallet(s: PlayerState, p: SimPlayer): void {
  if (s.wallet !== p.wallet) s.wallet = p.wallet;
  if (s.earned !== p.earned) s.earned = p.earned;
}

/** Story 2.8: countdown, revive progress (0–255) and kills; Story 3.1: build-phase Ready. */
function syncDowned(s: PlayerState, p: SimPlayer, kills: number): void {
  if (s.downedTicksLeft !== p.downedTicksLeft) s.downedTicksLeft = p.downedTicksLeft;
  // Story 5.11 (review L1/L2): the denominator is this revive's need (fastest kit in reach), synced
  // as `reviveNeed` (on change only), so the client's ring divides by the same number.
  const progress = p.reviveTicks > 0 && p.reviveNeedTicks > 0 ? Math.min(255, Math.round((p.reviveTicks / p.reviveNeedTicks) * 255)) : 0;
  if (s.reviveNeed !== p.reviveNeedTicks) s.reviveNeed = p.reviveNeedTicks;
  if (s.reviveProgress !== progress) s.reviveProgress = progress;
  if (s.kills !== kills) s.kills = kills;
  if (s.buildReady !== p.buildReady) s.buildReady = p.buildReady;
  if (s.vote !== p.vote) s.vote = p.vote; // Story 6.11
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
  // Story 5.1: upgrade levels (0 = empty slot).
  if (s.level0 !== a.level) s.level0 = a.level;
  const level1 = b ? b.level : 0;
  if (s.level1 !== level1) s.level1 = level1;
  if (s.slowTicks !== p.slowTicksLeft) s.slowTicks = p.slowTicksLeft; // Story 3.9
  if (s.slowPct !== p.slowPct) s.slowPct = p.slowPct;
  if (s.knockTicks !== p.knockTicks) s.knockTicks = p.knockTicks; // Story 5.7
  if (s.knockDx !== p.knockDx) s.knockDx = p.knockDx;
  if (s.knockDy !== p.knockDy) s.knockDy = p.knockDy;
  if (s.knockStepMm !== p.knockStepMm) s.knockStepMm = p.knockStepMm;
  if (s.gear !== p.gear) s.gear = p.gear; // Story 5.11: on a purchase only
  if (s.protectTicks !== p.protectTicks) s.protectTicks = p.protectTicks; // Story 8.1: 40 changes after a mid-wave return, then none
}

/** Story 8.1 (F5): a held player's wallet still changes (their turrets' pay); nothing else of theirs does. */
function visitHeld(h: { readonly player: SimPlayer }): void {
  const s = pass.state?.players.get(h.player.id);
  if (s) syncWallet(s, h.player);
}

/** Story 2.8 › `lobby.return`: every fight field and Ready flag back to its default; slot and name stay. */
export function resetRunFields(state: RunState): void {
  state.players.forEach(resetPlayer);
  state.tick = 0;
  state.wave = 0;
  state.remaining = 0;
  state.aliveCount = 0;
  state.resultWave = 0;
  state.resultEnding = ""; // Story 6.11
  state.voteTicksLeft = 0;
  state.endless = false; // Story 6.12
  state.frozen = false; // Story 8.1
  state.resumeIn = 0;
  state.buildTicksLeft = 0;
  state.runSeed = 0; // Story 4.4: the next run writes its own
  state.decayStage = 0; // Story 4.5
  state.decayVariants = 0;
  state.decayFiresOut = 0; // Story 4.8
  state.blackoutPct = 0; // Story 6.3
  state.halfDark = false;
  state.buildings.clear(); // Story 3.4: the next run starts with none
  buildingSyncs.delete(state);
  state.boss = new BossState(); // Story 6.5: no boss before the next run's wave 10
  state.eventKind = EVENT_KIND_NONE_WIRE; // Story 6.8: no event before the next run's
  state.eventPhase = 0;
  state.eventStartTick = 0;
  state.eventPhaseTick = 0;
  state.eventX = 0;
  state.eventY = 0;
  state.eventLane = 255;
  state.crateWeapon = 255; // Story 6.9
  state.crateClaimSlot = 255;
  state.crateClaimTicks = 0;
  state.npcX = 0; // Story 6.10
  state.npcY = 0;
  state.npcHp = 0;
  state.npcState = 0;
  state.npcLook = 0;
  state.npcLeaderSlot = 255;
  state.lootBagState = 0; // Story 7.12: no bag before the next run's drop
  state.lootBagX = 0;
  state.lootBagY = 0;
  state.lootBagUntilTick = 0;
  state.lootBagVariant = 0;
  state.safeX = 0;
  state.safeY = 0;
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
  s.inputQueued = 0; // Story 8.9
  s.active = 0;
  s.weapon0 = "";
  s.weapon1 = "";
  s.ammo0 = 0;
  s.ammo1 = 0;
  s.reloadTicks0 = 0;
  s.reloadTicks1 = 0;
  s.swapTicks = 0;
  s.level0 = 0; // Story 5.1
  s.level1 = 0;
  s.downedTicksLeft = 0;
  s.reviveProgress = 0;
  s.kills = 0;
  s.buildReady = false;
  s.vote = 0; // Story 6.11
  s.heldUntilTick = 0; // Story 8.1
  s.protectTicks = 0;
  s.wallet = 0;
  s.earned = 0;
  s.slowTicks = 0;
  s.slowPct = 0;
  s.knockTicks = 0; // Story 5.7
  s.knockDx = 0;
  s.knockDy = 0;
  s.knockStepMm = 0;
  s.gear = 0; // Story 5.11: the next run starts with none
  s.reviveNeed = 0;
  s.consumable = CONSUMABLE_NONE; // Story 5.12: the next run starts empty
  s.consumableCount = 0;
}
