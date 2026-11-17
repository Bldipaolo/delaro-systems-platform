import Link from "next/link";
import { DataRow, DataSection, InternalPage } from "@/components/internal/methodology";
import { requireInternalUserContext } from "@/lib/auth/context";
import { getClientAdministration } from "@/lib/data/client-administration";
import { getInternalOperationalModel } from "@/lib/data/operational-model";
import { getOpportunities } from "@/lib/data/opportunities";
import { getInitiatives } from "@/lib/data/initiatives";
import { createClient } from "@/lib/supabase/server";
import { createDecisionRequest, updateDecisionRequest } from "./actions";

export default async function InternalDecisionsPage() {
  const context = await requireInternalUserContext();
  if (!context) return <InternalPage stage="Deliver / human control" title="Decisions" description="Create and audit client decisions and approvals." demo><DataSection title="Requests" empty="Decision authoring is unavailable in demo mode.">{null}</DataSection></InternalPage>;
  const [administration, model, opportunities, initiatives] = await Promise.all([getClientAdministration(), getInternalOperationalModel(), getOpportunities(), getInitiatives()]);
  const client = await createClient();
  if (!client) throw new Error("The decision workspace is unavailable.");
  const { data: decisions, error } = await client.from("decisions").select("id,title,kind,risk_level,required_approval_role,status,due_date,client_visible,process_id,opportunity_id,initiative_id,requested_from_membership_id,selected_outcome,decided_at").eq("organization_id", context.organization.id).order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load internal decisions.");
  const decisionIds = (decisions ?? []).map((item) => item.id);
  const approvals = decisionIds.length ? await client.from("approvals").select("id,decision_id,status,responded_at,response_note").eq("organization_id", context.organization.id).in("decision_id", decisionIds) : { data: [], error: null };
  const events = decisionIds.length ? await client.from("decision_events").select("decision_id,summary,occurred_at").eq("organization_id", context.organization.id).in("decision_id", decisionIds).order("occurred_at", { ascending: false }) : { data: [], error: null };
  if (approvals.error || events.error) throw new Error("Unable to load decision audit records.");
  const clients = administration.memberships.filter((member) => member.status === "active" && ["client_admin","client_user"].includes(member.role));

  return <InternalPage stage="Deliver / human control" title="Decisions" description="Request client judgment with explicit scope, assignment, risk, and an immutable response record.">
    <DataSection title="New request"><details className="pilot-editor"><summary>Create decision or approval request</summary><form action={createDecisionRequest} className="pilot-form">
      <label>Request type<select name="kind" defaultValue="approval">{["approval","question","exception","recommendation"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Risk<select name="riskLevel" defaultValue="standard"><option>standard</option><option>elevated</option><option>high</option></select></label>
      <label>Required approval role<select name="requiredApprovalRole" defaultValue="client_user"><option value="client_user">Authorized client member</option><option value="client_admin">Client administrator</option></select></label>
      <label>Assigned client member<select name="requestedFromMembershipId" required><option value="">Choose member</option>{clients.map((member) => <option key={member.id} value={member.id}>{member.fullName ?? member.email} · {member.role.replaceAll("_", " ")}</option>)}</select></label>
      <label>Title<input name="title" minLength={3} required/></label><label>Due date<input name="dueDate" type="date"/></label>
      <label>Context<textarea name="context" minLength={10} required/></label><label>Why a decision is needed<textarea name="whyNeeded" minLength={10} required/></label>
      <label>Recommendation<textarea name="recommendation"/></label><label>Operational consequence<textarea name="operationalConsequence"/></label><label>Financial consequence<textarea name="financialConsequence"/></label>
      <label>Process<select name="processId"><option value="">None</option>{model.processes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Opportunity<select name="opportunityId"><option value="">None</option>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Improvement<select name="initiativeId"><option value="">None</option>{initiatives.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Recommended option<input name="optionOne" minLength={2} required/></label><label>Alternative option<input name="optionTwo" minLength={2} required/></label>
      <label>Recommended choice<select name="recommendedOption"><option value="one">First option</option><option value="two">Second option</option></select></label>
      <label className="pilot-check"><input name="publish" type="checkbox" defaultChecked/> Send to assigned client member</label><button type="submit">Create request</button>
    </form></details></DataSection>
    <DataSection title={`Decision record · ${(decisions ?? []).length}`} empty="No decisions recorded yet.">{(decisions ?? []).map((decision) => {
      const approval = (approvals.data ?? []).find((item) => item.decision_id === decision.id);
      const assignee = administration.memberships.find((item) => item.id === decision.requested_from_membership_id);
      const history = (events.data ?? []).filter((item) => item.decision_id === decision.id);
      return <div key={decision.id}><DataRow title={decision.title} subtitle={`${decision.kind} · ${decision.risk_level} risk`} values={[{ label: "Status", value: decision.status }, { label: "Assigned", value: assignee?.fullName ?? assignee?.email ?? "Unknown member" }, { label: "Required role", value: decision.required_approval_role.replaceAll("_", " ") }, { label: "Client view", value: decision.client_visible ? "Published" : "Internal" }, { label: "Approval", value: approval?.status ?? "Not required" }, { label: "Outcome", value: decision.selected_outcome ?? "Pending" }]}/><div className="methodology-inline-links">{decision.process_id && <Link href="/internal/operations">Process →</Link>}{decision.opportunity_id && <Link href="/opportunities">Opportunity →</Link>}{decision.initiative_id && <Link href="/internal/initiatives">Improvement →</Link>}</div><details className="pilot-editor"><summary>Audit and controls · {history.length} events</summary>{history.map((item) => <p key={`${item.occurred_at}-${item.summary}`}>{item.summary} · {new Date(item.occurred_at).toLocaleDateString("en-US")}</p>)}<form action={updateDecisionRequest} className="methodology-inline-form"><input type="hidden" name="decisionId" value={decision.id}/>{!decision.client_visible && <button name="action" value="publish">Publish</button>}{!decision.decided_at && decision.status !== "cancelled" && <button name="action" value="cancel">Cancel request</button>}</form>{approval && approval.status !== "pending" && <p>Submitted responses are immutable. Create a new request if further approval is required.</p>}</details></div>;
    })}</DataSection>
  </InternalPage>;
}
