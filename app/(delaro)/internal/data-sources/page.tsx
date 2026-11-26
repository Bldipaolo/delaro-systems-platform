import { DataSection, InternalPage } from "@/components/internal/methodology";
import { HubSpotConnectionPanel } from "@/components/measurement-sources/hubspot-connection-panel";
import { getInternalMeasurementSources } from "@/lib/data/measurement-sources";
import { createMeasurementSource, createMetricMapping, disableMeasurementSource, disconnectHubSpotSource, requestSourceSync } from "./actions";

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
function when(value: string | null) { return value ? dateTime.format(new Date(value)) : "Not yet"; }

export default async function DataSourcesPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  const requestedOrganizationId=(await searchParams).organizationId;
  const workspace=await getInternalMeasurementSources(requestedOrganizationId);
  const healthy=workspace.sources.filter((item)=>item.status==="healthy").length;
  const attention=workspace.sources.filter((item)=>["stale","degraded","failed","authentication_required"].includes(item.status)).length;
  const mapped=workspace.sources.reduce((total,item)=>total+item.mappings.filter((mapping)=>mapping.status==="active").length,0);
  return <InternalPage stage="Measure / sources" title="Data sources" description="Register where operational measures come from, map source fields to Delaro measures, and review synchronization health without exposing provider credentials." demo={workspace.demo}>
    <section className="workflow-organization-bar" aria-labelledby="source-client-heading">
      <div><h2 id="source-client-heading">Client organization</h2><p>All source records, mappings, and sync runs remain tenant-scoped.</p></div>
      <form method="get"><label><span className="sr-only">Select client organization</span><select name="organizationId" defaultValue={workspace.organizationId}>{workspace.organizations.map((organization)=><option value={organization.id} key={organization.id}>{organization.name}</option>)}</select></label><button type="submit">Open organization</button></form>
    </section>

    <section className="source-health-ledger" aria-label="Measurement source summary">
      <div><span>Registered sources</span><strong>{workspace.sources.length}</strong></div>
      <div><span>Healthy</span><strong>{healthy}</strong></div>
      <div><span>Needs attention</span><strong>{attention}</strong></div>
      <div><span>Active mappings</span><strong>{mapped}</strong></div>
    </section>

    {!workspace.demo&&<details className="source-create-panel"><summary>Add data source</summary><form action={createMeasurementSource} className="pilot-form source-form-grid">
      <input type="hidden" name="organizationId" value={workspace.organizationId}/>
      <label>Source name<input name="name" minLength={2} maxLength={160} required placeholder="HubSpot sales operations"/></label>
      <label>Provider<select name="providerType" defaultValue="hubspot"><option value="hubspot">HubSpot</option><option value="api">HTTP API</option><option value="database">Database</option><option value="webhook">Webhook</option><option value="csv">CSV import</option><option value="manual">Manual source</option><option value="other">Other</option></select></label>
      <label>Source category<select name="sourceCategory" defaultValue="crm"><option value="crm">CRM</option><option value="erp">ERP</option><option value="accounting">Accounting</option><option value="scheduling">Scheduling</option><option value="database">Database</option><option value="api">API</option><option value="automation">Automation platform</option><option value="support">Support / ticketing</option><option value="spreadsheet">Spreadsheet</option><option value="file_import">File import</option><option value="custom">Custom</option><option value="manual">Manual</option></select></label>
      <label>Environment<select name="environment" defaultValue="production"><option value="production">Production</option><option value="sandbox">Sandbox</option><option value="test">Test</option><option value="other">Other</option></select></label>
      <label>Connection mode<select name="connectionMode" defaultValue="pull"><option value="pull">Scheduled pull</option><option value="push">Authenticated push</option><option value="batch">Batch import</option><option value="manual">Manual import</option></select></label>
      <label>External reference<input name="externalReference" maxLength={500} placeholder="Portal or account label — never a credential"/></label>
      <label className="source-form-wide">Description<textarea name="description" maxLength={1200} placeholder="What this source measures and who owns it."/></label>
      <input type="hidden" name="scheduleIntervalMinutes" value="60"/><input type="hidden" name="staleAfterMinutes" value="1440"/>
      <label className="pilot-check source-form-wide"><input name="clientVisible" type="checkbox"/> Let clients see source health after connection</label>
      <p className="source-form-note source-form-wide">The source begins as a draft. Credentials are added through the provider-specific connection step and are never stored in this public record.</p>
      <button type="submit">Create draft source</button>
    </form></details>}

    <DataSection title={`Source registry · ${workspace.sources.length}`} empty="No measurement sources are registered for this client.">
      {workspace.sources.map((source)=><article className="source-record" key={source.id}>
        <header className="source-record-header"><div><span className={`source-state source-state-${source.status}`}><i aria-hidden="true"/>{source.status.replaceAll("_"," ")}</span><h2>{source.name}</h2><p>{source.description??"Source purpose has not been documented."}</p></div><dl><div><dt>Provider</dt><dd>{source.providerType} · {source.sourceCategory}</dd></div><div><dt>Mode</dt><dd>{source.connectionMode} · {source.environment}</dd></div><div><dt>Last success</dt><dd>{when(source.lastSuccessfulAt)}</dd></div><div><dt>Latest record</dt><dd>{when(source.lastRecordAt)}</dd></div></dl></header>
        <div className="source-health-line"><strong>{source.healthSummary??(source.status==="draft"?"Connection not configured":"Awaiting the first authenticated measurement")}</strong><span>{source.scheduleEnabled?`Every ${source.scheduleIntervalMinutes} minutes · next ${when(source.nextSyncAt)}`:"No recurring pull schedule"}</span>{source.consecutiveFailures>0&&<span>{source.consecutiveFailures} consecutive {source.consecutiveFailures===1?"failure":"failures"}</span>}</div>
        {!workspace.demo&&source.providerType==="hubspot"&&source.status!=="disabled"&&<HubSpotConnectionPanel organizationId={workspace.organizationId} sourceId={source.id}/>}
        <section className="source-mapping-list" aria-label={`Metric mappings for ${source.name}`}><div className="source-subheading"><h3>Metric mappings</h3><span>{source.mappings.length} active or retained</span></div>{source.mappings.length?source.mappings.map((mapping)=><div className="source-mapping-row" key={mapping.id}><strong>{mapping.metricName}<small>{mapping.name}</small></strong><span>{mapping.providerObject}.{mapping.valueField}</span><span>{mapping.transformKind.replaceAll("_"," ")}</span><span>{mapping.aggregationMethod} · {mapping.periodGranularity}</span><span>{mapping.clientVisible?"Client visible":"Internal"}</span></div>):<p className="methodology-empty">No source field has been mapped to a Delaro measure.</p>}</section>
        {!workspace.demo&&source.status!=="disabled"&&<div className="source-actions">
          {source.connectionMode==="pull"&&source.status!=="draft"&&<form action={requestSourceSync}><input type="hidden" name="organizationId" value={workspace.organizationId}/><input type="hidden" name="sourceId" value={source.id}/><button type="submit">Sync now</button></form>}
          <details><summary>Add metric mapping</summary><form action={createMetricMapping} className="pilot-form source-form-grid"><input type="hidden" name="organizationId" value={workspace.organizationId}/><input type="hidden" name="sourceId" value={source.id}/><label>Delaro measure<select name="metricId" required><option value="">Choose measure</option>{workspace.metrics.map((metric)=><option value={metric.id} key={metric.id}>{metric.name} · {metric.unit}</option>)}</select></label><label>Mapping name<input name="name" required minLength={2} maxLength={160}/></label><label>Provider object<input name="providerObject" required placeholder="contacts or tickets"/></label><label>Value field<input name="valueField" required placeholder="properties.response_time"/></label><label>Timestamp field<input name="timestampField" placeholder="updatedAt"/></label><label>Record ID field<input name="externalIdField" placeholder="id"/></label><label>Transformation<select name="transformKind"><option value="identity">No conversion</option><option value="duration_ms_to_seconds">Milliseconds to seconds</option><option value="minor_currency_to_major">Currency minor to major</option><option value="fraction_to_percentage">Fraction to percentage</option></select></label><label>Aggregation<select name="aggregationMethod"><option value="latest">Latest</option><option value="count">Count</option><option value="sum">Sum</option><option value="average">Average</option><option value="median">Median</option><option value="minimum">Minimum</option><option value="maximum">Maximum</option></select></label><label>Period<select name="periodGranularity"><option value="event">Per event</option><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="quarter">Quarterly</option></select></label><label className="pilot-check source-form-wide"><input name="clientVisible" type="checkbox"/> Show this provenance to clients</label><button type="submit">Save mapping</button></form></details>
          <details><summary>Sync history</summary><div className="source-run-list">{source.runs.length?source.runs.map((run)=><div key={run.id}><strong>{run.status}<small>{run.triggerType} · attempt {run.attempt}</small></strong><span>{run.recordsAccepted} accepted / {run.recordsSeen} seen</span><span>{when(run.finishedAt??run.startedAt??run.createdAt)}</span><span>{run.errorSummary??"No provider error recorded"}</span></div>):<p className="methodology-empty">No synchronization attempts have been recorded.</p>}</div></details>
          {source.providerType==="hubspot"&&source.status!=="draft"&&<form action={disconnectHubSpotSource}><input type="hidden" name="organizationId" value={workspace.organizationId}/><input type="hidden" name="sourceId" value={source.id}/><button className="source-disable" type="submit">Remove credential</button></form>}
          <form action={disableMeasurementSource}><input type="hidden" name="organizationId" value={workspace.organizationId}/><input type="hidden" name="sourceId" value={source.id}/><button className="source-disable" type="submit">Disable source</button></form>
        </div>}
      </article>)}
    </DataSection>
  </InternalPage>;
}
