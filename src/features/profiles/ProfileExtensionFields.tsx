import { useEffect, useState } from "react";
import { Blocks, Cookie, Shield } from "lucide-react";
import { HubAdmSectionBlock } from "@tool-workspace/hub-ui";
import { fetchExtensionToggles } from "../../api";
import type { ExtensionToggles, ProfileExtensionOverrides } from "../../types";
import { useExtensionIcons, type ExtensionIconMap } from "./useExtensionIcons";

type OverrideMode = "default" | "on" | "off";

function modeFor(overrides: ProfileExtensionOverrides, key: keyof ExtensionToggles): OverrideMode {
  const value = overrides[key];
  if (value === true) return "on";
  if (value === false) return "off";
  return "default";
}

function applyMode(
  overrides: ProfileExtensionOverrides,
  key: keyof ExtensionToggles,
  mode: OverrideMode,
): ProfileExtensionOverrides {
  const next = { ...overrides };
  if (mode === "default") {
    delete next[key];
    return next;
  }
  next[key] = mode === "on";
  return next;
}

function globalLabel(enabled: boolean) {
  return enabled ? "On" : "Off";
}

function effectiveEnabled(mode: OverrideMode, globalEnabled: boolean) {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return globalEnabled;
}

function overrideSummary(mode: OverrideMode, globalEnabled: boolean) {
  if (mode === "default") return `Using app default · currently ${globalLabel(globalEnabled)}`;
  return mode === "on" ? "Override active · forced On" : "Override active · forced Off";
}

function OverrideIcon({
  kind,
  icons,
}: {
  kind: "e0001" | "surfshark" | "webStore";
  icons: ExtensionIconMap;
}) {
  if (kind === "webStore") return <Blocks size={15} className="text-sky-300" aria-hidden />;
  const Fallback = kind === "e0001" ? Cookie : Shield;
  const fallbackClass = kind === "e0001" ? "text-orange-300" : "text-cyan-300";
  const src = icons[kind];
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <Fallback size={15} className={`shrink-0 ${fallbackClass}`} aria-hidden />;
  }
  return (
    <img
      src={src}
      width={15}
      height={15}
      className="shrink-0"
      alt=""
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
}

function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-white/15"
      }`}
      aria-hidden
    >
      <span
        className={`absolute h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-[15px]" : "translate-x-[3px]"
        }`}
      />
    </span>
  );
}

const EXTENSION_OVERRIDE_OPTIONS: Array<{ value: OverrideMode; label: string }> = [
  { value: "default", label: "Use app default" },
  { value: "on", label: "Enable on this profile" },
  { value: "off", label: "Disable on this profile" },
];

function ExtensionOverrideRow({
  kind,
  label,
  globalEnabled,
  mode,
  disabled,
  onChange,
  extensionIcons,
}: {
  kind: "e0001" | "surfshark" | "webStore";
  label: string;
  globalEnabled: boolean;
  mode: OverrideMode;
  disabled?: boolean;
  onChange: (mode: OverrideMode) => void;
  extensionIcons: ExtensionIconMap;
}) {
  const name = label.replace(/\s+/g, "-").toLowerCase();
  const enabled = effectiveEnabled(mode, globalEnabled);
  return (
    <div className="stealth-profile-extension-row" role="group" aria-label={label}>
      <div className="stealth-profile-extension-row__head">
        <div className="stealth-profile-extension-row__toggle">
          <span className="stealth-profile-extension-row__icon">
            <OverrideIcon kind={kind} icons={extensionIcons} />
          </span>
          <span className="min-w-0 truncate" title={label}>
            {label}
          </span>
        </div>
        <ToggleSwitch on={enabled} />
      </div>
      <div className="stealth-profile-extension-row__meta">
        <p className="stealth-profile-extension-row__summary">
          {overrideSummary(mode, globalEnabled)} · App default: {globalLabel(globalEnabled)}
        </p>
      </div>
      <div className="stealth-profile-extension-row__options" role="radiogroup" aria-label={label}>
        {EXTENSION_OVERRIDE_OPTIONS.map((option) => {
          const checked = mode === option.value;
          return (
            <label
              key={option.value}
              className={`stealth-profile-extension-choice${checked ? " is-active" : ""}${
                disabled ? " is-disabled" : ""
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function ProfileExtensionFields({
  overrides,
  onChange,
  disabled,
}: {
  overrides: ProfileExtensionOverrides;
  onChange: (next: ProfileExtensionOverrides) => void;
  disabled?: boolean;
}) {
  const extensionIcons = useExtensionIcons();
  const [globalToggles, setGlobalToggles] = useState<ExtensionToggles>({
    e0001: true,
    surfshark: false,
    webStore: false,
  });

  useEffect(() => {
    void fetchExtensionToggles()
      .then(setGlobalToggles)
      .catch(() => undefined);
  }, []);

  const setMode = (key: keyof ExtensionToggles, mode: OverrideMode) => {
    onChange(applyMode(overrides, key, mode));
  };

  return (
    <HubAdmSectionBlock
      id="profile-extensions"
      header={{ label: "Extensions" }}
    >
      <p className="col-span-full stealth-profile-extension-section__lead">
        Override app-wide extension defaults for this profile only. After save, close Chrome and Run again.
        Surfshark can be enabled on 2–3 profiles while staying off globally.
      </p>
      <div className="col-span-full stealth-profile-extension-list">
        <ExtensionOverrideRow
          kind="e0001"
          label="E0001 Cookie Bridge"
          globalEnabled={globalToggles.e0001}
          mode={modeFor(overrides, "e0001")}
          disabled={disabled}
          onChange={(mode) => setMode("e0001", mode)}
          extensionIcons={extensionIcons}
        />
        <ExtensionOverrideRow
          kind="surfshark"
          label="Surfshark VPN Extension"
          globalEnabled={globalToggles.surfshark}
          mode={modeFor(overrides, "surfshark")}
          disabled={disabled}
          onChange={(mode) => setMode("surfshark", mode)}
          extensionIcons={extensionIcons}
        />
        <ExtensionOverrideRow
          kind="webStore"
          label="Other Web Store extensions"
          globalEnabled={globalToggles.webStore}
          mode={modeFor(overrides, "webStore")}
          disabled={disabled}
          onChange={(mode) => setMode("webStore", mode)}
          extensionIcons={extensionIcons}
        />
      </div>
    </HubAdmSectionBlock>
  );
}
