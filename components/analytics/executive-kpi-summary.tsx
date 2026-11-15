import { EvidenceState } from "./evidence-state";
import type { EvidenceStatus } from "@/lib/measurement/types";

export type ExecutiveKpi = {
  id: string;
  label: string;
  value: string;
  context: string;
  status: EvidenceStatus;
  stateLabel?: string;
  emphasis?: boolean;
};

export function ExecutiveKpiSummary({ items }: { items: ExecutiveKpi[] }) {
  return <div className="analytics-kpi-strip" aria-label="Executive financial summary">
    {items.map((item) => <article key={item.id} className="analytics-kpi" data-emphasis={item.emphasis ? "true" : "false"}>
      <div className="analytics-kpi-heading"><span>{item.label}</span><EvidenceState status={item.status} label={item.stateLabel}/></div>
      <strong>{item.value}</strong>
      <p>{item.context}</p>
    </article>)}
  </div>;
}
