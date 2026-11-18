"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalUserContext } from "@/lib/auth/context";
import { assertOrganizationMemberReference } from "@/lib/auth/references";
import { implementationStatuses, implementationTypes } from "@/lib/implementation-management/types";
import { createClient } from "@/lib/supabase/server";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

const optionalUuid = z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null);
const optionalDate = z.union([z.string().date(), z.literal("")]).transform((value) => value || null);
const optionalText = (max = 4000) => z.string().trim().max(max).transform((value) => value || null);

async function actionContext() {
  const context = await requireInternalUserContext();
  if (!context) throw new Error("An authenticated internal workspace is required.");
  const client = await createClient();
  if (!client) throw new Error("The implementation workspace is unavailable.");
  return { context, client, organizationId: context.organization.id };
}

async function implementationRecord(client: Client, organizationId: string, implementationId: string) {
  const { data, error } = await client.from("implementations")
    .select("id,initiative_id,status,status_before_pause")
    .eq("organization_id", organizationId).eq("id", implementationId).maybeSingle();
  if (error || !data) throw new Error("Implementation does not belong to the active organization.");
  return data;
}

async function assertMembership(client: Client, organizationId: string, membershipId: string | null) {
  if (!membershipId) return;
  const { data, error } = await client.from("organization_memberships").select("id")
    .eq("organization_id", organizationId).eq("id", membershipId).eq("status", "active").maybeSingle();
  if (error || !data) throw new Error("The selected owner is not an active member of this organization.");
}

async function assertReference(client: Client, table: string, organizationId: string, id: string | null) {
  if (!id) return;
  const { data, error } = await client.from(table).select("id").eq("organization_id", organizationId).eq("id", id).maybeSingle();
  if (error || !data) throw new Error("A selected implementation reference is invalid for this organization.");
}

function refresh() {
  revalidatePath("/internal/implementations");
  revalidatePath("/internal/initiatives");
  revalidatePath("/improvements");
  revalidatePath("/overview");
}

