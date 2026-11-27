import { InternalPage } from "@/components/internal/methodology";
import { SignalWorkspace } from "@/components/intelligence/signal-workspace";
import { getInternalOperationalSignals } from "@/lib/data/operational-intelligence";
import type { SignalFilters } from "@/lib/operational-intelligence/view-types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function InternalIntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = first(params.period);
  const filters: SignalFilters = {
    organizationId: first(params.organization), severity: first(params.severity), type: first(params.type), status: first(params.status),
    areaId: first(params.areaId), workflowId: first(params.workflowId), metricId: first(params.metricId),
    period: period === "7" || period === "90" ? period : "30",
  };
  const workspace = await getInternalOperationalSignals(filters);
  return <InternalPage stage="Diagnose / operational intelligence" title="Intelligence" description="Review evidence-backed changes in operating performance before deciding whether they represent a constraint or an improvement opportunity." demo={workspace.signals.some((signal) => signal.demo)}>
    <SignalWorkspace workspace={workspace} filters={filters} selectedId={first(params.id)}/>
  </InternalPage>;
}
