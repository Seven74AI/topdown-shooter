/**
 * Story 7.9 T6 (SC3 line-up cards with DP2's district line, Lumen LF5; `docs/art/epic-7/lumen/picks/sc3-dp2.png`,
 * `lumen/slots.jpg`): the lobby's geometry as rects in CSS px, from the viewport and the safe-area insets. The lobby
 * screen positions its parts from these numbers and the one layout test (R9) checks them at 568×320, 640×360,
 * 800×360 and 844×390 (insets 44/21): nothing overlaps, every button ≥ 44 px, nothing outside the safe area.
 * No DOM here (tests import it).
 */
import { MIN_BUTTON_CSS_PX } from "./sizes";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface Insets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Margin inside the safe area, gap between parts (CSS px). */
export const LOBBY_MARGIN = 8;
export const LOBBY_GAP = 6;
/** The header row (game code, district line, Leave) and the button row (CSS px). */
export const LOBBY_HEADER_H = 48;
export const LOBBY_BUTTONS_H = 48;
/** Inside a card: the slot-colour bar under the picture, the name + Ready block (CSS px). */
export const CARD_BAR_H = 3;
export const CARD_NAME_H = 46;
/** The picture's padding inside the card and its largest size (about 3× game size, D3). */
export const CARD_PICTURE_PAD = 8;
export const CARD_PICTURE_MAX = 168;
/** Header and button widths as a share of the content width (min widths keep labels readable). */
const CODE_SHARE = 0.27;
const LEAVE_W = 92;
const SIDE_BUTTON_SHARE = 0.18;
const MAIN_BUTTON_SHARE = 0.24;

export interface LobbyCardLayout {
  readonly card: Rect;
  /** The survivor picture (square) inside its card, with the slot ring around it. */
  readonly picture: Rect;
  readonly bar: Rect;
  readonly name: Rect;
}

export interface LobbyLayout {
  readonly content: Rect;
  readonly code: Rect;
  readonly district: Rect;
  readonly leave: Rect;
  readonly cards: readonly LobbyCardLayout[];
  readonly copy: Rect;
  readonly share: Rect;
  /** Ready / Not ready (everyone). */
  readonly ready: Rect;
  /** Start (host) or the "The host starts the game" line (guests): the bottom-right place. */
  readonly start: Rect;
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x: Math.round(x), y: Math.round(y), w: Math.floor(w), h: Math.floor(h) });

export function lobbyLayout(width: number, height: number, inset: Insets): LobbyLayout {
  const x0 = inset.left + LOBBY_MARGIN;
  const y0 = inset.top + LOBBY_MARGIN;
  const cw = width - inset.left - inset.right - 2 * LOBBY_MARGIN;
  const ch = height - inset.top - inset.bottom - 2 * LOBBY_MARGIN;
  const content = r(x0, y0, cw, ch);

  const codeW = Math.max(112, cw * CODE_SHARE);
  const code = r(x0, y0, codeW, LOBBY_HEADER_H);
  const leave = r(x0 + cw - LEAVE_W, y0, LEAVE_W, LOBBY_HEADER_H);
  const district = r(code.x + code.w + LOBBY_GAP, y0, leave.x - LOBBY_GAP - (code.x + code.w + LOBBY_GAP), LOBBY_HEADER_H);

  const by = y0 + ch - LOBBY_BUTTONS_H;
  const sideW = Math.max(84, cw * SIDE_BUTTON_SHARE);
  const mainW = Math.max(112, cw * MAIN_BUTTON_SHARE);
  const copy = r(x0, by, sideW, LOBBY_BUTTONS_H);
  const share = r(x0 + sideW + LOBBY_GAP, by, sideW, LOBBY_BUTTONS_H);
  const start = r(x0 + cw - mainW, by, mainW, LOBBY_BUTTONS_H);
  const ready = r(start.x - LOBBY_GAP - mainW, by, mainW, LOBBY_BUTTONS_H);

  const cy = y0 + LOBBY_HEADER_H + LOBBY_GAP;
  const cardH = by - LOBBY_GAP - cy;
  const cardW = (cw - 3 * LOBBY_GAP) / 4;
  const cards: LobbyCardLayout[] = [];
  for (let i = 0; i < 4; i++) {
    const card = r(x0 + i * (cardW + LOBBY_GAP), cy, cardW, cardH);
    const picH = card.h - CARD_NAME_H - CARD_BAR_H;
    const side = Math.max(0, Math.min(CARD_PICTURE_MAX, card.w - 2 * CARD_PICTURE_PAD, picH - 2 * CARD_PICTURE_PAD));
    const picture = r(card.x + (card.w - side) / 2, card.y + (picH - side) / 2, side, side);
    const bar = r(card.x + 4, card.y + picH, card.w - 8, CARD_BAR_H);
    const name = r(card.x, card.y + picH + CARD_BAR_H, card.w, CARD_NAME_H);
    cards.push({ card, picture, bar, name });
  }
  return { content, code, district, leave, cards, copy, share, ready, start };
}

/** Every tap target of the layout (the R9 test checks each is ≥ 44 px). */
export const lobbyButtons = (l: LobbyLayout): Rect[] => [l.leave, l.copy, l.share, l.ready, l.start];

export const MIN_LOBBY_BUTTON = MIN_BUTTON_CSS_PX;
