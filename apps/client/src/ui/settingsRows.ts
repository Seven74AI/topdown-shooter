import type { PlayerSettingKey, PlayerSettings } from "@topdown/shared";

/**
 * Story 10.1 (AC 1, 3; decisions 10.1-B2, B16–B18): the rows of the Settings panel, top to bottom, one place for
 * wording. Stories 9.5 (gore), 9.6 (film grain) and 9.8 (music) add their row here; their fields already exist in the
 * shared schema (stored, synced) and are NOT listed until then (B2). Blackout darkness and the 10 m fog vision limit
 * have no row (AC 2).
 */
export type SettingsRow =
  | { readonly kind: "switch"; readonly key: Extract<PlayerSettingKey, "aimAssist" | "screenShake" | "haptics" | "alwaysFullSpeed" | "showPerformance" | "batterySaver">; readonly label: string; readonly hint?: string; readonly needsVibrate?: boolean }
  | { readonly kind: "choice"; readonly key: "resolution" | "rain" | "fog" | "glow"; readonly label: string; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly hint?: string }
  | { readonly kind: "volume"; readonly key: "sfxVolume" | "ambienceVolume"; readonly label: string };

export interface SettingsGroup {
  readonly id: "controls" | "screen" | "sound";
  readonly title: string;
  readonly rows: readonly SettingsRow[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = Object.freeze([
  {
    id: "controls",
    title: "Controls",
    rows: [
      { kind: "switch", key: "aimAssist", label: "Aim assist", hint: "Touch aim bends toward a zombie it would miss" },
      { kind: "switch", key: "alwaysFullSpeed", label: "Always full speed", hint: "Any push on the move stick runs at full speed" },
      { kind: "switch", key: "haptics", label: "Vibration", hint: "A short buzz when you place a building", needsVibrate: true },
    ],
  },
  {
    id: "screen",
    title: "Screen",
    rows: [
      { kind: "switch", key: "screenShake", label: "Screen shake" },
      // Story 10.2-Q2 A: the canvas resolution (2× / 1.5× / 1× device px), the biggest frame-rate lever
      { kind: "choice", key: "resolution", label: "Resolution", options: [{ value: "sharp", label: "Sharp" }, { value: "balanced", label: "Balanced" }, { value: "fast", label: "Fast" }], hint: "Fast is smoother on slower phones" },
      // Story 10.3-Q1 A: the biggest battery lever (half the frames drawn); off by default
      { kind: "switch", key: "batterySaver", label: "Battery saver", hint: "Draws 30 frames a second instead of 60" },
      { kind: "choice", key: "rain", label: "Rain", options: [{ value: "full", label: "Full" }, { value: "light", label: "Light" }, { value: "off", label: "Off" }] },
      { kind: "choice", key: "fog", label: "Fog detail", options: [{ value: "full", label: "Full" }, { value: "plain", label: "Plain" }], hint: "The fog still hides what it hides" },
      { kind: "choice", key: "glow", label: "Light glow", options: [{ value: "full", label: "Full" }, { value: "low", label: "Low" }, { value: "off", label: "Off" }] },
      { kind: "switch", key: "showPerformance", label: "Show performance", hint: "Frame rate and network numbers, top right" },
    ],
  },
  {
    id: "sound",
    title: "Sound",
    rows: [
      { kind: "volume", key: "sfxVolume", label: "Effects volume" },
      { kind: "volume", key: "ambienceVolume", label: "Ambience volume" },
    ],
  },
]);

/** B18: rows shown on this phone (Vibration only where a web page can vibrate). */
export function visibleRows(group: SettingsGroup, canVibrate: boolean): SettingsRow[] {
  return group.rows.filter((r) => r.kind !== "switch" || !r.needsVibrate || canVibrate);
}

/** Every settings key a row shows (tests: the hidden fields of B2 are not among them). */
export function shownKeys(): PlayerSettingKey[] {
  return SETTINGS_GROUPS.flatMap((g) => g.rows.map((r) => r.key));
}

/** The value a row shows. */
export const rowValue = (s: PlayerSettings, key: PlayerSettingKey): PlayerSettings[PlayerSettingKey] => s[key];

export const SETTINGS_TEXT = {
  title: "Settings",
  back: "Back",
  inRunDeleteNote: "Delete my progress is on the start screen",
  progressGroup: "Progress",
  /** Story 10.6 (Q2 B): the Report a problem row, above Delete my progress. */
  helpGroup: "Help",
  deleteButton: "Delete my progress",
  deleteHint: "Start over as a new player on this phone",
  confirmTitle: "Delete my progress?",
  /** AC 7: names what goes. */
  confirmGoes: ["Supplies", "Unlocks", "Training", "Your survivor's look", "Saved games"] as readonly string[],
  confirmAccount: (username: string) => `The account ${username} (username and password)`,
  confirmFooter: "This can't be undone.",
  password: "Password",
  confirm: "Delete everything",
  deleting: "Deleting…",
  cancel: "Cancel",
} as const;
