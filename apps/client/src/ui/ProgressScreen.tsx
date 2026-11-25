import { useEffect, useRef, useState } from "preact/hooks";
import { openSurvivor, uiStore, type UiScreen } from "./uiState";
import {
  HUB_TABS,
  HUB_TEXT,
  SURVIVOR_TAB_ID,
  IDLE,
  answerUnlock,
  expireConfirm,
  hubSections,
  refreshAfterFailureMs,
  rowAction,
  suppliesText,
  tapUnlock,
  type BuyState,
  type HubRow,
} from "./hubModel";
import { progressStore, type ProgressSnapshot } from "../net/progressStore";
import { unlockItem } from "../net/account";
import { formatSupplies } from "../net/rewardsStore";
import { weaponIconUrl } from "../render/city/weaponArt";
import { gearIconUrl } from "../render/city/gearIcons";
import { consumableIconUrl } from "../render/city/consumableIcons";
import { buildingIconUrl } from "../render/city/buildIcons";

/** The existing shop / build-bar drawing of an item, or null (a placeholder silhouette is drawn instead). */
function iconUrl(item: string): string | null {
  return weaponIconUrl(item) ?? gearIconUrl(item) ?? consumableIconUrl(item) ?? buildingIconUrl(item);
}

/** A v4 UUID per confirmed tap (`randomUUID` needs a secure context: a LAN dev page falls back to getRandomValues). */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Back (and Esc): return to the screen the hub was opened from. */
function goBack(): void {
  const s = uiStore.get();
  if (s.kind === "progress") uiStore.set(s.back);
}

/**
 * Story 7.3 (AC 6–8, layout PH1 in Lumen LF5): the Progress hub. Header (Back, "Progress", the Supplies total), the
 * rule line (U1), the tab bar (data-driven, built for three), and the Unlocks tab: one scrolling list in four
 * sections. Every number shown is the server's (`progressStore`, U5); offline it shows the last known copy and
 * disables Unlock (AC 8).
 */
