import { PROGRESSION, type ProgressView } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import {
  CONFIRM_MS,
  HUB_TABS,
  HUB_TAB_SLOTS,
  HUB_TEXT,
  IDLE,
  PH_BTN_H,
  PH_TEXT_PX,
  answerUnlock,
  expireConfirm,
  hubSections,
  layoutHub,
  notEnoughText,
  refreshAfterFailureMs,
  rowAction,
  suppliesText,
  tapUnlock,
  type BuyState,
  type Box,
  type HubRow,
} from "./hubModel";

const fresh: ProgressView = { supplies: 340, lifetimeSupplies: 340, unlocks: [] };
const rowsOf = (p: ProgressView | null) => hubSections(p).flatMap((s) => s.rows);
const row = (p: ProgressView | null, key: string) => rowsOf(p).find((r) => r.key === key) as HubRow;
let n = 0;
const ids = () => `req-${++n}`;

describe("Story 7.3 AC 6–7: the Unlocks tab content", () => {
  it("U1: the header line; Unlocks + Training (Story 7.5) in a bar built for three", () => {
    expect(HUB_TEXT.rule).toBe("Unlocks add cards to your shop, not power");
    expect(HUB_TABS.map((t) => t.id)).toEqual(["unlocks", "training", "survivor"]); // 7.5 Training, 7.10 Survivor
    expect(HUB_TAB_SLOTS).toBe(3);
  });

  it("four sections in order; 13 starter rows (Unlocked · Starter) + 14 unlock rows", () => {
    const secs = hubSections(fresh);
    expect(secs.map((s) => s.label)).toEqual(["Weapons", "Buildings", "Gear", "Consumables"]);
    const rows = secs.flatMap((s) => s.rows);
    expect(rows.filter((r) => r.starter).length).toBe(13);
    expect(rows.filter((r) => r.starter).every((r) => r.state === "owned")).toBe(true);
    expect(rows.filter((r) => !r.starter).length).toBe(14);
    expect(row(fresh, "starter:pistol")).toMatchObject({ name: "Pistol", line: "Your sidearm: never runs dry", starter: true });
    expect(row(fresh, "barricade_upgrades")).toMatchObject({ name: "Barricade upgrades", iconItem: "reinforced_barricade", price: 150 });
    expect(row(fresh, "body_armor_2").name).toBe("Body armor II");
  });

  it("U2: every locked item I can afford is 'buy' (any order); too dear is 'short' with how many more", () => {
    const rows = rowsOf(fresh).filter((r) => !r.starter);
    for (const r of rows) expect(r.state).toBe(r.price <= 340 ? "buy" : "short");
    expect(row(fresh, "flamethrower")).toMatchObject({ state: "short", need: 60 });
    expect(rowAction(row(fresh, "flamethrower"), IDLE, false)).toEqual({ kind: "short", price: 400, text: "Not enough Supplies · need 60 more" });
    expect(notEnoughText(1234)).toBe("Not enough Supplies · need 1,234 more");
  });

  it("locked first (cheapest first, list order on ties), then bought, then starter", () => {
    const p = { ...fresh, unlocks: ["assault_rifle", "mine"] };
    const weapons = hubSections(p)[0]!.rows.map((r) => r.key);
    expect(weapons).toEqual(["chainsaw", "gas_torch", "flamethrower", "grenade_launcher", "assault_rifle", ...PROGRESSION.starterPool.filter((i) => ["pistol", "machete", "fire_axe", "shotgun", "smg", "hunting_rifle"].includes(i)).map((i) => `starter:${i}`)]);
    const buildings = hubSections(p)[1]!.rows.map((r) => r.key);
    expect(buildings.slice(0, 5)).toEqual(["spike_trap", "bear_trap", "floodlight", "barricade_upgrades", "med_station"]);
    expect(buildings[5]).toBe("mine");
    expect(row(p, "assault_rifle").state).toBe("owned");
    expect(rowAction(row(p, "assault_rifle"), IDLE, false)).toEqual({ kind: "owned", starter: false });
    expect(rowAction(row(p, "starter:pistol"), IDLE, false)).toEqual({ kind: "owned", starter: true });
  });

  it("AC 3: the Good next pick tag is on the Spike trap for a new player, on one row only", () => {
    const picks = rowsOf(fresh).filter((r) => r.goodPick);
    expect(picks.map((r) => r.key)).toEqual(["spike_trap"]);
    expect(rowsOf(null).filter((r) => r.goodPick)).toEqual([]);
  });

  it("U5: Supplies come from the given (server) progress; '–' before any is known", () => {
    expect(suppliesText({ ...fresh, supplies: 1240 })).toBe("1,240");
    expect(suppliesText(null)).toBe("–");
  });
});

