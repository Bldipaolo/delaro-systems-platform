import Link from "next/link";
import { updateSignalRule, updateSignalState } from "@/app/(delaro)/internal/intelligence/actions";
import { signalDate, signalLabel, signalPeriod, signalValue } from "@/components/intelligence/signal-format";
import type { InternalSignalWorkspace, OperationalSignalView, SignalFilters } from "@/lib/operational-intelligence/view-types";

function queryString(filters: SignalFilters, id?: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key === "organizationId" ? "organization" : key, value);
  if (id) params.set("id", id);
  return params.toString();
}

function uniqueOptions(signals: OperationalSignalView[], key: "signalType" | "operationalAreaId" | "workflowId" | "metricId") {
  const labelKey = key === "operationalAreaId" ? "operationalAreaName" : key === "workflowId" ? "workflowName" : key === "metricId" ? "metricName" : null;
  return [...new Map(signals.flatMap((signal) => {
    const value = signal[key];
    if (!value) return [];
    const label = labelKey ? String(signal[labelKey] ?? value) : signalLabel(String(value));
    return [[String(value), label] as const];
  })).entries()];
}

function SignalLedgerRow({ signal, selected, filters }: { signal: OperationalSignalView; selected: boolean; filters: SignalFilters }) {
  return <Link href={`/internal/intelligence?${queryString(filters, signal.id)}`} className="signal-ledger-row" aria-current={selected ? "true" : undefined}>
    <span className={`signal-severity signal-severity-${signal.severity}`}>{signalLabel(signal.severity)}</span>
    <span className="signal-ledger-copy"><strong>{signal.title}</strong><small>{signal.organizationName} · {signalLabel(signal.signalType)}</small></span>
    <span className="signal-ledger-state">{signalLabel(signal.status)}</span>
    <time dateTime={signal.lastObservedAt}>{signalDate(signal.lastObservedAt)}</time>
  </Link>;
}

function SignalInspector({ signal }: { signal: OperationalSignalView }) {
  const deviation = signal.percentageDeviation === null ? "Not calculated" : `${signal.percentageDeviation > 0 ? "+" : ""}${signal.percentageDeviation.toFixed(1)}%`;
  return <section className="signal-inspector" aria-labelledby="signal-inspector-title">
    <header className="signal-inspector-header"><div><span className={`signal-severity signal-severity-${signal.severity}`}>{signalLabel(signal.severity)}</span><h2 id="signal-inspector-title">{signal.title}</h2><p>{signal.summary}</p></div><span className="signal-visibility">{signal.visibility === "client_visible" ? "Client visible" : signal.visibility === "reviewed" ? "Reviewed" : "Internal only"}</span></header>
    <dl className="signal-comparison"><div><dt>Current</dt><dd>{signalValue(signal.currentValue, signal.unit)}</dd></div><div><dt>Reference</dt><dd>{signalValue(signal.referenceValue, signal.unit)}</dd></div><div><dt>Difference</dt><dd>{deviation}</dd></div></dl>
    <div className="signal-inspector-grid">
      <section><h3>What changed</h3><dl className="signal-facts">
        <div><dt>Observed period</dt><dd>{signalPeriod(signal)}</dd></div><div><dt>First detected</dt><dd>{signalDate(signal.firstDetectedAt)}</dd></div>
        <div><dt>Current evidence</dt><dd>{signal.currentSampleSize} observations</dd></div><div><dt>Reference evidence</dt><dd>{signal.referenceSampleSize} observations</dd></div>
        <div><dt>Persistence</dt><dd>{signal.consecutivePeriods} evaluation {signal.consecutivePeriods === 1 ? "period" : "periods"}</dd></div><div><dt>Method</dt><dd>{signalLabel(signal.detectionMethod)}</dd></div>
      </dl></section>
      <section><h3>Operational context</h3><dl className="signal-facts">
        <div><dt>Area</dt><dd>{signal.operationalAreaName ?? "Not linked"}</dd></div><div><dt>Process</dt><dd>{signal.processName ?? "Not linked"}</dd></div>
        <div><dt>Workflow</dt><dd>{signal.workflowName ?? "Not linked"}</dd></div><div><dt>Metric</dt><dd>{signal.metricName ?? "Not linked"}</dd></div>
        <div><dt>Source</dt><dd>{signal.sourceName ?? "Not linked"}</dd></div><div><dt>Confidence</dt><dd>{signalLabel(signal.confidence)}</dd></div>
      </dl></section>
    </div>
    <section className="signal-controls" aria-labelledby="signal-controls-title"><div><h3 id="signal-controls-title">Review and publication</h3><p>Detection records a change. Diagnosis, recommendation, and opportunity creation remain human decisions.</p></div><form action={updateSignalState} className="signal-action-row"><input type="hidden" name="organizationId" value={signal.organizationId}/><input type="hidden" name="signalId" value={signal.id}/>{signal.status === "active" && <button name="action" value="acknowledge">Acknowledge</button>}{signal.status !== "monitoring" && signal.status !== "resolved" && <button name="action" value="monitor">Monitor</button>}{signal.status !== "resolved" && <button name="action" value="resolve">Resolve</button>}{signal.status !== "dismissed" && <button name="action" value="dismiss">Dismiss</button>}{signal.visibility === "client_visible" ? <button name="action" value="unpublish">Remove from client view</button> : <button className="signal-primary-action" name="action" value="publish">Publish client-safe summary</button>}</form></section>
    {signal.rule && signal.ruleId && <details className="signal-rule-editor"><summary>Detection rule</summary><form action={updateSignalRule} className="signal-rule-form"><input type="hidden" name="organizationId" value={signal.organizationId}/><input type="hidden" name="ruleId" value={signal.ruleId}/><label>Current window · days<input name="currentWindowDays" type="number" min="1" max="365" step="1" defaultValue={Math.max(1, Math.round((signal.rule.currentWindowMinutes ?? 1440) / 1440))}/></label><label>Reference window · days<input name="referenceWindowDays" type="number" min="2" max="1095" step="1" defaultValue={Math.max(2, Math.round((signal.rule.referenceWindowMinutes ?? 43200) / 1440))}/></label><label>Current samples<input name="minimumCurrentSamples" type="number" min="1" defaultValue={signal.rule.minimumCurrentSamples}/></label><label>Reference samples<input name="minimumReferenceSamples" type="number" min="1" defaultValue={signal.rule.minimumReferenceSamples}/></label><label>Persistence periods<input name="minimumConsecutivePeriods" type="number" min="1" max="30" defaultValue={signal.rule.minimumConsecutivePeriods}/></label><label>Deviation threshold · %<input name="deviationThresholdPct" type="number" min="0.01" step="0.01" defaultValue={signal.rule.deviationThresholdPct ?? ""}/></label><label>Publication<select name="publicationMode" defaultValue={signal.rule.publicationMode}><option value="internal_only">Internal only</option><option value="review_required">Review required</option>{signal.entityType === "measurement_source" && <option value="auto_publish">Automatic · infrastructure only</option>}</select></label><button type="submit">Save rule</button></form></details>}
    <section className="signal-history"><h3>Audit history</h3>{signal.events.length ? <ol>{signal.events.map((event) => <li key={event.id}><time dateTime={event.occurredAt}>{signalDate(event.occurredAt)}</time><span>{event.summary}</span></li>)}</ol> : <p>No lifecycle events recorded.</p>}</section>
  </section>;
}

