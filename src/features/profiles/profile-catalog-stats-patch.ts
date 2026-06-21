import type { ProfileCatalogStats, ProfileStatus } from "../../types";

type StatusBucket = "closed" | "opening" | "running" | "failed";

function statusBucket(status: ProfileStatus): StatusBucket | null {
  if (status === "closed" || status === "opening" || status === "running" || status === "failed") {
    return status;
  }
  return null;
}

/** Live-adjust catalog counters when a profile session event fires (no full DB scan). */
export function patchCatalogStatsForStatusChange(
  stats: ProfileCatalogStats,
  from: ProfileStatus,
  to: ProfileStatus,
): ProfileCatalogStats {
  if (from === to) return stats;
  const fromBucket = statusBucket(from);
  const toBucket = statusBucket(to);
  if (!fromBucket || !toBucket) return stats;

  const next = { ...stats };
  if (next[fromBucket] > 0) next[fromBucket] -= 1;
  next[toBucket] += 1;
  return next;
}

/** Map session events when the profile row is not in the paginated client cache. */
export function patchCatalogStatsForSessionEvent(
  stats: ProfileCatalogStats,
  event: string,
): ProfileCatalogStats {
  const next = { ...stats };
  const dec = (key: StatusBucket) => {
    if (next[key] > 0) next[key] -= 1;
  };
  const inc = (key: StatusBucket) => {
    next[key] += 1;
  };

  switch (event) {
    case "opening":
      dec("closed");
      inc("opening");
      break;
    case "running":
    case "focused":
      if (next.opening > 0) dec("opening");
      else dec("closed");
      inc("running");
      break;
    case "closed":
    case "storage-released":
      if (next.running > 0) dec("running");
      else if (next.opening > 0) dec("opening");
      else dec("failed");
      inc("closed");
      break;
    case "failed":
      if (next.opening > 0) dec("opening");
      else dec("closed");
      inc("failed");
      break;
    default:
      return stats;
  }
  return next;
}

/** Reconcile status buckets with catalog total (unknown status → ready; clamp patch drift). */
export function reconcileCatalogStats(stats: ProfileCatalogStats): ProfileCatalogStats {
  const { total, opening, running, failed } = stats;
  const active = opening + running + failed;
  let closed = stats.closed;
  const sum = closed + active;
  if (sum > total) {
    closed = Math.max(0, total - active);
  } else if (sum < total) {
    closed += total - sum;
  }
  return { ...stats, closed };
}

/** Header/KPI “Running” includes profiles still opening (launch in progress). */
export function catalogStatsToKpiNumbers(stats: ProfileCatalogStats) {
  const reconciled = reconcileCatalogStats(stats);
  return {
    total: reconciled.total,
    ready: reconciled.closed,
    running: reconciled.running + reconciled.opening,
    failed: reconciled.failed,
  };
}
