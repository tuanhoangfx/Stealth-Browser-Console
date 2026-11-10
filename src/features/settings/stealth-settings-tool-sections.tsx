import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FolderOpen,
  Info,
  MonitorSmartphone,
  Palette,
  Puzzle,
  RefreshCw,
  Shield,
} from "lucide-react";
import {
  HubAdmClickEditField,
  HubAdmClickFilterField,
  HubAlert,
  HubDetailFieldRow,
  HubDetailFieldsGroup,
  compactIconSize,
  type HubDisplayPrefsToolSection,
} from "@tool-workspace/hub-ui";
import { useRegisterSettingsSave } from "./stealth-settings-save-context";
import {
  applySuggestedProfilesLocation,
  chooseProfilesLocation,
  dismissProfilesLocationPrompt,
  fetchAppInfo,
  fetchEngineHealth,
  fetchExtensionToggles,
  fetchProfilesLocation,
  fetchStealthRuntimeSettings,
  migrateProfilesLocation,
  openDataFolder,
  openProfilesFolder,
  setExtensionToggles,
  updateEngineBinary,
  updateStealthRuntimeSettings,
  type StealthRuntimeSettings,
} from "../../api";
import { useStealthShell } from "../../context/stealth-shell-context";
import {
  LOCALE_OPTIONS,
  TIMEZONE_OPTIONS,
  applyDevicePreset,
  DEFAULT_DEVICE,
} from "../../lib/device-presets";
import {
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
  type BrowserDefaults,
  type TargetMonitorMode,
} from "../../lib/stealth-app-prefs";
import { formatStartupUrlOnBlur, normalizeStartupUrl } from "../../lib/startup-url";
import { stealthFormFieldHintContent } from "../../lib/stealth-directory-column-hints";
import type { EngineHealth, ExtensionToggles, ProfilesLocationInfo } from "../../types";

const SSOT_COMPACT_BTN_CLASS =
  "inline-flex h-[24px] shrink-0 items-center gap-1 rounded border border-white/[0.12] bg-white/[0.04] px-2 text-xs font-medium text-slate-200 transition hover:border-indigo-400/45 hover:bg-indigo-500/15 hover:text-white disabled:pointer-events-none disabled:opacity-45";

const SSOT_BADGE_PILL_CLASS =
  "inline-flex h-[20px] shrink-0 items-center gap-1 rounded border border-white/[0.09] bg-white/[0.03] px-1.5 font-mono text-[10px] text-slate-300";

