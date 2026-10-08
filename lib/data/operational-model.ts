import { requireCurrentUserContext, requireInternalUserContext, type UserOrganizationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type {
  ClientOperationalModel, ClientOpportunitySummary, ConstraintDiagnostic, ConstraintPublication,
  DataAsset, Handoff, InternalOperationalModel, LinkedImprovement, OperatingProcess,
  OperatingSystem, OperationalArea, OperationalPerson, OperationalTeam, OperationalTeamMember,
  ProcessConstraint, ProcessDependency, ProcessMetric, ProcessStep, ProcessStepData,
  ProcessStepSystem, ProcessSystem, StepDependency,
} from "@/lib/operational-model/types";

type DatabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

// Keep client projections explicit: adding a diagnostic column must not publish it by accident.
const fields = {
  areas: "id,organization_id,name,description,sort_order",
  teams: "id,organization_id,name,description,owner_membership_id,sort_order,client_visible",
  people: "id,organization_id,membership_id,display_name,title,client_visible",
  processes: "id,organization_id,operational_area_id,name,description,owner_membership_id,owner_team_id,status,sort_order,trigger_description,expected_output,downstream_effect,client_visible",
  steps: "id,organization_id,process_id,step_type,name,description,sort_order,owner_membership_id,owner_team_id,automation_mode,expected_duration_minutes,actual_duration_minutes,approval_required,decision_criteria,notes,client_visible",
  systems: "id,organization_id,name,category,vendor,system_of_record,description,integration_status,client_visible",
  dataAssets: "id,organization_id,system_id,name,category,description,source_description,data_format,client_visible",
  constraints: "id,organization_id,process_id,step_id,system_id,issue_description,severity,frequency,status,client_visible",
  metrics: "id,organization_id,process_id,step_id,name,definition,unit,desired_direction,baseline_value,target_value,actual_value,actual_measured_at,client_visible",
  processSystems: "id,organization_id,process_id,system_id,usage_role,notes,client_visible",
  stepSystems: "id,organization_id,step_id,system_id,usage_role,notes,client_visible",
  stepData: "id,organization_id,step_id,data_asset_id,direction,notes,client_visible",
  handoffs: "id,organization_id,source_step_id,source_team_id,destination_step_id,destination_team_id,information_transferred,handoff_method,delay_minutes,failure_rate_percent,notes,client_visible",
  processDependencies: "id,organization_id,upstream_process_id,downstream_process_id,condition_description,notes,client_visible",
  stepDependencies: "id,organization_id,upstream_step_id,downstream_step_id,condition_description,notes,client_visible",
  publications: "organization_id,constraint_id,root_cause_summary,business_consequence_summary,measured_delay_minutes,opportunity_summary_id,initiative_id",
  opportunitySummaries: "id,organization_id,title,summary,priority,status",
  improvements: "id,organization_id,title,status",
} as const;

function toDomainRecord<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value,
  ])) as T;
}

async function loadRows<T>(
  supabase: DatabaseClient,
  organizationId: string,
  table: string,
  selection: string,
  options: { publishedOnly?: boolean; orderBy?: string } = {},
): Promise<T[]> {
  let query = supabase.from(table).select(selection).eq("organization_id", organizationId);
  if (options.publishedOnly) query = query.eq("client_visible", true);
  if (options.orderBy) query = query.order(options.orderBy);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  return (data ?? []).map((row) => toDomainRecord<T>(row as unknown as Record<string, unknown>));
}

function emptyClientModel(): ClientOperationalModel {
  return {
    organizationId: null, areas: [], teams: [], people: [], processes: [], steps: [], systems: [], dataAssets: [], constraints: [], metrics: [],
    processSystems: [], stepSystems: [], stepData: [], handoffs: [], processDependencies: [], stepDependencies: [],
    publications: [], opportunitySummaries: [], improvements: [],
  };
}

function emptyInternalModel(): InternalOperationalModel {
  return {
    ...emptyClientModel(), teamMembers: [], diagnostics: [],
  };
}