export async function createImplementation(formData: FormData) {
  const input = z.object({
    initiativeId: z.string().uuid(),
    name: z.string().trim().min(3).max(180),
    implementationType: z.enum(implementationTypes),
    operationalProblem: z.string().trim().min(10).max(4000),
    desiredOutcome: z.string().trim().min(10).max(4000),
    technicalScope: optionalText(), operationalScope: optionalText(), architectureSummary: optionalText(),
    expectedBusinessImpact: optionalText(), clientSolutionSummary: optionalText(), clientProgressSummary: optionalText(),
    ownerMembershipId: optionalUuid, plannedDeploymentDate: optionalDate,
    processId: optionalUuid, systemId: optionalUuid, metricId: optionalUuid,
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  const [{ data: initiative }, { data: approval }] = await Promise.all([
    client.from("initiatives").select("id").eq("organization_id", organizationId).eq("id", input.initiativeId).maybeSingle(),
    client.from("decisions").select("id").eq("organization_id", organizationId).eq("initiative_id", input.initiativeId)
      .eq("kind", "approval").eq("status", "approved").not("decided_at", "is", null).limit(1).maybeSingle(),
  ]);
  if (!initiative) throw new Error("The selected improvement does not belong to the active organization.");
  if (!approval) throw new Error("The improvement requires recorded client approval before an implementation is created.");
  await Promise.all([
    assertMembership(client, organizationId, input.ownerMembershipId),
    assertReference(client, "processes", organizationId, input.processId),
    assertReference(client, "systems", organizationId, input.systemId),
    assertReference(client, "measurement_metrics", organizationId, input.metricId),
  ]);
  const { data, error } = await client.from("implementations").insert({
    organization_id: organizationId, initiative_id: input.initiativeId, name: input.name,
    implementation_type: input.implementationType, operational_problem: input.operationalProblem,
    desired_outcome: input.desiredOutcome, expected_business_impact: input.expectedBusinessImpact,
    client_solution_summary: input.clientSolutionSummary, client_progress_summary: input.clientProgressSummary,
    owner_membership_id: input.ownerMembershipId, planned_deployment_date: input.plannedDeploymentDate,
  }).select("id").single();
  if (error) { console.error("Implementation creation failed", { code: error.code }); throw new Error("Unable to create the implementation record."); }
  const implementationId = data.id;
  const writes = [];
  if ([input.technicalScope, input.operationalScope, input.architectureSummary].some(Boolean)) writes.push(client.from("implementation_internal_details").insert({
    organization_id: organizationId, implementation_id: implementationId, technical_scope: input.technicalScope,
    operational_scope: input.operationalScope, architecture_summary: input.architectureSummary,
  }));
  if (input.processId) writes.push(client.from("implementation_processes").insert({ organization_id: organizationId, implementation_id: implementationId, process_id: input.processId, relationship: "Primary operating process" }));
  if (input.systemId) writes.push(client.from("implementation_systems").insert({ organization_id: organizationId, implementation_id: implementationId, system_id: input.systemId, relationship: "In scope" }));
  if (input.metricId) writes.push(client.from("implementation_metrics").insert({ organization_id: organizationId, implementation_id: implementationId, metric_id: input.metricId, measurement_role: "Primary outcome measure" }));
  const results = await Promise.all(writes);
  if (results.some((result) => result.error)) {
    console.error("Implementation relationship save failed", { codes: results.map((result) => result.error?.code).filter(Boolean) });
    throw new Error("The implementation was created, but one or more scoped relationships require review.");
  }
  refresh();
}

export async function updateImplementationOverview(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), name: z.string().trim().min(3).max(180),
    operationalProblem: z.string().trim().min(10).max(4000), desiredOutcome: z.string().trim().min(10).max(4000),
    expectedBusinessImpact: optionalText(), clientSolutionSummary: optionalText(), clientProgressSummary: optionalText(),
    ownerMembershipId: optionalUuid, operationalOwnerMembershipId: optionalUuid, escalationOwnerMembershipId: optionalUuid,
    acceptanceDecisionId: optionalUuid, plannedDeploymentDate: optionalDate, expectedOperatingCadence: optionalText(500),
    supportResponsibility: optionalText(2000), manualInterventionSummary: optionalText(2000),
    monitoringStatus: z.enum(["not_connected","configured","connected","degraded","disabled"]),
    clientVisible: z.string().optional(), technicalScope: optionalText(), operationalScope: optionalText(),
    architectureSummary: optionalText(), blockers: optionalText(), internalNotes: optionalText(),
  }).parse(Object.fromEntries(formData));
  if (input.clientVisible === "on" && (!input.clientSolutionSummary || !input.clientProgressSummary)) {
    throw new Error("Add reviewed client solution and progress summaries before publishing.");
  }
  const { client, organizationId } = await actionContext();
  const implementation = await implementationRecord(client, organizationId, input.implementationId);
  await Promise.all([
    assertMembership(client, organizationId, input.ownerMembershipId),
    assertMembership(client, organizationId, input.operationalOwnerMembershipId),
    assertMembership(client, organizationId, input.escalationOwnerMembershipId),
  ]);
  if (input.acceptanceDecisionId) {
    const { data } = await client.from("decisions").select("id").eq("organization_id", organizationId)
      .eq("id", input.acceptanceDecisionId).eq("initiative_id", implementation.initiative_id).eq("kind", "approval").maybeSingle();
    if (!data) throw new Error("The selected acceptance decision must belong to the parent improvement.");
  }
  const { error } = await client.from("implementations").update({
    name: input.name, operational_problem: input.operationalProblem, desired_outcome: input.desiredOutcome,
    expected_business_impact: input.expectedBusinessImpact, client_solution_summary: input.clientSolutionSummary,
    client_progress_summary: input.clientProgressSummary, owner_membership_id: input.ownerMembershipId,
    operational_owner_membership_id: input.operationalOwnerMembershipId, escalation_owner_membership_id: input.escalationOwnerMembershipId,
    acceptance_decision_id: input.acceptanceDecisionId, planned_deployment_date: input.plannedDeploymentDate,
    expected_operating_cadence: input.expectedOperatingCadence, support_responsibility: input.supportResponsibility,
    manual_intervention_summary: input.manualInterventionSummary, monitoring_status: input.monitoringStatus,
    client_visible: input.clientVisible === "on",
  }).eq("organization_id", organizationId).eq("id", input.implementationId);
  if (error) { console.error("Implementation update failed", { code: error.code }); throw new Error("Unable to update the implementation overview."); }
  const { error: detailsError } = await client.from("implementation_internal_details").upsert({
    organization_id: organizationId, implementation_id: input.implementationId,
    technical_scope: input.technicalScope, operational_scope: input.operationalScope,
    architecture_summary: input.architectureSummary, blockers: input.blockers, internal_notes: input.internalNotes,
  }, { onConflict: "implementation_id" });
  if (detailsError) { console.error("Implementation private details update failed", { code: detailsError.code }); throw new Error("Overview saved, but private delivery details were not updated."); }
  refresh();
}

