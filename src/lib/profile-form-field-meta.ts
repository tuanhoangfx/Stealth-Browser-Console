import {
  AppWindow,
  Bot,
  Compass,
  Fingerprint,
  Ghost,
  Globe2,
  Languages,
  MonitorSmartphone,
  Palette,
  Ruler,
  Shield,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { HubTableColumnHeaderProps } from "@tool-workspace/hub-ui";
import { resolveHubTableColumnMeta } from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_COLUMN_META } from "./directory-column-meta";
import type { StealthFormFieldKey } from "./stealth-directory-column-hints";

const PROFILE_FORM_FIELD_LABELS: Record<StealthFormFieldKey, string> = {
  name: "Name",
  group: "Group",
  startupUrl: "Startup URL",
  proxyPreset: "Proxy preset",
  proxy: "Proxy (optional)",
  devicePreset: "Device preset",
  platform: "Operating system",
  colorScheme: "Color scheme",
  timezone: "Timezone",
  locale: "Locale",
  windowMode: "Window mode",
  viewport: "Viewport",
  fingerprintSeed: "Fingerprint seed",
  humanize: "Humanize",
  headless: "Headless",
  userAgent: "User-Agent",
  defaultStartupUrl: "Default startup URL",
};

function lucideHeader(
  label: string,
  icon: LucideIcon,
  iconClassName: string,
): HubTableColumnHeaderProps {
  return { label, icon, iconClassName };
}

function directoryLucideHeader(key: keyof typeof STEALTH_PROFILE_COLUMN_META): HubTableColumnHeaderProps {
  const meta = STEALTH_PROFILE_COLUMN_META[key];
  const roleMeta = resolveHubTableColumnMeta(meta.role);
  return {
    label: meta.label,
    icon: meta.headerIcon ?? roleMeta.icon,
    iconClassName: meta.headerIconClassName ?? roleMeta.iconClassName,
  };
}

const PROFILE_FORM_FIELD_HEADERS: Record<StealthFormFieldKey, HubTableColumnHeaderProps> = {
  name: lucideHeader("Name", Tag, "hub-users-th-icon--name text-indigo-300"),
  group: directoryLucideHeader("group"),
  startupUrl: directoryLucideHeader("startupUrl"),
  proxyPreset: lucideHeader("Proxy preset", Shield, "hub-users-th-icon--tools text-violet-300"),
  proxy: directoryLucideHeader("proxy"),
  devicePreset: lucideHeader("Device preset", MonitorSmartphone, "hub-adm-section-icon--teal"),
  platform: lucideHeader("Operating system", MonitorSmartphone, "hub-adm-section-icon--teal"),
  colorScheme: lucideHeader("Color scheme", Palette, "hub-users-th-icon--tools text-violet-300"),
  timezone: lucideHeader("Timezone", Globe2, "hub-users-th-icon--id text-cyan-300"),
  locale: lucideHeader("Locale", Languages, "hub-users-th-icon--role text-indigo-300"),
  windowMode: lucideHeader("Window mode", AppWindow, "hub-users-th-icon--tools text-sky-300"),
  viewport: lucideHeader("Viewport", Ruler, "hub-users-th-icon--tools text-slate-300"),
  fingerprintSeed: lucideHeader("Fingerprint seed", Fingerprint, "hub-users-th-icon--id text-cyan-300"),
  humanize: lucideHeader("Humanize", Bot, "hub-users-th-icon--tools text-emerald-300"),
  headless: lucideHeader("Headless", Ghost, "hub-users-th-icon--tools text-amber-300"),
  userAgent: lucideHeader("User-Agent", Compass, "hub-users-th-icon--id text-sky-300"),
  defaultStartupUrl: directoryLucideHeader("startupUrl"),
};

export function profileFormFieldLabel(key: StealthFormFieldKey): string {
  return PROFILE_FORM_FIELD_LABELS[key];
}

export function profileFormFieldHeaderProps(key: StealthFormFieldKey): HubTableColumnHeaderProps {
  return PROFILE_FORM_FIELD_HEADERS[key];
}
