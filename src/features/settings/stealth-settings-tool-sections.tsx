import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, Globe, Info, Link2, MonitorSmartphone, Palette, Puzzle, Shield } from "lucide-react";
import {
  HubAlert,
  HubFormFieldLabel,
  HubToolDetailModalPrimaryAction,
  HUB_TOOL_DETAIL_FORM_GRID_2_CLASS,
  compactIconSize,
  type HubDisplayPrefsToolSection,
} from "@tool-workspace/hub-ui";
import { HubModalFilterField } from "@tool-workspace/hub-ui";
import { useRegisterSettingsSave } from "./stealth-settings-save-context";
import {
  applySuggestedProfilesLocation,
  chooseProfilesLocation,
  dismissProfilesLocationPrompt,
  fetchAppInfo,
  fetchEngineHealth,
  fetchExtensionToggles,
  fetchProfilesLocation,
  migrateProfilesLocation,
  openDataFolder,
  openProfilesFolder,
  setExtensionToggles,
  updateEngineBinary,
} from "../../api";
import { useStealthShell } from "../../context/stealth-shell-context";
import {
  LOCALE_OPTIONS,
  TIMEZONE_OPTIONS,
  applyDevicePreset,
  DEFAULT_DEVICE
} from "../../lib/device-presets";
import {
  BROWSER_DEVICE_FORM_CLASS,
  browserColorSchemeFilterOptions,
  browserPlatformFilterOptions,
  browserTimezoneFilterOptions,
  browserWindowModeFilterOptions,
  devicePresetFilterOptions,
  localeFilterOptions,
} from "../../lib/device-filter-options";
import {
  readBrowserDefaults,
  writeBrowserDefaults,
  type BrowserDefaults
} from "../../lib/stealth-app-prefs";
import { formatStartupUrlOnBlur, normalizeStartupUrl } from "../../lib/startup-url";
import { stealthFormFieldHintContent } from "../../lib/stealth-directory-column-hints";
import type { EngineHealth, ExtensionToggles, ProfilesLocationInfo } from "../../types";

const SETTINGS_FORM_CLASS = `${HUB_TOOL_DETAIL_FORM_GRID_2_CLASS} stealth-settings-form min-w-0`;