export async function saveImplementationArchitecture(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), authenticationMethod: optionalText(500),
    credentialOwner: z.enum(["client","delaro","shared_responsibility","not_applicable"]),
    failureConditions: optionalText(), retryBehavior: optionalText(), loggingStrategy: optionalText(),
    monitoringStrategy: optionalText(), securityConsiderations: optionalText(), manualFallbackProcedure: optionalText(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await implementationRecord(client, organizationId, input.implementationId);
  const { error } = await client.from("implementation_architectures").upsert({
    organization_id: organizationId, implementation_id: input.implementationId,
    authentication_method: input.authenticationMethod, credential_owner: input.credentialOwner,
    failure_conditions: input.failureConditions, retry_behavior: input.retryBehavior,
    logging_strategy: input.loggingStrategy, monitoring_strategy: input.monitoringStrategy,
    security_considerations: input.securityConsiderations, manual_fallback_procedure: input.manualFallbackProcedure,
  }, { onConflict: "implementation_id" });
  if (error) { console.error("Architecture save failed", { code: error.code }); throw new Error("Unable to save the architecture controls."); }
  refresh();
}

export async function addArchitectureItem(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), category: z.enum(["input","processing","decision","output"]),
    itemType: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(180),
    description: optionalText(3000), systemId: optionalUuid, sequence: z.coerce.number().int().min(0).max(10000),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await Promise.all([implementationRecord(client, organizationId, input.implementationId), assertReference(client, "systems", organizationId, input.systemId)]);
  const { error } = await client.from("implementation_architecture_items").insert({
    organization_id: organizationId, implementation_id: input.implementationId, category: input.category,
    item_type: input.itemType, name: input.name, description: input.description, system_id: input.systemId, sequence: input.sequence,
  });
  if (error) throw new Error("Unable to add the architecture item.");
  refresh();
}

export async function registerWorkflow(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), processId: optionalUuid,
    platform: z.string().trim().min(2).max(80), instanceReference: z.string().trim().min(2).max(300),
    workflowId: z.string().trim().min(1).max(180), workflowName: z.string().trim().min(2).max(180),
    purpose: z.string().trim().min(5).max(2000), environment: z.enum(["development","staging","production","other"]),
    operationalStatus: z.enum(["documented","in_development","testing","active","paused","failed","retired"]),
    ownerMembershipId: optionalUuid, monitoringStatus: z.enum(["not_connected","configured","connected","degraded","disabled"]),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await Promise.all([
    implementationRecord(client, organizationId, input.implementationId),
    assertReference(client, "processes", organizationId, input.processId),
    assertMembership(client, organizationId, input.ownerMembershipId),
  ]);
  const { error } = await client.from("implementation_workflows").insert({
    organization_id: organizationId, implementation_id: input.implementationId, process_id: input.processId,
    platform: input.platform, instance_reference: input.instanceReference, external_workflow_id: input.workflowId,
    workflow_name: input.workflowName, purpose: input.purpose, environment: input.environment,
    operational_status: input.operationalStatus, owner_membership_id: input.ownerMembershipId, monitoring_status: input.monitoringStatus,
  });
  if (error) { console.error("Workflow registry insert failed", { code: error.code }); throw new Error("Unable to register the external workflow metadata."); }
  refresh();
}

