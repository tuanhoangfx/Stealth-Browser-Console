import { useEffect, useMemo, useState } from "react";
import { Activity, CloudUpload, FolderPlus, RotateCcw, Shield, ShieldCheck } from "lucide-react";
import {
  HubAdmGridSlotPad,
  HubDirectoryRunToggle,
  HubPromptDialog,
  HubUsersOnOffLabel,
  validateHubCatalogPromptName,
} from "@tool-workspace/hub-ui";
import {
  checkProfileProxy,
  fetchExtensionToggles,
  fetchProfileCookieGuardStatus,
  reconcileProfileP0020Status,
  restoreProfileCookiesBackup,
  snapshotProfileCookiesBackup,
  type ProxyCheckHealthResult,
} from "../../api";
import { DEFAULT_EXTENSION_TOGGLES, resolveProfileExtensionEffective } from "../../lib/profile-extension-effective";
import { readCachedProxyHealth, writeCachedProxyHealth } from "../../lib/proxy-health-cache";
import { formatStartupUrlOnBlur } from "../../lib/startup-url";
import {
  extractProxyCountryCode,
  extractProxyHostIp,
  extractVpnCountryCode,
  resolveVpnCountryGeoDefaults,
} from "../../lib/stealth-profile-utils";
import {
  profileGroupFilterOptions,
  proxyUnifiedFilterOptions,
  resolveUnifiedProxyOptionValue,
} from "../../lib/device-filter-options";
import { useAppToast } from "../../components/toast";
import { useRunLogs } from "../runtime/RunLogsContext";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type {
  ExtensionToggles,
  ProfileCookieGuardStatus,
  ProfileExtensionOverrides,
  ProfileRow,
  StealthGroup,
} from "../../types";
import {
  PROFILE_DETAIL_FORM_ROW_ALIGNED_3,
  PROFILE_DETAIL_FORM_ROW_DETAIL_LINE,
  ProfileDetailClickEditField,
  ProfileDetailClickFilterField,
  ProfileDetailReadonlyField,
} from "./ProfileDetailField";

export type ProfileBasicsFieldsProps = {
  profileId?: string;
  profileRow?: ProfileRow;
  name?: string;
  setName?: (value: string) => void;
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  staticIp?: boolean;
  setStaticIp?: (value: boolean) => void;
  extensionOverrides?: ProfileExtensionOverrides;
  setExtensionOverrides?: (value: ProfileExtensionOverrides) => void;
  onTouchExtensionKey?: (key: "e0001" | "e0002" | "surfshark") => void;
  startupUrl: string;
  setStartupUrl: (value: string) => void;
  groups: StealthGroup[];
  showName?: boolean;
  nameAutoFocus?: boolean;
  onAutoGeoSync?: (geo: { countryCode: string; timezone: string; locale: string }) => void;
};

