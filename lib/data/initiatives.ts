import { demoOverview, type Initiative } from "@/lib/domain";

export async function getInitiatives(organizationId?: string): Promise<Initiative[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !organizationId) return demoOverview.activeInitiatives;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return demoOverview.activeInitiatives;

  const { data, error } = await supabase.from("initiatives").select("id,title,objective,current_phase,owner_id,progress,next_milestone,status").eq("organization_id", organizationId).order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, title: row.title, objective: row.objective, phase: row.current_phase, owner: row.owner_id ?? "Unassigned", progress: row.progress, nextMilestone: row.next_milestone ?? "To be set", status: row.status }));
}
