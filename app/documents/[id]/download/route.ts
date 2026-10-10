import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const context = await getCurrentUserContext();
  if (!context) return new NextResponse("Not found", { status: 404 });
  const client = await createClient();
  if (!client) return new NextResponse("Unavailable", { status: 503 });
  const { data: document, error } = await client.from("client_documents")
    .select("storage_path").eq("organization_id", context.organization.id).eq("id", id).maybeSingle();
  if (error || !document) return new NextResponse("Not found", { status: 404 });
  const { data, error: signedError } = await client.storage.from("client-documents")
    .createSignedUrl(document.storage_path, 60);
  if (signedError || !data?.signedUrl) {
    console.error("Document signing failed", { code: signedError?.name, documentId: id });
    return new NextResponse("Unable to open this file", { status: 503 });
  }
  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
