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
const optionalNumber = (max: number) => z.preprocess(
  (value) => value === "" ? null : value,
  z.coerce.number().min(0).max(max).nullable(),
);
type DatabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

async function internalClient() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  return { context, client };
}

async function requireRecord(client: DatabaseClient, table: string, organizationId: string, id: string, message: string) {
  const { data, error } = await client.from(table).select("id").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error || !data) throw new Error(message);
}

function refreshOperations() {
  revalidatePath("/internal/operations"); revalidatePath("/operations");
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
    ownerTeamId: optionalUuid, sortOrder: z.coerce.number().int().min(0).max(10000), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const organizationId = context.organization.id;
  const { data: area } = await client.from("operational_areas").select("id")
    .eq("organization_id", organizationId).eq("id", input.operationalAreaId).maybeSingle();
  if (!area) throw new Error("Choose an area in this organization.");
  if (input.ownerTeamId) await requireRecord(client, "operational_teams", organizationId, input.ownerTeamId, "Choose a team in this organization.");
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
    owner_team_id: input.ownerTeamId || null, sort_order: input.sortOrder,
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
    ownerTeamId: optionalUuid,
    expectedDurationMinutes: optionalNumber(100000), actualDurationMinutes: optionalNumber(100000),
    decisionCriteria: text.optional(), notes: text.optional(),
    approvalRequired: z.string().optional(), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const organizationId = context.organization.id;
  const { data: process } = await client.from("processes").select("id")
    .eq("organization_id", organizationId).eq("id", input.processId).maybeSingle();
  if (!process) throw new Error("Process not found in this organization.");
  if (input.ownerTeamId) await requireRecord(client, "operational_teams", organizationId, input.ownerTeamId, "Choose a team in this organization.");
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this step.");
  const values = {
    process_id: input.processId, step_type: input.stepType, name: input.name,
    description: input.description || null, sort_order: input.sortOrder,
    automation_mode: input.automationMode, approval_required: input.approvalRequired === "on",
    owner_team_id: input.ownerTeamId || null,
    expected_duration_minutes: input.expectedDurationMinutes, actual_duration_minutes: input.actualDurationMinutes,
    decision_criteria: input.decisionCriteria || null, notes: input.notes || null,
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

export async function saveOperationalTeam(formData: FormData) {
  const input = z.object({
    name: z.string().trim().min(2).max(160), description: text.optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  const { error } = await client.from("operational_teams").insert({
    organization_id: context.organization.id, name: input.name, description: input.description || null,
    sort_order: input.sortOrder, client_visible: input.clientVisible === "on",
  });
  if (error) { console.error("Team save failed", { code: error.code }); throw new Error("Unable to save this team."); }
  refreshOperations();
}

export async function saveOperationalPerson(formData: FormData) {
  const input = z.object({
    membershipId: z.string().uuid(), displayName: z.string().trim().min(2).max(160),
    title: z.string().trim().max(160), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  await requireRecord(client, "organization_memberships", context.organization.id, input.membershipId, "Choose a member of this organization.");
  const { error } = await client.from("operational_people").upsert({
    organization_id: context.organization.id, membership_id: input.membershipId,
    display_name: input.displayName, title: input.title || null, client_visible: input.clientVisible === "on",
  }, { onConflict: "organization_id,membership_id" });
  if (error) { console.error("Operational person save failed", { code: error.code }); throw new Error("Unable to save this operating role."); }
  refreshOperations();
}

export async function saveDataAsset(formData: FormData) {
  const input = z.object({
    systemId: optionalUuid, name: z.string().trim().min(2).max(160), category: text.optional(),
    description: text.optional(), sourceDescription: text.optional(), dataFormat: z.string().trim().max(160),
    clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient();
  if (input.systemId) await requireRecord(client, "systems", context.organization.id, input.systemId, "Choose a system in this organization.");
  const { error } = await client.from("data_assets").insert({
    organization_id: context.organization.id, system_id: input.systemId || null, name: input.name,
    category: input.category || null, description: input.description || null,
    source_description: input.sourceDescription || null, data_format: input.dataFormat || null,
    client_visible: input.clientVisible === "on",
  });
  if (error) { console.error("Data asset save failed", { code: error.code }); throw new Error("Unable to save this data source."); }
  refreshOperations();
}

export async function linkProcessSystem(formData: FormData) {
  const input = z.object({ processId: z.string().uuid(), systemId: z.string().uuid(), usageRole: z.string().trim().max(500), notes: text.optional(), clientVisible: z.string().optional() }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient(); const organizationId = context.organization.id;
  await Promise.all([requireRecord(client, "processes", organizationId, input.processId, "Process not found."), requireRecord(client, "systems", organizationId, input.systemId, "System not found.")]);
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this relationship.");
  const { error } = await client.from("process_systems").upsert({ organization_id: organizationId, process_id: input.processId, system_id: input.systemId, usage_role: input.usageRole || null, notes: input.notes || null, client_visible: input.clientVisible === "on" }, { onConflict: "organization_id,process_id,system_id" });
  if (error) { console.error("Process system link failed", { code: error.code }); throw new Error("Unable to link this system."); } refreshOperations();
}

export async function linkStepSystem(formData: FormData) {
  const input = z.object({ stepId: z.string().uuid(), systemId: z.string().uuid(), usageRole: z.string().trim().max(500), notes: text.optional(), clientVisible: z.string().optional() }).parse(Object.fromEntries(formData));
  const { context, client } = await internalClient(); const organizationId = context.organization.id;
  await Promise.all([requireRecord(client, "process_steps", organizationId, input.stepId, "Process step not found."), requireRecord(client, "systems", organizationId, input.systemId, "System not found.")]);
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this relationship.");
  const { error } = await client.from("process_step_systems").upsert({ organization_id: organizationId, step_id: input.stepId, system_id: input.systemId, usage_role: input.usageRole || null, notes: input.notes || null, client_visible: input.clientVisible === "on" }, { onConflict: "organization_id,step_id,system_id" });
  if (error) { console.error("Step system link failed", { code: error.code }); throw new Error("Unable to link this system to the step."); } refreshOperations();
}

export async function saveHandoff(formData: FormData) {
  const input = z.object({
    sourceStepId: z.string().uuid(), destinationStepId: z.string().uuid(), informationTransferred: z.string().trim().min(2).max(2000),
    handoffMethod: z.string().trim().max(500), delayMinutes: optionalNumber(100000),
    failureRatePercent: optionalNumber(100), notes: text.optional(), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  if (input.sourceStepId === input.destinationStepId) throw new Error("A handoff needs different source and destination steps.");
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this handoff.");
  const { context, client } = await internalClient(); const organizationId = context.organization.id;
  await Promise.all([requireRecord(client, "process_steps", organizationId, input.sourceStepId, "Source step not found."), requireRecord(client, "process_steps", organizationId, input.destinationStepId, "Destination step not found.")]);
  const { error } = await client.from("handoffs").insert({ organization_id: organizationId, source_step_id: input.sourceStepId, destination_step_id: input.destinationStepId, information_transferred: input.informationTransferred, handoff_method: input.handoffMethod || null, delay_minutes: input.delayMinutes, failure_rate_percent: input.failureRatePercent, notes: input.notes || null, client_visible: input.clientVisible === "on" });
  if (error) { console.error("Handoff save failed", { code: error.code }); throw new Error("Unable to save this handoff."); } refreshOperations();
}

export async function saveProcessDependency(formData: FormData) {
  const input = z.object({ upstreamProcessId: z.string().uuid(), downstreamProcessId: z.string().uuid(), conditionDescription: text.optional(), notes: text.optional(), clientVisible: z.string().optional() }).parse(Object.fromEntries(formData));
  if (input.upstreamProcessId === input.downstreamProcessId) throw new Error("Choose two different processes.");
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this dependency.");
  const { context, client } = await internalClient(); const organizationId = context.organization.id;
  await Promise.all([requireRecord(client, "processes", organizationId, input.upstreamProcessId, "Upstream process not found."), requireRecord(client, "processes", organizationId, input.downstreamProcessId, "Downstream process not found.")]);
  const { error } = await client.from("process_dependencies").upsert({ organization_id: organizationId, upstream_process_id: input.upstreamProcessId, downstream_process_id: input.downstreamProcessId, condition_description: input.conditionDescription || null, notes: input.notes || null, client_visible: input.clientVisible === "on" }, { onConflict: "organization_id,upstream_process_id,downstream_process_id" });
  if (error) { console.error("Process dependency save failed", { code: error.code }); throw new Error("Unable to save this dependency."); } refreshOperations();
}

export async function saveStepDependency(formData: FormData) {
  const input = z.object({ upstreamStepId: z.string().uuid(), downstreamStepId: z.string().uuid(), conditionDescription: text.optional(), notes: text.optional(), clientVisible: z.string().optional() }).parse(Object.fromEntries(formData));
  if (input.upstreamStepId === input.downstreamStepId) throw new Error("Choose two different steps.");
  if (input.clientVisible === "on" && input.notes) throw new Error("Remove private notes before publishing this dependency.");
  const { context, client } = await internalClient(); const organizationId = context.organization.id;
  await Promise.all([requireRecord(client, "process_steps", organizationId, input.upstreamStepId, "Upstream step not found."), requireRecord(client, "process_steps", organizationId, input.downstreamStepId, "Downstream step not found.")]);
  const { error } = await client.from("step_dependencies").upsert({ organization_id: organizationId, upstream_step_id: input.upstreamStepId, downstream_step_id: input.downstreamStepId, condition_description: input.conditionDescription || null, notes: input.notes || null, client_visible: input.clientVisible === "on" }, { onConflict: "organization_id,upstream_step_id,downstream_step_id" });
  if (error) { console.error("Step dependency save failed", { code: error.code }); throw new Error("Unable to save this step dependency."); } refreshOperations();
}