function BrowserDefaultsSectionBody() {
  const [defaults, setDefaults] = useState<BrowserDefaults>(() => readBrowserDefaults());
  const [savedPulse, setSavedPulse] = useState(false);

  const devicePresetOptions = useMemo(() => devicePresetFilterOptions(), []);
  const localeOptions = useMemo(() => localeFilterOptions(), []);

  const editDefaults = (patch: Partial<BrowserDefaults>) =>
    setDefaults((d) => ({ ...d, ...patch, devicePreset: "custom" }));
  const editLaunch = (patch: Partial<BrowserDefaults>) => setDefaults((d) => ({ ...d, ...patch }));

  const saveDefaults = (next: BrowserDefaults) => {
    setDefaults(next);
    writeBrowserDefaults(next);
    setSavedPulse(true);
    window.setTimeout(() => setSavedPulse(false), 1200);
  };

  useRegisterSettingsSave(
    "browser-defaults",
    () => {
      const next = {
        ...defaults,
        defaultStartupUrl: normalizeStartupUrl(defaults.defaultStartupUrl),
      };
      saveDefaults(next);
    },
    () => true,
  );

  const timezoneValue = TIMEZONE_OPTIONS.some((o) => o.value === defaults.timezone) ? defaults.timezone : "";
  const localeValue = LOCALE_OPTIONS.some((o) => o.value === defaults.locale) ? defaults.locale : "";

  return (
    <div className={BROWSER_DEVICE_FORM_CLASS}>
      {savedPulse ? (
        <div className="col-span-full">
          <HubAlert tone="info">Saved browser defaults.</HubAlert>
        </div>
      ) : null}

      <HubModalFilterField
        filterKey="browser-device-preset"
        label="Device preset"
        labelHint={stealthFormFieldHintContent("devicePreset")}
        options={devicePresetOptions}
        value={defaults.devicePreset}
        onChange={(presetId) => {
          const dev = applyDevicePreset(
            {
              ...DEFAULT_DEVICE,
              platform: defaults.platform,
              timezone: defaults.timezone,
              locale: defaults.locale,
              colorScheme: defaults.colorScheme
            },
            presetId
          );
          setDefaults({
            ...defaults,
            platform: dev.platform,
            devicePreset: dev.devicePreset,
            timezone: dev.timezone,
            locale: dev.locale,
            colorScheme: defaults.colorScheme,
            headless: defaults.headless,
            humanize: defaults.humanize,
            windowMode: dev.windowMode,
            defaultStartupUrl: defaults.defaultStartupUrl
          });
        }}
      />

      <HubModalFilterField
        filterKey="browser-platform"
        label="Operating system"
        labelHint={stealthFormFieldHintContent("platform")}
        options={browserPlatformFilterOptions()}
        value={defaults.platform}
        onChange={(value) => editDefaults({ platform: value as BrowserDefaults["platform"] })}
      />

      <HubModalFilterField
        filterKey="browser-color-scheme"
        label="Color scheme"
        labelHint={stealthFormFieldHintContent("colorScheme")}
        options={browserColorSchemeFilterOptions()}
        value={defaults.colorScheme}
        onChange={(value) => editDefaults({ colorScheme: value as BrowserDefaults["colorScheme"] })}
      />

      <HubModalFilterField
        filterKey="browser-timezone"
        label="Timezone"
        labelHint={stealthFormFieldHintContent("timezone")}
        options={browserTimezoneFilterOptions()}
        value={timezoneValue}
        onChange={(value) => editDefaults({ timezone: value })}
      />

      <HubModalFilterField
        filterKey="browser-locale"
        label="Locale"
        labelHint={stealthFormFieldHintContent("locale")}
        options={localeOptions}
        value={localeValue}
        onChange={(value) => editDefaults({ locale: value })}
      />

      <HubModalFilterField
        filterKey="browser-window-mode"
        label="Window mode"
        labelHint={stealthFormFieldHintContent("windowMode")}
        options={browserWindowModeFilterOptions()}
        value={defaults.windowMode}
        onChange={(value) => editDefaults({ windowMode: value as BrowserDefaults["windowMode"] })}
      />

      <label className="col-span-full block min-w-0">
        <HubFormFieldLabel icon={Link2} iconClassName="text-violet-300" labelHint={stealthFormFieldHintContent("defaultStartupUrl")}>
          Default startup URL
        </HubFormFieldLabel>
        <input
          className="hub-input w-full min-w-0"
          value={defaults.defaultStartupUrl}
          onChange={(e) => editLaunch({ defaultStartupUrl: e.target.value })}
          onBlur={() => {
            const next = formatStartupUrlOnBlur(defaults.defaultStartupUrl);
            if (next !== defaults.defaultStartupUrl) editLaunch({ defaultStartupUrl: next });
          }}
          placeholder="https://myaccount.google.com/"
        />
      </label>

      <div className="col-span-full stealth-settings-form__checks">
        <label className="stealth-settings-form__check">
          <input
            type="checkbox"
            checked={defaults.humanize}
            onChange={(e) => editLaunch({ humanize: e.target.checked })}
          />
          Humanize
        </label>
        <label className="stealth-settings-form__check">
          <input type="checkbox" checked={defaults.headless} onChange={(e) => editLaunch({ headless: e.target.checked })} />
          Headless
          <span className="stealth-settings-form__warn">easier to detect</span>
        </label>
      </div>
    </div>
  );
}

const DEFAULT_EXTENSION_TOGGLES: ExtensionToggles = {
  e0001: true,
  surfshark: false,
  webStore: false,
};

function ExtensionsSectionBody() {
  const [toggles, setToggles] = useState<ExtensionToggles>(DEFAULT_EXTENSION_TOGGLES);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchExtensionToggles()
      .then(setToggles)
      .catch(() => setToggles(DEFAULT_EXTENSION_TOGGLES));
  }, []);

  const apply = (patch: Partial<ExtensionToggles>) => {
    setBusy(true);
    setMessage("");
    void setExtensionToggles(patch)
      .then((next) => {
        setToggles(next);
        setMessage("Saved. Close Chrome completely and Run again for changes to apply.");
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Save failed"))
      .finally(() => setBusy(false));
  };

  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full text-xs text-[var(--muted)]">
        Per-extension control for every profile. Default: E0001 Cookie Bridge only.
      </p>
      <label className="stealth-settings-form__check col-span-full">
        <input
          type="checkbox"
          checked={toggles.e0001}
          disabled={busy}
          onChange={(e) => apply({ e0001: e.target.checked })}
        />
        E0001 Cookie Bridge
      </label>
      <label className="stealth-settings-form__check col-span-full">
        <input
          type="checkbox"
          checked={toggles.surfshark}
          disabled={busy}
          onChange={(e) => apply({ surfshark: e.target.checked })}
        />
        Surfshark VPN Extension
      </label>
      <label className="stealth-settings-form__check col-span-full">
        <input
          type="checkbox"
          checked={toggles.webStore}
          disabled={busy}
          onChange={(e) => apply({ webStore: e.target.checked })}
        />
        Other Web Store extensions
      </label>
      {message ? (
        <div className="col-span-full">
          <HubAlert tone="info">{message}</HubAlert>
        </div>
      ) : null}
    </div>
  );
}

