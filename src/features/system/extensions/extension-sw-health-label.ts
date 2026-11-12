import type { ExtensionSwHealthSummary } from "../../../types";

export function formatSwHealthDetailLabel(sw?: ExtensionSwHealthSummary | null): {
  text: string;
  toneClass: string;
  tooltip: string;
} {
  if (!sw || sw.sampledProfiles === 0) {
    return {
      text: "Idle (0 opened profiles sampled)",
      toneClass: "text-[var(--muted)]",
      tooltip: "Sampled across closed non-customer profiles after first session launch.",
    };
  }
  if (sw.status === "needs-heal") {
    const missingList = sw.sampleMissingCodes?.length ? ` (${sw.sampleMissingCodes.join(", ")})` : "";
    return {
      text: `Needs heal · ${sw.missingSwCount} missing (${sw.registeredCount}/${sw.sampledProfiles} active)`,
      toneClass: "text-amber-300",
      tooltip: `MV3 background Service Worker unregistered on ${sw.missingSwCount} profile(s)${missingList}. Re-launch or run Repair prefs.`,
    };
  }
  const onLatest =
    sw.expectedVersion && sw.currentVersionCount < sw.registeredCount
      ? ` · ${sw.currentVersionCount} on v${sw.expectedVersion}`
      : sw.expectedVersion
        ? ` · v${sw.expectedVersion}`
        : "";
  return {
    text: `Healthy · ${sw.registeredCount}/${sw.sampledProfiles} registered${onLatest}`,
    toneClass: "text-emerald-300",
    tooltip: `MV3 Service Worker verified across ${sw.sampledProfiles} recently active closed profile(s).`,
  };
}
