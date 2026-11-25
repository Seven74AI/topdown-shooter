import { describe, expect, it } from "vitest";
import { MIN_LOBBY_BUTTON, lobbyButtons, lobbyLayout, type Rect } from "./lobbyLayout";

/** Story 7.9 T6, retro R9: the one layout test of the SC3 lobby (insets 44 left/right, 21 bottom: a notched phone). */
const SIZES = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
] as const;
const INSETS = [
  { left: 44, right: 44, top: 0, bottom: 21 },
  { left: 0, right: 0, top: 0, bottom: 0 },
];
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe("lobby layout (Story 7.9 T6, R9)", () => {
  for (const [w, h] of SIZES)
    for (const inset of INSETS) {
      it(`${w}×${h} insets ${inset.left}/${inset.bottom}: inside the safe area, no overlaps, buttons ≥ 44 px, pictures readable`, () => {
        const l = lobbyLayout(w, h, inset);
        const safe = { x: inset.left, y: inset.top, w: w - inset.left - inset.right, h: h - inset.top - inset.bottom };
        const parts: [string, Rect][] = [
          ["code", l.code],
          ["district", l.district],
          ["leave", l.leave],
          ["copy", l.copy],
          ["share", l.share],
          ["ready", l.ready],
          ["start", l.start],
          ...l.cards.map((c, i) => [`card${i}`, c.card] as [string, Rect]),
        ];
        for (const [n, p] of parts) {
          expect(inside(p, safe), `${n} inside the safe area`).toBe(true);
          expect(p.w, `${n} width`).toBeGreaterThan(0);
        }
        for (let i = 0; i < parts.length; i++)
          for (let j = i + 1; j < parts.length; j++) expect(overlap(parts[i]![1], parts[j]![1]), `${parts[i]![0]} vs ${parts[j]![0]}`).toBe(false);
        for (const b of lobbyButtons(l)) {
          expect(b.w).toBeGreaterThanOrEqual(MIN_LOBBY_BUTTON);
          expect(b.h).toBeGreaterThanOrEqual(MIN_LOBBY_BUTTON);
        }
        // the district line has room for "District · Downtown" (7.7 adds the picker there)
        expect(l.district.w).toBeGreaterThanOrEqual(120);
        for (const c of l.cards) {
          expect(inside(c.picture, c.card)).toBe(true);
          expect(inside(c.bar, c.card)).toBe(true);
          expect(inside(c.name, c.card)).toBe(true);
          expect(overlap(c.picture, c.name)).toBe(false);
          // D3: about 3× game size — at least 2.5 × the game's 28 px survivor body (r = 14 px)
          expect(c.picture.w).toBeGreaterThanOrEqual(70);
          expect(c.picture.w).toBe(c.picture.h);
          expect(c.name.w).toBeGreaterThanOrEqual(96); // "[1] Name" + "NOT READY" at 12–14 px
        }
      });
    }
});
