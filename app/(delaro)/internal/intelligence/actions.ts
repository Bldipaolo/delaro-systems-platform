"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

async function workspace(organizationId: string) {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const membership = context.memberships.find((item) => item.organizationId === organizationId && canViewInternalWorkspace(item.role));
  if (!membership) throw new Error("Internal organization access required.");
  const client = await createClient();
  if (!client) throw new Error("The intelligence workspace is unavailable.");
  return client;
}

export async function updateSignalState(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(), signalId: z.string().uuid(),
    action: z.enum(["acknowledge", "monitor", "resolve", "dismiss", "publish", "unpublish"]),
  }).parse(Object.fromEntries(formData));
  const client = await workspace(input.organizationId);
  const values = input.action === "publish" ? { visibility_status: "client_visible" }
    : input.action === "unpublish" ? { visibility_status: "internal_only" }
      : { status: ({ acknowledge: "acknowledged", monitor: "monitoring", resolve: "resolved", dismiss: "dismissed" } as const)[input.action] };
  const { data, error } = await client.from("operational_signals").update(values)
    .eq("organization_id", input.organizationId).eq("id", input.signalId).select("id").maybeSingle();
  if (error || !data) throw new Error("The signal could not be updated.");
  revalidatePath("/internal/intelligence"); revalidatePath("/attention"); revalidatePath("/overview"); revalidatePath("/activity");
}

export async function updateSignalRule(formData: FormData) {
  const input = z.object({
    organizationId: z.string().uuid(), ruleId: z.string().uuid(),
    currentWindowDays: z.coerce.number().min(1).max(365), referenceWindowDays: z.coerce.number().min(2).max(1095),
    minimumCurrentSamples: z.coerce.number().int().min(1).max(10000),
    minimumReferenceSamples: z.coerce.number().int().min(1).max(100000),
    minimumConsecutivePeriods: z.coerce.number().int().min(1).max(30),
    deviationThresholdPct: z.union([z.literal(""), z.coerce.number().min(0.01).max(10000)]),
    publicationMode: z.enum(["internal_only", "review_required", "auto_publish"]),
  }).parse(Object.fromEntries(formData));
  const client = await workspace(input.organizationId);
  const { data: rule } = await client.from("operational_signal_rules").select("id,entity_type,detection_method")
    .eq("organization_id", input.organizationId).eq("id", input.ruleId).maybeSingle();
  if (!rule) throw new Error("The detection rule is unavailable.");
  if (input.publicationMode === "auto_publish" && (rule.entity_type !== "measurement_source" || rule.detection_method !== "source_health")) {
    throw new Error("Automatic publication is limited to infrastructure source-health signals.");
  }
  const { data, error } = await client.from("operational_signal_rules").update({
    current_window_minutes: Math.round(input.currentWindowDays * 1440),
    reference_window_minutes: Math.round(input.referenceWindowDays * 1440),
    minimum_current_samples: input.minimumCurrentSamples,
    minimum_reference_samples: input.minimumReferenceSamples,
    minimum_consecutive_periods: input.minimumConsecutivePeriods,
    deviation_threshold_pct: input.deviationThresholdPct === "" ? null : input.deviationThresholdPct,
    client_publication_mode: input.publicationMode,
  }).eq("organization_id", input.organizationId).eq("id", input.ruleId).select("id").maybeSingle();
  if (error || !data) throw new Error("The detection rule could not be updated.");
  revalidatePath("/internal/intelligence");
}
