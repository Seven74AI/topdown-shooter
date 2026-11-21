import { useState } from "preact/hooks";
import { uiStore } from "../ui/uiState";
import { TUNING_KNOBS, getTuning, resetTuning, setTuning, tunedBalance, tuningText, type TuningValues } from "./tuning";

/**
 * `?tune=1` controls tuning panel for the Story 1.12 playtest (release-safe: it only changes control
 * and Machete feel values for this session). Apply restarts the run with the new values.
 */
export function TuningPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TuningValues>({ ...getTuning() });
  const [message, setMessage] = useState("");

  const apply = () => {
    const before = { ...getTuning() };
    setTuning(draft);
    try {
      tunedBalance(); // validate before restarting
    } catch (e) {
      setTuning(before);
      setMessage(`Invalid value: ${(e as Error).message.split("\n")[0]}`);
      return;
    }
    setMessage("Applied: new run started");
    uiStore.request("restart");
  };
  const copy = () => {
    const text = tuningText(draft);
    void navigator.clipboard?.writeText(text).then(
      () => setMessage("Copied"),
      () => setMessage(text),
    );
  };

  return (
    <div class="tune">
      <button type="button" class="tune__toggle" onClick={() => setOpen(!open)}>
        {open ? "Close tuning" : "Tune"}
      </button>
      {open && (
        <div class="tune__panel">
          {TUNING_KNOBS.map((k) => (
            <label class="tune__row">
              <span>{k.label}</span>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={draft[k.key]}
                onInput={(e) => setDraft({ ...draft, [k.key]: Number((e.target as HTMLInputElement).value) })}
              />
              <output>{draft[k.key]}</output>
            </label>
          ))}
          <div class="tune__actions">
            <button type="button" class="btn" onClick={apply}>
              Apply (new run)
            </button>
            <button type="button" class="btn" onClick={copy}>
              Copy values
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => {
                resetTuning();
                setDraft({ ...getTuning() });
                setMessage("Reset to defaults (Apply to use)");
              }}
            >
              Reset
            </button>
          </div>
          {message && <p class="tune__msg">{message}</p>}
        </div>
      )}
    </div>
  );
}
