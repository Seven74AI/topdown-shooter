import { useEffect, useState } from "preact/hooks";
import { stressRun } from "./stressScenario";

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

/**
 * Stress test summary (Story 1.11): shown when the 60-s `?stress` run ends, with a Copy results
 * button so the designer can paste phone numbers into docs/perf/epic-1-stress.md. Release builds too.
 */
export function StressResults() {
  const [report, setReport] = useState(stressRun.state.phase === "done" ? stressRun.state.report : "");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  useEffect(
    () =>
      stressRun.subscribe((s) => {
        setReport(s.phase === "done" ? s.report : "");
        setCopied("");
      }),
    [],
  );
  if (!report) return null;
  return (
    <div class="stress-results" role="dialog" aria-labelledby="stress-title">
      <h2 id="stress-title">Stress test results</h2>
      <pre class="stress-results__text">{report}</pre>
      <div class="stress-results__row">
        <button type="button" class="btn" onClick={() => void copyText(report).then((ok) => setCopied(ok ? "ok" : "fail"))}>
          Copy results
        </button>
        <button type="button" class="btn" onClick={() => setReport("")}>
          Close
        </button>
      </div>
      {copied && <p class="stress-results__note">{copied === "ok" ? "Copied." : "Copy failed: select the text above."}</p>}
    </div>
  );
}
