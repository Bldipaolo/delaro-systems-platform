import { ActivityWorkspace } from "@/components/activity/activity-views";
import { getClientOperationalActivity } from "@/lib/data/operational-events";
import { getClientWorkflows } from "@/lib/data/workflow-observability";

export default async function ActivityPage() {
  const [activity, workflows] = await Promise.all([getClientOperationalActivity(), getClientWorkflows()]);
  return <ActivityWorkspace activity={activity} workflows={workflows}/>;
}
