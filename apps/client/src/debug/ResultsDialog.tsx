import { useState } from "preact/hooks";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS / insecure origin (LAN IP over http): fall back to a selected textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok: boolean;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export interface ResultsDialogProps {
  /** Element id prefix (each dialog on the page has its own). */
  id: string;
  title: string;
  report: string;
  onClose: () => void;
}

/**
 * A results box with Copy results and Close (Story 1.11's stress summary; Story 2.10's network
 * summary reuses it), so the designer can paste phone numbers into the docs/perf files.
 */
export function ResultsDialog({ id, title, report, onClose }: ResultsDialogProps) {
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  return (
    <div class="stress-results" role="dialog" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <pre class="stress-results__text">{report}</pre>
      <div class="stress-results__row">
        <button type="button" class="btn" onClick={() => void copyText(report).then((ok) => setCopied(ok ? "ok" : "fail"))}>
          Copy results
        </button>
        <button type="button" class="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {copied && <p class="stress-results__note">{copied === "ok" ? "Copied." : "Copy failed: select the text above."}</p>}
    </div>
  );
}
