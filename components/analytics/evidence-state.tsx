import type { EvidenceStatus } from "@/lib/measurement/types";

const labels: Record<EvidenceStatus | "observed", string> = {
  pending: "Evidence pending",
  submitted: "Submitted for review",
  verified: "Verified",
  rejected: "Needs revision",
  observed: "Observed · not verified",
};

export function EvidenceState({ status, label }: { status: EvidenceStatus | "observed"; label?: string }) {
  return <span className="analytics-state" data-state={status}>{label ?? labels[status]}</span>;
}
