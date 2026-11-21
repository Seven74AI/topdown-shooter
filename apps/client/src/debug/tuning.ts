import { bundledBalanceFiles, loadBalance, withOverrides, type Balance, type BalanceOverride } from "@topdown/shared";
import { STICK_RADIUS_CSS_PX } from "../input/TouchSticks";

/**
 * Live tuning for the Story 1.12 controls playtest (`?tune=1`, release-safe). Values live for this
 * page session only (a reload resets them); "Copy values" exports them for the playtest doc.
 * Balance values go through `withOverrides` + `loadBalance`, so the simulation still reads one
 * validated Balance; the stick radius is a client constant.
 */
export interface TuningValues {
  moveDeadZone: number;
  aimDeadZone: number;
  aimAssistDeg: number;
  macheteArcDeg: number;
  macheteRangeM: number;
  machetePushbackM: number;
  stickRadiusCssPx: number;
}

export interface TuningKnob {
  key: keyof TuningValues;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const TUNING_KNOBS: readonly TuningKnob[] = [
  { key: "moveDeadZone", label: "Move dead zone", min: 0, max: 0.4, step: 0.01 },
  { key: "aimDeadZone", label: "Aim dead zone (fire)", min: 0.05, max: 0.7, step: 0.01 },
  { key: "aimAssistDeg", label: "Aim assist (°)", min: 0, max: 20, step: 0.5 },
  { key: "macheteArcDeg", label: "Machete arc (°)", min: 60, max: 180, step: 5 },
  { key: "macheteRangeM", label: "Machete reach (m)", min: 1, max: 3, step: 0.1 },
  { key: "machetePushbackM", label: "Machete pushback (m)", min: 0, max: 1, step: 0.05 },
  { key: "stickRadiusCssPx", label: "Stick radius (px)", min: 40, max: 100, step: 2 },
];

function defaults(): TuningValues {
  const b = loadBalance();
  const m = b.weapons.machete;
  const melee = m && m.kind === "melee" ? m : null;
  return {
    moveDeadZone: b.controls.moveDeadZone,
    aimDeadZone: b.controls.aimDeadZone,
    aimAssistDeg: b.controls.aimAssistDeg,
    macheteArcDeg: melee?.arcDeg ?? 110,
    macheteRangeM: melee?.rangeM ?? 1.8,
    machetePushbackM: melee?.hitPushbackM ?? 0.25,
    stickRadiusCssPx: STICK_RADIUS_CSS_PX,
  };
}

let values: TuningValues | null = null;

export function getTuning(): TuningValues {
  values ??= defaults();
  return values;
}

export function setTuning(patch: Partial<TuningValues>): void {
  values = { ...getTuning(), ...patch };
}

export function resetTuning(): void {
  values = defaults();
}

export function tuningOverrides(v: TuningValues): BalanceOverride[] {
  return [
    ["controls", "moveDeadZone", v.moveDeadZone],
    ["controls", "aimDeadZone", v.aimDeadZone],
    ["controls", "aimAssistDeg", v.aimAssistDeg],
    ["weapons", "machete.arcDeg", v.macheteArcDeg],
    ["weapons", "machete.rangeM", v.macheteRangeM],
    ["weapons", "machete.hitPushbackM", v.machetePushbackM],
  ];
}

/** Balance with the current tuning applied (throws BalanceError on an invalid value). */
export function tunedBalance(): Balance {
  return loadBalance(withOverrides(bundledBalanceFiles(), tuningOverrides(getTuning())));
}

/** Text for the playtest doc ("Copy values"). */
export function tuningText(v: TuningValues): string {
  return TUNING_KNOBS.map((k) => `${k.label}: ${v[k.key]}`).join("\n");
}
