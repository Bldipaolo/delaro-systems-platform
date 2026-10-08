import { ActivityWorkspace } from "@/components/activity/activity-views";
import { getClientOperationalActivity } from "@/lib/data/operational-events";

export default async function ActivityPage() {
  return <ActivityWorkspace activity={await getClientOperationalActivity()}/>;
}
