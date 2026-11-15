import type { ImpactMetric } from "@/lib/measurement/types";
import { formatDate, formatUnitValue } from "@/lib/analytics/format";
import { EvidenceState } from "./evidence-state";
import { metricWorkflowState } from "@/lib/analytics/series";

export function MetricComparisonTable({ metrics, selectedId, onSelect }: { metrics: ImpactMetric[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!metrics.length) return <div className="analytics-chart-empty" role="status"><strong>No measures shared yet</strong><p>A baseline, target, method, and evidence source are required before a measure appears here.</p></div>;
  return <div className="metric-table-wrap"><table className="metric-table">
    <thead><tr><th>Measure</th><th>Baseline</th><th>Target</th><th>Latest verified</th><th>Evidence</th><th>Last measured</th></tr></thead>
    <tbody>{metrics.map((metric) => <tr key={metric.id} data-selected={selectedId === metric.id ? "true" : "false"}>
      <th scope="row"><button type="button" onClick={() => onSelect(metric.id)} aria-pressed={selectedId === metric.id}><strong>{metric.name}</strong><span>{metric.unit}</span></button></th>
      <td data-label="Baseline">{formatUnitValue(metric.baselineValue, metric.unit)}</td>
      <td data-label="Target">{formatUnitValue(metric.targetValue, metric.unit)}</td>
      <td data-label="Latest verified">{formatUnitValue(metric.currentValue, metric.unit)}</td>
      <td data-label="Evidence"><EvidenceState status={metricWorkflowState(metric)}/></td>
      <td data-label="Last measured">{formatDate(metric.lastMeasuredAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}