describe("Story 7.3 (decision 7.3 D3; U3): Unlock → Confirm 300 (3 s) → spinner", () => {
  const spike = () => row(fresh, "spike_trap");

  it("the first tap doesn't send; it shows 'Confirm 100 · Tap again · 3 s'", () => {
    const r = tapUnlock(IDLE, "spike_trap", 1000, ids, false);
    expect(r.send).toBeNull();
    expect(r.state.step).toEqual({ kind: "confirm", unlockId: "spike_trap", untilMs: 1000 + CONFIRM_MS });
    expect(rowAction(spike(), r.state, false)).toEqual({ kind: "confirm", label: "Confirm 100", sub: "Tap again · 3 s" });
  });

  it("the second tap within 3 s sends once with a fresh request id; then a spinner and every tap is ignored", () => {
    const a = tapUnlock(IDLE, "spike_trap", 0, ids, false);
    const b = tapUnlock(a.state, "spike_trap", CONFIRM_MS - 1, ids, false);
    expect(b.send?.unlockId).toBe("spike_trap");
    expect(b.state.step.kind).toBe("sending");
    expect(rowAction(spike(), b.state, false)).toEqual({ kind: "sending" });
    const c = tapUnlock(b.state, "spike_trap", CONFIRM_MS, ids, false);
    expect(c.send).toBeNull();
    expect(c.state).toBe(b.state);
    // another row's button is disabled meanwhile
    expect(rowAction(row(fresh, "bear_trap"), b.state, false)).toMatchObject({ kind: "buy", disabled: true });
    expect(tapUnlock(b.state, "bear_trap", 10, ids, false).send).toBeNull();
  });

  it("a fine time sweep (1 ms): the confirm step sends before 3,000 ms and times out at 3,000 ms exactly", () => {
    for (let t = 0; t <= CONFIRM_MS + 5; t++) {
      const a = tapUnlock(IDLE, "mine", 0, ids, false);
      const expired = expireConfirm(a.state, t);
      expect(expired.step.kind).toBe(t >= CONFIRM_MS ? "idle" : "confirm");
      const second = tapUnlock(a.state, "mine", t, ids, false);
      expect(second.send !== null).toBe(t < CONFIRM_MS);
    }
  });

  it("a tap on another row moves the confirm there (nothing sent)", () => {
    const a = tapUnlock(IDLE, "mine", 0, ids, false);
    const b = tapUnlock(a.state, "bear_trap", 100, ids, false);
    expect(b.send).toBeNull();
    expect(b.state.step).toMatchObject({ kind: "confirm", unlockId: "bear_trap" });
  });

  it("AC 8: offline, taps do nothing and the button is disabled", () => {
    expect(tapUnlock(IDLE, "mine", 0, ids, true)).toEqual({ state: IDLE, send: null });
    expect(rowAction(row(fresh, "mine"), IDLE, true)).toMatchObject({ kind: "buy", disabled: true });
  });

  it("answers: ok/not_enough/already show the SERVER's progress; a stale answer is ignored; failures say so", () => {
    const sending: BuyState = { step: { kind: "sending", unlockId: "mine", requestId: "r1" }, note: null };
    const prog = { supplies: 240, lifetimeSupplies: 340, unlocks: ["mine"] };
    expect(answerUnlock(sending, "r1", { kind: "answer", body: { ok: true, unlockId: "mine", progress: prog } })).toEqual({ state: IDLE, progress: prog, offline: false });
    const short = answerUnlock(sending, "r1", { kind: "answer", body: { ok: false, unlockId: "mine", reason: "not_enough", need: 60, progress: { ...prog, supplies: 40, unlocks: [] } } });
    expect(short.state.note).toEqual({ unlockId: "mine", text: "Not enough Supplies · need 60 more" });
    expect(short.progress?.supplies).toBe(40);
    const already = answerUnlock(sending, "r1", { kind: "answer", body: { ok: false, unlockId: "mine", reason: "already_unlocked", progress: prog } });
    expect(already).toEqual({ state: IDLE, progress: prog, offline: false });
    expect(answerUnlock(sending, "other", { kind: "answer", body: { ok: true, unlockId: "mine", progress: prog } })).toEqual({ state: sending, progress: null, offline: false });
    expect(answerUnlock(sending, "r1", { kind: "failed", status: 0 })).toEqual({ state: { step: { kind: "idle" }, note: { unlockId: "mine", text: HUB_TEXT.failed } }, progress: null, offline: true });
    expect(answerUnlock(sending, "r1", { kind: "failed", status: 429 }).state.note?.text).toBe(HUB_TEXT.rateLimited);
    expect(answerUnlock(sending, "r1", { kind: "failed", status: 503 }).offline).toBe(true);
  });
});

