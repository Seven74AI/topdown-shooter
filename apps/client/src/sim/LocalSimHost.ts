import { FlameCues } from "../render/flameCues";
import {
  forceLootPlan,
  NEUTRAL_INPUT,
  TICK_DT_S,
  buyCard,
  offerFor,
  reroll,
  upgradeWeapon,
  buyItem,
  createWorld,
  DOWNTOWN_MAP,
  placeBuilding,
  repairBuilding,
  upgradeBuilding,
  sellBuilding,
  moveBuilding,
  setBuildReady,
  castVote,
  type EvacChoice,
  setInput,
  startBuild,
  applyStartWave,
  step,
  type Balance,
  type DistrictMap,
  type PlaceError,
  type PlaceRequest,
  type RepairError,
  type UpgradeError,
  type SellError,
  type MoveRequest,
  type PlayerInput,
  type SimEvent,
  type ShopOfferView,
  type World,
  decodeLook,
  encodeLook,
  ownedParts,
} from "@topdown/shared";
import type { MoveRefusal } from "../net/session";
import { MOVE_REFUSALS_MAX, type PlayerInfo, type ShopAnswer, type SimHost } from "./SimHost";

/** Most steps run in one frame; leftover time is dropped (avoids a catch-up spiral after a hidden tab). */
export const MAX_CATCHUP_STEPS = 5;

/** Id of the only player in local (Epic 1) mode. */
export const LOCAL_PLAYER_ID = "local";

/** Solo: the one survivor is slot 0 (blue) and has no name tag (Story 2.9). */
const LOCAL_PLAYER_INFO: PlayerInfo = Object.freeze({ slot: 0, name: "", look: "" });

/** Step timing of the last `update()` (Story 1.11 overlay). Client code, so `performance.now()` is allowed. */
export interface SimStepStats {
  /** Steps run by the last `update()` call (0..MAX_CATCHUP_STEPS). */
  lastUpdateSteps: number;
  /** Duration of each of those steps, ms (only the first `lastUpdateSteps` entries are valid). */
  readonly stepMs: Float64Array;
  /** Steps run since the host was created. */
  totalSteps: number;
}

/** Runs the shared World in the browser at a fixed 20 Hz step. */
export class LocalSimHost implements SimHost {
  readonly world: World;
  readonly localPlayerId = LOCAL_PLAYER_ID;
  readonly online = false;
  /** Story 5.4: solo flames come from the sim's own burst events (never lost). */
  readonly flames = new FlameCues();
  private accumulatorS = 0;
  /**
   * Story 2.11: the in-run menu pauses solo practice. While paused `update` steps nothing and the
   * accumulator is frozen (frame time is not added), so resuming never runs a catch-up burst and
   * `alpha` keeps the drawn positions exactly where they were (no snap at pause or resume).
   */
  paused = false;
  private input: PlayerInput = NEUTRAL_INPUT;
  /** Edge flags latched until a step consumes them (a tap between two steps is never lost). */
  private latchedSwap = false;
  private latchedConsumable = false;
  /**
   * Re-review M: the tap frame's throw-encoded aim (InputRouter encodes the throw's range and drops
   * fire on that frame only). The step that takes the latched flag uses it with fire off, whatever
   * frame is the latest by then.
   */
  private latchedThrowAimX = 0;
  private latchedThrowAimY = 0;
  /** Re-review L: the tap frame's own fire (InputRouter drops it for a throwable only; a medkit tap keeps shooting). */
  private latchedTapFire = false;
  /** Input sequence number, one per step (the shared input system fires edges once per seq). */
  private seq = 0;
  private events: SimEvent[] = [];
  /** Story 3.4: the last placement refusal, until the scene takes it. */
  private refusal: PlaceError | null = null;
  private drained: SimEvent[] = [];
  private readonly unsubscribe: () => void;
  readonly stats: SimStepStats = { lastUpdateSteps: 0, stepMs: new Float64Array(MAX_CATCHUP_STEPS), totalSteps: 0 };

