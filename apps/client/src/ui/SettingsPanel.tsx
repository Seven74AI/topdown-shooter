import { useEffect, useState } from "preact/hooks";
import type { PlayerSettings, StoredPlayerSettings } from "@topdown/shared";
import { getSettings, subscribeSettings } from "../settings/settings";
import { changeSettings } from "../net/settingsSync";
import { SETTINGS_GROUPS, visibleRows, type SettingsRow } from "./settingsRows";

const canVibrate = (): boolean => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/**
 * Story 10.1 (AC 1, 4; B16, B17): the settings groups, shared by the start-screen Settings screen and the ☰ in-run
 * Settings view. Every change goes through `changeSettings` (stored at once, applied at once, synced when logged in).
 * Switches are the LF5 switch rows, 2–3 choices a segmented row of 44 px buttons, volumes a 44 px range input.
 */
export function SettingsPanel({ idPrefix }: { idPrefix: string }) {
  const [s, setS] = useState<PlayerSettings>(getSettings());
  useEffect(() => subscribeSettings(setS), []);
  const vibrate = canVibrate();
  return (
    <div class="st-groups" data-testid="settings-panel">
      {SETTINGS_GROUPS.map((g) => (
        <section key={g.id} class="st-group" aria-labelledby={`${idPrefix}-${g.id}`}>
          <h2 id={`${idPrefix}-${g.id}`} class="st-group__title">
            {g.title}
          </h2>
          {visibleRows(g, vibrate).map((r) => (
            <Row key={r.key} row={r} s={s} idPrefix={idPrefix} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Row({ row, s, idPrefix }: { row: SettingsRow; s: PlayerSettings; idPrefix: string }) {
  const id = `${idPrefix}-${row.key}`;
  const set = (patch: StoredPlayerSettings) => changeSettings(patch);
  if (row.kind === "switch") {
    const on = s[row.key];
    return (
      <div class="st-row">
        <button type="button" role="switch" aria-checked={on} class="in-run-menu__switch st-switch" data-testid={`setting-${row.key}`} aria-describedby={row.hint ? `${id}-hint` : undefined} onClick={() => set({ [row.key]: !on })}>
          <span class="in-run-menu__switch-label">{row.label}</span>
          <span class="in-run-menu__switch-track" aria-hidden="true">
            <span class="in-run-menu__switch-thumb" />
          </span>
        </button>
        {row.hint && (
          <p id={`${id}-hint`} class="st-hint">
            {row.hint}
          </p>
        )}
      </div>
    );
  }
  if (row.kind === "choice") {
    const value = s[row.key];
    return (
      <div class="st-row">
        <div class="st-choice" role="group" aria-labelledby={`${id}-label`}>
          <span id={`${id}-label`} class="st-label">
            {row.label}
          </span>
          <span class="st-seg">
            {row.options.map((o) => (
              <button key={o.value} type="button" class="st-seg__btn" aria-pressed={value === o.value} data-testid={`setting-${row.key}-${o.value}`} onClick={() => set({ [row.key]: o.value } as StoredPlayerSettings)}>
                {o.label}
              </button>
            ))}
          </span>
        </div>
        {row.hint && <p class="st-hint">{row.hint}</p>}
      </div>
    );
  }
  const v = s[row.key];
  return (
    <div class="st-row">
      <label class="st-volume" for={id}>
        <span class="st-label">{row.label}</span>
        <input
          id={id}
          class="st-range"
          type="range"
          min={0}
          max={100}
          step={5}
          value={v}
          data-testid={`setting-${row.key}`}
          onInput={(e) => set({ [row.key]: Number((e.currentTarget as HTMLInputElement).value) })}
        />
        <span class="st-volume__n" aria-hidden="true">
          {v}
        </span>
      </label>
    </div>
  );
}