describe("Story 7.3 (R9): the hub layout at 568×320, 640×360, 800×360, 844×390 with insets 44/21", () => {
  const SIZES = [
    [568, 320],
    [640, 360],
    [800, 360],
    [844, 390],
  ] as const;
  const INSET = { left: 44, right: 44, bottom: 21 };
  const E = 1e-6;
  const inside = (b: Box, w: number, h: number) => b.x >= INSET.left - E && b.x + b.w <= w - INSET.right + E && b.y >= 0 && b.y + b.h <= h - INSET.bottom + E;
  const contains = (o: Box, i: Box) => i.x >= o.x - E && i.y >= o.y - E && i.x + i.w <= o.x + o.w + E && i.y + i.h <= o.y + o.h + E;
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - E && b.x < a.x + a.w - E && a.y < b.y + b.h - E && b.y < a.y + a.h - E;

  const check = (w: number, h: number) => {
    const l = layoutHub(w, h, INSET);
    const parts = [l.back, l.title, l.supplies, l.rule, ...l.tabs, l.list];
    for (const b of parts) expect(inside(b, w, h)).toBe(true);
    for (const b of parts) expect(contains(l.frame, b)).toBe(true);
    const disjoint = [l.back, l.title, l.supplies, l.rule, ...l.tabs, l.list];
    for (let i = 0; i < disjoint.length; i++) for (let j = i + 1; j < disjoint.length; j++) expect(overlaps(disjoint[i]!, disjoint[j]!)).toBe(false);
    // tap targets ≥ 44
    for (const b of [l.back, ...l.tabs, l.row.button]) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(44);
    // a row: icon, text, action side by side inside the list; the text keeps ≥ 140 px for name + line
    expect(contains(l.list, l.row.icon) && contains(l.list, l.row.text) && contains(l.list, l.row.action)).toBe(true);
    expect(overlaps(l.row.icon, l.row.text) || overlaps(l.row.text, l.row.action)).toBe(false);
    expect(contains(l.row.action, l.row.button)).toBe(true);
    expect(l.row.text.w).toBeGreaterThanOrEqual(140);
    // at least two whole rows visible under the tabs (the sheet shows ~3 at 568 × 320)
    expect(l.list.h - 16).toBeGreaterThanOrEqual(2 * 56);
    return l;
  };

  for (const [w, h] of SIZES) it(`${w}×${h}: inside the safe area, no overlaps, every tap target ≥ 44 px`, () => void check(w, h));

  it("a fine width sweep (1 px, 568 → 1400) keeps every rule; the frame is centred and capped at 760", () => {
    for (let w = 568; w <= 1400; w++) {
      const l = check(w, 320);
      expect(l.frame.w).toBeLessThanOrEqual(760 + E);
      expect(Math.abs(l.frame.x - (w - (l.frame.x + l.frame.w)))).toBeLessThan(1e-6);
    }
  });

  it("text ≥ 11 px everywhere; the button is 44 px", () => {
    expect(Math.min(...Object.values(PH_TEXT_PX))).toBeGreaterThanOrEqual(11);
    expect(PH_BTN_H).toBe(44);
  });
});

describe("re-review RR-L1: the refresh after a failed unlock waits out the route's worst case", () => {
  it("never sooner than UNLOCK_TIMEOUT_MS after the send (1 ms sweep), at once after it", () => {
    for (let now = 0; now <= 8000; now++) {
      const d = refreshAfterFailureMs(1000, 1000 + now);
      expect(1000 + now + d).toBeGreaterThanOrEqual(1000 + 7000);
      expect(d).toBe(Math.max(0, 7000 - now));
    }
  });
});
