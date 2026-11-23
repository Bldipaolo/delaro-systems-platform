export const workflowPlatforms = ["n8n_cloud", "n8n_self_hosted"] as const;
export type WorkflowPlatform = (typeof workflowPlatforms)[number];

export type ParsedWorkflowReference = {
  externalWorkflowId: string;
  instanceReference: string;
  workflowUrl: string | null;
};

const workflowIdPattern = /^[A-Za-z0-9_-]{1,180}$/;

function n8nCloudHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "n8n.cloud" || normalized.endsWith(".n8n.cloud");
}

function workflowIdFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const workflowIndex = segments.findIndex((segment) => segment.toLowerCase() === "workflow");
  const id = workflowIndex >= 0 ? segments[workflowIndex + 1] : null;
  return id && workflowIdPattern.test(id) ? id : null;
}

export function parseWorkflowReference(platform: WorkflowPlatform, rawReference: string): ParsedWorkflowReference {
  const reference = rawReference.trim();
  if (!reference) throw new Error("Enter an n8n workflow URL or workflow ID.");

  if (workflowIdPattern.test(reference)) {
    if (platform === "n8n_self_hosted") {
      throw new Error("Use the full HTTPS workflow URL for a self-hosted n8n workflow.");
    }
    return { externalWorkflowId: reference, instanceReference: "n8n Cloud", workflowUrl: null };
  }

  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new Error("Enter a valid workflow ID or credential-free HTTPS n8n URL.");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Workflow URLs must use HTTPS and must not contain credentials.");
  }
  if (platform === "n8n_cloud" && !n8nCloudHost(url.hostname)) {
    throw new Error("The selected n8n Cloud platform requires an n8n.cloud workflow URL.");
  }

  const externalWorkflowId = workflowIdFromPath(url.pathname);
  if (!externalWorkflowId) throw new Error("The URL must contain /workflow/{workflow-id}.");
  url.search = "";
  url.hash = "";
  return {
    externalWorkflowId,
    instanceReference: url.hostname.toLowerCase(),
    workflowUrl: url.toString(),
  };
}

export function workflowPlatformLabel(platform: string) {
  if (platform === "n8n_cloud") return "n8n Cloud";
  if (platform === "n8n_self_hosted") return "n8n self-hosted";
  return platform;
}
