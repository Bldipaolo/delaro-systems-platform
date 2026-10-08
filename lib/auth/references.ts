import { createClient } from "@/lib/supabase/server";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export async function assertOrganizationMemberReference(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | null,
) {
  if (!userId) return;
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) throw new Error("Owner must be an active member of this organization.");
}

export async function assertOpportunityReference(
  supabase: SupabaseClient,
  organizationId: string,
  opportunityId: string | null,
) {
  if (!opportunityId) return;
  const { data, error } = await supabase
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) throw new Error("Opportunity does not belong to this organization.");
}
