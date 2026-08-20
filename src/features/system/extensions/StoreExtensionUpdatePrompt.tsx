import { memo, useCallback, useEffect, useRef, useState } from "react";
import { HubConfirmDialog } from "@tool-workspace/hub-ui";
import { fetchStoreExtensionUpdateCheck, installStoreExtension, onStoreExtensionUpdateCheck } from "../../../api";
import { useAppToast } from "../../../components/toast";
import type { StoreExtensionUpdateCheck, StoreExtensionUpdateRow } from "../../../types";

function availableRows(check: StoreExtensionUpdateCheck | null): StoreExtensionUpdateRow[] {
  return (check?.results ?? []).filter((row) => row.available);
}

/** Startup Store probe — ask before downloading CRX. */
export const StoreExtensionUpdatePrompt = memo(function StoreExtensionUpdatePrompt() {
  const { pushToast } = useAppToast();
  const [pending, setPending] = useState<StoreExtensionUpdateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const toastedKey = useRef<string | null>(null);

  const applyCheck = useCallback(
    (check: StoreExtensionUpdateCheck) => {
      if (check.checking) return;
      const available = availableRows(check);
      setPending(available);
      const key = check.checkedAt || "done";
      if (toastedKey.current === key) return;
      toastedKey.current = key;
      if (!available.length && check.results.length) {
        pushToast("Store extensions are current.", "success");
      }
    },
    [pushToast],
  );

  useEffect(() => {
    let alive = true;
    void fetchStoreExtensionUpdateCheck()
      .then((check) => {
        if (alive) applyCheck(check);
      })
      .catch(() => undefined);
    const off = onStoreExtensionUpdateCheck((check) => {
      if (alive) applyCheck(check);
    });
    return () => {
      alive = false;
      off();
    };
  }, [applyCheck]);

  const onUpdate = useCallback(async () => {
    if (!pending.length) return;
    setBusy(true);
    try {
      const lines: string[] = [];
      for (const row of pending) {
        const result = await installStoreExtension({ storeId: row.storeId, force: true });
        lines.push(`${result.name} v${result.version || row.latest}`);
      }
      pushToast(`Updated: ${lines.join("; ")}. Re-launch profiles to load the new cache.`, "success");
      setPending([]);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [pending, pushToast]);

  if (!pending.length) return null;

  return (
    <HubConfirmDialog
      open
      title={pending.length === 1 ? "Store extension update?" : "Store extension updates?"}
      message={
        <>
          <p>Newer Chrome Web Store versions are available. Update the local cache now?</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {pending.map((row) => (
              <li key={row.storeId}>
                {row.name || row.storeId} {row.current || "?"} → {row.latest}
              </li>
            ))}
          </ul>
        </>
      }
      confirmLabel="Update"
      cancelLabel="Later"
      tone="info"
      confirmBusy={busy}
      onConfirm={() => void onUpdate()}
      onClose={() => setPending([])}
    />
  );
});
