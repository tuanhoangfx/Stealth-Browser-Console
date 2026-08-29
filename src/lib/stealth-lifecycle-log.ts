export type StealthLifecycleLogEntry = {
  at?: string;
  kind?: "boot" | "shutdown" | string;
  reason?: string;
  version?: string;
  packaged?: boolean;
  apiPort?: number;
  runningProfiles?: number;
  updateVersion?: string;
  updateState?: string;
};

export function formatStealthLifecycleLogLine(entry: StealthLifecycleLogEntry): string {
  const at = entry.at ? new Date(entry.at).toLocaleString() : "unknown time";
  if (entry.kind === "boot") {
    const port = entry.apiPort != null ? ` :${entry.apiPort}` : "";
    return `${at} · Boot v${entry.version ?? "?"}${port}`;
  }
  if (entry.kind === "shutdown") {
    const parts = [`${at} · Shutdown: ${entry.reason ?? "unknown"}`];
    if (entry.runningProfiles != null) parts.push(`profiles=${entry.runningProfiles}`);
    if (entry.updateVersion) parts.push(`update=${entry.updateVersion}`);
    if (entry.updateState) parts.push(`state=${entry.updateState}`);
    return parts.join(" · ");
  }
  return `${at} · ${entry.kind ?? "event"}`;
}
