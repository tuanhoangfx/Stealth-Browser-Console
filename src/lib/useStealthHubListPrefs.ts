import { useEffect, useState } from "react";
import { HUB_LIST_PREFS_CHANGE_EVENT, readHubListPrefsCore, subscribeHubListPrefs } from "@tool-workspace/hub-ui";

/** URL display prefs — KPI, header stats, filters (P0004 Users parity). */
export function useStealthHubListPrefs() {
  const [prefs, setPrefs] = useState(readHubListPrefsCore);
  useEffect(() => {
    const sync = () => setPrefs(readHubListPrefsCore());
    const unsub = subscribeHubListPrefs(sync);
    window.addEventListener(HUB_LIST_PREFS_CHANGE_EVENT, sync);
    return () => {
      unsub();
      window.removeEventListener(HUB_LIST_PREFS_CHANGE_EVENT, sync);
    };
  }, []);
  return prefs;
}
