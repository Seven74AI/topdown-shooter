import { EVENT_KINDS, type EventKind } from "./eventState";

/**
 * Story 6.8 (brief 18): parses the dev schedule switch (`DEV_EVENTS=car_alarm@3,stampede@4` on the
 * server, `?events=` in solo): `kind@wave` pairs, comma separated. Unknown kinds and bad waves are
 * dropped; an empty result is null (the real draw).
 */
export function parseDevEvents(raw: string | null | undefined): { kind: EventKind; wave: number }[] | null {
  if (!raw) return null;
  const out: { kind: EventKind; wave: number }[] = [];
  for (const part of raw.split(",")) {
    const [k, w] = part.trim().split("@");
    const wave = Number(w);
    if (!(EVENT_KINDS as readonly string[]).includes(k ?? "") || !Number.isInteger(wave) || wave < 1 || wave > 255) continue;
    out.push({ kind: k as EventKind, wave });
  }
  return out.length > 0 ? out : null;
}