function AppearanceSectionBody() {
  const { theme, setTheme } = useStealthShell();
  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full text-xs text-[var(--muted)]">UI zoom is in the sidebar footer.</p>
      <label className="stealth-settings-form__check">
        <input type="radio" name="stealth-theme" checked={theme === "dark"} onChange={() => setTheme("dark")} />
        Dark
      </label>
      <label className="stealth-settings-form__check">
        <input type="radio" name="stealth-theme" checked={theme === "light"} onChange={() => setTheme("light")} />
        Light
      </label>
    </div>
  );
}

function EngineSectionBody() {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchEngineHealth().then(setHealth);
  }, []);

  const engineLabel =
    health?.ok ? "Ready" : health?.installed === false ? "Binary missing" : health ? "Offline" : "Checking";

  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full text-xs text-[var(--muted)]">Status: {engineLabel}</p>
      {health?.info ? (
        <p className="col-span-full text-xs text-[var(--muted)]">
          Version: {String((health.info as { version?: string }).version || "—")}
        </p>
      ) : null}
      {health?.error ? (
        <div className="col-span-full">
          <HubAlert tone="danger">{health.error}</HubAlert>
        </div>
      ) : null}
      {message ? (
        <div className="col-span-full">
          <HubAlert tone="info">{message}</HubAlert>
        </div>
      ) : null}
      <div className="col-span-full">
        <HubToolDetailModalPrimaryAction
          label="Check / download binary"
          busy={busy}
          disabled={busy}
          icon={Download}
          onClick={() => {
            setBusy(true);
            setMessage("");
            void updateEngineBinary()
              .then(async () => {
                setMessage("Binary check complete.");
                setHealth(await fetchEngineHealth());
              })
              .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Update failed"))
              .finally(() => setBusy(false));
          }}
        />
      </div>
    </div>
  );
}

