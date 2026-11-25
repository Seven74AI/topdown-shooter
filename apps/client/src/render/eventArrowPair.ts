import { eventArrowDrawnRect, placeEventArrow, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";

/**
 * Story 6.10 review L11: the survivor shows two edge arrows at once (the NPC and its white flag).
 * The flag's arrow is placed by the same rule as every event arrow (6.8's `placeEventArrow`: safe
 * area, off the wave controls / HP block / wave line, away from the survivor) and additionally keeps
 * off the first arrow's DRAWN rect, so the two never overlap. One reused list: no allocation.
 */
const avoidBoth: ScreenRect[] = [];
const firstRect: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

export function placeSecondEventArrow(
  sx: number,
  sy: number,
  w: number,
  h: number,
  insets: Insets,
  k: number,
  size: number,
  avoid: readonly ScreenRect[],
  first: Readonly<EventArrowPlace> | null,
  out: EventArrowPlace,
): boolean {
  avoidBoth.length = 0;
  for (let i = 0; i < avoid.length; i++) avoidBoth.push(avoid[i] as ScreenRect);
  if (first) avoidBoth.push(eventArrowDrawnRect(first, size, firstRect));
  return placeEventArrow(sx, sy, w, h, insets, k, size, avoidBoth, out);
}
