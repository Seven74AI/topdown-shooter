import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, EVENT_KINDS, EVENT_PHASE, NPC_STATE, addPlayer, createWorld, loadBalance, setLoadout, weaponIds, type SimEvent } from "@topdown/shared";
import { CRATE_ALREADY_HAVE, CRATE_CANCEL_UNTIL, NPC_PIN_LIFT_M, PIN_LIFT_M, GAS_LABEL, GAS_LABEL_ARMED, NPC_LABEL_FOLLOWING, NPC_LABEL_WAITING, cratePrompt, createEventCue, createEventMarkerLook, eventCue, eventMarkerLook } from "./eventMarkers";
import { mirrorSpecialEvent } from "../net/mirrorEvent";
import { fakeState } from "../net/fakeRoom";
import { eventSpecs, npcFrame } from "./city/eventArt";
import { packAtlas } from "./city/atlasLayout";

/** Stories 6.9 + 6.10 (AC 6–7; G1, G4, G5, G6, G7; S1; P1): the client side of the four events. */
const balance = loadBalance();
const mirror = () => createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { buildings: () => {} } });
const T = (s: number): number => Math.round(s * 20);

describe("Story 6.9: gas leak and supply drop markers (from the room state, server ticks)", () => {
  it("gas leak: the 6 m ring from the start, the countdown arc ending on the blast tick, the label turns at 3 s", () => {
    const w = mirror();
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("gas_leak"), eventPhase: EVENT_PHASE.HISS, eventStartTick: 500, eventPhaseTick: 500, eventX: 3400, eventY: 575 });
    mirrorSpecialEvent(w, s);
    const out = createEventMarkerLook();
    eventMarkerLook(w, 500, 20, 0, 24, 13.5, 1, out);
    expect(out).toMatchObject({ visible: true, icon: "flame", ringM: balance.events.gasLeak.radiusM, label: GAS_LABEL, x: 34, y: 5.75 - PIN_LIFT_M });
    expect(out.arc).toBeCloseTo(1, 9);
    eventMarkerLook(w, 500 + T(balance.events.gasLeak.armDelayS), 20, 0, 24, 13.5, 1, out);
    expect(out.label).toBe(GAS_LABEL_ARMED);
    eventMarkerLook(w, 500 + T(balance.events.gasLeak.hissS), 20, 0, 24, 13.5, 1, out);
    expect(out.arc).toBe(0); // G4: the fill ends exactly on the blast tick
  });

  it("supply drop: the weapon label from the flare (G5); the crate falls over the last 1.2 s; the fill ring from the claim ticks (G6)", () => {
    const w = mirror();
    const s = fakeState();
    const fl = weaponIds(balance).indexOf("flamethrower");
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("supply_drop"), eventPhase: EVENT_PHASE.FLARE, eventStartTick: 100, eventPhaseTick: 100, eventX: 1000, eventY: 2000, crateWeapon: fl, crateClaimSlot: 255, crateClaimTicks: 0 });
    mirrorSpecialEvent(w, s);
    const out = createEventMarkerLook();
    eventMarkerLook(w, 101, 0, 10, 24, 13.5, 1, out);
    expect(out).toMatchObject({ visible: true, icon: "gun", label: "FLAMETHROWER · II", crateFall: -1, crateDown: false, fill: -1 });
    eventMarkerLook(w, 100 + T(balance.events.supplyDrop.flareS) - T(0.6), 0, 10, 24, 13.5, 1, out);
    expect(out.crateFall).toBeCloseTo(0.5, 6);
    Object.assign(s, { eventPhase: EVENT_PHASE.LANDED, eventPhaseTick: 200, crateClaimSlot: 1, crateClaimTicks: 10 });
    mirrorSpecialEvent(w, s);
    eventMarkerLook(w, 210, 0, 10, 24, 13.5, 1, out);
    expect(out).toMatchObject({ crateDown: true, crateFall: -1 });
    expect(out.fill).toBeCloseTo(0.5, 6);
    // off screen: an edge arrow (white gun)
    eventMarkerLook(w, 210, 30, 0, 10, 8, 1, out);
    expect(out.edge.visible).toBe(true);
  });

  it("G7: the HUD line on the landed crate — 'Replaces your SMG III' with both slots full; 'You already have it' at ≥ II; nothing off it", () => {
    const w = mirror();
    const p = addPlayer(w, "p0", 10, 20);
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    p.loadout.active = 1;
    p.loadout.slots[1]!.level = 3;
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("supply_drop"), eventPhase: EVENT_PHASE.LANDED, eventPhaseTick: 200, eventX: 1000, eventY: 2000, crateWeapon: weaponIds(balance).indexOf("chainsaw") });
    mirrorSpecialEvent(w, s);
    expect(cratePrompt(w, "p0")).toBe("Replaces your SMG III · step off to cancel");
    // review L7: past 3/4 of the second the cancel promise drops (a step-off can't reach the server in time); the warning stays
    // re-review N1: the promise holds below 0.6 of the second (11 of 20 ticks), drops from 12 on
    Object.assign(s, { crateClaimSlot: 0, crateClaimTicks: 11 });
    mirrorSpecialEvent(w, s);
    expect(cratePrompt(w, "p0")).toBe("Replaces your SMG III · step off to cancel");
    Object.assign(s, { crateClaimSlot: 0, crateClaimTicks: 12 });
    mirrorSpecialEvent(w, s);
    expect(cratePrompt(w, "p0")).toBe("Replaces your SMG III");
    expect(CRATE_CANCEL_UNTIL).toBe(0.6);
    // review L8: a teammate holds the claim → nothing to lose here
    Object.assign(s, { crateClaimSlot: 1, crateClaimTicks: 5 });
    mirrorSpecialEvent(w, s);
    expect(cratePrompt(w, "p0")).toBe("");
    Object.assign(s, { crateClaimSlot: 255, crateClaimTicks: 0 });
    mirrorSpecialEvent(w, s);
    p.x = 11;
    expect(cratePrompt(w, "p0")).toBe("");
    p.x = 10;
    setLoadout(balance, p.loadout, ["pistol", "chainsaw"]);
    p.loadout.slots[1]!.level = 2;
    expect(cratePrompt(w, "p0")).toBe(CRATE_ALREADY_HAVE);
    setLoadout(balance, p.loadout, ["pistol", null]);
    expect(cratePrompt(w, "p0")).toBe(""); // the empty slot takes it: nothing to lose
  });

  it("cues: the banners and sounds per event; the crate's land / taken sounds; a woken tab's late start shows none", () => {
    const cue = createEventCue();
    const tr = (kind: "gas_leak" | "supply_drop" | "power_failure" | "survivor", ageS = 0): SimEvent => ({ type: "event.triggered", kind, wave: 6, x: 1, y: 2, startTick: 5, phase: 1, lane: -1, ageS });
    expect(eventCue(tr("gas_leak"), balance, cue)).toMatchObject({ banner: "GAS LEAK · get out of the ring", sound: "event_gas_hiss" });
    expect(eventCue(tr("supply_drop"), balance, cue)).toMatchObject({ banner: "SUPPLY DROP", sound: "event_flare_pop" });
    expect(eventCue(tr("power_failure"), balance, cue)).toMatchObject({ banner: "POWER FAILURE", sound: "event_power_down" });
    expect(eventCue(tr("survivor"), balance, cue)).toMatchObject({ banner: "SURVIVOR · lead them to the flag", sound: "event_survivor_help" });
    expect(eventCue(tr("survivor", 9), balance, cue)).toMatchObject({ banner: null, sound: null });
    const ph = (kind: "supply_drop" | "survivor", phase: number): SimEvent => ({ type: "event.phase_changed", kind, phase, tick: 9, playerId: null });
    expect(eventCue(ph("supply_drop", EVENT_PHASE.LANDED), balance, cue).sound).toBe("event_crate_land");
    expect(eventCue(ph("supply_drop", EVENT_PHASE.TAKEN), balance, cue).sound).toBe("event_crate_taken");
    expect(eventCue(ph("survivor", EVENT_PHASE.SAVED), balance, cue)).toMatchObject({ banner: "Survivor saved · +100", sound: "event_survivor_saved" });
    expect(eventCue({ type: "event.ended", kind: "survivor", outcome: "failed" }, balance, cue).banner).toBe("Survivor lost");
    expect(eventCue({ type: "event.ended", kind: "survivor", outcome: "done" }, balance, cue).banner).toBeNull();
  });
});

