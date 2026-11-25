/**
 * Stories 7.4 + 7.5 client models: the borrowed tag on the card view (K2, BT1), the build bar / consumables of my
 * unlocks (K5), Practice solo's pool and Training (D1, T2), the Results Train column (T4, TL3) and unlock line (K7),
 * the Training tab rows and its Train → Confirm → answer steps (AC 8), "Starting…" (AC 2), the dev URL switches.
 */
import { describe, expect, it } from "vitest";
import { ALL_UNLOCKED, PROGRESSION, STARTER_ONLY, loadBalance, unlockMask, type ProgressView, type RunRewards } from "@topdown/shared";
import { buildBarItems } from "../scenes/buildBar";
import { practiceInit, cachedProgress } from "../net/practicePool";
import { parseShopOffered } from "../net/session";
import { parseDevTraining, parseDevUnlocks, parseUrlOptions } from "../debug/urlOptions";
import { rewardsView, trainingCell, unlockHint } from "./rewardsModel";
import { IDLE, TRAIN_TEXT, answerTrain, boostEffect, tapUnlock, trainAction, trainingRows, HUB_TABS } from "./hubModel";
import { STARTING_MS, startButton } from "./startButton";
import { borrowedLabel, borrowedTag } from "./shopStore";

const balance = loadBalance();
const progress = (over: Partial<ProgressView> = {}): ProgressView => ({ supplies: 0, lifetimeSupplies: 0, unlocks: [], ...over });

describe("Story 7.4 K5: the build bar shows only my unlocked buildings", () => {
  it("starter = wood barricade + auto-turret; all = every shop building; cached per mask", () => {
    expect(buildBarItems(balance, STARTER_ONLY).map((t) => t.id)).toEqual(["wood_barricade", "auto_turret"]);
    expect(buildBarItems(balance, unlockMask(PROGRESSION, ["mine"])).map((t) => t.id)).toEqual(["wood_barricade", "auto_turret", "mine"]);
    expect(buildBarItems(balance).length).toBe(buildBarItems(balance, ALL_UNLOCKED).length);
    expect(buildBarItems(balance, STARTER_ONLY)).toBe(buildBarItems(balance, STARTER_ONLY));
  });
});

describe("Story 7.4 K2 (BT1): the borrowed card on the wire and its tag", () => {
  it("shop.offered carries borrowed / lender / lenderName; an older server's message reads as none", () => {
    const base = { build: 1, rev: 0, cards: ["smg", "chainsaw"], sold: 0, rerollPrice: 20, canReroll: true };
    expect(parseShopOffered({ ...base, borrowed: 2, lender: 1, lenderName: "Mo" })).toMatchObject({ borrowed: 2, lender: 1, lenderName: "Mo" });
    expect(parseShopOffered(base)).toMatchObject({ borrowed: 0, lender: 255, lenderName: "" });
    expect(parseShopOffered({ ...base, borrowed: 999, lender: -1, lenderName: 4 })).toMatchObject({ borrowed: 0, lender: 255, lenderName: "" });
    expect(borrowedTag("Mo")).toBe("From Mo");
    expect(borrowedLabel("Mo")).toBe("Borrowed from Mo");
  });
});

describe("Story 7.4 D1 / 7.5 T2: Practice solo starts from my cached progress", () => {
  const off = { unlocks: null, training: null, shopAll: false, startingWallet: null };
  it("cached unlocks and Training apply; none → starter and 0; ?unlocks / ?shopall / ?training override; ?wallet wins over start money", () => {
    const p = progress({ unlocks: ["chainsaw"], training: { max_hp: 3, damage: 1, start_money: 2, reload: 0 } });
    expect(practiceInit(off, p)).toEqual({ unlocks: unlockMask(PROGRESSION, ["chainsaw"]), training: { maxHp: 3, damage: 1, startMoney: 2, reload: 0 } });
    expect(practiceInit(off, null)).toEqual({ unlocks: STARTER_ONLY, training: { maxHp: 0, damage: 0, startMoney: 0, reload: 0 } });
    expect(practiceInit({ ...off, unlocks: "all" }, null).unlocks).toBe(ALL_UNLOCKED);
    expect(practiceInit({ ...off, shopAll: true }, p).unlocks).toBe(ALL_UNLOCKED);
    expect(practiceInit({ ...off, unlocks: "starter" }, p).unlocks).toBe(STARTER_ONLY);
    expect(practiceInit({ ...off, training: { maxHp: 5, damage: 5, startMoney: 5, reload: 5 } }, p).training.maxHp).toBe(5);
    expect(practiceInit({ ...off, startingWallet: 2000 }, p).training.startMoney).toBe(0);
  });

  it("the cache reader never throws (blocked storage, junk JSON) and reads a good copy", () => {
    expect(cachedProgress(() => null)).toBeNull();
    expect(cachedProgress(() => ({ getItem: () => "{nope" }))).toBeNull();
    expect(
      cachedProgress(() => ({
        getItem: () => {
          throw new Error("blocked");
        },
      })),
    ).toBeNull();
    expect(cachedProgress(() => ({ getItem: () => JSON.stringify(progress({ supplies: 5 })) }))?.supplies).toBe(5);
  });

  it("dev switches: ?unlocks=all|starter and ?training=a,b,c,d in dev builds only", () => {
    expect(parseDevUnlocks("ALL")).toBe("all");
    expect(parseDevUnlocks("x")).toBeNull();
    expect(parseDevTraining("5,5,5,5")).toEqual({ maxHp: 5, damage: 5, startMoney: 5, reload: 5 });
    expect(parseDevTraining("6,0,0,0")).toBeNull();
    expect(parseUrlOptions("?unlocks=starter&training=1,2,3,4", true)).toMatchObject({ unlocks: "starter", training: { maxHp: 1, damage: 2, startMoney: 3, reload: 4 } });
    expect(parseUrlOptions("?unlocks=starter&training=1,2,3,4", false)).toMatchObject({ unlocks: null, training: null });
  });
});

