import { demoOpportunities, type Opportunity } from "@/lib/domain";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";

export async function getOpportunities(): Promise<Opportunity[]> {
  if (!isSupabaseConfigured()) return demoOpportunities;
  const context = await getCurrentUserContext();
  if (!context) throw new Error("An authenticated organization is required.");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) throw new Error("The workspace is unavailable.");

  const { data, error } = await supabase.from("opportunities").select("id,title,department_or_process,business_consequence,estimated_annual_value,opportunity_score,evidence_quality,priority,status,owner_id,updated_at").eq("organization_id", context.organization.id).neq("status", "Rejected").order("opportunity_score", { ascending: false });
  if (error) { console.error("Opportunity load failed", { code: error.code }); throw new Error("Unable to load opportunities."); }
  if (!data) throw new Error("Unable to load opportunities.");
  return data.map((row) => ({ id: row.id, title: row.title, process: row.department_or_process, consequence: row.business_consequence, estimatedAnnualValue: row.estimated_annual_value, score: row.opportunity_score, evidenceQuality: row.evidence_quality, priority: row.priority, status: row.status, owner: row.owner_id === context.user.id ? (context.profile?.fullName ?? context.profile?.email ?? "Assigned member") : row.owner_id ? "Assigned member" : "Unassigned", updatedAt: row.updated_at }));
}
