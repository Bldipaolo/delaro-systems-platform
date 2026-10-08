import { demoOverview, type Initiative } from "@/lib/domain";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";

export async function getInitiatives(): Promise<Initiative[]> {
  if (!isSupabaseConfigured()) return demoOverview.activeInitiatives;
  const context = await getCurrentUserContext();
  if (!context) return [];
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("initiatives").select("id,title,objective,current_phase,owner_id,progress,next_milestone,status").eq("organization_id", context.organization.id).order("updated_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, title: row.title, objective: row.objective, phase: row.current_phase, owner: row.owner_id === context.user.id ? (context.profile?.fullName ?? context.profile?.email ?? "Assigned member") : row.owner_id ? "Assigned member" : "Unassigned", progress: row.progress, nextMilestone: row.next_milestone ?? "To be set", status: row.status }));
}