export function ProgressScreen() {
  const [screen, setScreen] = useState<UiScreen>(uiStore.get());
  const [snap, setSnap] = useState<ProgressSnapshot>(progressStore.get());
  const [buy, setBuy] = useState<BuyState>(IDLE);
  const [tab] = useState(HUB_TABS[0]?.id ?? "unlocks");
  const buyRef = useRef(buy);
  buyRef.current = buy;
  useEffect(() => uiStore.subscribe(setScreen), []);
  useEffect(() => progressStore.subscribe(setSnap), []);
  const open = screen.kind === "progress";
  useEffect(() => {
    if (!open) {
      setBuy(IDLE);
      return;
    }
    void progressStore.refresh(); // AC 4: the server's numbers each time the hub opens
  }, [open]);
  // Decision 7.3 D3: "Confirm 300" falls back to "Unlock" after 3 s.
  useEffect(() => {
    if (buy.step.kind !== "confirm") return;
    const id = setTimeout(() => setBuy((b) => expireConfirm(b, performance.now())), Math.max(0, buy.step.untilMs - performance.now()) + 5);
    return () => clearTimeout(id);
  }, [buy.step]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (screen.kind !== "progress") return null;

  const offline = snap.source !== "server";
  const progress = snap.progress;
  const sections = hubSections(progress);

  const onUnlock = (row: HubRow) => {
    if (row.unlockId === null) return;
    const { state, send } = tapUnlock(buyRef.current, row.unlockId, performance.now(), newRequestId, offline);
    buyRef.current = state;
    setBuy(state);
    if (!send) return;
    const sentAt = performance.now();
    void unlockItem(send.unlockId, send.requestId).then((call) => {
      const r = answerUnlock(buyRef.current, send.requestId, call);
      buyRef.current = r.state;
      setBuy(r.state);
      if (r.progress) progressStore.accept(r.progress); // U5: the server's answer, never a local guess
      else if (r.offline) {
        // Review F2: mark offline, then ask the server again: a good answer brings its truth back and re-enables Unlock.
        // RR-L1: not before the route's worst case has passed since the send (no pre-commit read).
        progressStore.markOffline();
        setTimeout(() => void progressStore.refresh(), refreshAfterFailureMs(sentAt, performance.now()));
      }
    });
  };

  return (
    <div class="menu ph" role="dialog" aria-labelledby="ph-title" data-testid="progress-hub">
      <div class="ph-frame">
        <header class="ph-head">
          <button type="button" class="ph-back" aria-label={HUB_TEXT.back} onClick={goBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <h1 id="ph-title" class="ph-title">
            {HUB_TEXT.title}
          </h1>
          <p class="ph-supplies" aria-label={`Supplies ${suppliesText(progress)}`} data-testid="hub-supplies">
            <span class="ph-supplies__label">Supplies</span>
            <span class="rw-crate" aria-hidden="true" />
            <span class="ph-supplies__n">{suppliesText(progress)}</span>
          </p>
        </header>
        <p class="ph-rule">
          {HUB_TEXT.rule}
          {offline && !snap.loading ? (
            <span class="ph-offline" role="status" data-testid="hub-offline">
              {" "}
              · {HUB_TEXT.offline}
            </span>
          ) : null}
        </p>
        <div class="ph-tabs" role="tablist">
          {HUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              class={`ph-tab${t.id === tab ? " ph-tab--on" : ""}`}
              aria-selected={t.id === tab}
              data-tab={t.id}
              onClick={t.id === SURVIVOR_TAB_ID ? () => uiStore.set(openSurvivor({ kind: "progress", back: screen.back })) : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="ph-list" role="tabpanel">
          {progress === null && snap.loading ? <p class="ph-note">{HUB_TEXT.loading}</p> : null}
          {sections.map((sec) => (
            <section key={sec.category} class="ph-sec" aria-label={sec.label}>
              <h2 class="ph-sec__head">{sec.label}</h2>
              {sec.rows.map((row) => (
                <Row key={row.key} row={row} buy={buy} offline={offline} onUnlock={onUnlock} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ row, buy, offline, onUnlock }: { row: HubRow; buy: BuyState; offline: boolean; onUnlock: (r: HubRow) => void }) {
  const icon = iconUrl(row.iconItem);
  const a = rowAction(row, buy, offline);
  const note = buy.note && buy.note.unlockId === row.unlockId ? buy.note.text : a.kind === "short" ? a.text : null;
  return (
    <div class={`ph-row ph-row--${row.state}`} data-unlock={row.unlockId ?? undefined}>
      <span class={`ph-icon${icon ? "" : " ph-icon--none"}`} aria-hidden="true">
        {icon ? <img src={icon} alt="" /> : <span class="ph-silhouette" />}
      </span>
      <span class="ph-text">
        <span class="ph-name">
          <span class="ph-name__text">{row.name}</span>
          {row.goodPick ? <span class="ph-pick">{HUB_TEXT.goodPick}</span> : null}
        </span>
        <span class="ph-line">{row.line}</span>
        {note ? (
          <span class="ph-need" role={buy.note ? "status" : undefined}>
            {note}
          </span>
        ) : null}
      </span>
      <span class="ph-action">
        {a.kind === "owned" ? (
          <span class="ph-owned">
            <span class="ph-owned__chip">{HUB_TEXT.unlocked}</span>
            {a.starter ? <span class="ph-owned__starter">{HUB_TEXT.starter}</span> : null}
          </span>
        ) : a.kind === "short" ? (
          <span class="ph-price" aria-label={`${formatSupplies(a.price)} Supplies`}>
            <span class="rw-crate" aria-hidden="true" />
            {formatSupplies(a.price)}
          </span>
        ) : a.kind === "sending" ? (
          <button type="button" class="ph-btn ph-btn--busy" aria-busy="true" aria-label={HUB_TEXT.unlocking} disabled>
            <span class="ph-spin" aria-hidden="true" />
          </button>
        ) : a.kind === "confirm" ? (
          <button type="button" class="ph-btn ph-btn--confirm" onClick={() => onUnlock(row)}>
            <span class="ph-btn__main">{a.label}</span>
            <span class="ph-btn__sub">{a.sub}</span>
          </button>
        ) : (
          <button type="button" class="ph-btn" disabled={a.disabled} onClick={() => onUnlock(row)}>
            {a.label}
          </button>
        )}
      </span>
    </div>
  );
}
