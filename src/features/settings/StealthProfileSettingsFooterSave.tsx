import { HubToolDetailModalPrimaryAction } from "@tool-workspace/hub-ui";
import { Save } from "lucide-react";
import { useStealthSettingsSave } from "./stealth-settings-save-context";

export function StealthProfileSettingsFooterSave() {
  const { runAllSaves, busy } = useStealthSettingsSave();

  return (
    <HubToolDetailModalPrimaryAction
      label={busy ? "Saving…" : "Save"}
      onClick={() => void runAllSaves()}
      disabled={busy}
      busy={busy}
      icon={Save}
    />
  );
}
