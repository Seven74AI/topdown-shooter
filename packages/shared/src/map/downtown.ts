import downtownTmj from "./data/downtown.tmj.json" with { type: "json" };
import { loadTiledMap } from "./loadTiledMap";

/**
 * Story 4.1: District 1, Downtown (GDD › District 1; FR54), parsed once at import from the sim's copy
 * of `tools/maps/downtown.tmj` (`npm run maps:sync` after a Tiled export; a test
 * fails when the two differ). The server, solo, the client's mirror World and its Predictor all use
 * this one frozen object, so prediction collides exactly like the server (brief line 2).
 */
export const DOWNTOWN_MAP = loadTiledMap(downtownTmj, "downtown");
