import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Role } from "@/lib/domain";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { assertActiveOrganizationId, selectActiveMembership } from "@/lib/auth/organization-selection";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type Organization = {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  engagementStartDate: string | null;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  status: "active";
};

export type UserOrganizationContext = {
  user: User;
  profile: Profile | null;
  organization: Organization;
  membership: OrganizationMembership;
  role: Role;
  organizations: Organization[];
  memberships: OrganizationMembership[];
};

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Resolve auth, active memberships, and the validated active organization.
 * The optional cookie is only a preference; it never grants organization access.
 */
export async function getCurrentUserContext(): Promise<UserOrganizationContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const [{ data: profileRow, error: profileError }, { data: membershipRows, error: membershipsError }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("organization_memberships").select("id,organization_id,user_id,role,status").eq("user_id", user.id).eq("status", "active"),
  ]);

  if (profileError) throw new Error(`Unable to resolve user profile: ${profileError.message}`);
  if (membershipsError) throw new Error(`Unable to resolve organization memberships: ${membershipsError.message}`);

  const memberships = (membershipRows ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role as Role,
    status: "active" as const,
  }));

  if (!memberships.length) return null;

  const organizationIds = memberships.map((membership) => membership.organizationId);
  const { data: organizationRows, error: organizationsError } = await supabase
    .from("organizations")
    .select("id,name,industry,status,engagement_start_date")
    .in("id", organizationIds);

  if (organizationsError) throw new Error(`Unable to resolve organizations: ${organizationsError.message}`);

  const organizations = (organizationRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    industry: row.industry,
    status: row.status,
    engagementStartDate: row.engagement_start_date,
  }));

  const organizationById = new Map(
    organizations
      .filter((organization) => organization.status !== "archived")
      .map((organization) => [organization.id, organization]),
  );
  const membershipsWithOrganizations = memberships.filter((membership) => organizationById.has(membership.organizationId));
  if (!membershipsWithOrganizations.length) return null;

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get("delaro_active_organization")?.value;
  const selectedMembership = selectActiveMembership(memberships, new Set(organizationById.keys()), requestedOrganizationId);
  if (!selectedMembership) return null;
  const organization = organizationById.get(selectedMembership.organizationId);
  if (!organization) return null;

  return {
    user,
    profile: profileRow ? { id: profileRow.id, email: profileRow.email, fullName: profileRow.full_name, avatarUrl: profileRow.avatar_url } : null,
    organization,
    membership: selectedMembership,
    role: selectedMembership.role,
    organizations: membershipsWithOrganizations.map((membership) => organizationById.get(membership.organizationId)).filter((item): item is Organization => Boolean(item)),
    memberships: membershipsWithOrganizations,
  };
}

export async function requireCurrentUserContext() {
  const context = await getCurrentUserContext();
  if (isSupabaseConfigured() && !context) throw new Error("Authenticated organization membership required.");
  return context;
}

export async function requireInternalUserContext() {
  const context = await requireCurrentUserContext();
  if (context && !canViewInternalWorkspace(context.role)) {
    throw new Error("Internal Delaro access required.");
  }
  return context;
}

export function assertActiveOrganization(context: UserOrganizationContext, organizationId: string) {
  assertActiveOrganizationId(context.organization.id, organizationId);
}

export async function requireInternalActionContext(organizationId: string) {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("Supabase is not configured.");
  assertActiveOrganization(context, organizationId);
  return context;
}
