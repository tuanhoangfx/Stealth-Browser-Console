import { ScrollText, User, MonitorSmartphone } from "lucide-react";
import { compactIconSize } from "@tool-workspace/hub-ui";

export const PROFILE_DETAIL_SECTION_LOG = "profile-detail-log";

export const PROFILE_FORM_TOC = [
  { id: "profile-basics", label: "Profile", icon: User },
  { id: "profile-device", label: "Device", icon: MonitorSmartphone },
] as const;

export const PROFILE_DETAIL_TOC = [
  ...PROFILE_FORM_TOC,
  { id: PROFILE_DETAIL_SECTION_LOG, label: "Log", icon: ScrollText },
] as const;

export function profileFormTocItems() {
  return PROFILE_DETAIL_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: <item.icon size={compactIconSize(12)} className="text-indigo-300" aria-hidden />,
  }));
}
