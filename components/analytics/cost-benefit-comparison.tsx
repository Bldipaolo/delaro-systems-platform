import { formatCurrency } from "@/lib/analytics/format";
import { EvidenceState } from "./evidence-state";

export type CostBenefitCase = {
  id: string;
  name: string;
  currencyCode: string;
  costCurrencyCode: string;
  implementationCost: number | null;
  expectedAnnualValue: number | null;
  paybackMonths: number | null;
  paybackNote: string;
  approved: boolean;
  comparable: boolean;
};

function barWidth(value: number | null, maximum: number): string {
  return value === null || maximum <= 0 ? "0%" : `${Math.max(1, Math.min(100, (value / maximum) * 100))}%`;
}

export function CostBenefitComparison({ cases }: { cases: CostBenefitCase[] }) {
  if (!cases.length) return <div className="analytics-chart-empty" role="status"><strong>No supported comparisons yet</strong><p>Add an implementation cost and approved expected annual value before payback can be analyzed.</p></div>;
  return <div className="cost-benefit-comparison">
    <div className="cost-benefit-legend" aria-hidden="true"><span><i className="legend-cost"/>Implementation cost</span><span><i className="legend-benefit"/>Expected annual value</span></div>
    {cases.map((item) => {
      const maximum = Math.max(item.implementationCost ?? 0, item.expectedAnnualValue ?? 0, 1);
      return <article key={item.id} className="cost-benefit-row">
        <div className="cost-benefit-heading"><div><strong>{item.name}</strong><EvidenceState status={item.approved ? "submitted" : "pending"} label={item.approved ? "Modeled" : "Approval pending"}/></div><span>{item.paybackMonths === null ? "Payback pending" : `${item.paybackMonths.toFixed(1)} months`}</span></div>
        <div className="cost-benefit-bars" aria-hidden="true">{item.comparable && item.implementationCost !== null && <i className="cost-benefit-cost" style={{ width: barWidth(item.implementationCost, maximum) }}/>} {item.comparable && item.expectedAnnualValue !== null && <i className="cost-benefit-value" style={{ width: barWidth(item.expectedAnnualValue, maximum) }}/>}</div>
        <dl><div><dt>Implementation cost</dt><dd>{formatCurrency(item.implementationCost, item.costCurrencyCode, { maximumFractionDigits: 0 })}</dd></div><div><dt>Expected annual value</dt><dd>{formatCurrency(item.expectedAnnualValue, item.currencyCode, { maximumFractionDigits: 0 })}</dd></div><div><dt>Payback basis</dt><dd>{item.paybackNote}</dd></div></dl>
      </article>;
    })}
  </div>;
}