function formatDurationCompact(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min}m${remSec}s` : `${min}m`;
}

function HeadlessActiveStatusBadge({
  active,
  max,
  sessions = [],
  draining = false,
  onDrainIdle,
  prefix = "Active",
}: {
  active: number;
  max: number;
  sessions?: StealthRuntimeSettings["headlessSessions"];
  draining?: boolean;
  onDrainIdle?: () => void;
  prefix?: string;
}) {
  const isLive = active > 0;
  const breakdownTooltip =
    isLive && sessions && sessions.length > 0
      ? [
          `Active headless sessions (${active}/${max}):`,
          ...sessions
            .slice(0, 12)
            .map(
              (s) =>
                `• #${s.code} [${s.callerId || "agent:inline"}] — run ${formatDurationCompact(s.uptimeMs)} · idle ${formatDurationCompact(s.idleMs)}${
                  s.supportChatProtected ? " 💬 Support-Protected" : ""
                }${
                  s.shadowLane ? " (shadow)" : ""
                }`,
            ),
          sessions.length > 12 ? `…and ${sessions.length - 12} more` : "",
          "Click 'Drain' to reap idle headless workers immediately.",
        ]
          .filter(Boolean)
          .join("\n")
      : `Live active headless sessions (${active}) vs configured maximum limit (${max})`;

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className={
          isLive
            ? "inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded border border-emerald-400/35 bg-emerald-500/10 px-1.5 font-mono text-[10px] font-medium text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.14)] transition-colors"
            : SSOT_BADGE_PILL_CLASS
        }
        title={breakdownTooltip}
      >
        <span className="relative flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
          {isLive ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
            </>
          ) : (
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-slate-500/70" />
          )}
        </span>
        <span
          className={
            isLive ? " inline-block animate-pulse text-[10px] leading-none" : "text-[10px] leading-none opacity-65"
          }
          aria-hidden
        >
          👻
        </span>
        <span>
          {prefix}: {active}/{max}
        </span>
      </span>
      {isLive && onDrainIdle ? (
        <button
          type="button"
          disabled={draining}
          onClick={(e) => {
            e.stopPropagation();
            onDrainIdle();
          }}
          className="inline-flex h-[20px] shrink-0 items-center gap-1 rounded border border-amber-400/35 bg-amber-500/10 px-1.5 font-mono text-[10px] font-medium text-amber-200 transition hover:border-amber-300/60 hover:bg-amber-500/20 disabled:opacity-45"
          title={`${breakdownTooltip}\n\nClick to drain idle headless sessions immediately`}
        >
          <span>🧹</span>
          <span>{draining ? "Draining…" : "Drain"}</span>
        </button>
      ) : null}
    </span>
  );
}

const TARGET_MONITOR_OPTIONS = [
  { value: "auto-secondary", label: "Auto (Monitor 2 on dual)", color: "#34d399" },
  { value: "secondary", label: "Monitor 2 (Secondary)", color: "#38bdf8" },
  { value: "primary", label: "Monitor 1 (Primary)", color: "#a78bfa" },
  { value: "cursor", label: "Cursor screen", color: "#94a3b8" },
];

const MAX_HEADLESS_BASE_STEPS = [10, 15, 20, 25, 30, 40, 50] as const;

const BOOLEAN_ENABLE_OPTIONS = [
  { value: "1", label: "Enabled", color: "#34d399" },
  { value: "0", label: "Off", color: "#94a3b8" },
];

const LAUNCH_MODE_OPTIONS = [
  { value: "headed", label: "Headed window", color: "#38bdf8" },
  { value: "headless", label: "Headless background", color: "#f59e0b" },
];

const THEME_MODE_OPTIONS = [
  { value: "dark", label: "Dark", color: "#a78bfa" },
  { value: "light", label: "Light", color: "#38bdf8" },
];

/**
 * Shared runtime hook for Target Monitor & Max Headless concurrency so Display section
 * and Browser Defaults stay in sync with backend `/api/settings/runtime`.
 */
function useStealthRuntimePrefs() {
  const [defaults, setDefaults] = useState<BrowserDefaults>(() => readBrowserDefaults());
  const [runtime, setRuntime] = useState<StealthRuntimeSettings | null>(null);
  const [movingMonitor, setMovingMonitor] = useState(false);

  const reloadRuntime = useCallback(async () => {
    try {
      const rt = await fetchStealthRuntimeSettings();
      setRuntime(rt);
      setDefaults((prev) => {
        const next: BrowserDefaults = {
          ...prev,
          targetMonitor: rt.targetMonitor || prev.targetMonitor || "auto-secondary",
          maxHeadlessSessions: rt.maxHeadlessSessions || prev.maxHeadlessSessions || 40,
        };
        writeBrowserDefaults(next);
        return next;
      });
    } catch {
      /* ignore offline */
    }
  }, []);

  useEffect(() => {
    void reloadRuntime();
    const timer = window.setInterval(() => {
      void reloadRuntime();
    }, 4000);
    const onSync = () => setDefaults(readBrowserDefaults());
    window.addEventListener("stealth:browser-defaults-sync", onSync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("stealth:browser-defaults-sync", onSync);
    };
  }, [reloadRuntime]);

  const updateTargetMonitor = useCallback(
    async (mode: TargetMonitorMode, moveConsoleNow = true) => {
      const next: BrowserDefaults = { ...readBrowserDefaults(), targetMonitor: mode };
      setDefaults(next);
      writeBrowserDefaults(next);
      window.dispatchEvent(new Event("stealth:browser-defaults-sync"));
      setMovingMonitor(true);
      try {
        const rt = await updateStealthRuntimeSettings({ targetMonitor: mode, moveConsoleNow });
        setRuntime(rt);
      } finally {
        setMovingMonitor(false);
      }
    },
    [],
  );

  const [drainingHeadless, setDrainingHeadless] = useState(false);

  const updateMaxHeadless = useCallback(async (maxSessions: number) => {
    const clamped = Math.max(1, Math.min(200, Math.round(Number(maxSessions) || 40)));
    const next: BrowserDefaults = { ...readBrowserDefaults(), maxHeadlessSessions: clamped };
    setDefaults(next);
    writeBrowserDefaults(next);
    window.dispatchEvent(new Event("stealth:browser-defaults-sync"));
    const rt = await updateStealthRuntimeSettings({ maxHeadlessSessions: clamped });
    setRuntime(rt);
  }, []);

  const drainIdleHeadless = useCallback(async () => {
    setDrainingHeadless(true);
    try {
      const rt = await updateStealthRuntimeSettings({
        drainIdleHeadless: true,
        forceDrainAllHeadless: true,
        maxIdleMs: 5000,
      });
      setRuntime(rt);
    } finally {
      setDrainingHeadless(false);
    }
  }, []);

  const stopHeadlessCaller = useCallback(async (callerId: string) => {
    setDrainingHeadless(true);
    try {
      const rt = await updateStealthRuntimeSettings({
        stopCallerId: callerId,
      });
      setRuntime(rt);
    } finally {
      setDrainingHeadless(false);
    }
  }, []);

  const moveOpenBrowsersNow = useCallback(async () => {
    setMovingMonitor(true);
    try {
      const rt = await updateStealthRuntimeSettings({
        moveBrowsersNow: true,
        moveConsoleNow: false,
      });
      setRuntime(rt);
    } finally {
      setMovingMonitor(false);
    }
  }, []);

  return {
    defaults,
    setDefaults,
    runtime,
    movingMonitor,
    drainingHeadless,
    reloadRuntime,
    updateTargetMonitor,
    moveOpenBrowsersNow,
    updateMaxHeadless,
    drainIdleHeadless,
    stopHeadlessCaller,
  };
}

function BrowserDefaultsSectionBody() {
  const {
    defaults,
    setDefaults,
    runtime,
    movingMonitor,
    drainingHeadless,
    updateTargetMonitor,
    moveOpenBrowsersNow,
    updateMaxHeadless,
    drainIdleHeadless,
    stopHeadlessCaller,
  } = useStealthRuntimePrefs();
  const [savedPulse, setSavedPulse] = useState(false);

  const devicePresetOptions = useMemo(() => devicePresetFilterOptions(), []);
  const platformOptions = useMemo(() => browserPlatformFilterOptions(), []);
  const colorSchemeOptions = useMemo(() => browserColorSchemeFilterOptions(), []);
  const timezoneOptions = useMemo(() => browserTimezoneFilterOptions(), []);
  const localeOptions = useMemo(() => localeFilterOptions(), []);
  const windowModeOptions = useMemo(() => browserWindowModeFilterOptions(), []);

  const activeHeadless = runtime?.activeHeadlessCount ?? 0;
  const totalScreens = runtime?.totalMonitors ?? 2;
  const resolvedScreen =
    runtime?.resolvedDisplayIndex ?? (defaults.targetMonitor === "primary" ? 1 : 2);

  const maxHeadlessOptions = useMemo(
    () =>
      MAX_HEADLESS_BASE_STEPS.map((step) => ({
        value: String(step),
        label: step === 40 ? `${step} max (Default)` : `${step} max`,
        color: step === 40 ? "#34d399" : "#38bdf8",
      })),
    [],
  );

  const persistDefaults = useCallback(
    (next: BrowserDefaults) => {
      setDefaults(next);
      writeBrowserDefaults(next);
      window.dispatchEvent(new Event("stealth:browser-defaults-sync"));
    },
    [setDefaults],
  );

  const editDefaults = (patch: Partial<BrowserDefaults>) => {
    persistDefaults({ ...defaults, ...patch, devicePreset: "custom" });
  };
  const editLaunch = (patch: Partial<BrowserDefaults>) => {
    persistDefaults({ ...defaults, ...patch });
  };

  useRegisterSettingsSave(
    "browser-defaults",
    async () => {
      const next: BrowserDefaults = {
        ...defaults,
        defaultStartupUrl: normalizeStartupUrl(defaults.defaultStartupUrl),
      };
      persistDefaults(next);
      await updateStealthRuntimeSettings({
        targetMonitor: next.targetMonitor,
        maxHeadlessSessions: next.maxHeadlessSessions,
      });
      setSavedPulse(true);
      window.setTimeout(() => setSavedPulse(false), 1200);
    },
    () => true,
  );

  const timezoneValue = TIMEZONE_OPTIONS.some((o) => o.value === defaults.timezone) ? defaults.timezone : "";
  const localeValue = LOCALE_OPTIONS.some((o) => o.value === defaults.locale) ? defaults.locale : "";

  return (
    <div className="space-y-1.5">
      {savedPulse ? <HubAlert tone="info">Saved browser defaults.</HubAlert> : null}

      <HubDetailFieldsGroup>
        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Target monitor", headerEmoji: "🖥️" }}
            fieldLabel="Target monitor"
            filterKey="stealth-target-monitor"
            allowClear={false}
            showCopyAction={false}
            options={TARGET_MONITOR_OPTIONS}
            value={defaults.targetMonitor}
            onChange={(v) => void updateTargetMonitor(v as TargetMonitorMode, true)}
            trailingAction={
              <span className="inline-flex items-center gap-1">
                <span
                  className={SSOT_BADGE_PILL_CLASS}
                  title={`Active target: Screen ${resolvedScreen} of ${totalScreens} connected monitor(s)`}
                >
                  {movingMonitor ? "Moving…" : `Screen ${resolvedScreen}/${totalScreens}`}
                </span>
                <button
                  type="button"
                  disabled={movingMonitor}
                  onClick={(e) => {
                    e.stopPropagation();
                    void moveOpenBrowsersNow();
                  }}
                  title={`Move all currently open profile browser windows to Screen ${resolvedScreen}`}
                  className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded border border-sky-500/35 bg-sky-500/15 px-1.5 font-sans text-[10px] font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-50"
                >
                  {movingMonitor ? "⏳" : "↗ Move open"}
                </button>
              </span>
            }
          />
          <HubAdmClickFilterField
            header={{ label: "Max headless", headerEmoji: "🤖" }}
            fieldLabel="Max headless"
            filterKey="stealth-max-headless"
            allowClear={false}
            showCopyAction={false}
            options={maxHeadlessOptions}
            value={String(defaults.maxHeadlessSessions || 40)}
            onChange={(v) => void updateMaxHeadless(Number(v) || 40)}
            trailingAction={
              <HeadlessActiveStatusBadge
                active={activeHeadless}
                max={defaults.maxHeadlessSessions || 40}
                sessions={runtime?.headlessSessions}
                draining={drainingHeadless}
                onDrainIdle={() => void drainIdleHeadless()}
                prefix="Active"
              />
            }
          />
        </HubDetailFieldRow>

        {runtime?.headlessSessions && runtime.headlessSessions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800/80 bg-slate-950/60 px-2.5 py-1.5">
            <span className="hub-analytics-caption font-mono text-slate-400">
              Active Callers (Cap 3/caller):
            </span>
            {Object.entries(
              runtime.headlessSessions.reduce<
                Record<string, { codes: string[]; supportProtected: boolean }>
              >((acc, s) => {
                const cid = s.callerId || "agent:inline";
                if (!acc[cid]) acc[cid] = { codes: [], supportProtected: false };
                acc[cid].codes.push(`#${s.code}`);
                if (s.supportChatProtected) acc[cid].supportProtected = true;
                return acc;
              }, {}),
            ).map(([callerId, info]) => (
              <span
                key={callerId}
                className="inline-flex h-[22px] items-center gap-1.5 rounded border border-slate-700/80 bg-slate-900/90 px-2 font-mono text-[10px] text-slate-200"
                title={`Caller ${callerId} holding ${info.codes.join(", ")}`}
              >
                <span className="font-semibold text-sky-300">{callerId}</span>
                <span className="text-slate-400">
                  ({info.codes.length}/3: {info.codes.join(", ")})
                </span>
                {info.supportProtected ? (
                  <span
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1 text-[9px] text-emerald-300"
                    title="Support chat active — protected from idle eviction"
                  >
                    💬 Support
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={drainingHeadless}
                  onClick={() => void stopHeadlessCaller(callerId)}
                  className="ml-0.5 rounded border border-rose-500/40 bg-rose-500/15 px-1 text-[9px] font-semibold text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-45"
                  title={`Stop all headless sessions owned by ${callerId}`}
                >
                  ✕ Stop
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Device preset", headerEmoji: "📱" }}
            fieldLabel="Device preset"
            filterKey="browser-device-preset"
            labelHint={stealthFormFieldHintContent("devicePreset")}
            allowClear={false}
            showCopyAction={false}
            options={devicePresetOptions}
            value={defaults.devicePreset}
            onChange={(presetId) => {
              const dev = applyDevicePreset(
                {
                  ...DEFAULT_DEVICE,
                  platform: defaults.platform,
                  timezone: defaults.timezone,
                  locale: defaults.locale,
                  colorScheme: defaults.colorScheme,
                },
                presetId,
              );
              persistDefaults({
                ...defaults,
                platform: dev.platform,
                devicePreset: dev.devicePreset,
                timezone: dev.timezone,
                locale: dev.locale,
                colorScheme: defaults.colorScheme,
                headless: defaults.headless,
                humanize: defaults.humanize,
                windowMode: dev.windowMode,
                defaultStartupUrl: defaults.defaultStartupUrl,
              });
            }}
          />
          <HubAdmClickFilterField
            header={{ label: "Operating system", headerEmoji: "💻" }}
            fieldLabel="Operating system"
            filterKey="browser-platform"
            labelHint={stealthFormFieldHintContent("platform")}
            allowClear={false}
            showCopyAction={false}
            options={platformOptions}
            value={defaults.platform}
            onChange={(value) => editDefaults({ platform: value as BrowserDefaults["platform"] })}
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Window mode", headerEmoji: "🪟" }}
            fieldLabel="Window mode"
            filterKey="browser-window-mode"
            labelHint={stealthFormFieldHintContent("windowMode")}
            allowClear={false}
            showCopyAction={false}
            options={windowModeOptions}
            value={defaults.windowMode}
            onChange={(value) => editDefaults({ windowMode: value as BrowserDefaults["windowMode"] })}
          />
          <HubAdmClickFilterField
            header={{ label: "Color scheme", headerEmoji: "🎨" }}
            fieldLabel="Color scheme"
            filterKey="browser-color-scheme"
            labelHint={stealthFormFieldHintContent("colorScheme")}
            allowClear={false}
            showCopyAction={false}
            options={colorSchemeOptions}
            value={defaults.colorScheme}
            onChange={(value) => editDefaults({ colorScheme: value as BrowserDefaults["colorScheme"] })}
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Timezone", headerEmoji: "🌍" }}
            fieldLabel="Timezone"
            filterKey="browser-timezone"
            labelHint={stealthFormFieldHintContent("timezone")}
            allowClear={false}
            showCopyAction={false}
            options={timezoneOptions}
            value={timezoneValue}
            onChange={(value) => editDefaults({ timezone: value })}
          />
          <HubAdmClickFilterField
            header={{ label: "Locale", headerEmoji: "🗣️" }}
            fieldLabel="Locale"
            filterKey="browser-locale"
            labelHint={stealthFormFieldHintContent("locale")}
            allowClear={false}
            showCopyAction={false}
            options={localeOptions}
            value={localeValue}
            onChange={(value) => editDefaults({ locale: value })}
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Humanize input", headerEmoji: "⚡" }}
            fieldLabel="Humanize input"
            filterKey="browser-humanize"
            allowClear={false}
            showCopyAction={false}
            options={BOOLEAN_ENABLE_OPTIONS}
            value={defaults.humanize ? "1" : "0"}
            onChange={(v) => editLaunch({ humanize: v === "1" })}
          />
          <HubAdmClickFilterField
            header={{ label: "Default launch", headerEmoji: "👻" }}
            fieldLabel="Default launch"
            filterKey="browser-launch-mode"
            allowClear={false}
            showCopyAction={false}
            options={LAUNCH_MODE_OPTIONS}
            value={defaults.headless ? "headless" : "headed"}
            onChange={(v) => editLaunch({ headless: v === "headless" })}
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots="full">
          <HubAdmClickEditField
            header={{ label: "Startup URL", headerEmoji: "🔗" }}
            fieldLabel="Default startup URL"
            labelHint={stealthFormFieldHintContent("defaultStartupUrl")}
            value={defaults.defaultStartupUrl}
            placeholder="https://myaccount.google.com/"
            onChange={(val) => editLaunch({ defaultStartupUrl: val })}
            formatOnBlur={(raw) => formatStartupUrlOnBlur(raw)}
          />
        </HubDetailFieldRow>
      </HubDetailFieldsGroup>
    </div>
  );
}

const DEFAULT_EXTENSION_TOGGLES: ExtensionToggles = {
  e0001: true,
  e0002: true,
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
        setMessage("Saved extension toggles. Restart running Chrome profile to apply.");
      })
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Save failed"))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-1.5">
      <HubDetailFieldsGroup>
        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "E0001 Cookie Bridge", headerEmoji: "🍪" }}
            fieldLabel="E0001 Cookie Bridge"
            filterKey="ext-e0001"
            disabled={busy}
            allowClear={false}
            showCopyAction={false}
            options={BOOLEAN_ENABLE_OPTIONS}
            value={toggles.e0001 ? "1" : "0"}
            onChange={(v) => apply({ e0001: v === "1" })}
          />
          <HubAdmClickFilterField
            header={{ label: "E0002 Operator CDP", headerEmoji: "🤖" }}
            fieldLabel="E0002 Operator CDP"
            filterKey="ext-e0002"
            disabled={busy}
            allowClear={false}
            showCopyAction={false}
            options={BOOLEAN_ENABLE_OPTIONS}
            value={toggles.e0002 ? "1" : "0"}
            onChange={(v) => apply({ e0002: v === "1" })}
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots={2}>
          <HubAdmClickFilterField
            header={{ label: "Surfshark VPN", headerEmoji: "🦈" }}
            fieldLabel="Surfshark VPN"
            filterKey="ext-surfshark"
            disabled={busy}
            allowClear={false}
            showCopyAction={false}
            options={BOOLEAN_ENABLE_OPTIONS}
            value={toggles.surfshark ? "1" : "0"}
            onChange={(v) => apply({ surfshark: v === "1" })}
          />
          <HubAdmClickFilterField
            header={{ label: "Web Store add-ons", headerEmoji: "🏪" }}
            fieldLabel="Web Store add-ons"
            filterKey="ext-webstore"
            disabled={busy}
            allowClear={false}
            showCopyAction={false}
            options={BOOLEAN_ENABLE_OPTIONS}
            value={toggles.webStore ? "1" : "0"}
            onChange={(v) => apply({ webStore: v === "1" })}
          />
        </HubDetailFieldRow>
      </HubDetailFieldsGroup>

      {message ? <HubAlert tone="info">{message}</HubAlert> : null}
    </div>
  );
}

