"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("process"), id: z.string().uuid(), status: z.enum(["draft", "active", "paused", "retired"]) }),
  z.object({ kind: z.literal("system"), id: z.string().uuid(), status: z.enum(["unknown", "not_integrated", "planned", "partial", "integrated"]) }),
]);

export async function updateOperationalStatus(formData: FormData) {
  const input = change.parse({ kind: formData.get("kind"), id: formData.get("id"), status: formData.get("status") });
  const context = await requireInternalUserContext();
  if (!context) throw new Error("Changes require a configured, authenticated internal workspace.");
  const client = await createClient();
  if (!client) throw new Error("Supabase is unavailable.");
  const table = input.kind === "process" ? "processes" : "systems";
  const column = input.kind === "process" ? "status" : "integration_status";
  const { data, error } = await client.from(table).update({ [column]: input.status })
    .eq("organization_id", context.organization.id).eq("id", input.id).select("id").maybeSingle();
  if (error) { console.error("Operational status update failed", { table, code: error.code }); throw new Error("Unable to save this status."); }
  if (!data) throw new Error("Record not found in the active organization.");
  revalidatePath("/internal/operations");
  revalidatePath("/operations");
}

const optionalUuid = z.union([z.string().uuid(), z.literal("")]);
const text = z.string().trim().max(2000);

async function internalClient() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { context, client };
}

export async function saveOperationalArea(formData: FormData) {
  const input = z.object({ name: z.string().trim().min(2).max(120), description: text.optional() })
    .parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const { error } = await client.from("operational_areas").insert({
    organization_id: context.organization.id, name: input.name, description: input.description || null,
  });
  if (error) { console.error("Area creation failed", { code: error.code }); throw new Error("Unable to save this area."); }
  revalidatePath("/internal/operations");
}

export async function saveOperatingProcess(formData: FormData) {
  const input = z.object({
    id: optionalUuid, operationalAreaId: z.string().uuid(), name: z.string().trim().min(2).max(160),
    description: text.optional(), triggerDescription: text.optional(), expectedOutput: text.optional(),
    downstreamEffect: text.optional(), status: z.enum(["draft", "active", "paused", "retired"]),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const organizationId = context.organization.id;
  const { data: area } = await client.from("operational_areas").select("id")
    .eq("organization_id", organizationId).eq("id", input.operationalAreaId).maybeSingle();
  if (!area) throw new Error("Choose an area in this organization.");
  if (input.clientVisible === "on") {
    if (!input.triggerDescription || !input.expectedOutput || !input.downstreamEffect)
      throw new Error("A published process needs a trigger, expected output, and downstream effect.");
    if (input.id) {
      const { count, error } = await client.from("process_steps").select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("process_id", input.id).eq("client_visible", true);
      if (error || !count) throw new Error("Publish at least one reviewed step before publishing the process.");
    } else throw new Error("Save the draft and its steps before publishing.");
  }
  const values = {
    operational_area_id: input.operationalAreaId, name: input.name, description: input.description || null,
    trigger_description: input.triggerDescription || null, expected_output: input.expectedOutput || null,
    downstream_effect: input.downstreamEffect || null, status: input.status, client_visible: input.clientVisible === "on",
  };
  const result = input.id
    ? await client.from("processes").update(values).eq("organization_id", organizationId).eq("id", input.id).select("id").maybeSingle()
    : await client.from("processes").insert({ ...values, organization_id: organizationId }).select("id").maybeSingle();
  if (result.error) { console.error("Process save failed", { code: result.error.code }); throw new Error("Unable to save this process."); }
  if (!result.data) throw new Error("Process not found in this organization.");
  revalidatePath("/internal/operations"); revalidatePath("/operations");
}

export async function saveProcessStep(formData: FormData) {
  const input = z.object({
    id: optionalUuid, processId: z.string().uuid(), stepType: z.enum(["input", "process", "decision", "action", "output"]),
    name: z.string().trim().min(2).max(160), description: text.optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000),
    automationMode: z.enum(["manual", "assisted", "automated"]),
    approvalRequired: z.string().optional(), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const organizationId = context.organization.id;
  const { data: process } = await client.from("processes").select("id")
    .eq("organization_id", organizationId).eq("id", input.processId).maybeSingle();
  if (!process) throw new Error("Process not found in this organization.");
  const values = {
    process_id: input.processId, step_type: input.stepType, name: input.name,
    description: input.description || null, sort_order: input.sortOrder,
    automation_mode: input.automationMode, approval_required: input.approvalRequired === "on",
    client_visible: input.clientVisible === "on",
  };
  const result = input.id
    ? await client.from("process_steps").update(values).eq("organization_id", organizationId).eq("id", input.id).eq("process_id", input.processId).select("id").maybeSingle()
    : await client.from("process_steps").insert({ ...values, organization_id: organizationId }).select("id").maybeSingle();
  if (result.error) { console.error("Step save failed", { code: result.error.code }); throw new Error("Unable to save this process step."); }
  if (!result.data) throw new Error("Step not found in this process.");
  revalidatePath("/internal/operations"); revalidatePath("/operations");
}

export async function saveOperatingSystem(formData: FormData) {
  const input = z.object({
    id: optionalUuid, name: z.string().trim().min(2).max(160), category: text.optional(), vendor: text.optional(),
    description: text.optional(), integrationStatus: z.enum(["unknown", "not_integrated", "planned", "partial", "integrated"]),
    systemOfRecord: z.string().optional(), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const organizationId = context.organization.id;
  const values = { name: input.name, category: input.category || null, vendor: input.vendor || null,
    description: input.description || null, integration_status: input.integrationStatus,
    system_of_record: input.systemOfRecord === "on", client_visible: input.clientVisible === "on" };
  const result = input.id
    ? await client.from("systems").update(values).eq("organization_id", organizationId).eq("id", input.id).select("id").maybeSingle()
    : await client.from("systems").insert({ ...values, organization_id: organizationId }).select("id").maybeSingle();
  if (result.error) { console.error("System save failed", { code: result.error.code }); throw new Error("Unable to save this system."); }
  if (!result.data) throw new Error("System not found in this organization.");
  revalidatePath("/internal/operations"); revalidatePath("/operations");
}
