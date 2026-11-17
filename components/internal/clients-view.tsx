import Link from "next/link";
import type { ClientDirectoryEntry, ManagedMembership } from "@/lib/data/client-administration";
import { createOrganization, inviteClientMember, switchOrganization, updateClientMembership, updateOrganization } from "@/app/(delaro)/clients/actions";

const stages = ["onboarding", "map", "diagnose", "quantify", "prioritize", "architect", "implement", "measure", "improve"];
const statuses = ["prospect", "active", "paused", "complete", "archived"];
const clientRoles = ["client_admin", "client_user", "read_only"];

export function ClientsView({ organizationName, industry, status, demo, clients, memberships, canAdminister }: {
  organizationName: string; industry: string; status: string; demo: boolean;
  clients: ClientDirectoryEntry[]; memberships: ManagedMembership[]; canAdminister: boolean;
}) {
  const activeClient = clients.find((client) => client.active);
  const provisioningRequestId = crypto.randomUUID();
  if (demo) return <main className="content internal-content"><section className="page-intro compact"><div><p className="eyebrow">Engagement context</p><h1>Clients</h1><p className="intro-copy">The active client workspace and its operating model.</p></div></section><section className="internal-table"><div className="internal-table-head"><span>Organization</span><span>Industry</span><span>Workspace</span><span>Status</span></div><Link className="internal-table-row" href="/internal/operations"><strong>{organizationName}<small className="demo-inline">Demo</small></strong><span>{industry || "Not recorded"}</span><span>Open operating model →</span><span className="status">{status}</span></Link></section></main>;

  return <main className="content internal-content client-admin-page">
    <section className="page-intro compact"><div><p className="eyebrow">Engagement context</p><h1>Clients</h1><p className="intro-copy">Provision and move between authorized client engagements. The selected workspace controls every internal loader and action.</p></div>{canAdminister && <details className="pilot-editor client-create"><summary>New client organization</summary><form action={createOrganization} className="pilot-form"><input type="hidden" name="provisioningRequestId" value={provisioningRequestId}/><label>Organization name<input name="name" minLength={2} required/></label><label>Industry<input name="industry"/></label><label>Engagement start<input name="engagementStartDate" type="date"/></label><label>Profile<textarea name="description" placeholder="What the organization does"/></label><label>Business context<textarea name="businessContext" placeholder="Operating priorities, scope, and engagement context"/></label><button type="submit">Create client workspace</button></form></details>}</section>

    <section className="client-directory" aria-label="Client directory">
      <div className="internal-table-head client-directory-head"><span>Organization</span><span>Stage</span><span>Active work</span><span>Attention</span><span>Workspace</span></div>
      {clients.map((client) => <article className={`client-directory-row ${client.active ? "is-active" : ""}`} key={client.id}>
        <div><strong>{client.name}</strong><small>{client.industry || "Industry not recorded"} · {client.status}</small></div>
        <span>{client.engagementStage}</span><span>{client.activeImprovements} improvements</span><span>{client.outstandingDecisions} decisions · {client.openExceptions} issues</span>
        {client.active ? <Link href="/internal/operations">Open operating model →</Link> : <form action={switchOrganization}><input type="hidden" name="organizationId" value={client.id}/><button type="submit">Switch workspace</button></form>}
      </article>)}
    </section>

    {activeClient && canAdminister && <div className="client-admin-grid">
      <section className="methodology-section"><div className="section-heading"><div><p className="eyebrow">Active engagement</p><h2>Client profile</h2></div></div><form action={updateOrganization} className="pilot-form"><input type="hidden" name="organizationId" value={activeClient.id}/><label>Name<input name="name" defaultValue={activeClient.name} required/></label><label>Industry<input name="industry" defaultValue={activeClient.industry ?? ""}/></label><div className="pilot-form-pair"><label>Stage<select name="engagementStage" defaultValue={activeClient.engagementStage}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Status<select name="status" defaultValue={activeClient.status}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div><label>Engagement start<input name="engagementStartDate" type="date" defaultValue={activeClient.engagementStartDate ?? ""}/></label><label>Profile<textarea name="description" defaultValue={activeClient.description ?? ""}/></label><label>Business context<textarea name="businessContext" defaultValue={activeClient.businessContext ?? ""}/></label><button type="submit">Save client profile</button></form></section>
      <section className="methodology-section"><div className="section-heading"><div><p className="eyebrow">Access</p><h2>Client members</h2></div></div><details className="pilot-editor" open={memberships.length === 0}><summary>Invite client member</summary><form action={inviteClientMember} className="pilot-form"><input type="hidden" name="organizationId" value={activeClient.id}/><label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Role<select name="role" defaultValue="client_user">{clientRoles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label><button type="submit">Send invitation</button></form></details><div className="member-list">{memberships.map((member) => <article key={member.id}><div><strong>{member.fullName || member.email}</strong><small>{member.fullName ? member.email : "Name pending"}</small></div>{member.role.startsWith("delaro_") ? <span>{member.role.replaceAll("_", " ")} · {member.status}</span> : <form action={updateClientMembership} className="member-controls"><input type="hidden" name="membershipId" value={member.id}/><select aria-label={`Role for ${member.email}`} name="role" defaultValue={member.role}>{clientRoles.map((role) => <option key={role}>{role}</option>)}</select><select aria-label={`Status for ${member.email}`} name="status" defaultValue={member.status}><option value="active">active</option><option value="suspended">suspended</option></select><button type="submit">Save</button></form>}</article>)}</div></section>
    </div>}
  </main>;
}