describe("Story 6.10: the survivor, its flag and the power failure's flicker", () => {
  it("S1: the NPC's pin follows the mirrored NPC; the white flag has its own edge arrow; labels by state", () => {
    const w = mirror();
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("survivor"), eventPhase: EVENT_PHASE.WAITING, eventPhaseTick: 10, eventX: 2600, eventY: 2100, npcX: 2600, npcY: 2100, npcHp: 50, npcState: NPC_STATE.WAITING, npcLook: 2, npcLeaderSlot: 255, safeX: 850, safeY: 1700 });
    mirrorSpecialEvent(w, s);
    expect(w.special.survivor).toMatchObject({ x: 26, y: 21, hp: 50, look: 2, leaderSlot: -1, safeX: 8.5, safeY: 17, status: "alive" });
    const out = createEventMarkerLook();
    eventMarkerLook(w, 20, 18, 14, 16, 9, 1, out);
    expect(out).toMatchObject({ visible: true, icon: "person", x: 26, crouch: true, label: NPC_LABEL_WAITING, leaderSlot: -1 });
    expect(out.y).toBeCloseTo(21 - NPC_PIN_LIFT_M, 9); // the pin floats over its head (never on the body)
    expect(out.flag).toMatchObject({ visible: true, x: 8.5, y: 17 });
    expect(out.flag.edge.visible).toBe(true); // the flag is off this view
    Object.assign(s, { npcState: NPC_STATE.FOLLOWING, npcLeaderSlot: 1, npcX: 2500 });
    mirrorSpecialEvent(w, s);
    eventMarkerLook(w, 30, 18, 14, 16, 9, 1, out);
    expect(out).toMatchObject({ crouch: false, label: NPC_LABEL_FOLLOWING, leaderSlot: 1, x: 25 });
    // over: the mirror drops it (no target, nothing drawn)
    Object.assign(s, { eventKind: 255 });
    mirrorSpecialEvent(w, s);
    expect(w.special.survivor.status).toBe("dead");
    expect(eventMarkerLook(w, 40, 18, 14, 16, 9, 1, out).visible).toBe(false);
  });

  it("P1: no marker for the power failure; the lamps flicker (0.15 s steps from the server's phase tick) only during FLICKER", () => {
    const w = mirror();
    const s = fakeState();
    Object.assign(s, { eventKind: EVENT_KINDS.indexOf("power_failure"), eventPhase: EVENT_PHASE.FLICKER, eventStartTick: 300, eventPhaseTick: 300, eventX: 2400, eventY: 1600 });
    mirrorSpecialEvent(w, s);
    const out = createEventMarkerLook();
    const seen = new Set<boolean>();
    for (let t = 300; t < 340; t++) {
      eventMarkerLook(w, t, 0, 0, 24, 13.5, 1, out);
      expect(out.visible).toBe(false);
      seen.add(out.flicker);
    }
    expect([...seen].sort()).toEqual([false, true]);
    Object.assign(s, { eventPhase: EVENT_PHASE.DARK, eventPhaseTick: 340 });
    mirrorSpecialEvent(w, s);
    for (let t = 340; t < 360; t++) expect(eventMarkerLook(w, t, 0, 0, 24, 13.5, 1, out).flicker).toBe(false);
  });

  it("the event atlas with the new frames still fits ≤ 2048² (brief 12); the NPC frames exist for every look and pose", () => {
    const layout = packAtlas(eventSpecs());
    expect(layout.width).toBeLessThanOrEqual(2048);
    expect(layout.height).toBeLessThanOrEqual(2048);
    const names = new Set(eventSpecs().map((f) => f.name));
    for (const look of [0, 1, 2]) for (const c of [false, true]) expect(names.has(npcFrame(look, c))).toBe(true);
  });
});
