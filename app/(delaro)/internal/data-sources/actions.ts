"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const optionalText = z.string().trim().max(1200).transform((value) => value || null);
const fieldPath = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/);

function canManage(context: NonNullable<Awaited<ReturnType<typeof requireInternalUserContext>>>, organizationId: string) {
  return context.memberships.some((membership) => membership.organizationId===organizationId && canViewInternalWorkspace(membership.role));
}

async function workspace(organizationId: string) {
  const context = await requireInternalUserContext();
  if (!context || !canManage(context,organizationId)) throw new Error("Internal access to the selected client is required.");
  const client = await createClient();
  if (!client) throw new Error("Measurement source management is unavailable.");
  return client;
}

export async function createMeasurementSource(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(), name: z.string().trim().min(2).max(160), description: optionalText,
    providerType: z.enum(["hubspot","api","database","webhook","csv","manual","other"]),
    connectionMode: z.enum(["push","pull","manual"]), externalReference: z.string().trim().max(500).transform((value)=>value||null),
    scheduleEnabled: z.string().optional(), scheduleIntervalMinutes: z.coerce.number().int().min(5).max(10080),
    staleAfterMinutes: z.coerce.number().int().min(15).max(525600), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const client = await workspace(input.organizationId);
  const { error } = await client.from("measurement_sources").insert({
    organization_id: input.organizationId, name: input.name, description: input.description,
    provider_type: input.providerType, connection_mode: input.connectionMode, external_reference: input.externalReference,
    status: "draft", schedule_enabled: false, schedule_interval_minutes: input.scheduleIntervalMinutes,
    stale_after_minutes: input.staleAfterMinutes, client_visible: input.clientVisible === "on",
  });
  if (error) throw new Error(error.code === "23505" ? "This source is already registered for the client." : "Unable to create the measurement source.");
  revalidatePath("/internal/data-sources");
}

export async function createMetricMapping(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(), sourceId: z.string().uuid(), metricId: z.string().uuid(),
    name: z.string().trim().min(2).max(160), providerObject: z.string().trim().min(1).max(160), valueField: fieldPath,
    timestampField: z.union([fieldPath,z.literal("")]).transform((value)=>value||null),
    externalIdField: z.union([fieldPath,z.literal("")]).transform((value)=>value||null),
    transformKind: z.enum(["identity","scale","duration_ms_to_seconds","minor_currency_to_major","fraction_to_percentage"]),
    aggregationMethod: z.enum(["latest","count","sum","average","minimum","maximum"]),
    periodGranularity: z.enum(["event","day","week","month","quarter"]), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const client = await workspace(input.organizationId);
  const [{ data: source },{ data: metric }] = await Promise.all([
    client.from("measurement_sources").select("id").eq("organization_id",input.organizationId).eq("id",input.sourceId).maybeSingle(),
    client.from("measurement_metrics").select("id").eq("organization_id",input.organizationId).eq("id",input.metricId).maybeSingle(),
  ]);
  if (!source || !metric) throw new Error("The selected source or measure is unavailable.");
  const { error } = await client.from("measurement_source_mappings").insert({
    organization_id: input.organizationId, source_id: input.sourceId, metric_id: input.metricId, name: input.name,
    provider_object: input.providerObject, value_field: input.valueField, timestamp_field: input.timestampField,
    external_id_field: input.externalIdField, transform_kind: input.transformKind,
    aggregation_method: input.aggregationMethod, period_granularity: input.periodGranularity,
    client_visible: input.clientVisible === "on",
  });
  if (error) throw new Error(error.code === "23505" ? "This source already has an active mapping for the selected measure." : "Unable to save the metric mapping.");
  revalidatePath("/internal/data-sources");
  revalidatePath("/impact");
}

export async function requestSourceSync(formData: FormData) {
  const input=z.object({organizationId:z.string().uuid(),sourceId:z.string().uuid()}).parse(Object.fromEntries(formData));
  const client=await workspace(input.organizationId);
  const { error }=await client.rpc("request_measurement_source_sync",{target_source_id:input.sourceId});
  if(error) throw new Error("Unable to queue this source for synchronization.");
  revalidatePath("/internal/data-sources");
}

export async function disableMeasurementSource(formData: FormData) {
  const input=z.object({organizationId:z.string().uuid(),sourceId:z.string().uuid()}).parse(Object.fromEntries(formData));
  const client=await workspace(input.organizationId);
  const { error }=await client.from("measurement_sources").update({status:"disabled"}).eq("organization_id",input.organizationId).eq("id",input.sourceId);
  if(error) throw new Error("Unable to disable this measurement source.");
  revalidatePath("/internal/data-sources");
  revalidatePath("/impact");
}
