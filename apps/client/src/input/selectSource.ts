/** Which device drives the survivor: the touch sticks, or keyboard + mouse. */
export type InputSource = "touch" | "mouse";

/** Something the player did that may hand control to another device. */
export type SourceEvent = "touchDown" | "key" | "mouseButton" | "mouseMove";

/** Mouse movement must exceed this (canvas px) to take over: jitter and synthetic moves don't count. */
export const MOUSE_SWITCH_PX = 4;

/**
 * The most recent meaningful event chooses the source (Story 1.10, AC 3). A touch-down is always
 * meaningful; for keyboard and mouse, a key press, a mouse button, or a mouse move of more than
 * MOUSE_SWITCH_PX (`movePx`: distance from where the mouse was when touch took over) is.
 */
export function selectSource(current: InputSource, event: SourceEvent, movePx = 0): InputSource {
  switch (event) {
    case "touchDown":
      return "touch";
    case "key":
    case "mouseButton":
      return "mouse";
    case "mouseMove":
      return movePx > MOUSE_SWITCH_PX ? "mouse" : current;
  }
}
