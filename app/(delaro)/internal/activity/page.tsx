import { InternalActivityView } from "@/components/activity/activity-views";
import { getInternalOperationalActivity } from "@/lib/data/operational-events";

export default async function InternalActivityPage() {
  const { technicalEvents, ...activity } = await getInternalOperationalActivity();
  return <InternalActivityView activity={activity} technicalEvents={technicalEvents}/>;
}
