import { ResultsScreen } from "./ResultsScreen";
import { StartScreen } from "./StartScreen";
import { LobbyScreen } from "./LobbyScreen";
import { RotateOverlay } from "./RotateOverlay";
import { ServerNotice } from "./ServerNotice";
import { LoadoutPicker } from "../debug/LoadoutPicker";
import { TuningPanel } from "../debug/TuningPanel";
import { urlOptions } from "../debug/urlOptions";
import { StressResults } from "../debug/StressResults";

export interface AppProps {
  /** Code from a share link `/j/<code>` (Story 2.3), prefilled on the start screen. */
  joinCode?: string | null;
}

/** Root of the Preact overlay (#ui). Screens decide their own visibility. */
export function App({ joinCode = null }: AppProps) {
  return (
    <>
      <StartScreen joinCode={joinCode} />
      <LobbyScreen />
      <ResultsScreen />
      {urlOptions().tune && <TuningPanel />}
      {import.meta.env.DEV && <LoadoutPicker />}
      <StressResults />
      <ServerNotice />
      <RotateOverlay />
    </>
  );
}
