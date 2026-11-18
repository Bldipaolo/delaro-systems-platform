# Stage 2 implementation management

Stage 2 extends an approved improvement into one or more implementation records. It does not replace initiatives, execute n8n workflows, store client credentials, or treat deployment as proof of business impact.

## Record structure

```text
initiative (approved improvement)
  └─ implementations
       ├─ implementation_internal_details
       ├─ implementation_architectures
       │    └─ implementation_architecture_items
       ├─ implementation_workflows (external metadata only)
       ├─ implementation_processes / implementation_systems
       ├─ implementation_metrics
       ├─ initiative_milestones + implementation_milestone_details
       ├─ implementation_acceptance_criteria
       ├─ implementation_tests
       ├─ implementation_deployments (append-only)
       ├─ implementation_references
       └─ implementation_events (audit history)
```

All relationships carry `organization_id`. Composite foreign keys prevent references to another tenant's initiative, process, system, metric, milestone, decision, or membership.

## Lifecycle

```text
Planning → Architecture → Development → Internal testing
  → Client acceptance → Ready for deployment → Deployed → Monitoring
```

Paused and Retired are controlled side states. PostgreSQL validates transitions even when a user writes through the Supabase Data API:

- Development and later require a genuine approved parent improvement.
- Ready for deployment requires at least one required test and criterion, all required tests passed, all required criteria accepted, and the linked client acceptance decision approved.
- Deployed requires an accepted, versioned deployment record.
- Monitoring requires an operational owner and documented support responsibility.
- Deployment history cannot be updated or deleted.

Application actions enforce the same active-organization and internal-role boundaries before issuing writes. RLS remains the final access boundary.

## n8n ownership

`implementation_workflows` stores only external registry metadata: client instance reference, workflow ID/name, environment, purpose, status, owner, monitoring state, and observed timestamps. It has no credential, token, password, or workflow-payload field. Client credentials remain in the client-owned n8n instance.

Until Stage 3 adds authenticated ingestion, new implementations and workflows use `monitoring_status = not_connected`. A deployment is not labeled healthy merely because it exists.

## Publication boundary

Clients can read only:

- published implementation summary/progress fields beneath a published improvement;
- explicitly published implementation milestones; and
- explicitly published documentation references.

Architecture records, workflow identifiers, tests, deployment controls, blockers, internal notes, and audit events are internal-only. The client Improvements page shows lifecycle, reviewed progress, shared milestones, deployment state, monitoring connection state, and linked measurement intent without exposing technical configuration.

## Verification

The rollback SQL suite creates a synthetic approved improvement, architecture, two n8n registry records, milestone, required test, acceptance criterion, client acceptance decision, deployment, and monitoring record. It asserts failed tests block readiness, deployment cannot be bypassed, history is immutable, cross-tenant links fail, and internal records remain hidden from the client role.
