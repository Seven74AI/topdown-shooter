import type { MenuAction } from "./uiState";

/** What a menu item's visibility may depend on. */
export interface MenuContext {
  /** An online run (it keeps running while the menu is open). */
  readonly online: boolean;
  /** This player is the room's host (Story 8.5's Save and quit is host only). Solo: true. */
  readonly isHost: boolean;
}

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /** The `menuStep` action the item sends. */
  readonly action: MenuAction;
  /** Secondary style (grey button). */
  readonly secondary?: boolean;
  visible(ctx: MenuContext): boolean;
}

const always = (): boolean => true;

/**
 * The in-run menu's items, top to bottom (Story 2.11). Later items slot in here without touching
 * the menu screen: Save and quit (Story 8.5, `visible: (c) => c.online && c.isHost`). Settings opens
 * the Settings view (Always full speed; Story 10.1 adds the rest to it).
 */
export const MENU_ITEMS: readonly MenuItem[] = Object.freeze([
  { id: "resume", label: "Resume", action: "resume", visible: always },
  // Story 8.3 (H2): the host's Players list (Remove a seat); online only.
  { id: "players", label: "Players", action: "players", secondary: true, visible: (c) => c.online && c.isHost },
  { id: "settings", label: "Settings", action: "settings", secondary: true, visible: always },
  { id: "leave", label: "Leave game", action: "leave", secondary: true, visible: always },
]);

/** The items shown for this context, in order. */
export function visibleMenuItems(ctx: MenuContext, items: readonly MenuItem[] = MENU_ITEMS): MenuItem[] {
  return items.filter((i) => i.visible(ctx));
}

/** Menu texts (one place for wording). */
export const MENU_TEXT = {
  title: "Menu",
  /** Online: the run doesn't stop for anyone (designer decision 2026-11-21). */
  online: "The game keeps running",
  /** Solo practice pauses. */
  solo: "Paused",
  confirm: "Leave the game? Your team keeps playing.",
  confirmSolo: "Leave the game?",
  leave: "Leave",
  cancel: "Cancel",
  /** Story 8.3 (H2, AC 11). */
  players: "Players",
  back: "Back",
  remove: "Remove",
  removeOnlyInBuild: "You can remove players in the build phase",
  noOthers: "Nobody else is here",
  reconnecting: "reconnecting",
  waiting: "joins at the build phase",
  left: "left the run", // Story 8.3: a remembered seat (its slot stays kept until removed)
  settings: "Settings",
  alwaysFullSpeed: "Always full speed",
  alwaysFullSpeedHint: "Move at full speed however far you drag the stick",
} as const;

/** Story 8.3 (H2, AC 11): the confirm line, in the lobby and the in-run menu alike. */
export const removeConfirmText = (name: string): string => `Remove ${name} from this run? They can't come back.`;

/** Story 8.3: Remove only in the lobby and build phases (D9: never while anyone is fighting or voting). */
export const canRemoveIn = (phase: string): boolean => phase === "lobby" || phase === "build";

/** Story 8.3: who the in-run confirm step is about (set by the Players list's Remove, read by the confirm). */
let removeTarget: { readonly playerId: string; readonly name: string } | null = null;
export const menuRemoveTarget = {
  get: () => removeTarget,
  set: (t: { readonly playerId: string; readonly name: string } | null): void => {
    removeTarget = t;
  },
};
