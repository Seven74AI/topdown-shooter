import type { KeyboardMouse } from "../input/KeyboardMouse";
import type { SimHost } from "../sim/SimHost";
import type { HudModel } from "./hudModel";
import { markPingSent, pickPing, togglePingWheel } from "./pingWheelState";

/** Story 8.7 (AC 8): the ping chirp's volume. */
export const PING_SFX_VOLUME = 0.8;

/** Story 8.7 (AC 8): the chirp's pan from the ping's screen x (px): −1 at the left edge … 1 at the right, clamped. */
export function pingPan(sx: number, screenW: number): number {
  if (!(screenW > 0)) return 0;
  return Math.max(-1, Math.min(1, (sx / screenW) * 2 - 1));
}

/**
 * Story 8.7 (AC 2–4, P4, P6): one frame of the ping controls, in the GameScene before the build keys.
 *
 * - The button shows online (`host.pings`), with the link up (not reconnecting / seat kept), the room not frozen, a run on screen, in a
 *   build phase, a wave or the vote, my survivor standing or downed (E8-P4: out = spectating can't), not holding or
 *   moving a building and no building selected (`busy`), menu and shop closed (`blocked`).
 * - F toggles the wheel (only while the button shows); while the wheel is open the digit latch is taken here: 1–4 pick
 *   a ping, 5–7 do nothing (the build bar's digits are ignored while it is open).
 * - A pick (chip tap or digit) is sent once (`host.sendPing`; the server stamps where and who), only while the button
 *   shows; the 1.2 s cooldown starts with the send.
 * - Outside build / wave / vote nobody's ping is shown (the lobby, Results).
 */
export function pingFrame(m: HudModel, kb: KeyboardMouse, host: SimHost, linkOk: boolean, runOnScreen: boolean, blocked: boolean, busy: boolean, nowMs: number): void {
  const w = host.world;
  const phase = w.run.phase;
  const inRun = phase === "build" || phase === "wave" || phase === "vote";
  const me = w.players.get(host.localPlayerId);
  const standing = me !== undefined && (me.status === "alive" || me.status === "downed");
  m.pingButton = host.pings !== null && linkOk && !host.roomFrozen && runOnScreen && inRun && standing && !blocked && !busy; // review L2: not frozen
  m.pingSlot = host.pings !== null ? host.playerInfo(host.localPlayerId).slot : -1;
  if (kb.takePing() && m.pingButton) togglePingWheel(m.ping, nowMs);
  if (m.ping.open && m.pingButton) {
    const d = kb.takeBuild();
    if (d >= 0 && d < 4) pickPing(m.ping, d, nowMs);
  }
  // review L3: sent only while the button shows (a pick latched the frame it hid is dropped); the cooldown starts on the send
  if (m.ping.pick >= 0) {
    if (m.pingButton) {
      host.sendPing(m.ping.pick);
      markPingSent(m.ping, nowMs);
    }
    m.ping.pick = -1;
  }
  if (!inRun) host.pings?.clearAll();
}
