"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserContext } from "@/lib/auth/context";
import { inviteOrResolveAuthUser, type InvitationAdminClient } from "@/lib/auth/invitations";
import { canAdministerOrganizations } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const organizationStatuses = ["prospect", "active", "paused", "complete", "archived"] as const;
const engagementStages = ["onboarding", "map", "diagnose", "quantify", "prioritize", "architect", "implement", "measure", "improve"] as const;
const clientRoles = ["client_admin", "client_user", "read_only"] as const;

async function requireOrganizationAdministrator() {
  const context = await getCurrentUserContext();
  if (!context || !canAdministerOrganizations(context.role)) throw new Error("Delaro administrator access required.");
  const supabase = await createClient();
  if (!supabase) throw new Error("The client workspace is unavailable.");
  return { context, supabase };
}

function inviteRedirectUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = configured || (productionHost ? `https://${productionHost}` : "http://localhost:3200");
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", "/account");
  return url.toString();
}

export async function switchOrganization(formData: FormData) {
  const organizationId = z.string().uuid().parse(formData.get("organizationId"));
  const context = await getCurrentUserContext();
  if (!context || !context.memberships.some((membership) => membership.organizationId === organizationId)) {
    throw new Error("You do not have access to that organization.");
  }
  (await cookies()).set("delaro_active_organization", organizationId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/clients");
}

export async function createOrganization(formData: FormData) {
  const input = z.object({
    provisioningRequestId: z.string().uuid(),
    name: z.string().trim().min(2).max(160), industry: z.string().trim().max(160),
    description: z.string().trim().max(4000), businessContext: z.string().trim().max(8000),
    engagementStartDate: z.union([z.string().date(), z.literal("")]),
  }).parse(Object.fromEntries(formData));
  const { context, supabase } = await requireOrganizationAdministrator();
  const { data: organizationId, error } = await supabase.rpc("provision_client_organization", {
    requested_organization_id: input.provisioningRequestId,
    organization_name: input.name,
    organization_industry: input.industry || null,
    organization_description: input.description || null,
    organization_business_context: input.businessContext || null,
    organization_engagement_start_date: input.engagementStartDate || null,
  });
  if (error || !organizationId) {
    console.error("Organization provisioning failed", { code: error?.code });
    throw new Error("Unable to create the client organization.");
  }
  (await cookies()).set("delaro_active_organization", organizationId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
  redirect("/clients");
}

export async function updateOrganization(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(), name: z.string().trim().min(2).max(160), industry: z.string().trim().max(160),
    description: z.string().trim().max(4000), businessContext: z.string().trim().max(8000),
    status: z.enum(organizationStatuses), engagementStage: z.enum(engagementStages),
    engagementStartDate: z.union([z.string().date(), z.literal("")]),
  }).parse(Object.fromEntries(formData));
  const { context, supabase } = await requireOrganizationAdministrator();
  if (input.organizationId !== context.organization.id) throw new Error("Switch to this organization before editing it.");
  const { data, error } = await supabase.from("organizations").update({
    name: input.name, industry: input.industry || null, description: input.description || null,
    business_context: input.businessContext || null, status: input.status, engagement_stage: input.engagementStage,
    engagement_start_date: input.engagementStartDate || null,
  }).eq("id", context.organization.id).select("id").maybeSingle();
  if (error || !data) {
    console.error("Organization update failed", { code: error?.code });
    throw new Error("Unable to update this client organization.");
  }
  revalidatePath("/clients"); revalidatePath("/portfolio");
}

export async function inviteClientMember(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(),
    email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
    role: z.enum(clientRoles),
  }).parse(Object.fromEntries(formData));
  const { context, supabase } = await requireOrganizationAdministrator();
  if (input.organizationId !== context.organization.id) throw new Error("Switch to this organization before inviting members.");

  const admin = createAdminClient();
  const { user } = await inviteOrResolveAuthUser(admin as unknown as InvitationAdminClient, {
    email: input.email,
    redirectTo: inviteRedirectUrl(),
    organizationName: context.organization.name,
  });

  const { error } = await supabase.from("organization_memberships").upsert({
    organization_id: context.organization.id, user_id: user.id, role: input.role, status: "active",
  }, { onConflict: "organization_id,user_id" });
  if (error) {
    console.error("Client membership creation failed", { code: error.code });
    throw new Error("The account exists, but its organization membership could not be saved.");
  }
  revalidatePath("/clients");
}

export async function updateClientMembership(formData: FormData) {
  const input = z.object({
    membershipId: z.string().uuid(), role: z.enum(clientRoles), status: z.enum(["active", "suspended"]),
  }).parse(Object.fromEntries(formData));
  const { context, supabase } = await requireOrganizationAdministrator();
  const { data: existing } = await supabase.from("organization_memberships").select("id,role")
    .eq("organization_id", context.organization.id).eq("id", input.membershipId).maybeSingle();
  if (!existing || existing.role === "delaro_admin" || existing.role === "delaro_consultant") {
    throw new Error("Internal Delaro memberships cannot be changed from the client member controls.");
  }
  const { data, error } = await supabase.from("organization_memberships").update({ role: input.role, status: input.status })
    .eq("organization_id", context.organization.id).eq("id", input.membershipId).select("id").maybeSingle();
  if (error || !data) {
    console.error("Client membership update failed", { code: error?.code });
    throw new Error("Unable to update this client membership.");
  }
  revalidatePath("/clients");
}
