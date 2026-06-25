import type { LucideIcon } from "lucide-react";
import { HubScreenChunkFallback } from "@tool-workspace/hub-ui";
import { STEALTH_NAV_STRUCTURE } from "../lib/stealth-nav-structure";
import type { StealthScreen } from "../lib/stealth-screen";

const STEALTH_LOADING_PRESETS = Object.fromEntries(
  STEALTH_NAV_STRUCTURE.filter((item): item is Extract<(typeof STEALTH_NAV_STRUCTURE)[number], { kind: "screen" }> => item.kind === "screen").map(
    (item) => [item.screen, { icon: item.icon, ariaLabel: `Loading ${item.label.toLowerCase()}` }],
  ),
) as Record<StealthScreen, { icon: LucideIcon; ariaLabel: string }>;

/** P0004/P0016 Suspense fallback — portaled orb in main pane via HubLoaderRoot. */
export function StealthScreenLoadingView({
  screen,
  enabled = true,
}: {
  screen: StealthScreen;
  enabled?: boolean;
}) {
  const preset = STEALTH_LOADING_PRESETS[screen];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HubScreenChunkFallback
        icon={preset.icon}
        ariaLabel={preset.ariaLabel}
        variant="overlay"
        enabled={enabled}
        portaled
      />
    </div>
  );
}