export async function addImplementationMilestone(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), title: z.string().trim().min(3).max(180), description: optionalText(2000),
    status: z.enum(["Upcoming","In progress","Complete","Blocked"]), dueDate: optionalDate, ownerUserId: optionalUuid,
    acceptanceRequirements: optionalText(3000), blockerDetails: optionalText(3000), clientVisible: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  const implementation = await implementationRecord(client, organizationId, input.implementationId);
  await assertOrganizationMemberReference(client, organizationId, input.ownerUserId);
  const completedDate = input.status === "Complete" ? new Date().toISOString().slice(0, 10) : null;
  const { data, error } = await client.from("initiative_milestones").insert({
    organization_id: organizationId, initiative_id: implementation.initiative_id, implementation_id: input.implementationId,
    title: input.title, description: input.description, status: input.status, due_date: input.dueDate,
    completed_date: completedDate, owner_id: input.ownerUserId, client_visible: input.clientVisible === "on",
  }).select("id").single();
  if (error) throw new Error("Unable to save the implementation milestone.");
  if (input.acceptanceRequirements || input.blockerDetails) {
    const { error: detailError } = await client.from("implementation_milestone_details").insert({
      organization_id: organizationId, implementation_id: input.implementationId, milestone_id: data.id,
      acceptance_requirements: input.acceptanceRequirements, blocker_details: input.blockerDetails,
    });
    if (detailError) throw new Error("Milestone saved, but its internal requirements were not saved.");
  }
  refresh();
}

export async function addAcceptanceCriterion(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), title: z.string().trim().min(3).max(180),
    expectedBehavior: z.string().trim().min(5).max(3000), required: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await implementationRecord(client, organizationId, input.implementationId);
  const { error } = await client.from("implementation_acceptance_criteria").insert({
    organization_id: organizationId, implementation_id: input.implementationId,
    title: input.title, expected_behavior: input.expectedBehavior, required: input.required === "on",
  });
  if (error) throw new Error("Unable to add the acceptance criterion.");
  refresh();
}