function AppearanceSectionBody() {
  const { theme, setTheme } = useStealthShell();
  return (
    <HubDetailFieldsGroup>
      <HubDetailFieldRow slots={2}>
        <HubAdmClickFilterField
          header={{ label: "Color theme", headerEmoji: "🌗" }}
          fieldLabel="Color theme"
          filterKey="stealth-color-theme"
          allowClear={false}
          showCopyAction={false}
          options={THEME_MODE_OPTIONS}
          value={theme}
          onChange={(v) => setTheme(v === "light" ? "light" : "dark")}
        />
      </HubDetailFieldRow>
    </HubDetailFieldsGroup>
  );
}

function EngineSectionBody() {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { defaults, runtime } = useStealthRuntimePrefs();

  useEffect(() => {
    void fetchEngineHealth().then(setHealth);
  }, []);

  const engineLabel =
    health?.ok ? "Ready" : health?.installed === false ? "Binary missing" : health ? "Offline" : "Checking…";
  const engineVersion = String((health?.info as { version?: string } | undefined)?.version || "146.0.7680.165");
  const activeHeadless = runtime?.activeHeadlessCount ?? 0;

  return (
    <div className="space-y-1.5">
      <HubDetailFieldsGroup>
        <HubDetailFieldRow slots={2}>
          <HubAdmClickEditField
            header={{ label: "Binary status", headerEmoji: "🛡️" }}
            fieldLabel="Binary status"
            value={engineLabel}
            onChange={() => {}}
            disabled
            showCopyAction={false}
            trailingAction={
              <button
                type="button"
                disabled={busy}
                className={SSOT_COMPACT_BTN_CLASS}
                onClick={() => {
                  setBusy(true);
                  setMessage("");
                  void updateEngineBinary()
                    .then(async () => {
                      setMessage("Binary verified.");
                      setHealth(await fetchEngineHealth());
                    })
                    .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Update failed"))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? <RefreshCw size={11} className="animate-spin" /> : <Download size={11} />}
                <span>{busy ? "Checking…" : "Check / download"}</span>
              </button>
            }
          />
          <HubAdmClickEditField
            header={{ label: "Chromium build", headerEmoji: "📦" }}
            fieldLabel="Chromium build"
            value={engineVersion}
            onChange={() => {}}
            disabled
            showCopyAction={false}
            trailingAction={
              <HeadlessActiveStatusBadge
                active={activeHeadless}
                max={defaults.maxHeadlessSessions || 40}
                prefix="Headless"
              />
            }
          />
        </HubDetailFieldRow>
      </HubDetailFieldsGroup>

      {health?.error ? <HubAlert tone="danger">{health.error}</HubAlert> : null}
      {message ? <HubAlert tone="info">{message}</HubAlert> : null}
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
    <div className="space-y-1.5">
      <HubDetailFieldsGroup>
        <HubDetailFieldRow slots="full">
          <HubAdmClickEditField
            header={{ label: "App data", headerEmoji: "🗂️" }}
            fieldLabel="App data path"
            value={userDataPath || "—"}
            onChange={() => {}}
            disabled
            showCopyAction
            trailingAction={
              <button
                type="button"
                className={SSOT_COMPACT_BTN_CLASS}
                onClick={() => void openDataFolder()}
              >
                <FolderOpen size={11} />
                <span>Open</span>
              </button>
            }
          />
        </HubDetailFieldRow>

        <HubDetailFieldRow slots="full">
          <HubAdmClickEditField
            header={{ label: "Profiles folder", headerEmoji: "💾" }}
            fieldLabel="Profiles storage path"
            value={loc?.profilesRoot || "—"}
            onChange={() => {}}
            disabled
            showCopyAction
            trailingAction={
              <div className="flex items-center gap-1">
                <span className={SSOT_BADGE_PILL_CLASS}>
                  {loc ? `${loc.profileDirCount} dirs` : "—"}
                </span>
                <button
                  type="button"
                  className={SSOT_COMPACT_BTN_CLASS}
                  onClick={() => void openProfilesFolder()}
                >
                  <FolderOpen size={11} />
                  <span>Open</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={SSOT_COMPACT_BTN_CLASS}
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
                >
                  <FolderOpen size={11} />
                  <span>{busy ? "Moving…" : "Change…"}</span>
                </button>
              </div>
            }
          />
        </HubDetailFieldRow>
      </HubDetailFieldsGroup>

      {loc?.promptPending && loc.suggestedProfilesRoot && loc.suggestedProfilesRoot !== loc.profilesRoot ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1.5 text-xs text-slate-200">
          <span>Recommended drive: {loc.suggestedProfilesRoot}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              className={SSOT_COMPACT_BTN_CLASS}
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
            >
              <Download size={11} />
              <span>Use recommended</span>
            </button>
            <button
              type="button"
              disabled={busy}
              className={SSOT_COMPACT_BTN_CLASS}
              onClick={() => {
                void dismissProfilesLocationPrompt()
                  .then(() => refresh())
                  .then(() => setMessage("Kept current location."));
              }}
            >
              <span>Keep current</span>
            </button>
          </div>
        </div>
      ) : null}

      {message ? <HubAlert tone="info">{message}</HubAlert> : null}
    </div>
  );
}

function AboutSectionBody() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    void fetchAppInfo().then((info) => setVersion(info.version));
  }, []);

  return (
    <HubDetailFieldsGroup>
      <HubDetailFieldRow slots={2}>
        <HubAdmClickEditField
          header={{ label: "Console version", headerEmoji: "🚀" }}
          fieldLabel="Console version"
          value={`v${version || "—"}`}
          onChange={() => {}}
          disabled
          showCopyAction={false}
        />
        <HubAdmClickEditField
          header={{ label: "Runtime plane", headerEmoji: "⚙️" }}
          fieldLabel="Runtime plane"
          value="CloakBrowser Dual-Plane SSOT"
          onChange={() => {}}
          disabled
          showCopyAction={false}
        />
      </HubDetailFieldRow>
    </HubDetailFieldsGroup>
  );
}

