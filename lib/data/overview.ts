import { demoOverview, type ClientOverview } from "@/lib/domain";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { getClientEconomicImpact } from "@/lib/data/economic-impact";

function money(value: number | null, currencyCode: string | null) {
  if (value === null || !currencyCode) return "$—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).format(value);
}

export async function getClientOverview(): Promise<ClientOverview> {
  if (!isSupabaseConfigured()) return demoOverview;
  const context = await getCurrentUserContext();
  if (!context) return { ...demoOverview, organizationName: "Workspace unavailable", organizationIndustry: "", activeInitiatives: [], priorities: [] };

  const supabase = await (await import("@/lib/supabase/server")).createClient();
  if (!supabase) return { ...demoOverview, organizationName: "Workspace unavailable", organizationIndustry: "", activeInitiatives: [], priorities: [] };
  const [{ data, error }, economic] = await Promise.all([
    supabase.from("initiatives").select("id,title,objective,current_phase,owner_id,progress,next_milestone,status").eq("organization_id", context.organization.id).order("updated_at", { ascending: false }),
    getClientEconomicImpact(),
  ]);
  if (error) throw new Error(`Unable to load workspace overview: ${error.message}`);

  const activeInitiatives = (data ?? []).filter((row) => row.status !== "Complete").map((row) => ({
    id: row.id,
    title: row.title,
    objective: row.objective,
    phase: row.current_phase,
    owner: row.owner_id === context.user.id ? (context.profile?.fullName ?? context.profile?.email ?? "Assigned member") : row.owner_id ? "Assigned member" : "Unassigned",
    progress: row.progress,
    nextMilestone: row.next_milestone ?? "To be set",
    status: row.status,
  }));

  return {
    ...demoOverview,
    organizationName: context.organization.name,
    organizationIndustry: context.organization.industry ?? "",
    activeInitiatives,
    priorities: activeInitiatives.slice(0, 3).map((initiative) => initiative.title),
    theoreticalOpportunityValue: money(economic.summary.theoreticalMaximum, economic.summary.currencyCode),
    recoverableOpportunityValue: money(economic.summary.realisticallyRecoverable, economic.summary.currencyCode),
    estimatedOpportunityValue: money(economic.summary.expectedAnnualValue, economic.summary.currencyCode),
    realizedValue: money(economic.summary.verifiedRealizedValue, economic.summary.currencyCode),
  };
}
