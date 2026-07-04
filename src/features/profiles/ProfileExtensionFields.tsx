import { useEffect, useState } from "react";
import { Puzzle } from "lucide-react";
import { HubToolDetailSection, compactIconSize } from "@tool-workspace/hub-ui";
import { fetchExtensionToggles } from "../../api";
import type { ExtensionToggles, ProfileExtensionOverrides } from "../../types";

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

function ExtensionOverrideRow({
  label,
  globalEnabled,
  mode,
  disabled,
  onChange,
}: {
  label: string;
  globalEnabled: boolean;
  mode: OverrideMode;
  disabled?: boolean;
  onChange: (mode: OverrideMode) => void;
}) {
  const name = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <fieldset className="col-span-full space-y-1.5 rounded-lg border border-[var(--border)] px-3 py-2.5">
      <legend className="px-1 text-xs font-medium text-[var(--text)]">{label}</legend>
      <p className="text-[11px] text-[var(--muted)]">App default: {globalLabel(globalEnabled)}</p>
      <label className="stealth-settings-form__check block">
        <input
          type="radio"
          name={name}
          checked={mode === "default"}
          disabled={disabled}
          onChange={() => onChange("default")}
        />
        Use app default
      </label>
      <label className="stealth-settings-form__check block">
        <input
          type="radio"
          name={name}
          checked={mode === "on"}
          disabled={disabled}
          onChange={() => onChange("on")}
        />
        Enable on this profile
      </label>
      <label className="stealth-settings-form__check block">
        <input
          type="radio"
          name={name}
          checked={mode === "off"}
          disabled={disabled}
          onChange={() => onChange("off")}
        />
        Disable on this profile
      </label>
    </fieldset>
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
    <HubToolDetailSection
      id="profile-extensions"
      title="Extensions"
      icon={<Puzzle size={compactIconSize(12)} className="text-orange-300" aria-hidden />}
    >
      <p className="col-span-full text-xs text-[var(--muted)]">
        Override app-wide extension defaults for this profile only. After save, close Chrome and Run again.
        Surfshark can be enabled on 2–3 profiles while staying off globally.
      </p>
      <ExtensionOverrideRow
        label="E0001 Cookie Bridge"
        globalEnabled={globalToggles.e0001}
        mode={modeFor(overrides, "e0001")}
        disabled={disabled}
        onChange={(mode) => setMode("e0001", mode)}
      />
      <ExtensionOverrideRow
        label="Surfshark VPN Extension"
        globalEnabled={globalToggles.surfshark}
        mode={modeFor(overrides, "surfshark")}
        disabled={disabled}
        onChange={(mode) => setMode("surfshark", mode)}
      />
      <ExtensionOverrideRow
        label="Other Web Store extensions"
        globalEnabled={globalToggles.webStore}
        mode={modeFor(overrides, "webStore")}
        disabled={disabled}
        onChange={(mode) => setMode("webStore", mode)}
      />
    </HubToolDetailSection>
  );
}
