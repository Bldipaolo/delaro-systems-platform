import { requireCurrentUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getClientImpact } from "@/lib/data/impact";
import { demoImprovements } from "@/lib/measurement/demo";
import type { ClientImprovement } from "@/lib/measurement/types";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Row = Record<string, unknown>;

async function rows(client: Client, table: string, selection: string, organizationId: string): Promise<Row[]> {
  const { data, error } = await client.from(table).select(selection).eq("organization_id", organizationId);
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Client-approved improvement chain; never queries private opportunities or initiative_internal_details. */
export async function getClientImprovements(): Promise<ClientImprovement[]> {
  const context = await requireCurrentUserContext();
  if (!context) return demoImprovements;
  const client = await createClient();
  if (!client) throw new Error("Supabase is not configured.");
  const organizationId = context.organization.id;
  const [initiatives, narratives, constraints, publications, processes, steps, systems, processSystems, memberships, people, metrics] = await Promise.all([
    rows(client, "initiatives", "id,organization_id,title,objective,status,current_phase,owner_id,next_milestone", organizationId),
    rows(client, "initiative_client_narratives", "initiative_id,organization_id,current_state_summary,intervention_summary,implementation_summary,expected_result_summary,measurement_plan_summary,client_visible", organizationId),
    rows(client, "process_constraints", "id,organization_id,process_id,step_id,system_id,issue_description,client_visible", organizationId),
    rows(client, "constraint_publications", "organization_id,constraint_id,root_cause_summary,business_consequence_summary,measured_delay_minutes,initiative_id", organizationId),
    rows(client, "processes", "id,organization_id,name,client_visible", organizationId),
    rows(client, "process_steps", "id,organization_id,process_id,client_visible", organizationId),
    rows(client, "systems", "id,organization_id,name,client_visible", organizationId),
    rows(client, "process_systems", "id,organization_id,process_id,system_id,client_visible", organizationId),
    rows(client, "organization_memberships", "id,organization_id,user_id,status", organizationId),
    rows(client, "operational_people", "id,organization_id,membership_id,display_name,client_visible", organizationId),
    getClientImpact(),
  ]);

  return initiatives.filter((initiative) => narratives.some((item) => item.initiative_id === initiative.id && item.client_visible === true)).map((initiative) => {
    const id = String(initiative.id);
    const narrative = narratives.find((item) => item.initiative_id === id);
    const linked = publications.filter((item) => item.initiative_id === id)
      .map((publication) => ({ publication, constraint: constraints.find((item) => item.id === publication.constraint_id && item.client_visible === true) }))
      .filter((item) => item.constraint);
    const primary = linked[0];
    const processIds = [...new Set(linked.map(({ constraint }) => {
      if (constraint?.process_id) return String(constraint.process_id);
      return stringOrNull(steps.find((step) => step.id === constraint?.step_id && step.client_visible === true)?.process_id);
    }).filter((value): value is string => Boolean(value)))];
    const systemIds = [...new Set([
      ...linked.map(({ constraint }) => stringOrNull(constraint?.system_id)).filter((value): value is string => Boolean(value)),
      ...processSystems.filter((link) => link.client_visible === true && processIds.includes(String(link.process_id))).map((link) => String(link.system_id)),
    ])];
    const membership = memberships.find((item) => item.user_id === initiative.owner_id && item.status === "active");
    const person = people.find((item) => item.membership_id === membership?.id && item.client_visible === true);
    const ownerName = stringOrNull(person?.display_name)
      ?? (initiative.owner_id === context.user.id ? context.profile?.fullName ?? context.profile?.email ?? "Assigned member" : initiative.owner_id ? "Assigned member" : "Not assigned");
    const improvementMetrics = metrics.filter((metric) => metric.initiativeId === id);
    return {
      id, name: String(initiative.title), objective: String(initiative.objective),
      status: initiative.status as ClientImprovement["status"], currentPhase: String(initiative.current_phase), ownerName,
      nextMilestone: stringOrNull(initiative.next_milestone),
      constraintId: stringOrNull(primary?.constraint?.id), linkedConstraint: stringOrNull(primary?.constraint?.issue_description),
      currentStateProblem: stringOrNull(narrative?.current_state_summary) ?? stringOrNull(primary?.constraint?.issue_description),
      businessConsequence: stringOrNull(primary?.publication.business_consequence_summary),
      rootCause: stringOrNull(primary?.publication.root_cause_summary),
      intervention: stringOrNull(narrative?.intervention_summary) ?? String(initiative.objective),
      implementation: stringOrNull(narrative?.implementation_summary),
      linkedProcesses: processIds.map((processId) => stringOrNull(processes.find((process) => process.id === processId && process.client_visible === true)?.name)).filter((value): value is string => Boolean(value)),
      linkedSystems: systemIds.map((systemId) => stringOrNull(systems.find((system) => system.id === systemId && system.client_visible === true)?.name)).filter((value): value is string => Boolean(value)),
      expectedResult: stringOrNull(narrative?.expected_result_summary),
      measurementPlan: stringOrNull(narrative?.measurement_plan_summary) ?? improvementMetrics[0]?.measurementMethod ?? null,
      metrics: improvementMetrics, demo: false,
    };
  });
}
