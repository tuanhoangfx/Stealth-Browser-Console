import { createElement } from "react";
import {
  compactIconSize,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
  hubAdmSectionHeader,
  type HubAdmSectionKey,
  type HubTocNavItem,
} from "@tool-workspace/hub-ui";
import {
  PROFILE_DETAIL_SECTION_DEVICE,
  PROFILE_DETAIL_SECTION_LOG,
  PROFILE_DETAIL_SECTION_PROFILE,
  PROFILE_DETAIL_TOC,
} from "./profile-detail-toc";

const PROFILE_DETAIL_TOC_ICON: Record<(typeof PROFILE_DETAIL_TOC)[number]["id"], HubAdmSectionKey | "log"> = {
  [PROFILE_DETAIL_SECTION_PROFILE]: "profile",
  [PROFILE_DETAIL_SECTION_DEVICE]: "device",
  [PROFILE_DETAIL_SECTION_LOG]: "log",
};

function tocNavIcon(key: HubAdmSectionKey | "log") {
  if (key === "log") {
    const Icon = hubAccountDetailSectionIcon("log");
    return createElement(Icon, {
      size: compactIconSize(12),
      className: hubAccountDetailSectionIconClass("log"),
      "aria-hidden": true,
    });
  }
  const header = hubAdmSectionHeader(key);
  const Icon = header.icon;
  if (!Icon) return undefined;
  return createElement(Icon, {
    size: compactIconSize(12),
    className: header.iconClassName,
    "aria-hidden": true,
  });
}

/** Edit modal Navigate rail — Lucide glyphs (hubAdmSectionHeader SSOT). */
export function profileDetailTocNavItems(): HubTocNavItem[] {
  return PROFILE_DETAIL_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: tocNavIcon(PROFILE_DETAIL_TOC_ICON[item.id]),
  }));
}

const PROFILE_FORM_TOC = [
  { id: PROFILE_DETAIL_SECTION_PROFILE, label: "Profile" },
  { id: PROFILE_DETAIL_SECTION_DEVICE, label: "Device" },
] as const;

/** Create modal Single tab TOC — Lucide glyphs (profile + device sections). */
export function profileFormTocNavItems(): HubTocNavItem[] {
  return PROFILE_FORM_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: tocNavIcon(PROFILE_DETAIL_TOC_ICON[item.id]),
  }));
}
