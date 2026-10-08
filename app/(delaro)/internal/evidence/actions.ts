"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const review = z.object({
  kind: z.enum(["Metric", "Value"]),
  id: z.string().uuid(),
  outcome: z.enum(["verified", "rejected"]),
});

export async function reviewEvidence(formData: FormData) {
  const input = review.parse({ kind: formData.get("kind"), id: formData.get("id"), outcome: formData.get("outcome") });
  const context = await requireInternalUserContext();
  if (!context) throw new Error("Evidence review requires an authenticated internal workspace.");
  const client = await createClient();
  if (!client) throw new Error("Supabase is unavailable.");
  const table = input.kind === "Metric" ? "measurement_evidence" : "value_evidence";
  const { data: existing, error: readError } = await client.from(table)
    .select("id,source_reference,document_url,verification_status")
    .eq("organization_id", context.organization.id).eq("id", input.id).maybeSingle();
  if (readError) throw new Error(`Unable to inspect evidence: ${readError.message}`);
  if (!existing || !["pending", "submitted"].includes(existing.verification_status)) throw new Error("Evidence is unavailable or already reviewed.");
  if (input.outcome === "verified" && !existing.source_reference?.trim() && !existing.document_url?.trim()) {
    throw new Error("A source reference or document is required before verification.");
  }
  const { data, error } = await client.from(table).update({
    verification_status: input.outcome,
    verified_by_membership_id: input.outcome === "verified" ? context.membership.id : null,
    verified_at: input.outcome === "verified" ? new Date().toISOString() : null,
  }).eq("organization_id", context.organization.id).eq("id", input.id)
    .in("verification_status", ["pending", "submitted"]).select("id").maybeSingle();
  if (error) throw new Error(`Unable to review evidence: ${error.message}`);
  if (!data) throw new Error("Evidence changed during review. Reload and try again.");
  revalidatePath("/internal/evidence");
  revalidatePath("/measurement");
  revalidatePath("/internal/value-realization");
  revalidatePath("/impact");
}
