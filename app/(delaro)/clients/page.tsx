import { ClientsView } from "@/components/internal/clients-view";
import { requireInternalUserContext } from "@/lib/auth/context";
import { demoOverview } from "@/lib/domain";

export default async function ClientsPage() {
  const context = await requireInternalUserContext();
  return <ClientsView organizationName={context?.organization.name ?? demoOverview.organizationName} industry={context?.organization.industry ?? demoOverview.organizationIndustry} status={context?.organization.status ?? "Demo"} demo={!context}/>;
}
