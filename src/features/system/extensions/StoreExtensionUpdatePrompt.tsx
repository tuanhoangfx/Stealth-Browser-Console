import { memo, useCallback, useEffect, useRef } from "react";
import { fetchStoreExtensionUpdateCheck, installStoreExtension, onStoreExtensionUpdateCheck } from "../../../api";
import { useAppToast } from "../../../components/toast";
import type { StoreExtensionUpdateCheck } from "../../../types";
import {
  formatStoreExtensionUpdateLine,
  planStoreExtensionBackgroundUpdate,
} from "./store-extension-background-update";
import {
  clearStoreExtBackgroundKey,
  readStoreExtBackgroundKey,
  setStoreExtUpdateUi,
  writeStoreExtBackgroundKey,
} from "./store-extension-update-ui";

/** Startup Store probe — cache-only CRX download; never pin every profile / never block the pointer. */
export const StoreExtensionUpdatePrompt = memo(function StoreExtensionUpdatePrompt() {
  const { pushToast } = useAppToast();
  const startedKey = useRef<string | null>(readStoreExtBackgroundKey());
  const running = useRef(false);

  const applyCheck = useCallback(
    (check: StoreExtensionUpdateCheck) => {
      const plan = planStoreExtensionBackgroundUpdate(check, startedKey.current);
      if (plan.action === "ignore") return;
      startedKey.current = plan.key;
      writeStoreExtBackgroundKey(plan.key);
      if (plan.action === "done") return;
      if (running.current) return;
      running.current = true;
      const rows = plan.rows;
      const detail = rows.map(formatStoreExtensionUpdateLine).join("; ");
      setStoreExtUpdateUi({
        phase: "updating",
        label: rows.length === 1 ? "Updating extension…" : `Updating ${rows.length} extensions…`,
        detail,
      });
      pushToast(`Updating store extensions in the background: ${detail}`, "info", 5200);
      void (async () => {
        try {
          const lines: string[] = [];
          for (const row of rows) {
            const result = await installStoreExtension({
              storeId: row.storeId,
              force: true,
              cacheOnly: true,
            });
            lines.push(`${result.name} v${result.version || row.latest}`);
          }
          pushToast(`Updated: ${lines.join("; ")}. Re-launch profiles to load the new cache.`, "success", 6400);
        } catch (err) {
          startedKey.current = null;
          clearStoreExtBackgroundKey();
          pushToast(err instanceof Error ? err.message : String(err), "error");
        } finally {
          running.current = false;
          setStoreExtUpdateUi({ phase: "idle", label: "", detail: "" });
        }
      })();
    },
    [pushToast],
  );

  useEffect(() => {
    let alive = true;
    const boot = window.setTimeout(() => {
      void fetchStoreExtensionUpdateCheck()
        .then((check) => {
          if (alive) applyCheck(check);
        })
        .catch(() => undefined);
    }, 1200);
    const off = onStoreExtensionUpdateCheck((check) => {
      if (alive) applyCheck(check);
    });
    return () => {
      alive = false;
      window.clearTimeout(boot);
      off();
    };
  }, [applyCheck]);

  return null;
});
