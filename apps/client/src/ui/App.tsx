import { GameOver } from "./GameOver";
import { StartScreen } from "./StartScreen";
import { LobbyScreen } from "./LobbyScreen";
import { RotateOverlay } from "./RotateOverlay";
import { ServerNotice } from "./ServerNotice";
import { LoadoutPicker } from "../debug/LoadoutPicker";
import { TuningPanel } from "../debug/TuningPanel";
import { urlOptions } from "../debug/urlOptions";
import { StressResults } from "../debug/StressResults";

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App() {
  return (
    <>
      <StartScreen />
      <LobbyScreen />
      <GameOver />
      {urlOptions().tune && <TuningPanel />}
      {import.meta.env.DEV && <LoadoutPicker />}
      <StressResults />
      <ServerNotice />
      <RotateOverlay />
    </>
  );
}
