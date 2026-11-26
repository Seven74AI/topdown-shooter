import { useEffect, useState } from "preact/hooks";
import { PROGRESSION, VOTE_EXTRACT, VOTE_STAY } from "@topdown/shared";
import { SLOT_COLOR_CSS } from "../render/playerColors";
import { voteStore, type VoteView } from "./voteModel";

/**
 * Story 6.11 (look EX1, architecture › UI "EvacVote"): the evacuation vote over the live game while
 * the run is in phase "vote". Title, a green EXTRACT and a red STAY button (140 × 56 px, bottom
 * centre, under the thumbs), the ring timer between them (drawn from the server's ticks, F4), and the
 * slot-coloured chips above that fill with each player's choice (Story 8.12: downed, out and held
 * seats dimmed and marked "not voting"; my buttons disabled while I'm down or out).
 * After everyone voted: "EXTRACT · 3 – 1" for the 1 s beat. The colours are the picked look's UI
 * buttons (green / red), not map danger (the boss-only red rule is about the map, brief 24).
 */
const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;
const CHIP_TEXT = ["", "⬆ EXT", "✕ STAY"];
/** Story 8.12 (AC 6): a downed, out or held player's chip. */
export const NOT_VOTING = "not voting";

/** Story 7.2 (AC 7, S4): what each choice pays in Supplies, from `progression.json › supplies` (the bet, said plainly). */
export function voteStakesLine(s = PROGRESSION.supplies): string {
  return `Extract now: +${s.extract} · Stay: +${s.perEndlessWave} a wave, lost if you wipe`;
}

export function EvacVote() {
  const [v, setV] = useState<VoteView>(voteStore.get());
  useEffect(() => voteStore.subscribe(setV), []);
  if (!v.open) return null;
  const done = v.result !== "";
  return (
    <div class="evac" role="dialog" aria-labelledby="evac-title" data-testid="evac-vote">
      <div class="evac__head">
        <h2 id="evac-title" class="evac__title">{done ? v.result : "EVAC IS HERE"}</h2>
        <p class="evac__sub">{done ? (v.result.startsWith("STAY") ? "Fight on: endless waves" : "Get to the helicopter") : "Extract now, or stay and fight on (endless)?"}</p>
      </div>
      <div class="evac__bottom">
        <div class="evac__chips">
          {v.chips.map((c) => (
            <span
              key={c.slot}
              class={`evac__chip${c.vote ? " evac__chip--in" : ""}${c.dimmed ? " evac__chip--dim" : ""}${c.mine ? " evac__chip--mine" : ""}`}
              style={{ borderColor: SLOT_COLOR_CSS[c.slot], background: c.vote ? SLOT_COLOR_CSS[c.slot] : undefined, color: c.vote ? undefined : SLOT_COLOR_CSS[c.slot] }}
              data-vote={c.vote}
            >
              {c.dimmed ? (c.mine ? "You" : NOT_VOTING) : c.vote ? CHIP_TEXT[c.vote] : c.mine ? "You" : "…"}
            </span>
          ))}
        </div>
        {/* Story 7.2 (AC 7, build-time choice 7.2 B3): above the buttons, so the tested button rects never move. */}
        <p class="evac__stakes" data-testid="evac-stakes">
          {voteStakesLine()}
        </p>
        <div class="evac__row">
          <button
            type="button"
            class={`evac__btn evac__btn--extract${v.mine === VOTE_EXTRACT ? " evac__btn--on" : ""}`}
            aria-pressed={v.mine === VOTE_EXTRACT}
            disabled={!v.canVote}
            onPointerDown={(e) => {
              e.preventDefault();
              if (v.canVote) voteStore.tap("extract");
            }}
          >
            EXTRACT
          </button>
          <svg class="evac__ring" width="48" height="48" viewBox="0 0 48 48" aria-label={`${v.secondsLeft} seconds left`}>
            <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.6)" />
            <circle
              cx="24"
              cy="24"
              r={RING_R}
              fill="none"
              stroke="#e8e4da"
              stroke-width="4"
              stroke-dasharray={`${RING_C * v.ringFrac} ${RING_C}`}
              transform="rotate(-90 24 24)"
            />
            <text x="24" y="30" text-anchor="middle" class="evac__secs">
              {v.secondsLeft}
            </text>
          </svg>
          <button
            type="button"
            class={`evac__btn evac__btn--stay${v.mine === VOTE_STAY ? " evac__btn--on" : ""}${done && !v.result.startsWith("STAY") ? " evac__btn--lost" : ""}`}
            aria-pressed={v.mine === VOTE_STAY}
            disabled={!v.canVote}
            onPointerDown={(e) => {
              e.preventDefault();
              if (v.canVote) voteStore.tap("stay");
            }}
          >
            STAY
          </button>
        </div>
      </div>
    </div>
  );
}
