import type { HubNotifyPanelProps } from "@tool-workspace/hub-ui";

export function buildStealthNotifyPanelProps(input: {
  engineStatus: "checking" | "ready" | "offline";
  syncBusy: boolean;
  profileFailed: number;
  profileRunning: number;
  runHistoryFailed: number;
}): HubNotifyPanelProps {
  const alerts: HubNotifyPanelProps["alerts"] = [];

  if (input.engineStatus === "offline") {
    alerts.push({
      id: "engine-offline",
      severity: "bad",
      label: "Engine offline",
      detail: "CloakBrowser binary is missing or failed to start."
    });
  } else if (input.engineStatus === "checking") {
    alerts.push({
      id: "engine-checking",
      severity: "warn",
      label: "Checking engine",
      detail: "Verifying CloakBrowser installation."
    });
  } else {
    alerts.push({
      id: "engine-ready",
      severity: "ok",
      label: "Engine ready",
      detail: "CloakBrowser is installed and reachable."
    });
  }

  if (input.syncBusy) {
    alerts.push({ id: "sync-busy", severity: "warn", label: "Syncing", detail: "Refreshing profile data." });
  }
  if (input.profileFailed > 0) {
    alerts.push({
      id: "profile-failed",
      severity: "bad",
      label: "Failed profiles",
      detail: `${input.profileFailed} profile(s) in failed state — filter Status → Failed to review.`,
    });
  }
  if (input.profileRunning > 0) {
    alerts.push({
      id: "profile-running",
      severity: "ok",
      label: "Running profiles",
      detail: `${input.profileRunning} browser session(s) active.`
    });
  }
  if (input.runHistoryFailed > 0) {
    alerts.push({
      id: "run-failed",
      severity: "warn",
      label: "Failed runs",
      detail: `${input.runHistoryFailed} recent automation run(s) failed.`
    });
  }

  return {
    scopeKey: "stealth-console-notify",
    title: "Status",
    emptyMessage: "All systems nominal.",
    alerts
  };
}