  /**
   * Story 4.1: `map` defaults to `DOWNTOWN_MAP` (tests may pass the open `PLACEHOLDER_MAP`). Story 6.1
   * dev (`?startwave=7`): `startWave` makes the first build lead into that wave (null = wave 1).
   */
  /** Story 7.9 (AC 13, D4): my own look in practice (this phone's saved progress), checked like a join would. */
  private readonly info: PlayerInfo;

  /**
   * `look`: the device's look code (7.1's progress cache; absent = the default look). Never sent anywhere. `owned`: the
   * server's `cosmetics` from the cached progress (Stories 7.11 / 7.12: milestone and loot parts; absent = starter parts).
   */
  constructor(opts: { balance: Balance; seed: number; map?: DistrictMap; startWave?: number | null; look?: unknown; owned?: readonly string[] | undefined; devLoot?: readonly [number, number] | null }) {
    this.info = opts.look === undefined ? LOCAL_PLAYER_INFO : Object.freeze({ slot: 0, name: "", look: encodeLook(decodeLook(opts.look, ownedParts(opts.owned)).look) });
    // Story 7.12 (D2): offline practice banks nothing (7.2's rule), so it makes no loot plan;
    // the dev `?loot=3:0.1` forces one for browser checks.
    this.world = createWorld({ balance: opts.balance, seed: opts.seed, map: opts.map ?? DOWNTOWN_MAP, loot: { off: true } });
    if (opts.devLoot) forceLootPlan(this.world, opts.devLoot[0], opts.devLoot[1]);
    if (opts.startWave) applyStartWave(this.world, opts.startWave); // Story 6.1: before the first build start
    this.unsubscribe = this.world.events.subscribe((e) => this.events.push(e));
    // Story 3.1: solo runs the same state machine as the server: Lobby → the first build phase. The
    // scene adds the player right after (the build heal of nobody is a no-op); `build.started` is
    // delivered with the first step.
    startBuild(this.world);
  }

  setBuildReady(ready: boolean): void {
    setBuildReady(this.world, LOCAL_PLAYER_ID, ready);
  }

  /** Story 6.11: solo votes through the same `castVote` (the in-run menu pauses the vote's clock too). */
  castVote(choice: EvacChoice): void {
    castVote(this.world, LOCAL_PLAYER_ID, choice);
  }

  /** Story 3.4: solo applies the placement at once (between steps, like the server's message handler). */
  placeBuilding(req: PlaceRequest): void {
    const r = placeBuilding(this.world, LOCAL_PLAYER_ID, req);
    if (!r.ok) {
      if (this.refusal !== null) this.placeRefusalsDropped++; // Story 5.18 review L1: two in one frame (never paced like that)
      this.refusal = r.error;
    }
  }

  /** Story 5.18 (review L1): refusals overwritten before the scene took them. */
  placeRefusalsDropped = 0;

  takePlaceRefusal(): PlaceError | null {
    const r = this.refusal;
    this.refusal = null;
    return r;
  }

  /** Story 3.7: the last repair refusal, until the scene takes it. */
  private repairRefusal: RepairError | null = null;

  /** Story 3.7: solo applies the repair at once (between steps, like the server's message handler). */
  repairBuilding(id: number): void {
    const r = repairBuilding(this.world, LOCAL_PLAYER_ID, id);
    if (!r.ok) this.repairRefusal = r.error;
  }

  /** Story 5.9: the last upgrade refusal, until the scene takes it. */
  private upgradeRefusal: UpgradeError | null = null;

  /** Story 5.9: solo applies the upgrade at once (between steps, like the server's message handler). */
  upgradeBuilding(id: number): void {
    const r = upgradeBuilding(this.world, LOCAL_PLAYER_ID, id);
    if (!r.ok) this.upgradeRefusal = r.error;
  }

  takeUpgradeRefusal(): UpgradeError | null {
    const r = this.upgradeRefusal;
    this.upgradeRefusal = null;
    return r;
  }

