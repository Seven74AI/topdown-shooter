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
 * the menu screen: Save and quit (Story 8.5, `visible: (c) => c.online && c.isHost`), Settings
 * (Story 10.1).
 */
export const MENU_ITEMS: readonly MenuItem[] = Object.freeze([
  { id: "resume", label: "Resume", action: "resume", visible: always },
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
} as const;
