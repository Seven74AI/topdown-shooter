/**
 * Story 10.11 (AC 3, 8): the one lazy entry of the cheat panel. Its chunk is named `assets/admin-tools-<hash>.js`
 * (+ `.css`) by `apps/client/vite.config.ts`, so the entry chunk's import list names nothing cheat-like, and
 * `tools/checks/noCheatsInRelease.test.ts` can exempt exactly this chunk. A production build downloads it only for an
 * admin (`adminGate.ts`); a dev build at boot (main.ts).
 */
export { mountDevCheats as mountAdminTools, type CheatPanelHandle, type CheatPanelOptions } from "./DevCheats";
