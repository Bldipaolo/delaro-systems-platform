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
  if (error) throw new Error(`Unable to update ${input.kind}: ${error.message}`);
  if (!data) throw new Error("Record not found in the active organization.");
  revalidatePath("/internal/operations");
  revalidatePath("/operations");
}
