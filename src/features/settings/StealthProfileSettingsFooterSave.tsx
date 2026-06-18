import { HubToolDetailModalPrimaryAction } from "@tool-workspace/hub-ui";
import { useStealthSettingsSave } from "./stealth-settings-save-context";

export function StealthProfileSettingsFooterSave() {
  const { runAllSaves, busy } = useStealthSettingsSave();

  return (
    <HubToolDetailModalPrimaryAction
      label={busy ? "Saving…" : "Save"}
      onClick={() => void runAllSaves()}
      disabled={busy}
      busy={busy}
    />
  );
}
