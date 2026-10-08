import { cookies } from "next/headers";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoDecisions } from "@/lib/decisions/demo";
import type { ClientDecision } from "@/lib/decisions/types";

export const demoDecisionCookie = "delaro_demo_decisions";
export type DemoDecisionState = Record<string, { status?: ClientDecision["status"]; optionId?: string; note?: string; comments?: string[] }>;

export async function getDemoDecisionState(): Promise<DemoDecisionState> {
  const raw = (await cookies()).get(demoDecisionCookie)?.value;
  if (!raw) return {};
  try { return JSON.parse(raw) as DemoDecisionState; } catch { return {}; }
}

export async function getClientDecisions(): Promise<ClientDecision[]> {
  if (!isSupabaseConfigured()) {
    const state = await getDemoDecisionState();
    return demoDecisions.map((item) => {
      const saved = state[item.id];
      if (!saved) return item;
      const resolved = saved.status === "approved" || saved.status === "changes_requested" || saved.status === "declined";
      return {
        ...item,
        status: saved.status ?? item.status,
        selectedOutcome: saved.optionId ? item.options.find((option) => option.id === saved.optionId)?.title ?? null : null,
        approvalStatus: resolved ? saved.status as "approved" | "changes_requested" | "declined" : "pending",
        canRespond: !resolved,
        comments: (saved.comments ?? []).map((body, index) => ({ id: `${item.id}-comment-${index}`, body, author: "You", createdAt: new Date().toISOString() })),
        history: [...item.history, ...(resolved ? [{ id: `${item.id}-response`, summary: saved.status === "approved" ? "Approved in demo mode" : "Changes requested in demo mode", occurredAt: new Date().toISOString() }] : [])],
      };
    });
  }
  const context = await getCurrentUserContext();
  if (!context) return [];
  const supabase = await createClient();
  if (!supabase) return [];
  const organizationId = context.organization.id;
  const { data: decisions, error } = await supabase.from("decisions")
    .select("id,kind,risk_level,status,title,context,why_needed,recommendation,financial_consequence,operational_consequence,due_date,requested_from_membership_id,requested_by_membership_id,process_id,opportunity_id,initiative_id,selected_outcome,decided_at")
    .eq("organization_id", organizationId).eq("client_visible", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load decisions: ${error.message}`);
  if (!decisions?.length) return [];
  const decisionIds = decisions.map((decision) => decision.id);
  const [optionsResult, approvalsResult, commentsResult, eventsResult, memberResult] = await Promise.all([
    supabase.from("decision_options").select("id,decision_id,title,description,consequence,is_recommended,sort_order").eq("organization_id", organizationId).in("decision_id", decisionIds).eq("client_visible", true).order("sort_order"),
    supabase.from("approvals").select("id,decision_id,status").eq("organization_id", organizationId).in("decision_id", decisionIds).eq("requested_from_membership_id", context.membership.id),
    supabase.from("comments").select("id,decision_id,body,author_membership_id,created_at").eq("organization_id", organizationId).in("decision_id", decisionIds).eq("client_visible", true).order("created_at"),
    supabase.from("decision_events").select("id,decision_id,summary,occurred_at").eq("organization_id", organizationId).in("decision_id", decisionIds).order("occurred_at"),
    supabase.from("organization_memberships").select("id,user_id").eq("organization_id", organizationId),
  ]);
  for (const result of [optionsResult, approvalsResult, commentsResult, eventsResult, memberResult]) {
    if (result.error) throw new Error(`Unable to load decision details: ${result.error.message}`);
  }
  const requesterIds = [...new Set(decisions.map((decision) => decision.requested_by_membership_id))];
  const requesterUserIds = (memberResult.data ?? []).filter((member) => requesterIds.includes(member.id)).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = requesterUserIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", requesterUserIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(`Unable to load decision requesters: ${profilesError.message}`);
  const nameByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Team member"]));
  const userByMembership = new Map((memberResult.data ?? []).map((member) => [member.id, member.user_id]));
  return decisions.map((decision) => {
    const approval = (approvalsResult.data ?? []).find((row) => row.decision_id === decision.id);
    return {
      id: decision.id, kind: decision.kind as ClientDecision["kind"], riskLevel: decision.risk_level as ClientDecision["riskLevel"],
      status: decision.status as ClientDecision["status"], title: decision.title, context: decision.context,
      whyNeeded: decision.why_needed, recommendation: decision.recommendation,
      financialConsequence: decision.financial_consequence, operationalConsequence: decision.operational_consequence,
      dueDate: decision.due_date, requestedBy: nameByUser.get(userByMembership.get(decision.requested_by_membership_id) ?? "") ?? "Delaro team",
      relatedProcessId: decision.process_id, relatedOpportunityId: decision.opportunity_id,
      relatedImprovementId: decision.initiative_id, selectedOutcome: decision.selected_outcome,
      decidedAt: decision.decided_at,
      options: (optionsResult.data ?? []).filter((row) => row.decision_id === decision.id).map((row) => ({ id: row.id, title: row.title, description: row.description, consequence: row.consequence, recommended: row.is_recommended })),
      approvalId: approval?.id ?? null, approvalStatus: (approval?.status ?? null) as ClientDecision["approvalStatus"],
      assignedToCurrentUser: decision.requested_from_membership_id === context.membership.id || Boolean(approval),
      canRespond: approval?.status === "pending" && ["open", "in_discussion"].includes(decision.status) && context.role !== "read_only",
      canDiscuss: context.role !== "read_only",
      comments: (commentsResult.data ?? []).filter((row) => row.decision_id === decision.id).map((row) => ({ id: row.id, body: row.body, author: row.author_membership_id === context.membership.id ? "You" : nameByUser.get(userByMembership.get(row.author_membership_id) ?? "") ?? "Team member", createdAt: row.created_at })),
      history: (eventsResult.data ?? []).filter((row) => row.decision_id === decision.id).map((row) => ({ id: row.id, summary: row.summary, occurredAt: row.occurred_at })),
    };
  });
}
