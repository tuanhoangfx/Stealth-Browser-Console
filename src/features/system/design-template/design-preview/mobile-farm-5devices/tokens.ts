export type MobileFarmPreviewVariantId = "V1" | "V2" | "V3" | "V4" | "V5";

export type MobileFarmPreviewVariantMeta = {
  id: MobileFarmPreviewVariantId;
  name: string;
  direction: string;
  summary: string;
  bestFor: string;
};

export const MOBILE_FARM_PREVIEW_VARIANTS: MobileFarmPreviewVariantMeta[] = [
  {
    id: "V1",
    name: "V1 · Split-Dock Console",
    direction: "7/3 Split Rail + Unified 5-Device Wall",
    summary: "P0003 Profiles golden split layout: collapsible left controls, slim KPI strip, 5 live phones side-by-side, clean bottom 2-col Daemons + Kaizen.",
    bestFor: "Operators wanting sliders & batch actions visible alongside all 5 screens.",
  },
  {
    id: "V2",
    name: "V2 · Equal 5-Screen Wall First",
    direction: "Hardware-First Full-Width 5-Column Grid",
    summary: "Maximizes screen size for all 5 physical phones (Android x3 + iOS x2) at the top, collapsing Daemon & Kaizen telemetry into an expandable drawer.",
    bestFor: "Pure live visual monitoring of all 5 phone screens at a glance.",
  },
  {
    id: "V3",
    name: "V3 · Hero Inspector + Filmstrip",
    direction: "1 Interactive Focus Stage + 5-Phone Top Dock",
    summary: "Click any of the 5 live thumbnails on top to inspect full-scale controls, step feed, carrier latency, and OTP tools on the right rail.",
    bestFor: "Hands-on debugging & tapping individual iPhone/Android flows without losing 5-node visibility.",
  },
  {
    id: "V4",
    name: "V4 · OS-Segmented Lanes",
    direction: "Android Root Fleet vs iOS Crane Lanes + Right Ops Rail",
    summary: "Separates 3 Android 4G nodes from 2 Jailbroken iOS nodes with explicit Dim-0% / Lock / Shadowrocket indicators and a non-idle Cooldown Burst rail.",
    bestFor: "Clear OS separation so iOS dim-mode activity is unmistakable.",
  },
  {
    id: "V5",
    name: "V5 · Progressive Executive Deck",
    direction: "Hub-UI Minimal + Interactive Chips + Tabbed Drawer",
    summary: "Zero visual noise: 1-row Hub chrome bar, 5 clickable phone status chips, hover-clean screen cards, and a single tabbed drawer below.",
    bestFor: "Strict Hub-UI SSOT clarity with lowest clutter density.",
  },
];
