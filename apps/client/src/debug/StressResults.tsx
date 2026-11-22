import { useEffect, useState } from "preact/hooks";
import { stressRun } from "./stressScenario";
import { ResultsDialog } from "./ResultsDialog";

/**
 * Stress test summary (Story 1.11): shown when the 60-s `?stress` run ends, with a Copy results
 * button so the designer can paste phone numbers into docs/perf/epic-1-stress.md. Release builds too.
 */
export function StressResults() {
  const [report, setReport] = useState(stressRun.state.phase === "done" || stressRun.state.phase === "interrupted" ? stressRun.state.report : "");
  useEffect(() => stressRun.subscribe((s) => setReport(s.phase === "done" || s.phase === "interrupted" ? s.report : "")), []);
  if (!report) return null;
  return <ResultsDialog key={report} id="stress" title="Stress test results" report={report} onClose={() => setReport("")} />;
}
