export function isUnauthenticatedServerEndpoint(pathname: string) {
  return pathname === "/api/integrations/n8n/executions";
}

export function isPublicIntegrationAsset(pathname: string) {
  return pathname.startsWith("/integrations/n8n/") && pathname.endsWith(".json");
}
