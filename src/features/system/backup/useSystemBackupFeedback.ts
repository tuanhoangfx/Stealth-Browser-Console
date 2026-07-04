import { useCallback } from "react";
import { useHubAppLog } from "@tool-workspace/hub-ui";
import { useAppToast } from "../../../components/toast";

const BACKUP_LOG_SCREEN = "system-backup";

/** Route backup/restore feedback to toast + session log (not filter bar). */
export function useSystemBackupFeedback() {
  const { pushToast } = useAppToast();
  const { pushLog } = useHubAppLog();

  const notifyInfo = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text) return;
      pushToast(text, "success");
      pushLog("Backup", text, BACKUP_LOG_SCREEN);
    },
    [pushLog, pushToast],
  );

  const notifyError = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text) return;
      pushToast(text, "error", 6500);
      pushLog("Backup", text, BACKUP_LOG_SCREEN);
    },
    [pushLog, pushToast],
  );

  const notifyProgress = useCallback(
    (message: string) => {
      const text = message.trim();
      if (!text) return;
      pushLog("Backup", text, BACKUP_LOG_SCREEN);
    },
    [pushLog],
  );

  return { notifyInfo, notifyError, notifyProgress };
}
