import { createElement } from "react";
import { Puzzle } from "lucide-react";
import {
  compactIconSize,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
  hubAdmSectionHeader,
  type HubAdmSectionKey,
  type HubTocNavItem,
} from "@tool-workspace/hub-ui";
import {
  EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE,
  EXTENSION_DETAIL_SECTION_INSTALL,
  EXTENSION_DETAIL_SECTION_LOG,
  EXTENSION_DETAIL_SECTION_METADATA,
  EXTENSION_DETAIL_TOC,
} from "./extension-detail-toc";

type ExtensionTocIconKey = HubAdmSectionKey | "log" | "new";

const EXTENSION_DETAIL_TOC_ICON: Partial<Record<string, ExtensionTocIconKey>> = {
  [EXTENSION_DETAIL_SECTION_METADATA]: "record",
  [EXTENSION_DETAIL_SECTION_INSTALL]: "new",
  [EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE]: "service",
  [EXTENSION_DETAIL_SECTION_LOG]: "log",
};

function tocNavIcon(key: ExtensionTocIconKey) {
  if (key === "new") {
    return createElement(Puzzle, {
      size: compactIconSize(12),
      className: "text-orange-300",
      "aria-hidden": true,
    });
  }
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

/** Extension detail Navigate rail — Lucide glyphs (ProfileDetailTocNav parity). */
export function extensionDetailTocNavItems(options?: {
  showInstall?: boolean;
  showCookieBridge?: boolean;
}): HubTocNavItem[] {
  const showInstall = options?.showInstall ?? false;
  const showCookieBridge = options?.showCookieBridge ?? false;

  const ids = EXTENSION_DETAIL_TOC.filter((item) => {
    if (item.id === EXTENSION_DETAIL_SECTION_INSTALL) return showInstall;
    if (item.id === EXTENSION_DETAIL_SECTION_METADATA) return !showInstall;
    return true;
  }).map((item) => item.id);

  const withCookieBridge = showCookieBridge
    ? ids.flatMap((id) =>
        id === EXTENSION_DETAIL_SECTION_METADATA
          ? [id, EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE]
          : [id],
      )
    : ids;

  const labels: Record<string, string> = {
    [EXTENSION_DETAIL_SECTION_METADATA]: "Metadata",
    [EXTENSION_DETAIL_SECTION_INSTALL]: "New",
    [EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE]: "Cookie Bridge",
    [EXTENSION_DETAIL_SECTION_LOG]: "Console",
  };

  return withCookieBridge.map((id) => ({
    id,
    label: labels[id] ?? id,
    icon: tocNavIcon(EXTENSION_DETAIL_TOC_ICON[id] ?? "record"),
  }));
}
