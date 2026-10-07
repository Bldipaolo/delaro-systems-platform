import { demoOpportunities, type Opportunity } from "@/lib/domain";

export async function getOpportunities(organizationId?: string): Promise<Opportunity[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !organizationId) return demoOpportunities;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return demoOpportunities;

  const { data, error } = await supabase.from("opportunities").select("id,title,department_or_process,business_consequence,estimated_annual_value,opportunity_score,evidence_quality,priority,status,owner_id,updated_at").eq("organization_id", organizationId).neq("status", "Rejected").order("opportunity_score", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, title: row.title, process: row.department_or_process, consequence: row.business_consequence, estimatedAnnualValue: row.estimated_annual_value, score: row.opportunity_score, evidenceQuality: row.evidence_quality, priority: row.priority, status: row.status, owner: row.owner_id ?? "Unassigned", lastUpdated: new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(row.updated_at)) }));
}
