import type { DirectoryTableColumnItem } from "@tool-workspace/hub-ui";
import {
  PROFILE_DIRECTORY_COLUMN_ITEMS,
  type ProfileDirectoryColumnKey,
} from "./profile-directory-prefs";
import type { ExtensionIconMap } from "./useExtensionIcons";

/** Display → Table columns — overlay runtime extension PNGs (parity with directory headers). */
export function profileDirectoryColumnItemsWithExtensionIcons(
  extensionIcons: ExtensionIconMap,
): DirectoryTableColumnItem<ProfileDirectoryColumnKey>[] {
  return PROFILE_DIRECTORY_COLUMN_ITEMS.map((item) => {
    if (item.key === "e0001" && extensionIcons.e0001) {
      return {
        ...item,
        imageSrc: extensionIcons.e0001,
        icon: undefined,
        iconClassName: undefined,
        brandIcon: undefined,
      };
    }
    if (item.key === "surfshark" && extensionIcons.surfshark) {
      return {
        ...item,
        imageSrc: extensionIcons.surfshark,
        brandIcon: undefined,
        icon: undefined,
        iconClassName: undefined,
      };
    }
    return item;
  });
}
