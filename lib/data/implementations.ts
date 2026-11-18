import { isSupabaseConfigured, requireCurrentUserContext, requireInternalUserContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { demoImplementations } from "@/lib/implementation-management/demo";
import { monitoringLabel, type ClientImplementation, type ImplementationStatus, type ImplementationType, type InternalImplementation, type MonitoringStatus } from "@/lib/implementation-management/types";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type Row = Record<string, unknown>;

async function tableRows(client: Client, table: string, selection: string, organizationId: string, order?: string) {
  let query = client.from(table).select(selection).eq("organization_id", organizationId);
  if (order) query = query.order(order, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

const value = (input: unknown) => typeof input === "string" ? input : null;
const bool = (input: unknown) => input === true;

function memberName(membershipId: unknown, people: Row[], currentMembershipId: string, currentName: string) {
  const id = value(membershipId);
  if (!id) return null;
  if (id === currentMembershipId) return currentName;
  return value(people.find((person) => person.membership_id === id)?.display_name) ?? "Assigned member";
}

function clientImplementation(
  implementation: Row,
  milestones: Row[],
  references: Row[],
  people: Row[],
  currentMembershipId: string,
  currentName: string,
): ClientImplementation {
  const id = String(implementation.id);
  const monitoringStatus = implementation.monitoring_status as MonitoringStatus;
  return {
    id,
    name: String(implementation.name),
    type: implementation.implementation_type as ImplementationType,
    solutionSummary: value(implementation.client_solution_summary),
    progressSummary: value(implementation.client_progress_summary),
    desiredOutcome: String(implementation.desired_outcome),
    status: implementation.status as ImplementationStatus,
    ownerName: memberName(implementation.owner_membership_id, people, currentMembershipId, currentName),
    plannedDeploymentDate: value(implementation.planned_deployment_date),
    actualDeploymentDate: value(implementation.actual_deployment_date),
    monitoringStatus,
    monitoringLabel: monitoringLabel(monitoringStatus),
    operationalHealth: String(implementation.operational_health),
    lastObservedStatus: value(implementation.last_observed_status),
    lastObservedAt: value(implementation.last_observed_at),
    expectedOperatingCadence: value(implementation.expected_operating_cadence),
    supportResponsibility: value(implementation.support_responsibility),
    milestones: milestones.filter((item) => item.implementation_id === id).map((item) => ({
      id: String(item.id),
      title: String(item.title),
      description: value(item.description),
      status: item.status as ClientImplementation["milestones"][number]["status"],
      dueDate: value(item.due_date),
      completedDate: value(item.completed_date),
      ownerName: memberName(item.owner_id, people, currentMembershipId, currentName),
      clientVisible: bool(item.client_visible),
    })),
    references: references.filter((item) => item.implementation_id === id).map((item) => ({
      id: String(item.id), title: String(item.title), type: String(item.reference_type),
      reference: String(item.reference), description: value(item.description),
    })),
  };
}

export async function getClientImplementations(): Promise<Map<string, ClientImplementation[]>> {
  if (!isSupabaseConfigured()) return new Map(Object.entries(demoImplementations));
  const context = await requireCurrentUserContext();
  if (!context) return new Map();
  const client = await createClient();
  if (!client) throw new Error("The implementation workspace is unavailable.");
  const organizationId = context.organization.id;
  const [implementations, milestones, references, people] = await Promise.all([
    tableRows(client, "implementations", "id,organization_id,initiative_id,name,implementation_type,desired_outcome,client_solution_summary,client_progress_summary,owner_membership_id,status,planned_deployment_date,actual_deployment_date,monitoring_status,operational_health,last_observed_status,last_observed_at,expected_operating_cadence,support_responsibility", organizationId, "updated_at"),
    tableRows(client, "initiative_milestones", "id,organization_id,initiative_id,implementation_id,title,description,status,due_date,completed_date,owner_id,client_visible", organizationId),
    tableRows(client, "implementation_references", "id,organization_id,implementation_id,title,reference_type,reference,description,client_visible", organizationId),
    tableRows(client, "operational_people", "id,organization_id,membership_id,display_name,client_visible", organizationId),
  ]);
  const currentName = context.profile?.fullName ?? context.profile?.email ?? "Current user";
  const grouped = new Map<string, ClientImplementation[]>();
  for (const row of implementations) {
    const initiativeId = String(row.initiative_id);
    const item = clientImplementation(row, milestones, references, people, context.membership.id, currentName);
    grouped.set(initiativeId, [...(grouped.get(initiativeId) ?? []), item]);
  }
  return grouped;
}

export async function getInternalImplementationWorkspace() {
  const context = await requireInternalUserContext();
  if (!context) return { organizationName: "Northstar Manufacturing", implementations: [] as InternalImplementation[], initiatives: [], processes: [], systems: [], metrics: [], decisions: [] };
  const client = await createClient();
  if (!client) throw new Error("The implementation workspace is unavailable.");
  const organizationId = context.organization.id;
  const [implementations, details, architectures, architectureItems, workflows, milestones, milestoneDetails, tests, criteria, deployments, references, dependencies, processLinks, systemLinks, metricLinks, initiatives, processes, systems, metrics, decisions, people] = await Promise.all([
    tableRows(client, "implementations", "*", organizationId, "updated_at"),
    tableRows(client, "implementation_internal_details", "*", organizationId),
    tableRows(client, "implementation_architectures", "*", organizationId),
    tableRows(client, "implementation_architecture_items", "*", organizationId),
    tableRows(client, "implementation_workflows", "*", organizationId),
    tableRows(client, "initiative_milestones", "id,organization_id,initiative_id,implementation_id,title,description,status,due_date,completed_date,owner_id,client_visible", organizationId),
    tableRows(client, "implementation_milestone_details", "*", organizationId),
    tableRows(client, "implementation_tests", "*", organizationId),
    tableRows(client, "implementation_acceptance_criteria", "*", organizationId),
    tableRows(client, "implementation_deployments", "*", organizationId, "deployed_at"),
    tableRows(client, "implementation_references", "*", organizationId),
    tableRows(client, "implementation_dependencies", "*", organizationId),
    tableRows(client, "implementation_processes", "*", organizationId),
    tableRows(client, "implementation_systems", "*", organizationId),
    tableRows(client, "implementation_metrics", "*", organizationId),
    tableRows(client, "initiatives", "id,title,current_phase,status,client_visible", organizationId),
    tableRows(client, "processes", "id,name", organizationId),
    tableRows(client, "systems", "id,name", organizationId),
    tableRows(client, "measurement_metrics", "id,name,unit,initiative_id", organizationId),
    tableRows(client, "decisions", "id,title,status,kind,initiative_id,client_visible", organizationId),
    tableRows(client, "operational_people", "id,membership_id,display_name", organizationId),
  ]);
  const currentName = context.profile?.fullName ?? context.profile?.email ?? "Current user";
  const records = implementations.map((implementation): InternalImplementation => {
    const id = String(implementation.id);
    const base = clientImplementation(implementation, milestones, references, people, context.membership.id, currentName);
    const internal = details.find((item) => item.implementation_id === id);
    const architecture = architectures.find((item) => item.implementation_id === id);
    return {
      ...base,
      organizationId,
      initiativeId: String(implementation.initiative_id),
      initiativeTitle: String(initiatives.find((item) => item.id === implementation.initiative_id)?.title ?? "Improvement"),
      operationalProblem: String(implementation.operational_problem),
      expectedBusinessImpact: value(implementation.expected_business_impact),
      ownerMembershipId: value(implementation.owner_membership_id),
      operationalOwnerMembershipId: value(implementation.operational_owner_membership_id),
      escalationOwnerMembershipId: value(implementation.escalation_owner_membership_id),
      acceptanceDecisionId: value(implementation.acceptance_decision_id),
      technicalScope: value(internal?.technical_scope), operationalScope: value(internal?.operational_scope),
      architectureSummary: value(internal?.architecture_summary), blockers: value(internal?.blockers), internalNotes: value(internal?.internal_notes),
      manualInterventionSummary: value(implementation.manual_intervention_summary),
      clientVisible: bool(implementation.client_visible),
      architecture: architecture ? {
        authenticationMethod: value(architecture.authentication_method), credentialOwner: String(architecture.credential_owner),
        failureConditions: value(architecture.failure_conditions), retryBehavior: value(architecture.retry_behavior),
        loggingStrategy: value(architecture.logging_strategy), monitoringStrategy: value(architecture.monitoring_strategy),
        securityConsiderations: value(architecture.security_considerations), manualFallbackProcedure: value(architecture.manual_fallback_procedure),
      } : null,
      architectureItems: architectureItems.filter((item) => item.implementation_id === id).sort((a, b) => Number(a.sequence) - Number(b.sequence)).map((item) => ({
        id: String(item.id), category: item.category as "input" | "processing" | "decision" | "output", itemType: String(item.item_type),
        name: String(item.name), description: value(item.description), systemId: value(item.system_id), sequence: Number(item.sequence),
      })),
      workflows: workflows.filter((item) => item.implementation_id === id).map((item) => ({
        id: String(item.id), platform: String(item.platform), instanceReference: String(item.instance_reference), workflowId: String(item.external_workflow_id),
        name: String(item.workflow_name), purpose: String(item.purpose), environment: String(item.environment), operationalStatus: String(item.operational_status),
        monitoringStatus: item.monitoring_status as MonitoringStatus, lastSuccessAt: value(item.last_successful_execution_at), lastFailureAt: value(item.last_failure_at),
      })),
      milestones: base.milestones.map((milestone) => {
        const detail = milestoneDetails.find((item) => item.milestone_id === milestone.id);
        return { ...milestone, acceptanceRequirements: value(detail?.acceptance_requirements), blockerDetails: value(detail?.blocker_details) };
      }),
      tests: tests.filter((item) => item.implementation_id === id).map((item) => ({
        id: String(item.id), name: String(item.name), category: String(item.category), expectedBehavior: String(item.expected_behavior),
        actualOutcome: value(item.actual_outcome), status: item.status as "pending" | "passed" | "failed" | "blocked", required: bool(item.required),
        executedAt: value(item.executed_at), evidenceReference: value(item.evidence_reference), remediation: value(item.required_remediation),
      })),
      criteria: criteria.filter((item) => item.implementation_id === id).map((item) => ({
        id: String(item.id), title: String(item.title), expectedBehavior: String(item.expected_behavior), required: bool(item.required),
        status: item.review_status as "pending" | "accepted" | "rejected", reviewedAt: value(item.reviewed_at),
      })),
      deployments: deployments.filter((item) => item.implementation_id === id).map((item) => ({
        id: String(item.id), version: String(item.version), environment: String(item.environment), deployedAt: String(item.deployed_at),
        acceptanceStatus: String(item.acceptance_status), externalReference: value(item.external_reference), knownLimitations: value(item.known_limitations),
        supportResponsibility: String(item.support_responsibility),
      })),
      dependencies: dependencies.filter((item) => item.implementation_id === id).map((item) => ({
        implementationId: String(item.depends_on_implementation_id),
        name: String(implementations.find((candidate) => candidate.id === item.depends_on_implementation_id)?.name ?? "Implementation"),
        type: item.dependency_type as InternalImplementation["dependencies"][number]["type"],
        description: value(item.description),
      })),
      linkedProcessIds: processLinks.filter((item) => item.implementation_id === id).map((item) => String(item.process_id)),
      linkedSystemIds: systemLinks.filter((item) => item.implementation_id === id).map((item) => String(item.system_id)),
      linkedMetricIds: metricLinks.filter((item) => item.implementation_id === id).map((item) => String(item.metric_id)),
    };
  });
  return {
    organizationName: context.organization.name,
    implementations: records,
    initiatives: initiatives.map((item) => ({ id: String(item.id), title: String(item.title), phase: String(item.current_phase), status: String(item.status) })),
    processes: processes.map((item) => ({ id: String(item.id), name: String(item.name) })),
    systems: systems.map((item) => ({ id: String(item.id), name: String(item.name) })),
    metrics: metrics.map((item) => ({ id: String(item.id), name: String(item.name), unit: String(item.unit), initiativeId: value(item.initiative_id) })),
    decisions: decisions.map((item) => ({ id: String(item.id), title: String(item.title), status: String(item.status), initiativeId: value(item.initiative_id) })),
  };
}