export async function reviewAcceptanceCriterion(formData: FormData) {
  const input = z.object({ criterionId: z.string().uuid(), status: z.enum(["pending","accepted","rejected"]) }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  const { data, error } = await client.from("implementation_acceptance_criteria").update({ review_status: input.status })
    .eq("organization_id", organizationId).eq("id", input.criterionId).select("id").maybeSingle();
  if (error || !data) throw new Error("Unable to record the acceptance review.");
  refresh();
}

export async function addImplementationTest(formData: FormData) {
  const input = z.object({
    implementationId: z.string().uuid(), name: z.string().trim().min(3).max(180),
    category: z.enum(["functional","integration","data_accuracy","error_handling","permission","security","performance","client_acceptance"]),
    expectedBehavior: z.string().trim().min(5).max(3000), required: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await implementationRecord(client, organizationId, input.implementationId);
  const { error } = await client.from("implementation_tests").insert({
    organization_id: organizationId, implementation_id: input.implementationId,
    name: input.name, category: input.category, expected_behavior: input.expectedBehavior, required: input.required === "on",
  });
  if (error) throw new Error("Unable to add the implementation test.");
  refresh();
}

export async function recordImplementationTest(formData: FormData) {
  const input = z.object({
    testId: z.string().uuid(), status: z.enum(["pending","passed","failed","blocked"]),
    actualOutcome: optionalText(3000), evidenceReference: optionalText(1000), notes: optionalText(3000), requiredRemediation: optionalText(3000),
  }).parse(Object.fromEntries(formData));
  if (input.status === "passed" && !input.actualOutcome) throw new Error("A passing test requires the actual outcome.");
  if (["failed","blocked"].includes(input.status) && !input.requiredRemediation) throw new Error("Failed or blocked tests require remediation notes.");
  const { client, organizationId } = await actionContext();
  const { data, error } = await client.from("implementation_tests").update({
    status: input.status, actual_outcome: input.actualOutcome, evidence_reference: input.evidenceReference,
    notes: input.notes, required_remediation: input.requiredRemediation,
  }).eq("organization_id", organizationId).eq("id", input.testId).select("id").maybeSingle();
  if (error || !data) throw new Error("Unable to record the test outcome.");
  refresh();
}

export async function transitionImplementation(formData: FormData) {
  const input = z.object({ implementationId: z.string().uuid(), status: z.enum(implementationStatuses) }).parse(Object.fromEntries(formData));
  const { client, organizationId } = await actionContext();
  await implementationRecord(client, organizationId, input.implementationId);
  const { data, error } = await client.from("implementations").update({ status: input.status })
    .eq("organization_id", organizationId).eq("id", input.implementationId).select("id").maybeSingle();
  if (error || !data) {
    console.error("Implementation transition rejected", { code: error?.code, target: input.status });
    throw new Error("The lifecycle transition was rejected. Confirm approval, testing, acceptance, deployment, and ownership prerequisites.");
  }
  refresh();
}

export async function recordDeployment(formData: FormData) {
  const input = z.object({
    deploymentRequestId: z.string().uuid(), implementationId: z.string().uuid(), version: z.string().trim().min(1).max(80),
    environment: z.enum(["staging","production","other"]), deployedAt: z.string().datetime({ offset: true }),
    externalReference: optionalText(1000), configurationRequirements: optionalText(3000), acceptanceStatus: z.enum(["approved","conditional"]),
    knownLimitations: optionalText(3000), rollbackProcedure: z.string().trim().min(5).max(4000),
    operationalOwnerMembershipId: z.string().uuid(), supportResponsibility: z.string().trim().min(3).max(2000),
  }).parse(Object.fromEntries(formData));
  if (input.acceptanceStatus !== "approved") throw new Error("A conditional release may be recorded only after the implementation returns to client acceptance.");
  const { client, organizationId } = await actionContext();
  await Promise.all([
    implementationRecord(client, organizationId, input.implementationId),
    assertMembership(client, organizationId, input.operationalOwnerMembershipId),
  ]);
  const { error } = await client.from("implementation_deployments").insert({
    id: input.deploymentRequestId, organization_id: organizationId, implementation_id: input.implementationId,
    version: input.version, environment: input.environment, deployed_at: input.deployedAt,
    external_reference: input.externalReference, configuration_requirements: input.configurationRequirements,
    acceptance_status: input.acceptanceStatus, known_limitations: input.knownLimitations,
    rollback_procedure: input.rollbackProcedure, operational_owner_membership_id: input.operationalOwnerMembershipId,
    support_responsibility: input.supportResponsibility,
  });
  if (error && error.code !== "23505") { console.error("Deployment record failed", { code: error.code }); throw new Error("Unable to record the deployment."); }
  const { error: updateError } = await client.from("implementations").update({
    operational_owner_membership_id: input.operationalOwnerMembershipId,
    support_responsibility: input.supportResponsibility, status: "deployed",
  }).eq("organization_id", organizationId).eq("id", input.implementationId);
  if (updateError) { console.error("Deployment transition failed", { code: updateError.code }); throw new Error("The deployment was recorded, but the lifecycle transition requires review."); }
  refresh();
}
