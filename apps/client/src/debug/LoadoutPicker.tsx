import { useEffect, useState } from "preact/hooks";
import { uiStore, type UiScreen } from "../ui/uiState";

const label = (id: string) => id.replace(/_/g, " ").toUpperCase();

/**
 * Dev loadout picker (Story 1.8, temporary until the shop in Story 3.3): pick exactly two weapons
 * from balance, then Start. Shown only in development builds.
 */
export function LoadoutPicker() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => uiStore.subscribe((s) => {
    setScreen(s);
    if (s.kind === "loadoutPicker") setPicked([]);
  }), []);
  if (screen.kind !== "loadoutPicker") return null;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((w) => w !== id) : p.length < 2 ? [...p, id] : [p[1] as string, id]));

  return (
    <div class="picker" role="dialog" aria-labelledby="picker-title">
      <h2 id="picker-title">Dev loadout: pick 2 weapons</h2>
      <div class="picker__chips">
        {screen.weapons.map((id) => (
          <button type="button" class={`chip${picked.includes(id) ? " chip--on" : ""}`} onClick={() => toggle(id)}>
            {picked.includes(id) ? `${picked.indexOf(id) + 1}. ` : ""}
            {label(id)}
          </button>
        ))}
      </div>
      <button
        type="button"
        class="btn"
        disabled={picked.length !== 2}
        onClick={() => uiStore.request("startRun", [picked[0] as string, picked[1] ?? null])}
      >
        Start
      </button>
    </div>
  );
}
