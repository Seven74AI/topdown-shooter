import { GameOver } from "./GameOver";
import { RotateOverlay } from "./RotateOverlay";
import { LoadoutPicker } from "../debug/LoadoutPicker";
import { StressResults } from "../debug/StressResults";

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App() {
  return (
    <>
      <GameOver />
      {import.meta.env.DEV && <LoadoutPicker />}
      <StressResults />
      <RotateOverlay />
    </>
  );
}