export function SignalWorkspace({ workspace, filters, selectedId }: { workspace: InternalSignalWorkspace; filters: SignalFilters; selectedId?: string }) {
  const selected = workspace.signals.find((signal) => signal.id === selectedId) ?? workspace.signals[0] ?? null;
  const areas = uniqueOptions(workspace.signals, "operationalAreaId"); const workflows = uniqueOptions(workspace.signals, "workflowId");
  const metrics = uniqueOptions(workspace.signals, "metricId"); const types = uniqueOptions(workspace.signals, "signalType");
  return <>
    <form className="signal-filters" method="get"><label>Client<select name="organization" defaultValue={workspace.selectedOrganizationId}>{workspace.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Severity<select name="severity" defaultValue={filters.severity ?? ""}><option value="">All severities</option>{["critical","high","medium","low","info"].map((value) => <option key={value} value={value}>{signalLabel(value)}</option>)}</select></label><label>Type<select name="type" defaultValue={filters.type ?? ""}><option value="">All signal types</option>{types.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Status<select name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{["active","acknowledged","monitoring","resolved","dismissed"].map((value) => <option key={value} value={value}>{signalLabel(value)}</option>)}</select></label><label>Area<select name="areaId" defaultValue={filters.areaId ?? ""}><option value="">All areas</option>{areas.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Workflow<select name="workflowId" defaultValue={filters.workflowId ?? ""}><option value="">All workflows</option>{workflows.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Metric<select name="metricId" defaultValue={filters.metricId ?? ""}><option value="">All metrics</option>{metrics.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Period<select name="period" defaultValue={filters.period ?? "30"}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label><button type="submit">Apply filters</button><Link href="/internal/intelligence">Reset</Link></form>
    <div className="signal-result-count" aria-live="polite">{workspace.signals.length} {workspace.signals.length === 1 ? "signal" : "signals"}</div>
    {workspace.signals.length ? <div className="signal-workspace"><section className="signal-ledger" aria-label="Operational signals">{workspace.signals.map((signal) => <SignalLedgerRow key={signal.id} signal={signal} selected={selected?.id === signal.id} filters={filters}/>)}</section>{selected && <SignalInspector signal={selected}/>}</div> : <section className="signal-empty"><h2>No signals match this view</h2><p>Widen the period or reset the filters. Insufficient data and healthy evaluations remain in the internal audit ledger rather than creating attention signals.</p></section>}
  </>;
}
