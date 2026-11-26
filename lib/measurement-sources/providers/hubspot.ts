import type { MeasurementSourceMapping } from "@/lib/measurement-sources/types";

export const hubSpotObjectTypes = ["contacts", "companies", "deals", "tickets", "products", "line_items", "quotes"] as const;
export type HubSpotObjectType = typeof hubSpotObjectTypes[number];

const HUBSPOT_API_ORIGIN = "https://api.hubapi.com";
const HUBSPOT_API_VERSION = "2026-03";
const maximumPages = 5;
const maximumRecords = 500;

type FetchLike = typeof fetch;
type ProviderRecord = Record<string, unknown>;

type HubSpotPage = {
  results: ProviderRecord[];
  paging?: { next?: { after?: string } };
};

export class HubSpotProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HubSpotProviderError";
    this.code = code;
  }
}

export function assertHubSpotObjectType(value: string): HubSpotObjectType {
  if (!hubSpotObjectTypes.includes(value as HubSpotObjectType)) throw new Error("Unsupported HubSpot object type.");
  return value as HubSpotObjectType;
}

export function hubSpotPropertiesForMappings(mappings: MeasurementSourceMapping[]) {
  const names = new Set<string>();
  for (const mapping of mappings) {
    for (const path of [mapping.valueField, mapping.timestampField, mapping.externalIdField]) {
      if (path?.startsWith("properties.")) names.add(path.slice("properties.".length));
    }
  }
  return [...names].filter((name) => /^[A-Za-z0-9_]+$/.test(name)).slice(0, 50);
}

function requestUrl(objectType: HubSpotObjectType, properties: string[], after?: string, limit = 100) {
  const url = new URL(`/crm/objects/${HUBSPOT_API_VERSION}/${objectType}`, HUBSPOT_API_ORIGIN);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("archived", "false");
  if (properties.length) url.searchParams.set("properties", properties.join(","));
  if (after) url.searchParams.set("after", after);
  return url;
}

async function fetchPage(
  accessToken: string,
  objectType: HubSpotObjectType,
  properties: string[],
  after: string | undefined,
  request: FetchLike,
  limit = 100,
): Promise<HubSpotPage> {
  const response = await request(requestUrl(objectType, properties, after, limit), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new HubSpotProviderError("AUTHORIZATION_FAILED", "HubSpot rejected the scoped credential or required object permission.");
    if (response.status === 429) throw new HubSpotProviderError("RATE_LIMITED", "HubSpot rate limited the measurement request.");
    if (response.status >= 500) throw new HubSpotProviderError("PROVIDER_UNAVAILABLE", "HubSpot is temporarily unavailable.");
    throw new HubSpotProviderError("PROVIDER_REJECTED", `HubSpot rejected the measurement request (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as HubSpotPage).results)) {
    throw new HubSpotProviderError("INVALID_RESPONSE", "HubSpot returned an unexpected response.");
  }
  return body as HubSpotPage;
}

export async function testHubSpotConnection(
  accessToken: string,
  objectType: HubSpotObjectType,
  request: FetchLike = fetch,
) {
  if (accessToken.trim().length < 20) throw new HubSpotProviderError("INVALID_CREDENTIAL", "Enter a valid HubSpot Service Key.");
  await fetchPage(accessToken.trim(), objectType, [], undefined, request, 1);
  return { objectType, apiVersion: HUBSPOT_API_VERSION };
}

export async function fetchHubSpotRecords(
  accessToken: string,
  objectType: HubSpotObjectType,
  properties: string[],
  request: FetchLike = fetch,
) {
  const records: ProviderRecord[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const page = await fetchPage(accessToken, objectType, properties, after, request);
    records.push(...page.results.slice(0, maximumRecords - records.length));
    after = page.paging?.next?.after;
    pages += 1;
  } while (after && pages < maximumPages && records.length < maximumRecords);
  return { records, cursor: after ?? null, truncated: Boolean(after) };
}
