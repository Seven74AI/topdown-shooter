import { useEffect, useState } from "preact/hooks";
import { resultsSub, resultsTitle, uiStore, type UiScreen } from "./uiState";
import { dawnLookFor, dawnProgress } from "./dawnModel";
import { clientBalance } from "../debug/clientBalance";
import { SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "../render/playerColors";
import { formatSupplies, rewardsStore } from "../net/rewardsStore";
import type { RunRewards } from "@topdown/shared";
import { lineAmount, rewardsView, trainingCell, type RewardsView } from "./rewardsModel";
import { itemPortraitUrl } from "../render/city/survivorPortrait";
import { ACCOUNT_TEXT, showNudge } from "./accountModel";
import { accountStore, type AccountSnapshot } from "../net/accountStore";
import { openAccount } from "./uiState";

/**
 * Results after a team wipe (Story 2.8, FR11): the wave reached, then color dot, name and kills per
 * player (sorted by slot). Online: Back to lobby (the whole room goes back; a player who taps later
 * is already there). Solo: Restart, as in Epic 1. Story 3.10 (temporary until Epic 6's full
 * Results): after the last wave the title is "You held out!" with the wave reached under it, and
 * every row shows the money earned this run. Story 4.4: the run seed under the table.
 * Story 6.11: "Extracted" after the 4 s dawn (DW1 warm sunrise after wave 10, DW2 blue hour in
 * endless; a tap skips it, D6); Story 6.12: "Lost in the city" on the DW2 backdrop at once (D7).
 * Story 7.2 (AC 5, layout RW1 in Lumen LF5): two cards — the team card (title, table, button) and the "Run rewards"
 * card (`rewardsModel.ts`: Supplies, then the row groups later stories fill, brief 26). The rewards come from the
 * server's `run.rewards` (`net/rewardsStore.ts`), before or after the Results patch; until then "Saving…".
 */
export function ResultsScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [rewards, setRewards] = useState<RunRewards | null>(rewardsStore.get());
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => rewardsStore.subscribe(setRewards), []);
  const [account, setAccount] = useState<AccountSnapshot>(accountStore.get());
  useEffect(() => accountStore.subscribe(setAccount), []);
  useEffect(() => {
    setSent(false);
    setSkipped(false);
    setNow(performance.now());
  }, [screen]);
  const endsAt = screen.kind === "results" ? screen.dawnEndsAtMs : 0;
  const progress = screen.kind === "results" ? dawnProgress(now, endsAt, clientBalance().waves.evac.dawnS, skipped) : 1;
  useEffect(() => {
    if (progress >= 1) return;
    const id = requestAnimationFrame(() => setNow(performance.now())); // the dawn's 4 s only
    return () => cancelAnimationFrame(id);
  }, [progress]);
  if (screen.kind !== "results") return null;
  const look = dawnLookFor(screen.ending, screen.endless);
  if (progress < 1) {
    // The dawn over the live map (the helicopter lifts off underneath): darkness lifting + the look's light.
    return (
      <div class={`dawn dawn--${look}`} role="presentation" onPointerDown={() => setSkipped(true)} data-testid="dawn">
        <div class="dawn__dark" style={{ opacity: String(1 - progress * (look === "dw2" ? 0.75 : 0.82)) }} />
        <div class="dawn__light" style={{ opacity: String(progress) }} />
        <p class="dawn__hint">Tap to skip</p>
      </div>
    );
  }
  const sub = resultsSub(screen);
  const cls = `game-over results rw${screen.ending === "extracted" ? " results--held" : screen.ending === "lost" ? " results--lost" : ""}`;
  const view = rewardsView(rewards, screen.online, screen.seed, undefined, (slot, seatId) => resultName(screen.rows, slot, seatId));
  return (
    <div class={look !== "none" ? `results-backdrop results-backdrop--${look}` : undefined}>
      <div class={cls} role="dialog" aria-labelledby="results-title">
        <section class="rw-card rw-card--team">
          <header class="rw-card__head rw-card__head--team">
            <div class="rw-head__main">
              <p class="rw-kicker">{screen.ending === "extracted" ? "Run complete · Downtown" : "Run over · Downtown"}</p>
              <h1 id="results-title">{resultsTitle(screen)}</h1>
              {screen.ending === "lost" ? <p class="results__sub">Rewards after wave 10 lost</p> : null}
            </div>
            {screen.ending !== "wiped" ? (
              <p class="rw-wave" aria-label={sub}>
                <span class="rw-wave__label">Wave</span>
                <span class="rw-wave__n">{screen.wave}</span>
              </p>
            ) : null}
          </header>
          <div class="rw-table-wrap">
          <table class="results__table">
            <colgroup>
              <col />
              <col class="rw-col--kills" />
              <col class="rw-col--earned" />
              <col class="rw-col--train" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Kills</th>
                <th scope="col">Earned</th>
                <th scope="col" class="rw-th--train">
                  Train
                </th>
              </tr>
            </thead>
            <tbody>
              {screen.rows.map((r) => (
                <tr key={r.slot} class={r.slot === screen.mySlot ? "rw-row--me" : undefined}>
                  <td class="results__name">
                    <span class="rw-slot" style={{ background: SLOT_COLOR_CSS[r.slot] }} role="img" aria-label={SLOT_COLOR_NAMES[r.slot]}>
                      {r.slot + 1}
                    </span>
                    <span class="rw-name">
                      <span class="rw-name__text">{r.name}</span>
                      {r.slot === screen.mySlot ? <span class="rw-you">You</span> : null}
                    </span>
                  </td>
                  <td class="results__kills">{r.kills}</td>
                  <td class="results__earned">${formatSupplies(r.earned)}</td>
                  <TrainCell r={r} />
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div class="rw-card__foot">
            <p class="results__seed">Run seed {screen.seed}</p>
            {screen.online ? (
              <button
                type="button"
                class="btn rw-btn"
                disabled={sent}
                onClick={() => {
                  setSent(true);
                  uiStore.request("lobbyReturn");
                }}
              >
                Back to lobby
              </button>
            ) : (
              <button type="button" class="btn rw-btn" onClick={() => uiStore.request("restart")}>
                Restart
              </button>
            )}
          </div>
        </section>
        <RunRewardsCard view={view} nudge={screen.online && rewards?.seed === screen.seed && showNudge(rewards, account) ? screen : null} />
      </div>
    </div>
  );
}

/** Story 7.5 (T4, TL3): "10/20" (or a MAX chip) over four small bars, one per boost; the label spells the levels out. */
function TrainCell({ r }: { r: { training?: Parameters<typeof trainingCell>[0] } }) {
  const c = trainingCell(r.training);
  return (
    <td class="results__train" aria-label={c.label} title={c.label} data-testid="train-cell">
      <span class={`rw-train__n${c.maxed ? " rw-train__n--max" : ""}`} aria-hidden="true">
        {c.text}
      </span>
      <span class="rw-train__bars" aria-hidden="true">
        {c.bars.map((f, i) => (
          <span key={i} class="rw-train__bar">
            <span class="rw-train__fill" style={{ width: `${Math.round(f * 100)}%` }} />
          </span>
        ))}
      </span>
    </td>
  );
}

/**
 * Stories 7.11 / 7.12: a found or granted part's picture — the default survivor wearing it (7.9's portrait drawing;
 * 7.10's `partTileUrl` close-up replaces it when it lands). A Collector row shows the bag badge instead.
 */
function ItemPicture({ partKey }: { partKey: string | null }) {
  const url = partKey ? itemPortraitUrl(partKey) : null;
  return url ? <img class="rw-item__pic" src={url} alt="" /> : <span class="rw-item__pic rw-item__pic--bag" aria-hidden="true" />;
}

/** Story 7.2 (AC 5, RW1): the "Run rewards" card. One scrolling column; rows in the fixed order of brief 26. */
export function RunRewardsCard({ view, nudge = null }: { view: RewardsView; /** Story 7.6 (AC 10): the Results screen to come back to, when the nudge shows. */ nudge?: UiScreen | null }) {
  return (
    <section class={`rw-card rw-card--rewards rw--${view.state}`} aria-labelledby="rw-title" data-testid="run-rewards" data-state={view.state}>
      <header class="rw-card__head rw-card__head--rewards">
        <span class="rw-crate" aria-hidden="true" />
        <div>
          <p class="rw-kicker">Run report</p>
          <h2 id="rw-title">Run rewards</h2>
        </div>
      </header>
      <div class="rw-body">
        <div class="rw-group rw-group--supplies" data-group="supplies">
          {view.state === "saved" ? (
            <>
              <p class="rw-earned">Supplies earned</p>
              <p class="rw-big">
                <span class={`rw-big__n${view.headline.length > 6 ? " rw-big__n--long" : ""}`}>{view.headline}</span>
                <span class="rw-big__unit">Supplies</span>
              </p>
              <ul class="rw-lines">
                {view.lines.map((l) => (
                  <li key={l.key} class="rw-line">
                    <span class="rw-line__label">{l.label}</span>
                    <span class="rw-line__bar" aria-hidden="true">
                      <span class="rw-line__fill" style={{ width: `${Math.round(l.frac * 100)}%` }} />
                    </span>
                    <span class="rw-line__amount">{lineAmount(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div class="rw-totalrow">
                {view.rookie ? (
                  <span class="rw-rookie" data-testid="rookie-badge">
                    <span class="rw-rookie__text">Rookie bonus</span>
                    <span class="rw-rookie__x">× 2</span>
                  </span>
                ) : (
                  <span />
                )}
                <span class="rw-total" aria-label={`Total: ${view.total} Supplies`}>
                  <span class="rw-total__label">Total</span>
                  <span class="rw-crate" aria-hidden="true" />
                  <span class={`rw-total__n${view.total.length > 7 ? " rw-total__n--long" : ""}`}>{view.total}</span>
                </span>
              </div>
              {view.note ? (
                <p class="rw-note" data-testid="rewards-note">
                  {view.note}
                </p>
              ) : null}
            </>
          ) : (
            <p class={`rw-status rw-status--${view.state}`} role="status">
              {view.status}
            </p>
          )}
        </div>
        {view.items.length > 0 ? (
          <ul class="rw-group rw-group--items" data-group="items" data-testid="rewards-items">
            {view.items.map((it, i) => (
              <li key={`${it.kind}${i}`} class={`rw-item rw-item--${it.kind}${it.big ? " rw-item--big" : ""}`}>
                <ItemPicture partKey={it.key} />
                <span class="rw-item__text">
                  <span class="rw-item__line" style={it.slot >= 0 ? { color: SLOT_COLOR_CSS[it.slot] } : undefined}>
                    {it.text}
                  </span>
                  {it.sub ? <span class="rw-item__sub">{it.sub}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {view.unlockLine || view.unlocks.length > 0 ? (
          <div class="rw-group rw-group--unlocks" data-group="unlocks" data-testid="rewards-unlocks">
            {/* Story 7.4's line first, then 7.7's districts (brief 26 group 3). */}
            {view.unlockLine ? (
              <p class="rw-unlock" data-testid="unlock-line">
                {view.unlockLine}
              </p>
            ) : null}
            {view.unlocks.map((u) => (
              <p key={u.id} class="rw-unlock rw-unlock--district">
                <span class="rw-unlock__line">{u.text}</span>
                {u.sub ? <span class="rw-unlock__sub">{u.sub}</span> : null}
              </p>
            ))}
          </div>
        ) : null}
        {nudge ? (
          <p class="rw-nudge" data-testid="rewards-nudge">
            <span class="rw-nudge__text">{ACCOUNT_TEXT.nudgeLine}</span>
            <button type="button" class="ph-btn rw-nudge__btn" onClick={() => uiStore.set(openAccount("save", nudge))}>
              {ACCOUNT_TEXT.save}
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * PR #9 review L1: the Results name of a teammate's find — by the finder's seat id when the message has one (a seat no
 * longer in the run → "" → "A teammate"), else by slot (an older server).
 */
export function resultName(rows: readonly { readonly slot: number; readonly name: string; readonly seat?: string }[], slot: number, seatId?: string): string {
  if (seatId !== undefined) return rows.find((r) => r.seat === seatId)?.name ?? "";
  return rows.find((r) => r.slot === slot)?.name ?? "";
}
