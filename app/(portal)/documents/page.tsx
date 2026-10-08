import { DocumentHub } from "@/components/documents/document-hub";
import { isSupabaseConfigured } from "@/lib/auth/context";

export default function DocumentsPage() { return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">Shared files</p><h1>Files</h1><p className="intro-copy">Find the plans, notes, and reports that explain what we found and what happens next.</p></div></section>{isSupabaseConfigured() ? <section className="empty-state"><h2>No files shared yet</h2><p>Shared file storage is not connected. Delaro will add documents here when that workflow is ready.</p></section> : <DocumentHub/>}</main>; }