  /** Story 5.20: the last sell refusal, until the scene takes it. */
  private sellRefusal: SellError | null = null;

  /** Story 5.20: solo applies the sell at once (between steps, like the server's message handler). */
  sellBuilding(id: number): void {
    const r = sellBuilding(this.world, LOCAL_PLAYER_ID, id);
    if (!r.ok) this.sellRefusal = r.error;
  }

  takeSellRefusal(): SellError | null {
    const r = this.sellRefusal;
    this.sellRefusal = null;
    return r;
  }

  /** Story 5.22: move refusals until the scene takes them (oldest first; a few at most). */
  private readonly moveRefusals: MoveRefusal[] = [];

  /** Story 5.22: solo applies the move at once (between steps, like the server's message handler). */
  moveBuilding(req: MoveRequest, seq: number): void {
    const r = moveBuilding(this.world, LOCAL_PLAYER_ID, req);
    if (!r.ok && this.moveRefusals.length < MOVE_REFUSALS_MAX) this.moveRefusals.push({ id: req.id, reason: r.error, seq });
  }

  takeMoveRefusal(): MoveRefusal | null {
    return this.moveRefusals.shift() ?? null;
  }

  /** Story 5.24: solo has no teammates (D10). */
  sendGhost(): void {}
  readonly teammateGhosts = null;

  takeRepairRefusal(): RepairError | null {
    const r = this.repairRefusal;
    this.repairRefusal = null;
    return r;
  }

  private shopAnswer: ShopAnswer | null = null;

  /** Story 5.13: the shared `buyCard` on my stored offer, at once (between steps); the answer waits for `takeShopAnswer`. */
  buyCard(card: number, item: string, slot: 0 | 1 | null): void {
    const o = this.shopOffer();
    const r = buyCard(this.world, LOCAL_PLAYER_ID, o?.build ?? -1, o?.rev ?? 0, card, item, slot);
    this.shopAnswer = r.ok ? { ok: true, item, card, slot: r.value.slot } : { ok: false, item, card, error: r.error };
  }

  /** Story 5.13: the shared `reroll` on my stored offer (solo is slot 0, `shop:0:<build>`). */
  reroll(): void {
    const o = this.shopOffer();
    const r = reroll(this.world, LOCAL_PLAYER_ID, o?.build ?? -1, o?.rev ?? 0);
    if (!r.ok) this.shopAnswer = { kind: "reroll", ok: false, error: r.error };
  }

  /** Story 5.13: the cached view of `world.shop` (rebuilt only when the offer or what I own changes). */
  private offerView: ShopOfferView | null = null;

  shopOffer(): ShopOfferView | null {
    const w = this.world;
    const p = w.players.get(LOCAL_PLAYER_ID);
    if (w.run.phase !== "build" || !p) return null;
    const s = w.shop;
    // Cheap change key: the offer slot 0 and what decides "Owned" / canReroll (no string work per frame while unchanged).
    const k0 = s.build[0] as number;
    const k1 = s.rev[0] as number;
    const k2 = s.sold[0] as number;
    if (this.offerView && this.offerView.build === k0 && this.offerView.rev === k1 && this.offerView.sold === k2 && this.offerGear === p.gear && this.offerW0 === p.loadout.slots[0].weapon && this.offerW1 === (p.loadout.slots[1]?.weapon ?? "")) return this.offerView;
    this.offerView = offerFor(w, LOCAL_PLAYER_ID);
    this.offerGear = p.gear;
    this.offerW0 = p.loadout.slots[0].weapon;
    this.offerW1 = p.loadout.slots[1]?.weapon ?? "";
    return this.offerView;
  }

  private offerGear = -1;
  private offerW0 = "";
  private offerW1 = "";

