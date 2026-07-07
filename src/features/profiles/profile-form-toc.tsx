import { User, MonitorSmartphone } from "lucide-react";
import { compactIconSize } from "@tool-workspace/hub-ui";
import { PROFILE_DETAIL_SECTION_LOG, PROFILE_DETAIL_TOC } from "./profile-detail-toc";

export { PROFILE_DETAIL_SECTION_LOG, PROFILE_DETAIL_TOC };

export const PROFILE_FORM_TOC = [
  { id: "profile-basics", label: "Profile", icon: User },
  { id: "profile-device", label: "Device", icon: MonitorSmartphone },
] as const;

export function profileFormTocItems() {
  return PROFILE_FORM_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: <item.icon size={compactIconSize(12)} className="text-indigo-300" aria-hidden />,
  }));
}
