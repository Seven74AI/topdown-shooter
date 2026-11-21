import { GameOver } from "./GameOver";
import { RotateOverlay } from "./RotateOverlay";
import { LoadoutPicker } from "../debug/LoadoutPicker";
import { TuningPanel } from "../debug/TuningPanel";
import { urlOptions } from "../debug/urlOptions";
import { StressResults } from "../debug/StressResults";

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App() {
  return (
    <>
      <GameOver />
      {urlOptions().tune && <TuningPanel />}
      {import.meta.env.DEV && <LoadoutPicker />}
      <StressResults />
      <RotateOverlay />
    </>
  );
}
