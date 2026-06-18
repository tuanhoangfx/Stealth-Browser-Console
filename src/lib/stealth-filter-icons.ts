import type { ElementType } from "react";
import { CheckCircle2, CircleOff, Clock, FolderOpen, Globe, Layers, Laptop, Monitor, MonitorSmartphone, Palette, Play, Shield, Tag, Terminal } from "lucide-react";
import { resolveSemanticIcon, type SemanticIconLookupKey } from "@tool-workspace/hub-ui";
import { DEVICE_PRESETS } from "./device-presets";

export type FilterIconMeta = {
  icon: ElementType<{ size?: number; className?: string }>;
  className: string;
};

const PLATFORM_ICONS: Record<string, FilterIconMeta> = {
  windows: { icon: Monitor, className: "text-sky-300" },
  macos: { icon: Laptop, className: "text-slate-300" },
  linux: { icon: Terminal, className: "text-amber-300" },
};

const BY_FILTER: Record<string, Record<string, FilterIconMeta>> = {
  group: {
    all: { icon: FolderOpen, className: "text-indigo-300" },
  },
  status: {
    closed: { icon: CheckCircle2, className: "text-emerald-400" },
    opening: { icon: Clock, className: "text-amber-400" },
    running: { icon: Play, className: "text-emerald-400" },
    failed: { icon: CircleOff, className: "text-rose-400" },
  },
  platform: {
    all: { icon: Layers, className: "text-indigo-300" },
  },
  "step-status": {
    all: { icon: CheckCircle2, className: "text-slate-300" },
    active: { icon: CheckCircle2, className: "text-emerald-400" },
    inactive: { icon: CircleOff, className: "text-slate-400" },
  },
  "browser-device-preset": {
    all: { icon: MonitorSmartphone, className: "text-violet-300" },
    custom: { icon: MonitorSmartphone, className: "text-violet-300" },
  },
  "browser-platform": {
    all: { icon: Layers, className: "text-cyan-300" },
    ...PLATFORM_ICONS,
  },
  "browser-color-scheme": {
    all: { icon: Palette, className: "text-fuchsia-300" },
    "": { icon: Palette, className: "text-fuchsia-300" },
    light: { icon: Palette, className: "text-amber-300" },
    dark: { icon: Palette, className: "text-indigo-300" },
  },
  "browser-timezone": {
    all: { icon: Clock, className: "text-amber-300" },
    "": { icon: Clock, className: "text-amber-300" },
  },
  "browser-locale": {
    all: { icon: Globe, className: "text-sky-300" },
    "": { icon: Globe, className: "text-sky-300" },
  },
  "browser-window-mode": {
    all: { icon: Monitor, className: "text-indigo-300" },
    "host-maximized": { icon: Monitor, className: "text-emerald-300" },
    "preset-viewport": { icon: MonitorSmartphone, className: "text-violet-300" },
    "engine-default": { icon: Monitor, className: "text-slate-300" },
  },
  "browser-proxy-preset": {
    all: { icon: Globe, className: "text-sky-300" },
    local: { icon: Shield, className: "text-emerald-300" },
    http: { icon: Globe, className: "text-sky-300" },
    socks5: { icon: Globe, className: "text-violet-300" },
    custom: { icon: Tag, className: "text-slate-300" },
  },
};

function lookup(filterKey: string, optionValue: string): FilterIconMeta | null {
  const bucket = BY_FILTER[filterKey];
  if (!bucket) return null;
  if (bucket[optionValue]) return bucket[optionValue];
  if (filterKey === "browser-device-preset") {
    const preset = DEVICE_PRESETS.find((item) => item.id === optionValue);
    if (preset) return PLATFORM_ICONS[preset.platform] ?? null;
  }
  if (filterKey === "group") return { icon: Tag, className: "text-slate-300" };
  if (filterKey === "platform") return { icon: Layers, className: "text-cyan-300" };
  return null;
}

export function resolveStealthFilterOptionIcon(filterKey: string, optionValue: string) {
  const hit = lookup(filterKey, optionValue);
  if (hit?.icon) return hit;
  const semantic = resolveSemanticIcon(`filter.${filterKey}.${optionValue}` as SemanticIconLookupKey);
  if (semantic?.icon) return { icon: semantic.icon, className: semantic.className ?? "text-slate-300" };
  return { icon: Tag, className: "text-slate-300" };
}

export function resolveStealthFilterAllIcon(filterKey: string) {
  const hit = lookup(filterKey, "all");
  if (hit) return hit;
  if (filterKey === "status") return { icon: CheckCircle2, className: "text-slate-300" };
  return { icon: FolderOpen, className: "text-indigo-300" };
}
