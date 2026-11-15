import type { EvidenceStatus } from "@/lib/measurement/types";

const labels: Record<EvidenceStatus, string> = {
  pending: "Evidence pending",
  submitted: "Submitted for review",
  verified: "Verified",
  rejected: "Needs revision",
};

export function EvidenceState({ status, label }: { status: EvidenceStatus; label?: string }) {
  return <span className="analytics-state" data-state={status}>{label ?? labels[status]}</span>;
}
