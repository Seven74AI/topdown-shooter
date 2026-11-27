/**
 * Story 10.6 review N2: imported FIRST by `main.ts`, so the report log is installed before any other module of the game
 * is evaluated (ES modules run their imports in order): a console line or an error thrown while those modules load is
 * captured too.
 */
import { installClientLog } from "./clientLog";

installClientLog();
