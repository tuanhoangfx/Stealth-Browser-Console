import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Globe, Info, Link2, MonitorSmartphone, Palette, Shield } from "lucide-react";
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
import { fetchAppInfo, fetchEngineHealth, openDataFolder, updateEngineBinary } from "../../api";
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
import type { EngineHealth } from "../../types";

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
        options={browserPlatformFilterOptions()}
        value={defaults.platform}
        onChange={(value) => editDefaults({ platform: value as BrowserDefaults["platform"] })}
      />

      <HubModalFilterField
        filterKey="browser-color-scheme"
        label="Color scheme"
        options={browserColorSchemeFilterOptions()}
        value={defaults.colorScheme}
        onChange={(value) => editDefaults({ colorScheme: value as BrowserDefaults["colorScheme"] })}
      />

      <HubModalFilterField
        filterKey="browser-timezone"
        label="Timezone"
        options={browserTimezoneFilterOptions()}
        value={timezoneValue}
        onChange={(value) => editDefaults({ timezone: value })}
      />

      <HubModalFilterField
        filterKey="browser-locale"
        label="Locale"
        options={localeOptions}
        value={localeValue}
        onChange={(value) => editDefaults({ locale: value })}
      />

      <HubModalFilterField
        filterKey="browser-window-mode"
        label="Window mode"
        options={browserWindowModeFilterOptions()}
        value={defaults.windowMode}
        onChange={(value) => editDefaults({ windowMode: value as BrowserDefaults["windowMode"] })}
      />

      <label className="col-span-full block min-w-0">
        <HubFormFieldLabel icon={Link2} iconClassName="text-violet-300">
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

  useEffect(() => {
    void fetchAppInfo().then((info) => setUserDataPath(info.userDataPath));
  }, []);

  return (
    <div className={SETTINGS_FORM_CLASS}>
      <p className="col-span-full break-all text-xs text-[var(--muted)]">{userDataPath || "—"}</p>
      <div className="col-span-full">
        <HubToolDetailModalPrimaryAction label="Open data folder" onClick={() => void openDataFolder()} />
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
