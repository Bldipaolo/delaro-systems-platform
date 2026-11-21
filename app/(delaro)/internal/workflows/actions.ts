"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createIntegrationToken } from "@/lib/workflow-observability/protocol";

export type CredentialActionState = { token: string | null; error: string | null };

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
  const { data: workflow } = await client.from("implementation_workflows").select("id").eq("organization_id", context.organization.id).eq("id", input.data.workflowId).maybeSingle();
  if (!workflow) return { token: null, error: "The workflow does not belong to the active organization." };
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
  const { data: credential } = await client.from("workflow_ingestion_credentials").select("id").eq("organization_id", context.organization.id).eq("id", credentialId).maybeSingle();
  if (!credential) throw new Error("The credential does not belong to the active organization.");
  const { error } = await client.rpc("revoke_workflow_ingestion_credential", { target_credential_id: credentialId });
  if (error) throw new Error("Unable to revoke the workflow credential.");
  revalidatePath("/internal/workflows");
}
