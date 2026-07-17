import { useEffect, useState } from "react";
import type { StealthSystemTab } from "./stealth-system-tab";
import { readSystemTabDisplay, STEALTH_SYSTEM_SUBTAB_DISPLAY } from "./stealth-system-display-prefs";

/** KPI/chart visibility for System sub-tabs (localStorage, default off). */
export function useStealthSystemTabDisplayPrefs(tab: StealthSystemTab) {
  const [slice, setSlice] = useState(() => readSystemTabDisplay(tab));

  useEffect(() => {
    const sync = () => setSlice(readSystemTabDisplay(tab));
    window.addEventListener(STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [tab]);

  return slice;
}