/** Profile defaults — P0020 ADM inline rows (label + value same line, 3 columns). */
export function ProfileBasicsFields({
  profileId,
  profileRow,
  name = "",
  setName,
  groupId,
  setGroupId,
  proxy,
  setProxy,
  staticIp = false,
  setStaticIp,
  extensionOverrides,
  setExtensionOverrides,
  onTouchExtensionKey,
  startupUrl,
  setStartupUrl,
  groups,
  showName = true,
  onAutoGeoSync,
}: ProfileBasicsFieldsProps) {
  const { createGroup, updateProfile, openOne, closeOne, runningHeadlessIds } = useProfilesRuntime();
  const { addLog } = useRunLogs();
  const { pushToast } = useAppToast();
  const [globalToggles, setGlobalToggles] = useState<ExtensionToggles>(DEFAULT_EXTENSION_TOGGLES);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [customProxyOpen, setCustomProxyOpen] = useState(false);
  const [proxyCheckBusy, setProxyCheckBusy] = useState(false);
  const [proxyHealth, setProxyHealth] = useState<ProxyCheckHealthResult | null>(() =>
    readCachedProxyHealth(proxy || "local", name),
  );
  const groupOptions = useMemo(() => profileGroupFilterOptions(groups), [groups]);
  const proxyOptions = useMemo(
    () =>
      proxyUnifiedFilterOptions(proxy, {
        note: profileRow?.note,
        timezone: profileRow?.timezone,
        locale: profileRow?.locale,
      }),
    [proxy, profileRow?.note, profileRow?.timezone, profileRow?.locale],
  );
  const isVpnCountryProxy = Boolean(
    extractVpnCountryCode(proxy, profileRow?.note) ||
      extractProxyCountryCode(proxy, profileRow?.note, profileRow?.timezone, profileRow?.locale),
  );

  useEffect(() => {
    void fetchExtensionToggles()
      .then(setGlobalToggles)
      .catch(() => setGlobalToggles(DEFAULT_EXTENSION_TOGGLES));
  }, []);

  useEffect(() => {
    const cacheKey = String(proxy || "").trim() || "local";
    const cached = readCachedProxyHealth(cacheKey, name);
    setProxyHealth(cached);
    if (!cached && String(proxy || "").trim()) {
      let cancelled = false;
      setProxyCheckBusy(true);
      void checkProfileProxy(String(proxy || "").trim(), {
        rotateVpn: false,
        profileId,
        profileName: name,
      })
        .then((health) => {
          if (cancelled) return;
          const stamped: ProxyCheckHealthResult = {
            ...health,
            checkedAt: health.checkedAt || new Date().toISOString(),
          };
          setProxyHealth(stamped);
          writeCachedProxyHealth(cacheKey, stamped, name);
          if (stamped.alive && (stamped.timezone || stamped.countryCode)) {
            const defaults = stamped.countryCode ? resolveVpnCountryGeoDefaults(stamped.countryCode) : null;
            onAutoGeoSync?.({
              countryCode: stamped.countryCode || defaults?.countryCode || "",
              timezone: stamped.timezone || defaults?.timezone || "",
              locale: defaults?.locale || "",
            });
          }
          if (stamped.geoSyncSummary) {
            addLog("info", name || "Profile", stamped.geoSyncSummary);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setProxyCheckBusy(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [proxy, name, profileId]);

  const handleToggleExtension = (key: "e0001" | "e0002" | "surfshark") => {
    if (!setExtensionOverrides) return;
    const current = resolveProfileExtensionEffective(globalToggles, extensionOverrides, key);
    const nextEnabled = !current;
    const nextOverrides: ProfileExtensionOverrides = { ...(extensionOverrides || {}) };
    if (nextEnabled === Boolean(globalToggles[key])) {
      delete nextOverrides[key];
    } else {
      nextOverrides[key] = nextEnabled;
    }
    onTouchExtensionKey?.(key);
    setExtensionOverrides(nextOverrides);
  };

  const handleCheckProxy = async (rotateVpn = false) => {
    if (proxyCheckBusy) return;
    const trimmed = String(proxy || "").trim();
    const targetSpec = trimmed || "local";
    setProxyCheckBusy(true);
    try {
      const health = await checkProfileProxy(targetSpec, {
        rotateVpn,
        profileId,
        profileName: name,
        manualCheck: true,
      });
      const stamped: ProxyCheckHealthResult = {
        ...health,
        checkedAt: health.checkedAt || new Date().toISOString(),
      };
      setProxyHealth(stamped);
      writeCachedProxyHealth(targetSpec, stamped, name);
      if (stamped.alive) {
        if (stamped.timezone || stamped.countryCode) {
          const defaults = stamped.countryCode ? resolveVpnCountryGeoDefaults(stamped.countryCode) : null;
          onAutoGeoSync?.({
            countryCode: stamped.countryCode || defaults?.countryCode || "",
            timezone: stamped.timezone || defaults?.timezone || "",
            locale: defaults?.locale || "",
          });
        }
        const prevGeo =
          extractProxyCountryCode(proxy, profileRow?.note, profileRow?.timezone, profileRow?.locale) || "Auto";
        const prevTz = profileRow?.timezone?.trim() || "Auto";
        const fallbackDelta = [
          stamped.countryCode ? `Geo: ${prevGeo} → ${stamped.countryCode}` : "",
          stamped.timezone ? `Timezone: ${prevTz} → ${stamped.timezone}` : "",
          stamped.exitIp ? `WebRTC: ${trimmed ? "Proxy Masked" : "Direct"} → Masked (${stamped.exitIp})` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const logSummary = stamped.geoSyncSummary || fallbackDelta;
        if (logSummary) {
          addLog("info", name || "Profile", logSummary);
        }
        const meta = [
          stamped.exitIp || "Live",
          stamped.countryCode ? `[${stamped.countryCode}]` : "",
          stamped.timezone || "",
          stamped.latencyMs != null ? `${stamped.latencyMs}ms` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        pushToast(`IP Live: ${meta}`, "success");
      } else {
        pushToast(`IP Die${stamped.reason ? `: ${stamped.reason}` : ""}`, "error");
      }
    } catch (err: unknown) {
      const failed: ProxyCheckHealthResult = {
        alive: false,
        reason: err instanceof Error ? err.message : "Failed",
        checkedAt: new Date().toISOString(),
      };
      setProxyHealth(failed);
      writeCachedProxyHealth(targetSpec, failed, name);
      pushToast(err instanceof Error ? err.message : "IP check failed", "error");
    } finally {
      setProxyCheckBusy(false);
    }
  };

  return (
    <>
      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        {showName ? (
          <ProfileDetailClickEditField
            fieldKey="name"
            value={name}
            onChange={(value) => {
              const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
              setName?.(digits);
            }}
            placeholder="0000–9999"
          />
        ) : null}
        <ProfileDetailClickFilterField
          fieldKey="group"
          filterKey="browser-profile-group"
          options={groupOptions}
          value={groupId}
          onChange={setGroupId}
          onPanelCreate={() => setCreateGroupOpen(true)}
          panelCreateAriaLabel="Add Group"
        />
        <ProfileDetailClickEditField
          fieldKey="startupUrl"
          value={startupUrl}
          onChange={setStartupUrl}
          placeholder="https://myaccount.google.com/"
          formatValue={(raw) => raw}
          renderDisplay={(value) => value}
          renderEdit={({ value, onChange, onDone, inputRef, className }) => (
            <input
              ref={inputRef}
              className={className}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => {
                const next = formatStartupUrlOnBlur(value);
                if (next !== value) onChange(next);
                onDone();
              }}
              placeholder="https://myaccount.google.com/"
            />
          )}
        />
        {!showName ? <HubAdmGridSlotPad filledCount={2} /> : null}
      </div>

      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        <ProfileDetailClickFilterField
          fieldKey="proxy"
          filterKey="browser-proxy-unified"
          className="stealth-adm-proxy-field"
          options={proxyOptions}
          value={resolveUnifiedProxyOptionValue(proxy)}
          allowClear
          clearLabel="📍 Local IP"
          allowCustom
          customOptionLabel={(q) => `Use custom proxy: ${q}`}
          onPanelCreate={() => setCustomProxyOpen(true)}
          panelCreateAriaLabel="Set Custom Proxy"
          showCopyAction={Boolean(String(proxy || "").trim())}
          copyValue={String(proxy || "").trim()}
          onChange={(nextVal) => {
            const trimmed = String(nextVal || "").trim();
            setProxy(trimmed);
            if (!trimmed) setStaticIp?.(false);
            setProxyHealth(null);
            const geo = resolveVpnCountryGeoDefaults(trimmed);
            if (geo) onAutoGeoSync?.(geo);
          }}
          trailingAction={
            Boolean(String(proxy || "").trim()) || Boolean(staticIp) ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setProxy("");
                  setStaticIp?.(false);
                  setProxyHealth(null);
                  onAutoGeoSync?.({ countryCode: "", timezone: "", locale: "" });
                  if (profileId) {
                    void updateProfile({
                      id: profileId,
                      proxy: "",
                      staticIp: false,
                      timezone: "",
                      locale: "",
                    })
                      .then(() => {
                        pushToast(`Profile ${name || ""} reset to 📍 Local IP.`, "success", 2500);
                      })
                      .catch(() => undefined);
                  } else {
                    pushToast("Reset to 📍 Local IP.", "success", 2200);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setProxy("");
                    setStaticIp?.(false);
                    setProxyHealth(null);
                    onAutoGeoSync?.({ countryCode: "", timezone: "", locale: "" });
                  }
                }}
                className="hub-reset-btn inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-80 transition-opacity hover:opacity-100 focus:opacity-100"
                title="Reset to 📍 Local IP & auto geolocation"
                aria-label="Reset to Local IP"
              >
                <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </span>
            ) : undefined
          }
        />
        <ProfileDetailReadonlyField fieldKey="staticIp" valueLayout="inline">
          <div className="stealth-adm-detail-inline-bar">
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(staticIp)}
              aria-label="Static IP"
              disabled={!setStaticIp}
              onClick={(event) => {
                event.stopPropagation();
                setStaticIp?.(!staticIp);
              }}
              className="inline-flex cursor-pointer items-center rounded-md px-0.5 py-0.5 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              title="Static IP: Keep this proxy permanently pinned to the profile. When Off (default), temporary task proxies reset to Local IP after the profile closes."
            >
              <HubUsersOnOffLabel on={Boolean(staticIp)} />
            </button>
          </div>
        </ProfileDetailReadonlyField>
        <ProfileDetailReadonlyField fieldKey="ipStatus" valueLayout="inline">
          {(() => {
            const rawProxy = String(proxy || "").trim();
            const hostIp = extractProxyHostIp(rawProxy);
            const exactIp =
              proxyHealth?.exitIp ||
              hostIp ||
              (proxyCheckBusy
                ? "Checking…"
                : proxyHealth?.alive === false
                  ? "Die"
                  : rawProxy
                    ? "Check IP"
                    : "Local IP");
            const dotClass = proxyCheckBusy
              ? "bg-amber-400 animate-pulse"
              : proxyHealth?.alive === true
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.65)]"
                : proxyHealth?.alive === false
                  ? "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.65)]"
                  : hostIp
                    ? "bg-emerald-400/80"
                    : "bg-sky-400/80";
            const textToneClass = proxyCheckBusy
              ? "text-amber-200"
              : proxyHealth?.alive === true
                ? "text-emerald-300"
                : proxyHealth?.alive === false
                  ? "text-rose-400"
                  : hostIp
                    ? "text-emerald-200"
                    : "text-[var(--text)]";
            const statusTooltip = proxyHealth
              ? proxyHealth.alive
                ? `Status: Live\nExit IP: ${proxyHealth.exitIp || hostIp || "—"}\nCountry: ${proxyHealth.countryCode || "—"}\nTimezone: ${proxyHealth.timezone || "—"}\nLatency: ${proxyHealth.latencyMs ?? "—"}ms${proxyHealth.checkedAt ? `\nChecked: ${new Date(proxyHealth.checkedAt).toLocaleString()}` : ""}`
                : `Status: Die\nReason: ${proxyHealth.reason || "Unreachable"}${hostIp ? `\nHost IP: ${hostIp}` : ""}${proxyHealth.checkedAt ? `\nChecked: ${new Date(proxyHealth.checkedAt).toLocaleString()}` : ""}`
              : hostIp
                ? `Configured IP: ${hostIp} — click pulse icon to verify live status`
                : rawProxy
                  ? `Proxy: ${rawProxy} — click pulse icon to resolve & verify exit IP`
                  : "Direct Local IP — click pulse icon to check public exit IP";
            return (
              <div className="stealth-adm-detail-inline-bar min-w-0 flex-1 justify-between gap-1.5">
                <span
                  className="inline-flex min-w-0 items-center gap-1.5 truncate"
                  title={statusTooltip}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`}
                    aria-hidden
                  />
                  <span className={`hub-adm-detail-value-text truncate font-mono text-[12px] ${textToneClass}`}>
                    {exactIp}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={proxyCheckBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCheckProxy(Boolean(proxyHealth?.alive && isVpnCountryProxy));
                  }}
                  aria-label="Check IP status"
                  className="hub-reset-btn inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-85 transition-opacity hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-45"
                  title={
                    isVpnCountryProxy && proxyHealth?.alive
                      ? "Probe / rotate tunnel and verify live exit IP"
                      : "Probe connectivity and verify live exit IP (Live / Die)"
                  }
                >
                  <Activity
                    size={13}
                    className={
                      proxyCheckBusy
                        ? "animate-pulse text-amber-300"
                        : proxyHealth?.alive === false
                          ? "text-rose-400"
                          : "text-cyan-300"
                    }
                    aria-hidden
                  />
                </button>
              </div>
            );
          })()}
        </ProfileDetailReadonlyField>
      </div>

      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        {(["e0001", "e0002", "surfshark"] as const).map((extKey) => {
          const enabled = resolveProfileExtensionEffective(globalToggles, extensionOverrides, extKey);
          const extTitle =
            extKey === "e0001"
              ? "Cookie Bridge (E0001) — click to toggle On/Off for this profile"
              : extKey === "e0002"
                ? "Browser Operator (E0002) — click to toggle On/Off for this profile"
                : "Surfshark VPN — click to toggle On/Off for this profile";
          return (
            <ProfileDetailReadonlyField key={extKey} fieldKey={extKey} valueLayout="inline">
              <div className="stealth-adm-detail-inline-bar">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={extKey === "surfshark" ? "Surfshark" : extKey.toUpperCase()}
                  disabled={!setExtensionOverrides}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggleExtension(extKey);
                  }}
                  className="inline-flex cursor-pointer items-center rounded-md px-0.5 py-0.5 transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
                  title={extTitle}
                >
                  <HubUsersOnOffLabel on={enabled} />
                </button>
              </div>
            </ProfileDetailReadonlyField>
          );
        })}
      </div>

      <HubPromptDialog
        open={customProxyOpen}
        title="Custom proxy"
        label="Proxy URL or host:port:user:pass"
        placeholder="http://user:pass@host:port or socks5://host:port"
        confirmLabel="Apply"
        headerIcon={Shield}
        headerIconClassName="text-emerald-300"
        onClose={() => setCustomProxyOpen(false)}
        onConfirm={(raw) => {
          const trimmed = raw.trim();
          setProxy(trimmed);
          if (!trimmed) setStaticIp?.(false);
          setProxyHealth(null);
          const geo = resolveVpnCountryGeoDefaults(trimmed);
          if (geo) onAutoGeoSync?.(geo);
          setCustomProxyOpen(false);
        }}
      />

      <HubPromptDialog
        open={createGroupOpen}
        title="New group"
        label="Group name"
        placeholder="e.g. Clients"
        confirmLabel="Create"
        busy={createBusy}
        busyLabel="Creating…"
        headerIcon={FolderPlus}
        headerIconClassName="text-amber-300"
        validate={(value) =>
          validateHubCatalogPromptName({
            value,
            options: groupOptions,
            entityLabel: "group",
          })
        }
        onClose={() => {
          if (!createBusy) setCreateGroupOpen(false);
        }}
        onConfirm={(raw) => {
          const nameTrim = raw.trim();
          if (!nameTrim || createBusy) return;
          setCreateBusy(true);
          void createGroup(nameTrim)
            .then((group) => {
              setGroupId(group.id);
              setCreateGroupOpen(false);
              pushToast(`Group created: ${group.name}`, "success");
            })
            .catch((err: unknown) => {
              pushToast(err instanceof Error ? err.message : "Could not create group", "error");
            })
            .finally(() => setCreateBusy(false));
        }}
      />
    </>
  );
}

/** Dedicated Cookie Guard & P0020 Session section rows (3-col ADM layout matching P0020 Service Modal). */
export function ProfileSessionFields({
  profileId,
  name = "",
  profileRow,
}: {
  profileId: string;
  name?: string;
  profileRow?: ProfileRow;
}) {
  const { openOne, closeOne, runningHeadlessIds } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const [cookieGuard, setCookieGuard] = useState<ProfileCookieGuardStatus | null>(null);
  const [cookieGuardBusy, setCookieGuardBusy] = useState<"restore" | "restore-prev" | "snapshot" | "reconcile" | null>(null);

  useEffect(() => {
    if (!profileId && !name) {
      setCookieGuard(null);
      return;
    }
    let cancelled = false;
    void fetchProfileCookieGuardStatus(profileId || name, name)
      .then((status) => {
        if (!cancelled) setCookieGuard(status);
      })
      .catch(() => {
        if (!cancelled) setCookieGuard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, name]);

  const handleRestoreCookiesBackup = async (slot: "latest" | "previous" = "latest") => {
    if ((!profileId && !name) || cookieGuardBusy) return;
    setCookieGuardBusy(slot === "previous" ? "restore-prev" : "restore");
    try {
      const res = await restoreProfileCookiesBackup(profileId || name, name, { slot });
      if (res.status) setCookieGuard(res.status);
      const parts: string[] = [];
      if (res.restoredFromBak) parts.push(`Slot ${slot} (${res.status?.current.totalRows ?? 0} cookies)`);
      if (res.historyRestored) parts.push("History");
      if (res.localStorageRestored) parts.push("Local Storage");
      if (res.stateFilesRestored) parts.push(`${res.stateFilesRestored} state files`);
      if (res.dpapiRewrapped) parts.push("DPAPI Re-wrapped");
      pushToast(
        parts.length > 0
          ? `Restored: ${parts.join(" + ")}`
          : `Session verified (${res.status?.current.totalRows ?? 0} cookies)`,
        "success",
      );
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : "Failed to restore session backup", "error");
    } finally {
      setCookieGuardBusy(null);
    }
  };

  const handleSnapshotCookiesBackup = async () => {
    if ((!profileId && !name) || cookieGuardBusy) return;
    setCookieGuardBusy("snapshot");
    try {
      const status = await snapshotProfileCookiesBackup(profileId || name, name, true);
      setCookieGuard(status);
      const latest = status.slots?.latest ?? status.backup.slotLatest;
      const histText =
        latest?.historyBytes && latest.historyBytes > 0
          ? ` · History ${(latest.historyBytes / (1024 * 1024)).toFixed(1)} MB`
          : "";
      pushToast(
        `Native Session v2 saved (${status.current.totalRows} cookies${histText})`,
        "success",
      );
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : "Failed to snapshot session", "error");
    } finally {
      setCookieGuardBusy(null);
    }
  };

  const handleReconcileP0020Status = async () => {
    if ((!profileId && !name) || cookieGuardBusy) return;
    setCookieGuardBusy("reconcile");
    try {
      const res = await reconcileProfileP0020Status(profileId || name, name);
      if (res.status) setCookieGuard(res.status);
      const loggedInList = (res.loggedInServices || []).join(", ");
      const summary = loggedInList
        ? `Logged in: ${loggedInList} (${res.patchedCount ?? 0} updated in P0020)`
        : `Checked ${res.checkedRows ?? 0} P0020 rows (${res.patchedCount ?? 0} updated)`;
      pushToast(`P0020 Synced: ${summary}`, "success");
    } catch (err: unknown) {
      pushToast(err instanceof Error ? err.message : "Failed to reconcile status with P0020", "error");
    } finally {
      setCookieGuardBusy(null);
    }
  };

  const authSummary = cookieGuard
    ? [
        cookieGuard.current.hasGoogleAuth ? "Google" : "",
        cookieGuard.current.hasOutlookAuth ? "Outlook" : "",
        cookieGuard.current.hasFacebookAuth ? "FB" : "",
        cookieGuard.current.hasTikTokAuth ? "TikTok" : "",
      ]
        .filter(Boolean)
        .join(" · ") || "No Auth"
    : "";

  const slotLatest = cookieGuard?.slots?.latest ?? cookieGuard?.backup.slotLatest ?? null;
  const slotPrevious = cookieGuard?.slots?.previous ?? cookieGuard?.backup.slotPrevious ?? null;
  const histBytes = slotLatest?.historyBytes ?? cookieGuard?.backup.historyBytes ?? 0;
  const stateBytes = slotLatest?.stateBytes ?? cookieGuard?.backup.stateBytes ?? 0;
  const lsBytes = slotLatest?.localStorageBackupBytes ?? cookieGuard?.backup.localStorageBackupBytes ?? 0;
  const backupParts: string[] = [];
  if (cookieGuard) {
    if (slotLatest) {
      backupParts.push(`v${slotLatest.version || 2} Latest (${slotLatest.totalRows})`);
    } else if (cookieGuard.backup.exists) {
      backupParts.push(`Bak (${cookieGuard.backup.totalRows})`);
    }
    if (slotPrevious) {
      backupParts.push(`Prev (${slotPrevious.totalRows})`);
    }
    if (histBytes > 0) {
      backupParts.push(`Hist ${(histBytes / (1024 * 1024)).toFixed(1)}MB`);
    }
    if (lsBytes > 0) {
      backupParts.push(
        lsBytes >= 1024 * 1024
          ? `LS ${(lsBytes / (1024 * 1024)).toFixed(1)}MB`
          : `LS ${Math.max(1, Math.round(lsBytes / 1024))}KB`,
      );
    }
  }

  return (
    <>
      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        <ProfileDetailReadonlyField fieldKey="sessionCookies" valueLayout="inline">
          <span
            className="hub-adm-detail-value-text truncate"
            title={
              cookieGuard
                ? `Live SQLite Cookies on disk (Default/Network/Cookies): ${cookieGuard.current.totalRows} rows\nAuthenticated sessions: ${authSummary}`
                : "Checking SQLite Cookies…"
            }
          >
            {cookieGuard ? (
              <>
                <span className={cookieGuard.current.totalRows > 0 ? "text-emerald-300" : "text-amber-300"}>
                  {cookieGuard.current.totalRows}
                </span>
                <span className="text-[var(--muted)]">{` · ${authSummary}`}</span>
              </>
            ) : (
              <span className="text-[var(--muted)]">Loading…</span>
            )}
          </span>
        </ProfileDetailReadonlyField>

        <ProfileDetailReadonlyField
          fieldKey="sessionBackup"
          valueLayout="inline"
          className="stealth-adm-session-backup-field"
        >
          <span
            className="hub-adm-detail-value-text truncate"
            title={
              cookieGuard
                ? `Slot Latest (v${slotLatest?.version || 2}): ${
                    slotLatest
                      ? `${slotLatest.totalRows} cookies · ${new Date(slotLatest.createdAt).toLocaleString()}`
                      : cookieGuard.backup.exists
                        ? `${cookieGuard.backup.totalRows} rows`
                        : "None"
                  }\nSlot Previous: ${
                    slotPrevious
                      ? `${slotPrevious.totalRows} cookies · ${new Date(slotPrevious.createdAt).toLocaleString()}`
                      : "None"
                  }\nHistory DB: ${
                    histBytes > 0 ? `${(histBytes / (1024 * 1024)).toFixed(2)} MB` : "None"
                  }\nLocalStorage (SPA): ${
                    lsBytes > 0 ? `${(lsBytes / (1024 * 1024)).toFixed(2)} MB` : "None"
                  }\nTotal State Bundle: ${
                    stateBytes > 0
                      ? `${(stateBytes / (1024 * 1024)).toFixed(1)} MB (${slotLatest?.stateFilesCount ?? 0} files)`
                      : "—"
                  }`
                : "Checking session backups…"
            }
          >
            {cookieGuard ? (
              backupParts.length > 0 ? (
                <span className="text-sky-300">{backupParts.join(" · ")}</span>
              ) : (
                <span className="text-[var(--muted)]">No backup</span>
              )
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </span>
        </ProfileDetailReadonlyField>

        {profileRow ? (
          <ProfileDetailReadonlyField fieldKey="status" valueLayout="inline">
            {(() => {
              const running = profileRow.status === "running" || profileRow.status === "opening";
              const opening = profileRow.status === "opening";
              const showHeadlessBadge =
                running && (profileRow.headless || Boolean(runningHeadlessIds?.has(profileRow.id)));
              return (
                <div className="stealth-adm-detail-inline-bar">
                  <HubDirectoryRunToggle
                    kind={running ? "stop" : "start"}
                    pending={opening}
                    label={running ? "Stop" : "Run"}
                    ariaLabel={
                      running
                        ? `Stop ${profileRow.name}${showHeadlessBadge ? " (headless)" : ""}`
                        : `Run ${profileRow.name} with startup URL`
                    }
                    disabled={!running && opening}
                    trailing={
                      running && showHeadlessBadge ? (
                        <span className="text-xs leading-none" aria-hidden>
                          👻
                        </span>
                      ) : null
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (running) void closeOne(profileRow);
                      else void openOne(profileRow);
                    }}
                  />
                </div>
              );
            })()}
          </ProfileDetailReadonlyField>
        ) : (
          <HubAdmGridSlotPad filledCount={2} />
        )}
      </div>

      <div className={PROFILE_DETAIL_FORM_ROW_DETAIL_LINE}>
        <ProfileDetailReadonlyField fieldKey="sessionActions" valueLayout="inline">
          <div className="stealth-adm-action-group">
            <button
              type="button"
              disabled={cookieGuardBusy !== null}
              onClick={() => void handleRestoreCookiesBackup("latest")}
              className="stealth-adm-action-pill"
              title={
                slotLatest
                  ? `Restore Slot Latest (v${slotLatest.version || 2} · ${slotLatest.totalRows} cookies · History ${(histBytes / (1024 * 1024)).toFixed(1)} MB · ${new Date(slotLatest.createdAt).toLocaleString()})`
                  : "Restore Native Session Bundle (Cookies + Local State + History + Bookmarks + LocalStorage) from Slot Latest"
              }
            >
              <RotateCcw size={11} className={cookieGuardBusy === "restore" ? "animate-spin text-amber-300" : "text-sky-300"} />
              <span>{cookieGuardBusy === "restore" ? "…" : "Latest"}</span>
            </button>
            <button
              type="button"
              disabled={cookieGuardBusy !== null || !slotPrevious}
              onClick={() => void handleRestoreCookiesBackup("previous")}
              className="stealth-adm-action-pill disabled:opacity-40"
              title={
                slotPrevious
                  ? `Restore Slot Previous (${slotPrevious.totalRows} cookies · ${new Date(slotPrevious.createdAt).toLocaleString()})`
                  : "Slot Previous not rotated yet (created automatically on next session change)"
              }
            >
              <RotateCcw size={11} className={cookieGuardBusy === "restore-prev" ? "animate-spin text-amber-300" : "text-violet-300"} />
              <span>{cookieGuardBusy === "restore-prev" ? "…" : "Prev"}</span>
            </button>
            <button
              type="button"
              disabled={cookieGuardBusy !== null}
              onClick={() => void handleSnapshotCookiesBackup()}
              className="stealth-adm-action-pill"
              title="Save an atomic 2-slot Native Session Bundle v2 (Cookies, DPAPI Local State, History, Bookmarks, Preferences, LocalStorage, Sessions)"
            >
              <ShieldCheck size={11} className={cookieGuardBusy === "snapshot" ? "animate-pulse text-amber-300" : "text-emerald-300"} />
              <span>{cookieGuardBusy === "snapshot" ? "…" : "Snapshot"}</span>
            </button>
            <button
              type="button"
              disabled={cookieGuardBusy !== null}
              onClick={() => void handleReconcileP0020Status()}
              className="stealth-adm-action-pill"
              title="Reconcile this profile's disk Cookies & SPA LocalStorage with P0020 Data Box"
            >
              <CloudUpload size={11} className={cookieGuardBusy === "reconcile" ? "animate-bounce text-amber-300" : "text-indigo-300"} />
              <span>{cookieGuardBusy === "reconcile" ? "…" : "Sync"}</span>
            </button>
          </div>
        </ProfileDetailReadonlyField>
      </div>
    </>
  );
}
