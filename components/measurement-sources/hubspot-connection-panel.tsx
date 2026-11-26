"use client";

import { useActionState } from "react";
import {
  connectHubSpotSource,
  type HubSpotConnectionState,
} from "@/app/(delaro)/internal/data-sources/actions";

const initialState: HubSpotConnectionState = { error: null, success: null };

export function HubSpotConnectionPanel({
  organizationId,
  sourceId,
}: {
  organizationId: string;
  sourceId: string;
}) {
  const [state, action, pending] = useActionState(connectHubSpotSource, initialState);
  return <details className="source-provider-connect">
    <summary>Connect HubSpot</summary>
    <div className="source-provider-layout">
      <div>
        <p className="eyebrow">Scoped provider access</p>
        <h3>Verify a HubSpot Service Key</h3>
        <p>Create a read-only Service Key in HubSpot with access only to the CRM objects used by this source. Delaro encrypts it server-side and never writes it to the public source record, browser storage, or synchronization logs.</p>
      </div>
      <form action={action} className="pilot-form source-provider-form">
        <input type="hidden" name="organizationId" value={organizationId}/>
        <input type="hidden" name="sourceId" value={sourceId}/>
        <label>HubSpot Service Key<input type="password" name="accessToken" minLength={20} maxLength={4000} required autoComplete="off" spellCheck={false}/></label>
        <label>Connection test object<select name="testObject" defaultValue="contacts"><option value="contacts">Contacts</option><option value="companies">Companies</option><option value="deals">Deals</option><option value="tickets">Tickets</option><option value="products">Products</option><option value="line_items">Line items</option><option value="quotes">Quotes</option></select></label>
        <label>Sync cadence<select name="scheduleIntervalMinutes" defaultValue="60"><option value="15">Every 15 minutes</option><option value="60">Hourly</option><option value="360">Every 6 hours</option><option value="1440">Daily</option></select></label>
        <p className="form-guidance">The test reads at most one page and retains no provider records. A source remains configured—not healthy—until a scheduled sync produces authenticated evidence.</p>
        <button type="submit" disabled={pending}>{pending ? "Verifying secure access…" : "Verify and connect"}</button>
      </form>
    </div>
    {state.error&&<p className="workflow-form-error" role="alert">{state.error}</p>}
    {state.success&&<p className="source-provider-success" role="status">{state.success}</p>}
  </details>;
}
