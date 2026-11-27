/**
 * Story 8.4 AC 4 (brief 2): every key of the World and of the run's state records is SAVED or EXCLUDED WITH A REASON.
 * A new field in any of them fails this test until it is classified here (and, if saved by a custom path in
 * `runSave.ts` / `restore.ts`, wired there). This replaces epics.md › Epic 8's "rule for every later epic".
 */
import { describe, expect, it } from "vitest";
import { WORLD_SAVE_PLAN } from "./runSave";
import { playToBuild } from "./saveFixtures";

const S = "saved";
/** Records saved whole (`toPlain` / `hydrate`): each key is "saved" unless a reason says otherwise. */
const PLANS: Record<string, Record<string, string>> = {
  PlayerState: Object.fromEntries(
    ["id", "x", "y", "prevX", "prevY", "facingX", "facingY", "hp", "maxHp", "radiusM", "status", "loadout", "shotAdvanceS", "rewindMaxTicks", "weaponsPaused", "downedTicksLeft", "reviveTicks", "reviverId", "reviveNeedTicks", "buildReady", "wallet", "earned", "vote", "earnedAtEvac", "slowTicksLeft", "fireTicks", "acidTicks", "slowPct", "knockTicks", "knockDx", "knockDy", "knockStepMm", "flameSlot", "flaming", "flameClock", "gear", "consumable", "consumableCount", "consumableCooldownTicks", "lastAimX", "lastAimY", "lastAimM", "lastAimTicks", "protectTicks", "protectedReturnWave", "wavesIn", "endlessWavesIn", "bossesIn", "endlessBossesIn", "unlocks", "lockedUsed", "trainHp", "trainDmg", "trainMoney", "trainReload", "waveMask", "kills", "revives", "downs10", "barricades", "barricadesPending", "downedBy", "weaponsBought"].map((k) => [k, S]),
  ),
  Building: Object.fromEntries(["id", "type", "ownerId", "gx", "gy", "rot", "hp", "maxHp", "solid", "stopsBullets", "minX", "minY", "maxX", "maxY", "fireCooldownS", "fireTicks", "aimX", "aimY", "trapState", "heldZombie", "heldGen", "rearmTicks", "rearmPlayer", "paid", "paidThisBuild", "usedThisBuild"].map((k) => [k, S])),
  RunState: Object.fromEntries(["phase", "buildTicksLeft", "voteTicksLeft", "ending", "endless", "endlessEvent", "lastEndlessEvent", "joinExtendedBuild", "joinPending"].map((k) => [k, S])),
  BossState: Object.fromEntries(["state", "x", "y", "facing", "hp", "maxHp", "number", "look", "wave", "stateTicks", "gapTicks", "cooldown", "targetId", "lastSwitchTick", "threat", "threatHead", "attack", "entry", "enraged", "crawlerTicks", "trampleId", "trampleGen", "pushing", "fieldChecked", "farX", "farY", "farSinceTick", "histX", "histY", "histTick", "hitAcc", "hitWeapon", "flameClock"].map((k) => [k, S])),
  SpecialEventState: Object.fromEntries(["scheduled", "schedule", "count", "done", "extra", "extraDone", "active", "carAlarm", "stampede", "gasLeak", "supplyDrop", "survivor", "log"].map((k) => [k, S])),
  ShopOffers: Object.fromEntries(["build", "rev", "cards", "sold", "borrowed", "lender", "teamMasks", "present"].map((k) => [k, S])),
  WaveState: Object.fromEntries(["number", "size", "queued", "remaining", "spawnTimerTicks", "rushing", "spitterStallSinceTick", "paused", "typeTarget", "typeSpawned", "fixedTarget", "fixedSpawned", "fixedAtList", "fixedServed", "fixedTotal", "brutesSpawned", "hpMult", "fixedFormula", "fixedFromSpawn", "fixedToSpawn", "brutesMaxAlive", "recentSpawns", "recentSpawnCount", "recentSpawnHead", "spawnHeldSinceTick"].map((k) => [k, S])),
  LootState: Object.fromEntries(["plan", "salt", "killIndex", "killed", "counting", "state", "x", "y", "dropTick", "untilTick", "variant", "foundBy", "foundWave", "banked"].map((k) => [k, S])),
  SeedStreams: Object.fromEntries(["decay", "events", "spawns", "combat", "loot", "shop"].map((k) => [k, "saved: RNG state (getState → createRngFromState)"])),
  DecayState: {
    stage: S,
    variants: S,
    firesOut: S,
    fireEndWave: S,
    burnTicks: S,
    fires: "derived: applyDecayStage(stage, variants, firesOut) picks the burning fireSlots",
    fireSlots: "excluded: static, from the map",
  },
  LightState: {
    blackoutPct: S,
    halfDark: S,
    powerFailure: S,
    forcedPct: S,
    list: "derived: updateLightState (buildings + fires)",
    pool: "excluded: entry objects reused by the list",
    buildingsVersion: "derived: the list's rebuild key",
    firesKey: "derived: the list's rebuild key",
    firesCount: "derived: the list's rebuild key",
    rebuilds: "excluded: a test counter",
  },
};

describe("Story 8.4 AC 4: every saved record's fields are classified", () => {
  const { world } = playToBuild({ players: 1, waves: 1, buildings: 1 });
  const live: Record<string, object> = {
    PlayerState: world.players.get("p0")!,
    Building: world.buildings.list[0]!,
    RunState: world.run,
    BossState: world.boss,
    SpecialEventState: world.special,
    ShopOffers: world.shop,
    WaveState: world.waves,
    LootState: world.loot,
    SeedStreams: world.streams,
    DecayState: world.decay,
    LightState: world.lights,
  };

  it("World: every key is saved, derived, a counter or excluded with a reason", () => {
    expect(Object.keys(world).sort()).toEqual(Object.keys(WORLD_SAVE_PLAN).sort());
    for (const [k, why] of Object.entries(WORLD_SAVE_PLAN)) expect(why, k).toMatch(/^(saved|derived|counter|excluded): ?|^saved$/);
  });

  for (const name of Object.keys(PLANS)) {
    it(`${name}: no unclassified field (add it to PLANS and to the save, or exclude it with a reason)`, () => {
      expect(Object.keys(live[name] as object).sort()).toEqual(Object.keys(PLANS[name] as object).sort());
      for (const why of Object.values(PLANS[name] as object)) expect(why).toMatch(/^(saved|derived|excluded)/);
    });
  }
});
