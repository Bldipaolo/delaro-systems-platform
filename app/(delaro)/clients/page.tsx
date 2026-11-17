import { ClientsView } from "@/components/internal/clients-view";
import { requireInternalUserContext } from "@/lib/auth/context";
import { canAdministerOrganizations } from "@/lib/auth/permissions";
import { getClientAdministration } from "@/lib/data/client-administration";
import { demoOverview } from "@/lib/domain";

export default async function ClientsPage() {
  const context = await requireInternalUserContext();
  const administration = context ? await getClientAdministration() : null;
  return <ClientsView organizationName={context?.organization.name ?? demoOverview.organizationName} industry={context?.organization.industry ?? demoOverview.organizationIndustry} status={context?.organization.status ?? "Demo"} demo={!context} clients={administration?.clients ?? []} memberships={administration?.memberships ?? []} canAdminister={Boolean(context && canAdministerOrganizations(context.role))}/>;
}