async function loadCoreModel(
  supabase: DatabaseClient,
  context: UserOrganizationContext,
  publishedOnly: boolean,
): Promise<ClientOperationalModel> {
  const organizationId = context.organization.id;
  const visible = { publishedOnly };
  const [areas, teams, people, processes, steps, systems, dataAssets, constraints, metrics,
    processSystems, stepSystems, stepData, handoffs, processDependencies, stepDependencies,
    publications, opportunitySummaries, improvements] = await Promise.all([
    loadRows<OperationalArea>(supabase, organizationId, "operational_areas", fields.areas, { orderBy: "sort_order" }),
    loadRows<OperationalTeam>(supabase, organizationId, "operational_teams", fields.teams, { ...visible, orderBy: "sort_order" }),
    loadRows<OperationalPerson>(supabase, organizationId, "operational_people", fields.people, visible),
    loadRows<OperatingProcess>(supabase, organizationId, "processes", fields.processes, { ...visible, orderBy: "sort_order" }),
    loadRows<ProcessStep>(supabase, organizationId, "process_steps", fields.steps, { ...visible, orderBy: "sort_order" }),
    loadRows<OperatingSystem>(supabase, organizationId, "systems", fields.systems, visible),
    loadRows<DataAsset>(supabase, organizationId, "data_assets", fields.dataAssets, visible),
    loadRows<ProcessConstraint>(supabase, organizationId, "process_constraints", fields.constraints, visible),
    loadRows<ProcessMetric>(supabase, organizationId, "process_metrics", fields.metrics, visible),
    loadRows<ProcessSystem>(supabase, organizationId, "process_systems", fields.processSystems, visible),
    loadRows<ProcessStepSystem>(supabase, organizationId, "process_step_systems", fields.stepSystems, visible),
    loadRows<ProcessStepData>(supabase, organizationId, "process_step_data", fields.stepData, visible),
    loadRows<Handoff>(supabase, organizationId, "handoffs", fields.handoffs, visible),
    loadRows<ProcessDependency>(supabase, organizationId, "process_dependencies", fields.processDependencies, visible),
    loadRows<StepDependency>(supabase, organizationId, "step_dependencies", fields.stepDependencies, visible),
    loadRows<ConstraintPublication>(supabase, organizationId, "constraint_publications", fields.publications),
    loadRows<ClientOpportunitySummary>(supabase, organizationId, "opportunity_client_summaries", fields.opportunitySummaries),
    loadRows<LinkedImprovement>(supabase, organizationId, "initiatives", fields.improvements),
  ]);
  return {
    organizationId, areas, teams, people, processes, steps, systems, dataAssets, constraints, metrics,
    processSystems, stepSystems, stepData, handoffs, processDependencies, stepDependencies,
    publications, opportunitySummaries, improvements,
  };
}

/** Published operational information for the server-resolved active organization. */
export async function getClientOperationalModel(): Promise<ClientOperationalModel> {
  const context = await requireCurrentUserContext();
  if (!context) return emptyClientModel(); // No Supabase configuration: the existing demo remains unchanged.
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase configuration changed while loading the operational model.");
  return loadCoreModel(supabase, context, true);
}

/** Full authoring graph, including internal diagnostics. Never accepts a browser-provided organization ID. */
export async function getInternalOperationalModel(): Promise<InternalOperationalModel> {
  const context = await requireInternalUserContext();
  if (!context) return emptyInternalModel();
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase configuration changed while loading the operational model.");
  const organizationId = context.organization.id;
  const [core, teamMembers, diagnostics] = await Promise.all([
    loadCoreModel(supabase, context, false),
    loadRows<OperationalTeamMember>(supabase, organizationId, "operational_team_members", "organization_id,team_id,membership_id,role_description"),
    loadRows<ConstraintDiagnostic>(supabase, organizationId, "constraint_diagnostics", "organization_id,constraint_id,root_cause,business_consequence,opportunity_id,internal_notes"),
  ]);
  return { ...core, teamMembers, diagnostics };
}
