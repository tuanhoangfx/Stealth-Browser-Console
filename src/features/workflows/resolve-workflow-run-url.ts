import { resolveProfileLaunchUrl } from "../../lib/startup-url";
import type { ProfileRow } from "../../types";
import { normalizeUrl } from "./workflow-defaults";
import type { WorkflowConfig } from "./workflow-types";

/** URL used when Launch runs a workflow for a profile — workflow target, else profile startup. */
export function resolveWorkflowRunUrl(workflow: WorkflowConfig, profile: ProfileRow): string {
  const workflowUrl = normalizeUrl(workflow.targetUrl);
  if (workflowUrl) return workflowUrl;
  if (workflow.action === "open-url") {
    return resolveProfileLaunchUrl(profile.startupUrl || "");
  }
  return workflowUrl;
}
