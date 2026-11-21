export function isUnauthenticatedServerEndpoint(pathname: string) {
  return pathname === "/api/integrations/n8n/executions";
}
