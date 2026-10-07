import { ClientOverview } from "@/components/dashboard/overview";
import { demoOverview } from "@/lib/domain";

export default function OverviewPage() {
  return <ClientOverview overview={demoOverview}/>;
}
