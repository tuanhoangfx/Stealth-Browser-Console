import { createElement } from "react";
import type { HubAdmSectionKey, HubTocNavItem } from "@tool-workspace/hub-ui";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import {
  PROFILE_DETAIL_SECTION_DEVICE,
  PROFILE_DETAIL_SECTION_LOG,
  PROFILE_DETAIL_SECTION_PROFILE,
  PROFILE_DETAIL_SECTION_SESSION,
  PROFILE_DETAIL_TOC,
} from "./profile-detail-toc";

type ProfileTocIconKey = HubAdmSectionKey | "session" | "log";

const PROFILE_DETAIL_TOC_ICON: Record<(typeof PROFILE_DETAIL_TOC)[number]["id"], ProfileTocIconKey> = {
  [PROFILE_DETAIL_SECTION_PROFILE]: "profile",
  [PROFILE_DETAIL_SECTION_SESSION]: "session",
  [PROFILE_DETAIL_SECTION_DEVICE]: "device",
  [PROFILE_DETAIL_SECTION_LOG]: "log",
};

const PROFILE_SECTION_STICKER: Partial<Record<ProfileTocIconKey, string>> = {
  profile: PROFILE_MODAL_SECTION_STICKER.profile,
  session: PROFILE_MODAL_SECTION_STICKER.session,
  device: PROFILE_MODAL_SECTION_STICKER.device,
  log: PROFILE_MODAL_SECTION_STICKER.console,
};

function tocNavIcon(key: ProfileTocIconKey) {
  const sticker = PROFILE_SECTION_STICKER[key];
  if (!sticker) return undefined;
  return createElement(
    "span",
    {
      className: "hub-section-sticker shrink-0 text-[12px] leading-none opacity-95",
      "aria-hidden": true,
    },
    sticker,
  );
}

/** Edit modal Navigate rail — unified SSOT section stickers matching center/right panes. */
export function profileDetailTocNavItems(opts?: { includeSession?: boolean }): HubTocNavItem[] {
  const includeSession = opts?.includeSession ?? true;
  return PROFILE_DETAIL_TOC.filter((item) => includeSession || item.id !== PROFILE_DETAIL_SECTION_SESSION).map(
    (item) => ({
      id: item.id,
      label: item.label,
      icon: tocNavIcon(PROFILE_DETAIL_TOC_ICON[item.id]),
    }),
  );
}

const PROFILE_FORM_TOC = [
  { id: PROFILE_DETAIL_SECTION_PROFILE, label: "Profile" },
  { id: PROFILE_DETAIL_SECTION_DEVICE, label: "Device" },
] as const;

/** Create modal Single tab TOC — unified SSOT section stickers (profile + device sections). */
export function profileFormTocNavItems(): HubTocNavItem[] {
  return PROFILE_FORM_TOC.map((item) => ({
    id: item.id,
    label: item.label,
    icon: tocNavIcon(PROFILE_DETAIL_TOC_ICON[item.id]),
  }));
}