function DataFolderSectionBody() {
  const [userDataPath, setUserDataPath] = useState("");
  const [loc, setLoc] = useState<ProfilesLocationInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const [info, location] = await Promise.all([fetchAppInfo(), fetchProfilesLocation()]);
    setUserDataPath(info.userDataPath);
    if (location?.ok !== false) {
      setLoc(location as ProfilesLocationInfo);
    }
  };

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : "Failed to load storage paths");
    });
  }, []);

  const runMigrate = async (target: string, mode: "migrate" | "point-only" = "migrate") => {
    setBusy(true);
    setMessage("");
    try {
      const result = await migrateProfilesLocation({ path: target, mode });
      if (!result.ok) {
        setMessage(result.error || "Move failed");
        return;
      }
      setMessage(result.moved ? "Profiles moved." : "Profiles location updated.");
      await refresh();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full text-xs text-[var(--muted)]">
        App database stays in AppData. Chromium profile folders can live on another fixed drive for long-term
        stability (same SSD speed on multi-partition disks).
      </p>
      <div className="col-span-full space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">App data</p>
        <p className="break-all font-mono text-xs text-[var(--muted)]">{userDataPath || "—"}</p>
      </div>
      <div className="col-span-full space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Profiles storage</p>
        <p className="break-all font-mono text-xs text-cyan-100/90">{loc?.profilesRoot || "—"}</p>
        <p className="text-xs text-[var(--muted)]">
          {loc?.usingCustom ? "Custom location" : "Default (under App data)"}
          {loc ? ` · ${loc.profileDirCount} profile folder(s)` : ""}
        </p>
      </div>
      {loc?.promptPending && loc.suggestedProfilesRoot && loc.suggestedProfilesRoot !== loc.profilesRoot ? (
        <div className="col-span-full">
          <HubAlert tone="info">
            Recommended: {loc.suggestedProfilesRoot}. Close open profiles before moving. Prefer a non-system fixed
            drive when available.
          </HubAlert>
        </div>
      ) : null}
      {message ? (
        <p className="col-span-full text-xs text-[var(--muted)]">{message}</p>
      ) : null}
      <div className="col-span-full flex flex-wrap gap-2">
        <HubToolDetailModalPrimaryAction
          label="Open app data"
          onClick={() => void openDataFolder()}
          icon={FolderOpen}
        />
        <HubToolDetailModalPrimaryAction
          label="Open profiles folder"
          onClick={() => void openProfilesFolder()}
          icon={FolderOpen}
        />
        <HubToolDetailModalPrimaryAction
          label={busy ? "Working…" : "Change profiles location…"}
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMessage("");
              try {
                const pick = await chooseProfilesLocation();
                if (!pick.ok || pick.canceled || !pick.selectedPath) {
                  setMessage(pick.canceled ? "Canceled." : "No folder selected.");
                  return;
                }
                await runMigrate(pick.selectedPath, "migrate");
              } catch (err: unknown) {
                setMessage(err instanceof Error ? err.message : "Chooser failed");
              } finally {
                setBusy(false);
              }
            })();
          }}
          icon={FolderOpen}
        />
        {loc?.promptPending && loc.suggestedProfilesRoot ? (
          <>
            <HubToolDetailModalPrimaryAction
              label={busy ? "Working…" : "Use recommended location"}
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setMessage("");
                  try {
                    const result = await applySuggestedProfilesLocation();
                    if (!result.ok) {
                      setMessage(result.error || "Apply failed");
                      return;
                    }
                    setMessage(result.moved ? "Moved to recommended location." : "Already on recommended location.");
                    await refresh();
                  } catch (err: unknown) {
                    setMessage(err instanceof Error ? err.message : "Apply failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              icon={Download}
            />
            <HubToolDetailModalPrimaryAction
              label="Keep current"
              disabled={busy}
              onClick={() => {
                void dismissProfilesLocationPrompt()
                  .then(() => refresh())
                  .then(() => setMessage("Kept current location."));
              }}
              icon={Info}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function AboutSectionBody() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    void fetchAppInfo().then((info) => setVersion(info.version));
  }, []);

  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full text-xs text-[var(--muted)]">Stealth Browser Console v{version || "—"}</p>
      <p className="col-span-full text-xs text-[var(--muted)]">Standalone CloakBrowser profile manager.</p>
    </div>
  );
}

/** Sidebar footer — app-wide settings (Display · Appearance · Engine · …). */
export function useStealthGeneralSettingsToolSections(): HubDisplayPrefsToolSection[] {
  return useMemo(
    () => [
      {
        id: "appearance",
        label: "Appearance",
        icon: <Palette size={compactIconSize(12)} className="text-cyan-300" aria-hidden />,
        body: <AppearanceSectionBody />
      },
      {
        id: "extensions",
        label: "Extensions",
        icon: <Puzzle size={compactIconSize(12)} className="text-orange-300" aria-hidden />,
        body: <ExtensionsSectionBody />,
      },
      {
        id: "engine",
        label: "CloakBrowser",
        icon: <Shield size={compactIconSize(12)} className="text-emerald-300" aria-hidden />,
        body: <EngineSectionBody />
      },
      {
        id: "data-folder",
        label: "Data folder",
        icon: <FolderOpen size={compactIconSize(12)} className="text-amber-300" aria-hidden />,
        body: <DataFolderSectionBody />
      },
      {
        id: "about",
        label: "About",
        icon: <Info size={compactIconSize(12)} className="text-indigo-300" aria-hidden />,
        body: <AboutSectionBody />
      }
    ],
    []
  );
}

/** Profiles tab header — browser defaults · table columns. */
export function useStealthProfileSettingsToolSections(): HubDisplayPrefsToolSection[] {
  return useMemo(
    () => [
      {
        id: "browser-defaults",
        label: "Browser defaults",
        icon: <MonitorSmartphone size={compactIconSize(12)} className="text-violet-300" aria-hidden />,
        body: <BrowserDefaultsSectionBody />
      }
    ],
    []
  );
}
