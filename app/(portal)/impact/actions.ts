"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function respondToValueValidation(formData: FormData) {
  const input = z.object({ id: z.string().uuid(), outcome: z.enum(["approved","disputed"]),
    responseNote: z.string().trim().min(3).max(2000) }).parse(Object.fromEntries(formData));
  const context = await requireCurrentUserContext();
  if (!context) throw new Error("Sign in to respond to this validation request.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const { data, error } = await client.from("value_model_validations")
    .update({ status: input.outcome, response_note: input.responseNote })
    .eq("organization_id", context.organization.id).eq("id", input.id).eq("status", "pending")
    .eq("requested_from_membership_id", context.membership.id).select("id").maybeSingle();
  if (error || !data) throw new Error("This validation request is unavailable or has already been answered.");
  revalidatePath("/impact"); revalidatePath("/internal/value-realization");
}
