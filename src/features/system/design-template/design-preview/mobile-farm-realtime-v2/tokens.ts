import type { MockCarrierLane, MockDaemon, MockDeviceId, MockLiveEvent, MockPhysicalDevice } from "./mock";

export type MobileFarmPreviewVariantId = "V1" | "V2" | "V3" | "V4" | "V5";

export interface FarmPreviewProps {
  devices: MockPhysicalDevice[];
  lanes: MockCarrierLane[];
  daemons: MockDaemon[];
  events: MockLiveEvent[];
  selectedId: MockDeviceId;
  onSelectDevice: (id: MockDeviceId) => void;
  dismissedAnr: boolean;
  onDismissAnr: () => void;
  onTapScreen: (dev: MockPhysicalDevice, xPct: number, yPct: number) => void;
  onAction: (label: string, dev?: MockPhysicalDevice) => void;
}

export interface VariantMeta {
  id: MobileFarmPreviewVariantId;
  name: string;
  tagline: string;
  layoutAxis: string;
  bestFor: string;
  deltaFromCurrent: string;
  tradeoff: string;
}

export const MOBILE_FARM_PREVIEW_VARIANTS: VariantMeta[] = [
  {
    id: "V1",
    name: "Cinema Stage + Unified Ops Dock",
    tagline: "Zero-overlay 5-phone wall + single tabbed bottom ops dock",
    layoutAxis: "Hero 5-Phone Stage + Bottom Tabbed Dock (No Left Rail)",
    bestFor: "Daily monitoring of all 5 physical devices with zero vertical scroll and clean screens",
    deltaFromCurrent:
      "Moves Top/Bottom screen overlays into a slim bezel footer; consolidates Daemons, 4G Lanes & Orchestrator into 1 tabbed bottom dock.",
    tradeoff: "Only 1 ops panel tab (Dispatch / 4G Lanes / Daemons / Feed) is expanded at a time.",
  },
  {
    id: "V2",
    name: "Focus Spotlight + 2x2 Live Filmstrip",
    tagline: "1 large interactive hero phone + live inspector + 4 mini-nodes",
    layoutAxis: "Master-Detail Split (36% Hero Phone & Inspector / 64% 2x2 Strip)",
    bestFor: "Debugging stuck devices (e.g. Pixel 7 ANR), manual touch control, and inspecting live ADB/MCP output",
    deltaFromCurrent:
      "Gives the selected phone 2.5x larger touchable canvas with dedicated live action stream & one-click macro controls.",
    tradeoff: "4 secondary devices render smaller in the 2x2 strip until clicked into Spotlight.",
  },
  {
    id: "V3",
    name: "End-to-End Node Pipelines",
    tagline: "5 vertical columns uniting Task -> Screen -> 4G Lane -> Dispatch",
    layoutAxis: "Unified 5-Column Vertical Pipeline (Top-to-Bottom per Node)",
    bestFor: "Seeing exact cause-and-effect per phone (which daemon, proxy lane, and orchestrator state belong to each device)",
    deltaFromCurrent:
      "Eliminates the disconnected bottom Carrier & Orchestrator grids by binding each phone's lane sparkline and task directly into its column.",
    tradeoff: "Slightly taller column cards when all 4 pipeline stages are shown simultaneously.",
  },
  {
    id: "V4",
    name: "Ultra-Dense NOC Wall",
    tagline: "38px top command bar + max-height screens + slide-over alerts",
    layoutAxis: "Zero-Chrome Full-Bleed Matrix + Slide-Over Ops Drawer",
    bestFor: "Maximum screen real estate (88% viewport height for screens) and seamless scaling to Virtual/PC multi-row walls",
    deltaFromCurrent:
      "Replaces the 5 KPI tiles, left rail, and bottom matrices with a single 38px Mission Strip + inline sparklines + slide-over drawer.",
    tradeoff: "Detailed Daemon/Orchestrator tables live 1 click away inside the top-right slide-over drawer.",
  },
  {
    id: "V5",
    name: "Asymmetric Wall + Live Ops Stream",
    tagline: "68% clean 3+2 phone & carrier grid + 32% realtime action console",
    layoutAxis: "Split Operations Console (Left Device Matrix / Right Live Stream)",
    bestFor: "True realtime situational awareness — watching live taps, OTP captures, proxy rotations, and ANR alerts scroll in real time",
    deltaFromCurrent:
      "Replaces static status labels with a live chronological event stream paired beside a 3-Android / 2-iPhone + Carrier layout.",
    tradeoff: "Phone cards arrange in 2 rows (3 + 2) instead of a single 5-across horizontal row.",
  },
];
