import type { AnalyticsSeriesPoint } from "@/lib/analytics/series";
import { formatDate } from "@/lib/analytics/format";

type ReferenceLine = { label: string; value: number; tone: "baseline" | "target" };

function coordinates(points: AnalyticsSeriesPoint[], references: ReferenceLine[]) {
  const values = [...points.map((point) => point.value), ...references.map((line) => line.value)];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * 0.14, Math.abs(maximum || 1) * 0.04, 1);
  const low = minimum - padding;
  const high = maximum + padding;
  const range = high - low || 1;
  const x = (index: number) => points.length === 1 ? 360 : 54 + (index / (points.length - 1)) * 626;
  const y = (value: number) => 28 + ((high - value) / range) * 176;
  return { low, high, x, y };
}

export function TimeSeriesChart({
  points,
  references = [],
  valueFormatter,
  emptyTitle = "No verified history yet",
  emptyCopy = "The chart will begin when a measured period and its supporting evidence have been verified.",
}: {
  points: AnalyticsSeriesPoint[];
  references?: ReferenceLine[];
  valueFormatter: (value: number) => string;
  emptyTitle?: string;
  emptyCopy?: string;
}) {
  if (points.length === 0) return <div className="analytics-chart-empty" role="status">
    <span aria-hidden="true" className="analytics-chart-empty-line"/>
    <strong>{emptyTitle}</strong><p>{emptyCopy}</p>
    {references.length > 0 && <dl>{references.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{valueFormatter(line.value)}</dd></div>)}</dl>}
  </div>;

  const plot = coordinates(points, references);
  const verified = points.filter((point) => point.status === "verified");
  const verifiedPath = verified.map((point) => points.findIndex((item) => item.id === point.id)).map((index, sequence) => `${sequence === 0 ? "M" : "L"} ${plot.x(index)} ${plot.y(points[index].value)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, index) => plot.low + ((plot.high - plot.low) * index) / 3).reverse();
  return <div className="analytics-chart">
    <div className="analytics-chart-plot" tabIndex={0} aria-label="Historical performance chart. Scroll horizontally on smaller screens."><svg viewBox="0 0 734 242" role="img" aria-label="Historical performance chart">
      {ticks.map((tick) => <g key={tick}><line x1="54" x2="680" y1={plot.y(tick)} y2={plot.y(tick)} className="analytics-grid-line"/><text x="46" y={plot.y(tick) + 4} textAnchor="end">{valueFormatter(tick)}</text></g>)}
      {references.map((line) => <g key={line.label}><line x1="54" x2="680" y1={plot.y(line.value)} y2={plot.y(line.value)} className={`analytics-reference analytics-reference-${line.tone}`}/><text x="680" y={plot.y(line.value) - 7} textAnchor="end" className="analytics-reference-label">{line.label}</text></g>)}
      {verifiedPath && <path d={verifiedPath} className="analytics-series-line"/>}
      {points.map((point, index) => <g key={point.id}>
        <circle cx={plot.x(index)} cy={plot.y(point.value)} r={point.status === "verified" ? 4 : 5} className={`analytics-series-point analytics-series-point-${point.status}`}/>
        <title>{`${point.label}: ${valueFormatter(point.value)} · ${point.status}`}</title>
      </g>)}
      <text x="54" y="232">{formatDate(points[0].date)}</text><text x="680" y="232" textAnchor="end">{formatDate(points.at(-1)?.date ?? null)}</text>
    </svg></div>
    <div className="analytics-chart-legend" aria-hidden="true"><span><i className="legend-verified"/>Verified</span>{points.some((item) => item.status === "submitted") && <span><i className="legend-submitted"/>Submitted, not verified</span>}</div>
    <details className="analytics-chart-data"><summary>View measurement data</summary><div className="metric-table-wrap"><table><caption>Historical measurements</caption><thead><tr><th>Period</th><th>Value</th><th>Status</th></tr></thead><tbody>{points.map((point) => <tr key={point.id}><td>{point.label}</td><td>{valueFormatter(point.value)}</td><td>{point.status}</td></tr>)}</tbody></table></div></details>
  </div>;
}
