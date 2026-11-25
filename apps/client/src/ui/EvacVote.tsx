import { useEffect, useState } from "preact/hooks";
import { VOTE_EXTRACT, VOTE_STAY } from "@topdown/shared";
import { SLOT_COLOR_CSS } from "../render/playerColors";
import { voteStore, type VoteView } from "./voteModel";

/**
 * Story 6.11 (look EX1, architecture › UI "EvacVote"): the evacuation vote over the live game while
 * the run is in phase "vote". Title, a green EXTRACT and a red STAY button (140 × 56 px, bottom
 * centre, under the thumbs), the ring timer between them (drawn from the server's ticks, F4), and the
 * slot-coloured chips above that fill with each player's choice (downed/out dimmed, still voting).
 * After everyone voted: "EXTRACT · 3 – 1" for the 1 s beat. The colours are the picked look's UI
 * buttons (green / red), not map danger (the boss-only red rule is about the map, brief 24).
 */
const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;
const CHIP_TEXT = ["", "⬆ EXT", "✕ STAY"];

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
              {c.vote ? CHIP_TEXT[c.vote] : c.mine ? "You" : "…"}
            </span>
          ))}
        </div>
        <div class="evac__row">
          <button
            type="button"
            class={`evac__btn evac__btn--extract${v.mine === VOTE_EXTRACT ? " evac__btn--on" : ""}`}
            aria-pressed={v.mine === VOTE_EXTRACT}
            onPointerDown={(e) => {
              e.preventDefault();
              voteStore.tap("extract");
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
            onPointerDown={(e) => {
              e.preventDefault();
              voteStore.tap("stay");
            }}
          >
            STAY
          </button>
        </div>
      </div>
    </div>
  );
}
