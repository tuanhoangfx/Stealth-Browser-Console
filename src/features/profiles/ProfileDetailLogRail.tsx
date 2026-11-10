import { useEffect, useMemo, useState } from "react";
import { HubToolDetailRail } from "@tool-workspace/hub-ui";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { useRunLogs, type ConsoleLog } from "../runtime/RunLogsContext";
import { StealthConsoleContent } from "../runtime/StealthRuntimeRailPanels";
import { StealthConsoleRailTitle } from "../runtime/stealth-console-hint";
import { STEALTH_CONSOLE_RAIL_LABEL } from "../runtime/stealth-runtime-rail-labels";
import { PROFILE_DETAIL_SECTION_LOG } from "./profile-detail-toc";
import { filterConsoleLogsForProfile, filterConsoleLogsForProfiles } from "./profile-runtime-rail-filter";

/** Profile detail console rail — live RunLogs + SQLite profile_events history for the profile(s). */
export function ProfileDetailLogRail({
  profileName,
  profileNames,
  focused = false,
}: {
  profileName?: string;
  profileNames?: readonly string[];
  focused?: boolean;
}) {
  const { logs } = useRunLogs();
  const [persistedLogs, setPersistedLogs] = useState<ConsoleLog[]>([]);
  const [fetchLimit, setFetchLimit] = useState(100);
  const [hasMorePersisted, setHasMorePersisted] = useState(false);

  useEffect(() => {
    setFetchLimit(100);
  }, [profileName, profileNames]);

  useEffect(() => {
    const targets = profileNames?.length
      ? [...profileNames].slice(0, 8)
      : profileName
        ? [profileName]
        : [];
    if (!targets.length) {
      setPersistedLogs([]);
      setHasMorePersisted(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const collected: ConsoleLog[] = [];
      let more = false;
      for (const name of targets) {
        const clean = name.trim();
        if (!clean) continue;
        for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
          try {
            const res = await fetch(
              `${base}/api/profiles/${encodeURIComponent(clean)}/events?limit=${fetchLimit}`,
            );
            if (!res.ok) continue;
            const data = (await res.json()) as {
              ok?: boolean;
              events?: Array<{
                id: string;
                profileName?: string;
                level?: string;
                message?: string;
                createdAt?: string;
              }>;
            };
            if (data?.ok && Array.isArray(data.events)) {
              if (data.events.length >= fetchLimit && fetchLimit < 500) {
                more = true;
              }
              for (const ev of data.events) {
                if (!ev?.message || !ev?.createdAt) continue;
                const lvl = String(ev.level || "info").toLowerCase();
                collected.push({
                  id: `pevt-${ev.id}`,
                  level: lvl === "error" || lvl === "warn" || lvl === "success" ? lvl : "info",
                  source: String(ev.profileName || clean),
                  message: String(ev.message),
                  time: String(ev.createdAt),
                });
              }
              try {
                const cgRes = await fetch(
                  `${base}/api/profiles/${encodeURIComponent(clean)}/cookie-guard`,
                );
                if (cgRes.ok) {
                  const cgData = (await cgRes.json()) as {
                    ok?: boolean;
                    status?: {
                      current?: {
                        totalRows?: number;
                        hasGoogleAuth?: boolean;
                        hasOutlookAuth?: boolean;
                        hasFacebookAuth?: boolean;
                        hasTikTokAuth?: boolean;
                      };
                      backup?: {
                        totalRows?: number;
                        updatedAt?: string | null;
                      };
                      vault?: {
                        totalVaultCookies?: number;
                        availableSources?: string[];
                      };
                    };
                  };
                  const st = cgData?.status;
                  if (st) {
                    const curRows = Number(st.current?.totalRows || 0);
                    const bakRows = Number(st.backup?.totalRows || 0);
                    const vaultRows = Number(st.vault?.totalVaultCookies || 0);
                    const auths: string[] = [];
                    if (st.current?.hasGoogleAuth) auths.push("Google");
                    if (st.current?.hasOutlookAuth) auths.push("Outlook");
                    if (st.current?.hasFacebookAuth) auths.push("FB");
                    if (st.current?.hasTikTokAuth) auths.push("TikTok");
                    const authStr = auths.length > 0 ? ` (${auths.join("+")})` : "";
                    const stamp = st.backup?.updatedAt || new Date().toISOString();
                    collected.unshift({
                      id: `cg-live-${clean}`,
                      level: "info",
                      source: clean,
                      message: `Profile closed → 🍪 SQLite: ${curRows} cookies${authStr} · Backup: ${bakRows} rows · Vault: ${vaultRows} cookies · by System`,
                      time: stamp,
                    });
                  }
                }
              } catch {
                // non-fatal cookie guard status probe
              }
              break;
            }
          } catch {
            // try next port
          }
        }
      }
      if (!cancelled) {
        setPersistedLogs(collected);
        setHasMorePersisted(more);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchLimit, profileName, profileNames]);

  const profileLogs = useMemo(() => {
    const live = profileNames?.length
      ? filterConsoleLogsForProfiles(logs, profileNames)
      : profileName
        ? filterConsoleLogsForProfile(logs, profileName)
        : [];
    if (!persistedLogs.length) return live;
    const map = new Map<string, ConsoleLog>();
    for (const item of [...live, ...persistedLogs]) {
      const sec = item.time ? item.time.slice(0, 19) : "";
      const sig = `${item.source}|${item.message}|${sec}`;
      if (!map.has(sig)) map.set(sig, item);
    }
    return [...map.values()].sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0));
  }, [logs, persistedLogs, profileName, profileNames]);

  return (
    <HubToolDetailRail
      id={PROFILE_DETAIL_SECTION_LOG}
      title={<StealthConsoleRailTitle label={STEALTH_CONSOLE_RAIL_LABEL} />}
      titleEmoji={PROFILE_MODAL_SECTION_STICKER.console}
      className={`twofa-adm-rail--log hub-adm-rail--log stealth-profile-detail-log-rail${
        focused ? " stealth-profile-detail-log-rail--focused" : ""
      }`}
      ariaLabel={STEALTH_CONSOLE_RAIL_LABEL}
    >
      <StealthConsoleContent
        logs={profileLogs}
        emptyHint="No log entries recorded yet."
        hasMoreExternal={hasMorePersisted}
        onLoadMoreExternal={() => setFetchLimit((prev) => Math.min(500, prev + 100))}
      />
    </HubToolDetailRail>
  );
}
