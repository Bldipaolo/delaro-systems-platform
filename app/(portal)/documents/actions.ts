"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const bucket = "client-documents";
const maxBytes = 10 * 1024 * 1024;
const extensions: Record<string,string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export async function uploadClientDocument(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || context.role === "read_only") throw new Error("You do not have permission to upload files.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > maxBytes || !extensions[file.type])
    throw new Error("Choose a PDF, PNG, JPEG, DOCX or XLSX file under 10 MB.");
  const fileName = file.name.replace(/[\/\\\x00-\x1f\x7f]/g, "").trim().slice(0,180);
  if (!fileName) throw new Error("The file needs a valid name.");
  const description = String(formData.get("description") ?? "").trim().slice(0,2000);
  const internal = canViewInternalWorkspace(context.role);
  const visibility = internal && formData.get("visibility") === "internal" ? "internal" : "client";
  const path = `${context.organization.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(path, file, {
    contentType: file.type, upsert: false, cacheControl: "0",
  });
  if (uploadError) { console.error("Document upload failed", { code: uploadError.name }); throw new Error("Unable to upload this file."); }
  const { error } = await client.from("client_documents").insert({
    organization_id: context.organization.id, storage_path: path, file_name: fileName,
    mime_type: file.type, size_bytes: file.size, description: description || null,
    visibility, uploaded_by_membership_id: context.membership.id,
  });
  if (error) {
    console.error("Document registration failed", { code: error.code, path });
    if (internal) await client.storage.from(bucket).remove([path]);
    throw new Error("The upload could not be registered. Please contact Delaro before retrying.");
  }
  revalidatePath("/documents");
}

export async function updateDocumentVisibility(formData: FormData) {
  const context = await getCurrentUserContext();
  if (!context || !canViewInternalWorkspace(context.role)) throw new Error("Internal access required.");
  const id = String(formData.get("id") ?? "");
  const visibility = formData.get("visibility");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["client","internal"].includes(String(visibility)))
    throw new Error("Invalid file selection.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const { data, error } = await client.from("client_documents")
    .update({ visibility }).eq("organization_id", context.organization.id).eq("id", id)
    .select("id").maybeSingle();
  if (error || !data) { console.error("Document visibility update failed", { code: error?.code }); throw new Error("Unable to update file visibility."); }
  revalidatePath("/documents");
}
