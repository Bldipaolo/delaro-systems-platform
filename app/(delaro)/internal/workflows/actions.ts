"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createIntegrationToken } from "@/lib/workflow-observability/protocol";
import { parseWorkflowReference, workflowPlatforms } from "@/lib/workflow-observability/registration";

export type CredentialActionState = { token: string | null; error: string | null };
export type ConnectWorkflowActionState = {
  token: string | null;
  workflowId: string | null;
  workflowName: string | null;
  error: string | null;
};

const optionalUuid = z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null);
const optionalText = z.string().trim().max(2000).transform((value) => value || null);

function canManageOrganization(
  context: NonNullable<Awaited<ReturnType<typeof requireInternalUserContext>>>,
  organizationId: string,
) {
  return context.memberships.some((membership) =>
    membership.organizationId === organizationId && canViewInternalWorkspace(membership.role));
}

async function scopedReference(
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  table: string,
  organizationId: string,
  id: string | null,
) {
  if (!id) return;
  const { data, error } = await client.from(table).select("id")
    .eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error || !data) throw new Error("A selected workflow relationship is unavailable for this client.");
}

export async function connectWorkflow(
  _state: ConnectWorkflowActionState,
  formData: FormData,
): Promise<ConnectWorkflowActionState> {
  const input = z.object({
    organizationId: z.string().uuid(),
    platform: z.enum(workflowPlatforms),
    workflowName: z.string().trim().min(2).max(180),
    workflowReference: z.string().trim().min(1).max(1000),
    purpose: optionalText,
    processId: optionalUuid,
    implementationId: optionalUuid,
    ownerMembershipId: optionalUuid,
    metricId: optionalUuid,
    publishToClient: z.string().optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { token: null, workflowId: null, workflowName: null, error: "Review the workflow details and try again." };

  let reference: ReturnType<typeof parseWorkflowReference>;
  try {
    reference = parseWorkflowReference(input.data.platform, input.data.workflowReference);
  } catch (error) {
    return { token: null, workflowId: null, workflowName: null, error: error instanceof Error ? error.message : "The workflow reference is invalid." };
  }

  const context = await requireInternalUserContext();
  if (!context || !canManageOrganization(context, input.data.organizationId)) {
    return { token: null, workflowId: null, workflowName: null, error: "Internal access to the selected client is required." };
  }
  const client = await createClient();
  if (!client) return { token: null, workflowId: null, workflowName: null, error: "Workflow connection is unavailable." };

  try {
    await Promise.all([
      scopedReference(client, "processes", input.data.organizationId, input.data.processId),
      scopedReference(client, "implementations", input.data.organizationId, input.data.implementationId),
      scopedReference(client, "organization_memberships", input.data.organizationId, input.data.ownerMembershipId),
      scopedReference(client, "measurement_metrics", input.data.organizationId, input.data.metricId),
    ]);
  } catch (error) {
    return { token: null, workflowId: null, workflowName: null, error: error instanceof Error ? error.message : "A workflow relationship is invalid." };
  }

  const generated = createIntegrationToken();
  const { data, error } = await client.rpc("register_monitored_workflow", {
    target_organization_id: input.data.organizationId,
    workflow_platform: input.data.platform,
    workflow_instance_reference: reference.instanceReference,
    workflow_external_id: reference.externalWorkflowId,
    workflow_display_name: input.data.workflowName,
    workflow_https_url: reference.workflowUrl,
    workflow_purpose: input.data.purpose,
    target_implementation_id: input.data.implementationId,
    target_process_id: input.data.processId,
    target_owner_membership_id: input.data.ownerMembershipId,
    target_metric_id: input.data.metricId,
    publish_to_client: input.data.publishToClient === "on",
    new_credential_id: generated.credentialId,
    new_secret_hash: generated.secretHash,
    new_token_hint: generated.tokenHint,
    credential_label: "n8n execution reporter",
    credential_rate_limit: 120,
  });
  if (error) {
    const duplicate = error.code === "23505";
    return {
      token: null, workflowId: null, workflowName: null,
      error: duplicate ? "This n8n workflow is already registered for the selected client." : "The workflow and reporter credential could not be created.",
    };
  }

  revalidatePath("/internal/workflows");
  revalidatePath("/workflows");
  return { token: generated.token, workflowId: String(data), workflowName: input.data.workflowName, error: null };
}

export async function rotateWorkflowCredential(_state: CredentialActionState, formData: FormData): Promise<CredentialActionState> {
  const input = z.object({
    workflowId: z.string().uuid(),
    label: z.string().trim().min(2).max(120),
    rateLimit: z.coerce.number().int().min(1).max(1000),
  }).safeParse(Object.fromEntries(formData));
  if (!input.success) return { token: null, error: "Choose a workflow and enter a valid credential label and rate limit." };
  const context = await requireInternalUserContext();
  if (!context) return { token: null, error: "An authenticated internal workspace is required." };
  const client = await createClient();
  if (!client) return { token: null, error: "Workflow credential management is unavailable." };
  const { data: workflow } = await client.from("implementation_workflows").select("id,organization_id").eq("id", input.data.workflowId).maybeSingle();
  if (!workflow || !canManageOrganization(context, workflow.organization_id)) return { token: null, error: "The workflow is unavailable." };
  const generated = createIntegrationToken();
  const { error } = await client.rpc("rotate_workflow_ingestion_credential", {
    target_workflow_id: input.data.workflowId,
    new_credential_id: generated.credentialId,
    new_secret_hash: generated.secretHash,
    new_token_hint: generated.tokenHint,
    credential_label: input.data.label,
    credential_rate_limit: input.data.rateLimit,
    credential_expires_at: null,
  });
  if (error) return { token: null, error: "The integration credential could not be created." };
  revalidatePath("/internal/workflows");
  return { token: generated.token, error: null };
}

export async function revokeWorkflowCredential(formData: FormData) {
  const credentialId = z.string().uuid().parse(formData.get("credentialId"));
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("Workflow credential management is unavailable.");
  const { data: credential } = await client.from("workflow_ingestion_credentials").select("id,organization_id").eq("id", credentialId).maybeSingle();
  if (!credential || !canManageOrganization(context, credential.organization_id)) throw new Error("The credential is unavailable.");
  const { error } = await client.rpc("revoke_workflow_ingestion_credential", { target_credential_id: credentialId });
  if (error) throw new Error("Unable to revoke the workflow credential.");
  revalidatePath("/internal/workflows");
}

export async function updateWorkflowRelationships(formData: FormData) {
  const input = z.object({
    workflowId: z.string().uuid(), organizationId: z.string().uuid(), purpose: optionalText,
    processId: optionalUuid, implementationId: optionalUuid, ownerMembershipId: optionalUuid,
    metricId: optionalUuid, publishToClient: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const context = await requireInternalUserContext();
  if (!context || !canManageOrganization(context, input.organizationId)) throw new Error("Internal access to the selected client is required.");
  const client = await createClient();
  if (!client) throw new Error("Workflow management is unavailable.");
  const { data: workflow } = await client.from("implementation_workflows").select("id")
    .eq("organization_id", input.organizationId).eq("id", input.workflowId).maybeSingle();
  if (!workflow) throw new Error("The workflow is unavailable.");
  await Promise.all([
    scopedReference(client, "processes", input.organizationId, input.processId),
    scopedReference(client, "implementations", input.organizationId, input.implementationId),
    scopedReference(client, "organization_memberships", input.organizationId, input.ownerMembershipId),
    scopedReference(client, "measurement_metrics", input.organizationId, input.metricId),
  ]);
  const { error } = await client.from("implementation_workflows").update({
    purpose: input.purpose, process_id: input.processId, implementation_id: input.implementationId,
    owner_membership_id: input.ownerMembershipId, client_visible: input.publishToClient === "on",
  }).eq("organization_id", input.organizationId).eq("id", input.workflowId);
  if (error) throw new Error("Unable to update workflow relationships.");
  const { error: clearError } = await client.from("workflow_metrics").delete()
    .eq("organization_id", input.organizationId).eq("workflow_id", input.workflowId);
  if (clearError) throw new Error("Workflow details saved, but the metric relationship could not be updated.");
  if (input.metricId) {
    const { error: metricError } = await client.from("workflow_metrics").insert({
      organization_id: input.organizationId, workflow_id: input.workflowId, metric_id: input.metricId,
    });
    if (metricError) throw new Error("Workflow details saved, but the metric relationship could not be updated.");
  }
  revalidatePath("/internal/workflows");
  revalidatePath("/workflows");
}
