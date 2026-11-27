import Link from "next/link";
import { ArrowIcon } from "@/components/layout/icons";
import { TimeSeriesChart } from "@/components/analytics/time-series-chart";
import { signalDate, signalDestination, signalLabel, signalPeriod, signalValue } from "@/components/intelligence/signal-format";
import type { AnalyticsSeriesPoint } from "@/lib/analytics/series";
import type { OperationalSignalView } from "@/lib/operational-intelligence/view-types";

function activeDuration(firstDetectedAt: string) {
  const days = Math.max(1, Math.ceil((Date.now() - Date.parse(firstDetectedAt)) / 86_400_000));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function ClientAttention({ signals }: { signals: OperationalSignalView[] }) {
  return <main className="content attention-center"><header className="attention-header"><div><h1>Needs attention</h1><p>Material changes that Delaro has reviewed or high-confidence infrastructure issues that can be stated directly.</p></div><span>{signals.length} active {signals.length === 1 ? "signal" : "signals"}</span></header>
    {signals.some((signal) => signal.demo) && <div className="workflow-demo-note"><strong>Illustrative demo signals</strong><span>These examples show how the attention experience works. They are not production findings.</span></div>}
    {signals.length ? <section className="attention-signal-list" aria-label="Operational signals requiring attention">{signals.map((signal) => <Link key={signal.id} href={`/attention/${signal.id}`}><span className={`signal-severity signal-severity-${signal.severity}`}>{signalLabel(signal.severity)}</span><div><strong>{signal.title}</strong><p>{signal.summary}</p><small>{signal.operationalAreaName ?? signal.workflowName ?? signal.metricName ?? signal.sourceName ?? "Operational intelligence"} · active {activeDuration(signal.firstDetectedAt)}</small></div><span className="attention-signal-change">{signal.percentageDeviation === null ? signalLabel(String(signal.evidence.sourceHealth ?? signal.status)) : `${signal.percentageDeviation > 0 ? "+" : ""}${signal.percentageDeviation.toFixed(1)}%`}</span><ArrowIcon size={16}/></Link>)}</section> : <section className="signal-empty"><h2>No published signals need attention</h2><p>Healthy and insufficient-data evaluations do not create client alerts. Internal findings remain private until reviewed.</p><Link href="/overview" className="text-link">Return to overview <ArrowIcon size={14}/></Link></section>}
  </main>;
}

export function ClientSignalDetail({ signal, history }: { signal: OperationalSignalView; history: AnalyticsSeriesPoint[] }) {
  const related = signalDestination(signal);
  const referenceLabel = signal.signalType === "metric_target_breach" ? "Target" : "Reference";
  return <main className="content signal-detail-page"><Link href="/attention" className="signal-back-link">← Back to attention</Link>
    <header className="signal-detail-header"><div><span className={`signal-severity signal-severity-${signal.severity}`}>{signalLabel(signal.severity)}</span><h1>{signal.title}</h1><p>{signal.summary}</p></div><dl><div><dt>Status</dt><dd>{signalLabel(signal.status)}</dd></div><div><dt>First detected</dt><dd>{signalDate(signal.firstDetectedAt)}</dd></div><div><dt>Last observed</dt><dd>{signalDate(signal.lastObservedAt)}</dd></div></dl></header>
    {signal.demo && <div className="workflow-demo-note"><strong>Illustrative signal</strong><span>This record demonstrates the evidence and explanation format. It is not a production finding.</span></div>}
    <dl className="signal-comparison signal-comparison-client"><div><dt>Current</dt><dd>{signalValue(signal.currentValue, signal.unit)}</dd></div><div><dt>{referenceLabel}</dt><dd>{signalValue(signal.referenceValue, signal.unit)}</dd></div><div><dt>Difference</dt><dd>{signal.percentageDeviation === null ? "Not calculated" : `${signal.percentageDeviation > 0 ? "+" : ""}${signal.percentageDeviation.toFixed(1)}%`}</dd></div></dl>
    <section className="signal-history-chart"><div className="section-heading"><div><h2>Observed change</h2><p className="activity-section-intro">The chart uses published measurement records and keeps observed values distinct from verified evidence.</p></div></div><TimeSeriesChart points={history} references={signal.referenceValue === null ? [] : [{ label: referenceLabel, value: signal.referenceValue, tone: "baseline" }]} valueFormatter={(value) => signalValue(value, signal.unit)} emptyTitle="No client-safe time series available" emptyCopy="The signal explanation remains available, but supporting records are not published for this signal type."/></section>
    <div className="signal-detail-grid"><section><h2>Evidence</h2><dl className="signal-facts"><div><dt>Current period</dt><dd>{signalPeriod(signal)}</dd></div><div><dt>Current observations</dt><dd>{signal.currentSampleSize}</dd></div><div><dt>Reference observations</dt><dd>{signal.referenceSampleSize}</dd></div><div><dt>Detection method</dt><dd>{signalLabel(signal.detectionMethod)}</dd></div><div><dt>Evidence confidence</dt><dd>{signalLabel(signal.confidence)}</dd></div><div><dt>Persistence</dt><dd>{signal.consecutivePeriods} evaluation {signal.consecutivePeriods === 1 ? "period" : "periods"}</dd></div></dl></section><section><h2>Operational context</h2><dl className="signal-facts"><div><dt>Area</dt><dd>{signal.operationalAreaName ?? "Not linked"}</dd></div><div><dt>Process</dt><dd>{signal.processName ?? "Not linked"}</dd></div><div><dt>Workflow</dt><dd>{signal.workflowName ?? "Not linked"}</dd></div><div><dt>Metric</dt><dd>{signal.metricName ?? "Not linked"}</dd></div><div><dt>Source</dt><dd>{signal.sourceName ?? "Not linked"}</dd></div></dl>{related && <Link href={related.href} className="text-link">Open {related.label} <ArrowIcon size={14}/></Link>}</section></div>
    <section className="signal-history"><h2>What changed</h2><ol>{signal.events.map((event) => <li key={event.id}><time dateTime={event.occurredAt}>{signalDate(event.occurredAt)}</time><span>{event.summary}</span></li>)}</ol></section>
  </main>;
}