/** Sidebar footer — app-wide settings (Display · Browser defaults · Appearance · Engine · …). */
export function useStealthGeneralSettingsToolSections(): HubDisplayPrefsToolSection[] {
  return useMemo(
    () => [
      {
        id: "browser-defaults",
        label: "Browser defaults",
        emoji: "🌐",
        icon: <MonitorSmartphone size={compactIconSize(12)} className="text-violet-300" aria-hidden />,
        body: <BrowserDefaultsSectionBody />,
      },
      {
        id: "engine",
        label: "CloakBrowser",
        emoji: "🛡️",
        icon: <Shield size={compactIconSize(12)} className="text-emerald-300" aria-hidden />,
        body: <EngineSectionBody />,
      },
      {
        id: "data-folder",
        label: "Data folder",
        emoji: "📁",
        icon: <FolderOpen size={compactIconSize(12)} className="text-amber-300" aria-hidden />,
        body: <DataFolderSectionBody />,
      },
      {
        id: "extensions",
        label: "Extensions",
        emoji: "🧩",
        icon: <Puzzle size={compactIconSize(12)} className="text-orange-300" aria-hidden />,
        body: <ExtensionsSectionBody />,
      },
      {
        id: "appearance",
        label: "Appearance",
        emoji: "🎨",
        icon: <Palette size={compactIconSize(12)} className="text-cyan-300" aria-hidden />,
        body: <AppearanceSectionBody />,
      },
      {
        id: "about",
        label: "About",
        emoji: "ℹ️",
        icon: <Info size={compactIconSize(12)} className="text-indigo-300" aria-hidden />,
        body: <AboutSectionBody />,
      },
    ],
    [],
  );
}

/** Profiles tab header — browser defaults · engine · data folder · extensions. */
export function useStealthProfileSettingsToolSections(): HubDisplayPrefsToolSection[] {
  return useMemo(
    () => [
      {
        id: "browser-defaults",
        label: "Browser defaults",
        emoji: "🌐",
        icon: <MonitorSmartphone size={compactIconSize(12)} className="text-violet-300" aria-hidden />,
        body: <BrowserDefaultsSectionBody />,
      },
      {
        id: "engine",
        label: "CloakBrowser",
        emoji: "🛡️",
        icon: <Shield size={compactIconSize(12)} className="text-emerald-300" aria-hidden />,
        body: <EngineSectionBody />,
      },
      {
        id: "data-folder",
        label: "Data folder",
        emoji: "📁",
        icon: <FolderOpen size={compactIconSize(12)} className="text-amber-300" aria-hidden />,
        body: <DataFolderSectionBody />,
      },
      {
        id: "extensions",
        label: "Extensions",
        emoji: "🧩",
        icon: <Puzzle size={compactIconSize(12)} className="text-orange-300" aria-hidden />,
        body: <ExtensionsSectionBody />,
      },
    ],
    [],
  );
}
