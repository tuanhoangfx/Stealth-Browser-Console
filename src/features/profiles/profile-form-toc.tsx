import { User, MonitorSmartphone, Globe } from "lucide-react";
import { compactIconSize } from "@tool-workspace/hub-ui";

export const PROFILE_FORM_TOC = [
  { id: "profile-basics", label: "Profile", icon: User },
  { id: "profile-device", label: "Device", icon: MonitorSmartphone },
  { id: "profile-network", label: "Proxy & note", icon: Globe }
] as const;

export function profileFormTocItems() {
  return PROFILE_FORM_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: <item.icon size={compactIconSize(12)} className="text-indigo-300" aria-hidden />
  }));
}
