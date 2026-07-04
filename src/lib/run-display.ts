/** Run history + console display helpers (parity P0027 ReUp Studio rail). */

export function humanizeWorkflowSlug(slug: string): string {
  return String(slug || "workflow")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Task label for Run History line 1 — last workflow segment (e.g. gmail-login → Login). */
export function workflowTaskLabel(slug: string): string {
  const parts = String(slug || "workflow").split(/[-_]+/).filter(Boolean);
  const token = parts[parts.length - 1] ?? "run";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function formatDurationMs(ms: number | null | undefined): string | undefined {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