  /** Story 5.1: the shared rule, at once (between steps); the answer waits for `takeShopAnswer`. */
  upgradeWeapon(weapon: string): void {
    const r = upgradeWeapon(this.world, LOCAL_PLAYER_ID, weapon);
    this.shopAnswer = r.ok ? { kind: "upgrade", ok: true, weapon, slot: r.value.slot, level: r.value.level } : { kind: "upgrade", ok: false, weapon, error: r.error };
  }

  /** Story 5.11: the shared dispatcher, at once (between steps); the answer waits for `takeShopAnswer`. */
  buyItem(item: string): void {
    const r = buyItem(this.world, LOCAL_PLAYER_ID, item);
    this.shopAnswer = r.ok ? { kind: "item", ok: true, item } : { kind: "item", ok: false, item, error: r.error };
  }

  takeShopAnswer(): ShopAnswer | null {
    const a = this.shopAnswer;
    this.shopAnswer = null;
    return a;
  }

  /** Story 6.5: the solo server tick (the World steps here). */
  get serverTick(): number {
    return this.world.tick - 1 + this.alpha;
  }

  /** Story 6.5: the boss between its last two recorded positions (`world.boss.hist*`). */
  bossDrawPos(out: { x: number; y: number }): void {
    const b = this.world.boss;
    const rows = b.histTick.length;
    const prev = (this.world.tick - 1 + rows) % rows;
    const a = this.alpha;
    if (b.histTick[prev] === this.world.tick - 1) {
      out.x = (b.histX[prev] as number) + (b.x - (b.histX[prev] as number)) * a;
      out.y = (b.histY[prev] as number) + (b.y - (b.histY[prev] as number)) * a;
    } else {
      out.x = b.x;
      out.y = b.y;
    }
  }

  get alpha(): number {
    return this.accumulatorS / TICK_DT_S;
  }

  update(frameDtS: number): void {
    this.stats.lastUpdateSteps = 0;
    if (!(frameDtS > 0) || this.paused) return;
    this.accumulatorS += frameDtS;
    let steps = 0;
    while (this.accumulatorS >= TICK_DT_S && steps < MAX_CATCHUP_STEPS) {
      const throwing = this.latchedConsumable;
      setInput(this.world, LOCAL_PLAYER_ID, {
        ...this.input,
        seq: ++this.seq,
        swap: this.latchedSwap,
        consumable: throwing,
        aimX: throwing ? this.latchedThrowAimX : this.input.aimX,
        aimY: throwing ? this.latchedThrowAimY : this.input.aimY,
        fire: throwing ? this.latchedTapFire : this.input.fire,
      });
      this.latchedSwap = false; // consumed by exactly one step
      this.latchedConsumable = false;
      const t0 = performance.now();
      step(this.world, TICK_DT_S);
      this.stats.stepMs[steps] = performance.now() - t0;
      this.accumulatorS -= TICK_DT_S;
      steps++;
    }
    this.stats.lastUpdateSteps = steps;
    this.stats.totalSteps += steps;
    if (this.accumulatorS >= TICK_DT_S) {
      // Hit the catch-up cap: drop whole steps, keep the fraction so alpha stays in [0, 1).
      this.accumulatorS %= TICK_DT_S;
    }
  }

  clearEdges(): void {
    this.latchedSwap = false;
    this.latchedConsumable = false;
  }

  setLocalInput(input: PlayerInput): void {
    this.input = input;
    if (input.swap) this.latchedSwap = true;
    if (input.consumable) {
      this.latchedConsumable = true;
      this.latchedThrowAimX = input.aimX;
      this.latchedThrowAimY = input.aimY;
      this.latchedTapFire = input.fire;
    }
  }

  drainEvents(): readonly SimEvent[] {
    // Swap buffers instead of allocating a new array every frame.
    const out = this.events;
    this.events = this.drained;
    this.drained = out;
    this.events.length = 0;
    return out;
  }

  playerInfo(): PlayerInfo {
    return this.info;
  }

  dispose(): void {
    this.unsubscribe();
    this.events.length = 0;
    this.drained.length = 0;
  }
}
