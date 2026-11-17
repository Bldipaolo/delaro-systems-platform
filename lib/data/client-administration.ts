import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type ClientDirectoryEntry = {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  engagementStage: string;
  engagementStartDate: string | null;
  description: string | null;
  businessContext: string | null;
  activeImprovements: number;
  outstandingDecisions: number;
  openExceptions: number;
  active: boolean;
};

export type ManagedMembership = {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string;
};

export async function getClientAdministration() {
  const context = await requireInternalUserContext();
  if (!context) return { clients: [] as ClientDirectoryEntry[], memberships: [] as ManagedMembership[] };
  const supabase = await createClient();
  if (!supabase) throw new Error("The client directory is unavailable.");
  const organizationIds = context.organizations.map((organization) => organization.id);

  const [initiatives, decisions, exceptions, memberships] = await Promise.all([
    supabase.from("initiatives").select("organization_id,status").in("organization_id", organizationIds),
    supabase.from("decisions").select("organization_id,status").in("organization_id", organizationIds),
    supabase.from("exceptions").select("organization_id,status").in("organization_id", organizationIds),
    supabase.from("organization_memberships").select("id,organization_id,user_id,role,status")
      .eq("organization_id", context.organization.id).order("created_at"),
  ]);
  for (const result of [initiatives, decisions, exceptions, memberships]) {
    if (result.error) throw new Error(`Unable to load client administration: ${result.error.message}`);
  }

  const userIds = [...new Set((memberships.data ?? []).map((membership) => membership.user_id))];
  const profiles = userIds.length
    ? await supabase.from("profiles").select("id,email,full_name").in("id", userIds)
    : { data: [], error: null };
  if (profiles.error) throw new Error(`Unable to load client members: ${profiles.error.message}`);
  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  const clients = context.organizations.map((organization) => ({
    ...organization,
    activeImprovements: (initiatives.data ?? []).filter((item) => item.organization_id === organization.id && item.status !== "Complete").length,
    outstandingDecisions: (decisions.data ?? []).filter((item) => item.organization_id === organization.id && ["open", "in_discussion", "changes_requested"].includes(item.status)).length,
    openExceptions: (exceptions.data ?? []).filter((item) => item.organization_id === organization.id && !["resolved", "dismissed"].includes(item.status)).length,
    active: organization.id === context.organization.id,
  }));
  return {
    clients,
    memberships: (memberships.data ?? []).map((membership) => ({
      id: membership.id,
      userId: membership.user_id,
      email: profileById.get(membership.user_id)?.email ?? "Profile pending",
      fullName: profileById.get(membership.user_id)?.full_name ?? null,
      role: membership.role,
      status: membership.status,
    })),
  };
}
