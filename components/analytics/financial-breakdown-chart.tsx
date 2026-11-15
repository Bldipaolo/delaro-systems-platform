import type { CalculatedValueModel } from "@/lib/economic-impact/types";
import { selectEconomicModelsForAggregation } from "@/lib/economic-impact/calculate";
import { formatCurrency } from "@/lib/analytics/format";

function width(value: number | null, maximum: number): string {
  return value === null || maximum <= 0 ? "0%" : `${Math.max(1, Math.min(100, (value / maximum) * 100))}%`;
}

export function FinancialBreakdownChart({ models }: { models: CalculatedValueModel[] }) {
  const eligible = selectEconomicModelsForAggregation(models);
  const maximum = Math.max(...eligible.map((model) => model.theoreticalMaximum ?? 0), 0);
  if (!eligible.length) return <div className="analytics-chart-empty" role="status"><strong>No approved value models</strong><p>Financial breakdowns appear only after a complete model has been reviewed for currency and benefit-stream overlap.</p></div>;
  return <div className="financial-breakdown">
    <div className="financial-breakdown-legend" aria-hidden="true"><span><i className="legend-theoretical"/>Theoretical ceiling</span><span><i className="legend-recoverable"/>Recoverable estimate</span><span><i className="legend-expected"/>Expected annual value</span></div>
    {eligible.map((model) => <article key={model.id} className="financial-breakdown-row">
      <div className="financial-breakdown-label"><strong>{model.initiativeName ?? model.name}</strong><span>{model.initiativeName ? model.name : "Value model"}</span></div>
      <div className="financial-breakdown-plot" aria-hidden="true">
        <i className="financial-bar financial-bar-theoretical" style={{ width: width(model.theoreticalMaximum, maximum) }}/>
        <i className="financial-bar financial-bar-recoverable" style={{ width: width(model.realisticallyRecoverable, maximum) }}/>
        <i className="financial-bar financial-bar-expected" style={{ width: width(model.expectedAnnualValue, maximum) }}/>
      </div>
      <dl className="financial-breakdown-values"><div><dt>Expected</dt><dd>{formatCurrency(model.expectedAnnualValue, model.currencyCode, { compact: true })}</dd></div><div><dt>Recoverable</dt><dd>{formatCurrency(model.realisticallyRecoverable, model.currencyCode, { compact: true })}</dd></div><div><dt>Theoretical</dt><dd>{formatCurrency(model.theoreticalMaximum, model.currencyCode, { compact: true })}</dd></div></dl>
    </article>)}
  </div>;
}