describe("Story 7.5 T4 (TL3): the Results Train column", () => {
  it("\"3/20\" with four bars; MAX at 20/20; absent = 0/20; the label spells the levels out", () => {
    const c = trainingCell({ maxHp: 3, damage: 2, startMoney: 5, reload: 0 });
    expect(c.text).toBe("10/20");
    expect(c.bars).toEqual([0.6, 0.4, 1, 0]);
    expect(c.label).toBe("Training · HP 3 · Damage 2 · Money 5 · Reload 0");
    expect(trainingCell({ maxHp: 5, damage: 5, startMoney: 5, reload: 5 })).toMatchObject({ text: "MAX", maxed: true });
    expect(trainingCell(undefined).text).toBe("0/20");
  });
});

describe("Story 7.4 K7: the Results unlock line (group 3)", () => {
  const msg = (over: Partial<RunRewards> = {}): RunRewards => ({
    runId: "00000000-0000-4000-8000-000000000000",
    seed: 9,
    status: "saved",
    lines: { waves: 10, boss: 0, extract: 0, endless: 0, endlessBoss: 0 },
    waveCount: 1,
    endlessWaveCount: 0,
    rookie: false,
    total: 10,
    newTotal: 10,
    ...over,
  });
  it("\"You used the Grenade Launcher: unlock it for 500\" when lockedUsed is set, saved or not; nothing otherwise or in practice", () => {
    const used = { unlockId: "grenade_launcher", name: "Grenade Launcher", price: 500 };
    expect(rewardsView(msg({ lockedUsed: used }), true, 9).unlockLine).toBe("You used the Grenade Launcher: unlock it for 500");
    expect(rewardsView(msg({ lockedUsed: used, status: "not_saved" }), true, 9).unlockLine).toBe(unlockHint("Grenade Launcher", 500));
    expect(rewardsView(msg(), true, 9).unlockLine).toBe("");
    expect(rewardsView(msg({ lockedUsed: null }), true, 9).unlockLine).toBe("");
    expect(rewardsView(msg({ lockedUsed: used }), false, 9).unlockLine).toBe("");
  });
});

describe("Story 7.5 AC 8 (TR1): the Training tab", () => {
  it("the hub's second tab is Training", () => {
    expect(HUB_TABS.map((t) => t.id)).toEqual(["unlocks", "training"]);
  });

  it("rows: Now / Next with the price, short with need, MAXED at 5 — all from the server's progress", () => {
    const rows = trainingRows(progress({ supplies: 120, training: { max_hp: 3, damage: 5, start_money: 0, reload: 1 } }));
    expect(rows.map((r) => [r.boost, r.level, r.now, r.next, r.price, r.state, r.need])).toEqual([
      ["max_hp", 3, "Now: +6 % max HP", "Next: +8 % max HP", 200, "short", 80],
      ["damage", 5, "Now: +5 % damage", "Maxed", 0, "maxed", 0],
      ["start_money", 0, TRAIN_TEXT.nothing, "Next: +$10 at the start", 50, "buy", 0],
      ["reload", 1, "Now: 1 % faster reload", "Next: 2 % faster reload", 100, "buy", 0],
    ]);
    expect(boostEffect("start_money", 5)).toBe("+$50 at the start");
  });

  it("Train → Confirm 50 (3 s) → sending; the answer shows the server's progress; not_enough leaves a note; a failure goes offline", () => {
    const row = trainingRows(progress({ supplies: 500 }))[2]!;
    expect(trainAction(row, IDLE, false)).toEqual({ kind: "buy", label: "Train", disabled: false });
    expect(trainAction(row, IDLE, true)).toMatchObject({ disabled: true });
    const t1 = tapUnlock(IDLE, row.key, 0, () => "id-1", false);
    expect(t1.send).toBeNull();
    expect(trainAction(row, t1.state, false)).toMatchObject({ kind: "confirm", label: "Confirm 50" });
    const t2 = tapUnlock(t1.state, row.key, 1000, () => "id-1", false);
    expect(t2.send).toEqual({ unlockId: row.key, requestId: "id-1" });
    expect(trainAction(row, t2.state, false)).toEqual({ kind: "sending" });
    const after = progress({ supplies: 450, training: { start_money: 1 } });
    const ok = answerTrain(t2.state, "id-1", { kind: "answer", body: { ok: true, boost: "start_money", level: 1, progress: after } });
    expect(ok.progress).toEqual(after);
    const short = answerTrain(t2.state, "id-1", { kind: "answer", body: { ok: false, boost: "start_money", reason: "not_enough", need: 20, progress: after } });
    expect(short.state.note?.text).toBe("Not enough Supplies · need 20 more");
    expect(answerTrain(t2.state, "id-1", { kind: "failed", status: 0 }).offline).toBe(true);
    expect(answerTrain(t2.state, "other", { kind: "failed", status: 0 }).progress).toBeNull(); // a stale answer is ignored
  });
});

describe("Stories 7.4/7.5 AC 2: \"Starting…\" while the server reads progress", () => {
  it("for STARTING_MS after the tap, then back to Start", () => {
    expect(startButton(null, 0)).toEqual({ label: "Start", starting: false });
    expect(startButton(100, 100 + STARTING_MS - 1)).toEqual({ label: "Starting…", starting: true });
    expect(startButton(100, 100 + STARTING_MS)).toEqual({ label: "Start", starting: false });
  });
});
