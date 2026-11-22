import { useEffect, useState } from "preact/hooks";
import { netSummary } from "./netSummary";
import { ResultsDialog } from "./ResultsDialog";

/**
 * Story 2.10: the online wave summary, shown at `wave.ended` while the perf overlay is on, with
 * Copy results for docs/perf/epic-2-network.md. Release builds too.
 */
export function NetResults() {
  const [report, setReport] = useState(netSummary.report);
  useEffect(() => netSummary.subscribe(setReport), []);
  if (!report) return null;
  return <ResultsDialog key={report} id="net" title="Network results" report={report} onClose={() => netSummary.dismiss()} />;
}
