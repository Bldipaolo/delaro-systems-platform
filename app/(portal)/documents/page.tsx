import Link from "next/link";
import { DocumentHub } from "@/components/documents/document-hub";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { updateDocumentVisibility, uploadClientDocument } from "./actions";

export default async function DocumentsPage() {
  if (!isSupabaseConfigured()) return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">Shared files</p><h1>Files</h1><p className="intro-copy">Illustrative documents in demo mode.</p></div></section><DocumentHub/></main>;
  const context = await getCurrentUserContext();
  if (!context) throw new Error("An authenticated workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The workspace is unavailable.");
  const { data, error } = await client.from("client_documents")
    .select("id,file_name,mime_type,size_bytes,description,visibility,created_at")
    .eq("organization_id", context.organization.id).order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load shared files.");
  const internal = canViewInternalWorkspace(context.role);
  return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">Shared files</p><h1>Files</h1><p className="intro-copy">Plans, notes and reports for this engagement. Downloads use short-lived private links.</p></div></section>
    {context.role !== "read_only" && <section className="methodology-section"><div className="section-heading"><h2>Share a file</h2></div>
      <form action={uploadClientDocument} className="pilot-form" encType="multipart/form-data">
        <label>File<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" required/></label>
        <label>Description<input name="description" maxLength={2000}/></label>
        {internal && <label>Visibility<select name="visibility" defaultValue="client"><option value="client">Shared with client</option><option value="internal">Delaro only</option></select></label>}
        <button type="submit">Upload file</button>
      </form><p>PDF, PNG, JPEG, DOCX or XLSX · 10 MB maximum. Do not upload credentials or secrets.</p>
    </section>}
    <section className="methodology-section"><div className="section-heading"><h2>Engagement files</h2></div>
      {!data?.length && <p className="methodology-empty">No files shared yet.</p>}
      {data?.map((item) => <article className="methodology-row" key={item.id}><div className="methodology-row-main"><h3><Link href={`/documents/${item.id}/download`}>{item.file_name} ↗</Link></h3>{item.description && <p>{item.description}</p>}</div>
        <dl><div><dt>Added</dt><dd>{new Date(item.created_at).toLocaleDateString("en-US")}</dd></div><div><dt>Size</dt><dd>{Math.ceil(item.size_bytes / 1024)} KB</dd></div><div><dt>Access</dt><dd>{item.visibility === "client" ? "Shared" : "Delaro only"}</dd></div></dl>
        {internal && <form action={updateDocumentVisibility} className="methodology-inline-form"><input type="hidden" name="id" value={item.id}/><label>Visibility<select name="visibility" defaultValue={item.visibility}><option value="client">Shared with client</option><option value="internal">Delaro only</option></select></label><button type="submit">Save</button></form>}
      </article>)}
    </section>
  </main>;
}
