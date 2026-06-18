import { useEffect } from "react";
import {
  patchHubListPrefs,
  patchHubTablePageSizeValue,
  useHubTablePageSize,
} from "@tool-workspace/hub-ui";
import { normalizeProfileDirectoryPageSize } from "./profile-directory-page-size";

export { normalizeProfileDirectoryPageSize } from "./profile-directory-page-size";

/** Profiles tab page size — P0003 options (20/50/100), migrates legacy `tpage=25`. */
export function useProfileDirectoryPageSize(): number {
  const hubSize = useHubTablePageSize();
  const pageSize = normalizeProfileDirectoryPageSize(hubSize);

  useEffect(() => {
    const normalized = normalizeProfileDirectoryPageSize(hubSize);
    if (hubSize !== normalized) {
      patchHubListPrefs({ tpage: patchHubTablePageSizeValue(normalized) });
    }
  }, [hubSize]);

  return pageSize;
}
