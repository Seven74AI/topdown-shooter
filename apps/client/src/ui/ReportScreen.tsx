import { useEffect, useRef, useState } from "preact/hooks";
import { REPORT_NOTE_MAX, REPORT_NOTE_WARN } from "@topdown/shared";
import { sendReport, type ReportCall } from "../net/report";

/** Story 10.6 (AC 2; Q1–Q3): the player text. AC 2 fixes the "what is sent" words. */
export const REPORT_TEXT = {
  open: "Report a problem",
  openHint: "Send us your note and this phone's log",
  title: "Report a problem",
  whatIsSent: "What is sent: your note, the last 200 log lines, your device and browser",
  notePlaceholder: "What went wrong? (optional)",
  noteLabel: "Your note",
  counter: (n: number) => `${n} / ${REPORT_NOTE_MAX}`,
  send: "Send",
  sending: "Sending…",
  cancel: "Cancel",
  sent: (code: string) => `Sent: report ${code}`,
  sentHint: "Tell us this code if you want to talk about it.",
  close: "Close",
} as const;

type Send = (note: string) => Promise<ReportCall>;

/**
 * Story 10.6 (10.6-Q1 = RP1, designer 2026-11-27; after 10.1's Delete confirm card): one centred Lumen card. The note stays after a failure; Send is
 * disabled while sending (`aria-busy`); Cancel / Esc / Close go back to where the player came from (`onClose`).
 */
export function ReportCard({ onClose, send = sendReport, testId = "report-card" }: { onClose: () => void; send?: Send; testId?: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      alive.current = false;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  useEffect(() => {
    if (code !== null) closeRef.current?.focus({ preventScroll: true });
  }, [code]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await send(note);
    if (!alive.current) return;
    setBusy(false);
    if (r.kind === "sent") setCode(r.code);
    else setError(r.text);
  };

  if (code !== null) {
    return (
      <div class="ac-card rp-card" data-testid={testId}>
        <h1 id="rp-title" class="ac-card__title">
          {REPORT_TEXT.title}
        </h1>
        <p class="rp-sent" role="status" data-testid="report-sent">
          {REPORT_TEXT.sent(code)}
        </p>
        <p class="rp-what">{REPORT_TEXT.sentHint}</p>
        <div class="rp-actions">
          <button ref={closeRef} type="button" class="ph-btn ph-btn--confirm ac-btn" onClick={onClose} data-testid="report-close">
            {REPORT_TEXT.close}
          </button>
        </div>
      </div>
    );
  }

  const n = note.length;
  return (
    <form
      class="ac-card rp-card"
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h1 id="rp-title" class="ac-card__title">
        {REPORT_TEXT.title}
      </h1>
      <p class="rp-what">{REPORT_TEXT.whatIsSent}</p>
      <label class="rp-field">
        <span class="rp-visually-hidden">{REPORT_TEXT.noteLabel}</span>
        <textarea
          ref={noteRef}
          class="menu__input rp-note"
          rows={3}
          maxLength={REPORT_NOTE_MAX}
          placeholder={REPORT_TEXT.notePlaceholder}
          value={note}
          disabled={busy}
          onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value.slice(0, REPORT_NOTE_MAX))}
          data-testid="report-note"
        />
        <span class={n >= REPORT_NOTE_WARN ? "rp-count rp-count--warn" : "rp-count"} aria-live="polite" data-testid="report-count">
          {REPORT_TEXT.counter(n)}
        </span>
      </label>
      {error && (
        <p class="menu__error rp-error" role="alert" data-testid="report-error">
          {error}
        </p>
      )}
      <div class="rp-actions">
        <button type="submit" class="ph-btn ph-btn--confirm ac-btn" disabled={busy} aria-busy={busy} data-testid="report-send">
          {busy ? REPORT_TEXT.sending : REPORT_TEXT.send}
        </button>
        <button type="button" class="ph-btn ac-btn" disabled={busy} onClick={onClose} data-testid="report-cancel">
          {REPORT_TEXT.cancel}
        </button>
      </div>
    </form>
  );
}
