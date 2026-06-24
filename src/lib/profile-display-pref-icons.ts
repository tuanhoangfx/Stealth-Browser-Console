import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FolderTree,
  Globe,
  Layers,
  Link2,
  ListChecks,
  Play,
  StickyNote,
  User,
} from "lucide-react";
import type { PrefIconMap } from "@tool-workspace/hub-ui";

/** P0003 — icon map for Profiles Display panel (attach via `withPrefItemIcons`). */
export const PROFILE_KPI_PREF_ICONS: PrefIconMap = {
  total: { icon: Database, iconClassName: "text-indigo-300" },
  running: { icon: Play, iconClassName: "text-emerald-400" },
  failed: { icon: AlertTriangle, iconClassName: "text-rose-300" },
  ready: { icon: CheckCircle2, iconClassName: "text-emerald-300" },
};

export const PROFILE_HEADER_PREF_ICONS: PrefIconMap = {
  running: { icon: Play, iconClassName: "text-emerald-400" },
  failed: { icon: AlertTriangle, iconClassName: "text-rose-300" },
  ready: { icon: CheckCircle2, iconClassName: "text-emerald-300" },
  total: { icon: Database, iconClassName: "text-indigo-300" },
};

export const PROFILE_FILTER_PREF_ICONS: PrefIconMap = {
  group: { icon: FolderTree, iconClassName: "text-slate-300" },
  status: { icon: Activity, iconClassName: "text-amber-300" },
};

export const PROFILE_COLUMN_PREF_ICONS: PrefIconMap = {
  profile: { icon: User, iconClassName: "text-indigo-300" },
  group: { icon: FolderTree, iconClassName: "text-slate-300" },
  status: { icon: Play, iconClassName: "text-emerald-400" },
  lastOpened: { icon: Clock, iconClassName: "text-cyan-300" },
  startupUrl: { icon: Globe, iconClassName: "text-sky-300" },
  proxy: { icon: Link2, iconClassName: "text-violet-300" },
  note: { icon: StickyNote, iconClassName: "text-amber-300" },
};

export const WORKFLOW_KPI_PREF_ICONS: PrefIconMap = {
  total: { icon: Layers, iconClassName: "text-indigo-300" },
  selected: { icon: ListChecks, iconClassName: "text-cyan-300" },
  steps: { icon: Activity, iconClassName: "text-amber-300" },
};

export const WORKFLOW_FILTER_PREF_ICONS: PrefIconMap = {
  group: { icon: FolderTree, iconClassName: "text-slate-300" },
  platform: { icon: Globe, iconClassName: "text-sky-300" },
};

export const WORKFLOW_HEADER_PREF_ICONS: PrefIconMap = {
  total: { icon: Layers, iconClassName: "text-indigo-300" },
  selected: { icon: ListChecks, iconClassName: "text-cyan-300" },
  steps: { icon: Activity, iconClassName: "text-amber-300" },
};
