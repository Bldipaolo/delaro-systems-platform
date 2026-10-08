import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getInternalMeasurement } from "@/lib/data/internal-measurement";

export default async function MeasurementPage() {
  const context = await requireInternalUserContext();
  const { metrics } = await getInternalMeasurement();
  const value = (amount: number | null, unit: string) => amount === null ? "Pending" : `${amount.toLocaleString("en-US")} ${unit}`;
  return <InternalPage stage="Measure / definitions" title="Metrics" description="Baseline, target, and latest observation stay distinct. Unverified observations are visible for review but never reported as a verified result." demo={!context}>
    <DataSection title={`Defined metrics · ${metrics.length}`} empty="No measures have been defined yet.">{metrics.map((metric) => <DataRow key={metric.id} title={metric.name} subtitle={metric.method} values={[{ label: "Baseline", value: value(metric.baseline, metric.unit) }, { label: "Target", value: value(metric.target, metric.unit) }, { label: "Latest observation", value: value(metric.latestObservation, metric.unit) }, { label: "Observation state", value: metric.observationStatus }, { label: "Confidence", value: metric.confidence }, { label: "Last measured", value: metric.observedAt ? new Date(metric.observedAt).toLocaleDateString("en-US") : "Pending" }]} />)}</DataSection>
  </InternalPage>;
}
