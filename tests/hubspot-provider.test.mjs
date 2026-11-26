import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchHubSpotRecords,
  hubSpotPropertiesForMappings,
  testHubSpotConnection,
} from "../lib/measurement-sources/providers/hubspot.ts";

const mapping = {
  id: "e4030000-0000-4000-8000-000000000011",
  valueField: "properties.amount",
  timestampField: "updatedAt",
  externalIdField: "id",
  transformKind: "identity",
  scaleFactor: 1,
  offsetValue: 0,
  aggregationMethod: "latest",
  periodGranularity: "event",
};

test("HubSpot adapter requests only mapped fields and follows bounded pagination", async () => {
  const requests = [];
  const fixtureFetch = async (input, init) => {
    const url = new URL(input);
    requests.push({ url, authorization: init.headers.Authorization });
    const second = url.searchParams.get("after") === "next-page";
    return Response.json(second
      ? { results: [{ id: "2", updatedAt: "2026-11-25T12:01:00Z", properties: { amount: "20" } }] }
      : { results: [{ id: "1", updatedAt: "2026-11-25T12:00:00Z", properties: { amount: "10" } }], paging: { next: { after: "next-page" } } });
  };
  const fields = hubSpotPropertiesForMappings([mapping]);
  const result = await fetchHubSpotRecords("fixture-service-key-long-enough", "deals", fields, fixtureFetch);
  assert.deepEqual(fields, ["amount"]);
  assert.equal(result.records.length, 2);
  assert.equal(requests.length, 2);
  assert.match(requests[0].url.pathname, /\/crm\/objects\/2026-03\/deals/);
  assert.equal(requests[0].url.searchParams.get("properties"), "amount");
  assert.equal(requests[0].authorization, "Bearer fixture-service-key-long-enough");
  assert.equal(result.cursor, "2");
});

test("HubSpot adapter resumes after its private incremental cursor", async () => {
  const fixtureFetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("after"), "previous-record");
    return Response.json({ results: [{ id: "next-record", updatedAt: "2026-11-26T01:00:00Z", properties: { amount: "25" } }] });
  };
  const result = await fetchHubSpotRecords("fixture-service-key-long-enough", "deals", ["amount"], fixtureFetch, "previous-record");
  assert.equal(result.records.length, 1);
  assert.equal(result.cursor, "next-record");
});

test("HubSpot connection tests fail safely for authorization and rate limits", async () => {
  const unauthorized = async () => new Response(null, { status: 401 });
  const limited = async () => new Response(null, { status: 429 });
  await assert.rejects(() => testHubSpotConnection("fixture-service-key-long-enough", "contacts", unauthorized), /rejected the scoped credential/);
  await assert.rejects(() => testHubSpotConnection("fixture-service-key-long-enough", "contacts", limited), /rate limited/);
});

test("HubSpot connection tests do not retain provider records", async () => {
  const fixtureFetch = async () => Response.json({ results: [{ id: "1", properties: { email: "private@example.invalid" } }] });
  assert.deepEqual(await testHubSpotConnection("fixture-service-key-long-enough", "contacts", fixtureFetch), {
    objectType: "contacts",
    apiVersion: "2026-03",
  });
});
